// ===============================================================
// สร้างไฟล์ดาวน์โหลด Print Server ให้หน้าเว็บ (หลังบ้าน > ตั้งค่าเครื่องพิมพ์)
// ---------------------------------------------------------------
// รันเองตอน vite build / vite dev (ดู vite.config.js) — ไม่ต้องเก็บ zip ไว้ใน git
// ไฟล์ที่ได้อยู่ใน public/downloads/ :
//   humlai-print-server.zip   โฟลเดอร์ Print Server พร้อมใช้ (แตกไฟล์แล้วดับเบิลคลิก .bat)
//   print-server.json         เวอร์ชันล่าสุด — หน้าเว็บใช้เทียบกับ Print Server ที่ร้านรันอยู่
//   print-server-guide.html   คู่มือติดตั้ง เปิดอ่านในเบราว์เซอร์ได้เลย
//
// รันมือ: node scripts/build-print-server-package.mjs
// ===============================================================

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FOLDER = 'HumLai-Print-Server';
export const ZIP_NAME = 'humlai-print-server.zip';
export const MANIFEST_NAME = 'print-server.json';
export const GUIDE_NAME = 'print-server-guide.html';
const GUIDE_SOURCE = 'docs/print-server-guide/PRINT-SERVER-GUIDE.html';

// ไฟล์จากโปรเจกต์ที่ Print Server ต้องใช้ (ชื่อในโปรเจกต์ → ชื่อใน zip)
const FILES = [
  'server.js',
  'print-ticket.js',
  'printer-net.js',
  'auto-print.js',
  'print-queue.js',
  'start-printer.bat',
  'install-autostart.bat',
  'uninstall-autostart.bat',
  'restart-print-server.bat',
  'check-printer.bat',
  'print-server-daemon.vbs',
  [GUIDE_SOURCE, 'README-GUIDE.html']
];
// ส่วนประกอบที่ Print Server ใช้ — ดึงเวอร์ชันจาก package.json หลัก จะได้ตรงกันเสมอ
const DEPENDENCIES = ['express', 'cors', 'node-thermal-printer'];

const readServerVersion = () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const m = src.match(/SERVER_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!m) throw new Error('หา SERVER_VERSION ใน server.js ไม่เจอ');
  return m[1];
};

// ── zip writer (มาตรฐาน PKZIP, deflate) — ไม่ต้องลงแพ็กเกจเพิ่ม ──
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const dosDateTime = (date) => {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
};

export const makeZip = (entries, date = new Date()) => {
  const { time, day } = dosDateTime(date);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);              // version needed
    local.writeUInt16LE(0x0800, 6);          // ชื่อไฟล์เป็น UTF-8
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);            // version made by
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);            // extra
    central.writeUInt16LE(0, 32);            // comment
    central.writeUInt16LE(0, 34);            // disk
    central.writeUInt16LE(0, 36);            // internal attrs
    central.writeUInt32LE(0, 38);            // external attrs
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
};

// ข้อความสั้น ๆ ใน zip — คู่มือเต็มอยู่ใน README-GUIDE.html
const readmeText = (version) => [
  `HumLai POS - Print Server v${version}`,
  '',
  'อ่านคู่มือเต็ม: ดับเบิลคลิก README-GUIDE.html',
  '',
  'ติดตั้งครั้งแรก',
  '  1. ติดตั้ง Node.js (รุ่น LTS) จาก https://nodejs.org',
  '  2. แตกไฟล์ zip นี้ไว้ที่ C:\\HumLai-Print-Server (อย่ารันจากในไฟล์ zip ตรง ๆ)',
  '  3. ดับเบิลคลิก install-autostart.bat (ครั้งแรกต้องต่ออินเทอร์เน็ต)',
  '  4. เปิดหน้าเว็บ > หลังบ้าน > ตั้งค่าเครื่องพิมพ์ สถานะ Print Server ต้องเป็นสีเขียว',
  '',
  'อัปเดตเวอร์ชันใหม่',
  '  ดาวน์โหลด zip ใหม่จากหน้าตั้งค่าเครื่องพิมพ์ แตกไฟล์ทับโฟลเดอร์เดิม',
  '  แล้วดับเบิลคลิก restart-print-server.bat (ค่าที่ตั้งไว้ไม่หาย)',
  '',
  'มีปัญหา: ดับเบิลคลิก check-printer.bat'
].join('\r\n') + '\r\n';

export const buildPrintServerPackage = ({ outDir = path.join(ROOT, 'public', 'downloads'), log = console.log } = {}) => {
  const version = readServerVersion();
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const dependencies = Object.fromEntries(DEPENDENCIES.map(name => {
    const v = rootPkg.dependencies && rootPkg.dependencies[name];
    if (!v) throw new Error(`package.json ไม่มี ${name}`);
    return [name, v];
  }));
  const serverPkg = {
    name: 'humlai-print-server',
    version,
    private: true,
    type: 'module',
    description: 'HumLai POS Print Server — ส่งงานพิมพ์จากหน้าเว็บไปเครื่องพิมพ์ในวงแลน',
    scripts: { start: 'node server.js' },
    dependencies
  };

  const entries = FILES.map(item => {
    const [from, to] = Array.isArray(item) ? item : [item, item];
    return { name: `${FOLDER}/${to}`, data: fs.readFileSync(path.join(ROOT, from)) };
  });
  entries.push({ name: `${FOLDER}/package.json`, data: Buffer.from(JSON.stringify(serverPkg, null, 2) + '\n') });
  entries.push({ name: `${FOLDER}/README.txt`, data: Buffer.from(readmeText(version), 'utf8') });

  const zip = makeZip(entries);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, ZIP_NAME), zip);
  fs.copyFileSync(path.join(ROOT, GUIDE_SOURCE), path.join(outDir, GUIDE_NAME));
  const manifest = {
    version,
    file: ZIP_NAME,
    guide: GUIDE_NAME,
    size: zip.length,
    files: entries.map(e => e.name.slice(FOLDER.length + 1)),
    builtAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(outDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + '\n');
  log(`[print-server] ${ZIP_NAME} v${version} (${(zip.length / 1024).toFixed(0)} KB, ${entries.length} ไฟล์) → ${path.relative(ROOT, outDir)}`);
  return manifest;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildPrintServerPackage();
}
