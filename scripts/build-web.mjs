// สร้างหน้าเว็บ POS สำหรับเปิดจากเซิร์ฟเวอร์ร้านเอง (sql-api-server.js เสิร์ฟโฟลเดอร์ dist)
//   npm run web:build   (update-api.bat เรียกให้เองทุกครั้งที่อัปเดต)
// สร้างลง dist-next ก่อน เสร็จแล้วค่อยสลับเข้า dist — ระหว่าง build หน้าเว็บเดิมยังเปิดได้ปกติ build พังก็ยังใช้ของเดิมต่อ
import { build } from 'vite';
import { existsSync } from 'node:fs';
import { rm, rename } from 'node:fs/promises';

process.env.VITE_SELF_HOSTED = '1';
process.env.VITE_API_URL = '/api/pos';   // หน้าเว็บกับ API อยู่โดเมนเดียวกัน

const NEXT = 'dist-next', LIVE = 'dist', OLD = 'dist-old';
const retry = async (fn, times = 10) => {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (err) {
      if (i >= times) throw err;
      await new Promise(r => setTimeout(r, 300 * i));   // Windows: ไฟล์ถูกเปิดอ่านอยู่ชั่วครู่
    }
  }
};

try {
  await build({ logLevel: 'warn', build: { outDir: NEXT, emptyOutDir: true } });
} catch (err) {
  console.error('[ผิดพลาด] สร้างหน้าเว็บไม่สำเร็จ — หน้าเว็บเดิมยังใช้ได้ตามปกติ');
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}
await rm(OLD, { recursive: true, force: true });
if (existsSync(LIVE)) await retry(() => rename(LIVE, OLD));
await retry(() => rename(NEXT, LIVE));
await rm(OLD, { recursive: true, force: true }).catch(() => {});
console.log('สร้างหน้าเว็บเสร็จ — เปิดได้ที่ http://localhost:' + (process.env.API_PORT || 8080) + '/');
