// รัน API ของ POS เป็นเซิร์ฟเวอร์ของตัวเอง — สำหรับกรณีที่ไม่ได้ deploy บน Vercel
// เช่นตั้งไว้ที่เครื่องออฟฟิศเครื่องเดียวกับ SQL Server แล้วให้หน้าเว็บชี้มาที่นี่
//
//   node --env-file=.env sql-api-server.js
//   (หรือ npm run api:serve)
//
// เซิร์ฟเวอร์นี้เปิดหน้าเว็บ POS ด้วย (โฟลเดอร์ dist ที่ update-api.bat สร้างให้ — npm run web:build)
// เปิดผ่าน Cloudflare Tunnel เป็น https://pos.<โดเมนร้าน> → หน้าเว็บกับ API อยู่โดเมนเดียวกัน ไม่ต้องพึ่ง Vercel
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cors from 'cors';
import { route } from './api/_lib/router.js';
import { query } from './api/_lib/db.js';
import { flushCrmQueue, syncMenuToCrm } from './api/_lib/crm.js';
import { imageProxy } from './api/_lib/imageProxy.js';

const app = express();
const PORT = Number(process.env.API_PORT || 8080);

// เปิดออกอินเทอร์เน็ตผ่าน Tunnel = ใครก็ยิงมาได้ จำกัดโดเมนที่เบราว์เซอร์เรียกได้ด้วย API_ALLOW_ORIGIN
// (ไม่ตั้ง = อนุญาตทุกโดเมนเหมือนเดิม — Print Server กับเครื่องในร้านยังเรียกได้ตามปกติ)
const allowOrigin = String(process.env.API_ALLOW_ORIGIN || '').trim();
app.use(cors(allowOrigin ? { origin: allowOrigin.split(',').map(s => s.trim()).filter(Boolean) } : {}));
// หน้าบ้านส่ง Content-Type: text/plain มาตั้งแต่ยุค GAS — ต้องรับทั้งสองแบบ
app.use(express.json({ limit: '12mb' }));
app.use(express.text({ type: 'text/*', limit: '12mb' }));

// IP ของลูกค้า: ผ่าน Cloudflare Tunnel ได้จาก CF-Connecting-IP · ผ่าน proxy อื่นใช้ X-Forwarded-For ตัวแรก · ในวง LAN ใช้ที่อยู่ที่ต่อเข้ามา
const clientIp = (req) => String(req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || '').trim();

app.all('/api/pos', async (req, res) => {
  try {
    const result = await route({ method: req.method, params: req.query, body: req.body, ip: clientIp(req) });
    res.set('Cache-Control', 'no-store').json(result);
  } catch (err) {
    console.error('[pos]', req.method, req.query.action || '', err);
    res.status(500).json({ success: false, error: String(err.message || err) });
  }
});

app.get('/api/image', async (req, res) => {
  try {
    const result = await query('SELECT mimeType, bytes FROM dbo.Images WHERE id = @id', { id: String(req.query.id || '') });
    if (!result.recordset.length) return res.status(404).json({ success: false, error: 'ไม่พบรูปนี้' });
    res.set('Content-Type', result.recordset[0].mimeType || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(result.recordset[0].bytes));
  } catch (err) {
    res.status(500).json({ success: false, error: String(err.message || err) });
  }
});

// ย่อรูปเมนูจาก ImgBB / Google Drive (แทนตัวย่อรูปของ Vercel)
app.get('/api/img', (req, res) => imageProxy(req, res).catch(err => {
  console.error('[img]', err);
  if (!res.headersSent) res.status(500).json({ success: false, error: String(err.message || err) });
}));

// ── หน้าเว็บ POS (dist) ──
// ไฟล์ใน assets/ มีรหัสในชื่อไฟล์ (เปลี่ยนทุกครั้งที่ build) จึงแคชยาวได้ · index.html ต้องโหลดใหม่เสมอ ไม่งั้นเครื่องค้างรุ่นเก่า
const WEB_DIR = join(process.cwd(), 'dist');
const sendIndex = (res) => {
  const file = join(WEB_DIR, 'index.html');
  if (!existsSync(file)) {
    return res.status(503).type('html').send('<meta charset="utf-8"><h3>ยังไม่ได้สร้างหน้าเว็บ</h3><p>รัน <b>update-api.bat</b> (Run as administrator) ที่เครื่องนี้หนึ่งครั้ง</p>');
  }
  res.set('Cache-Control', 'no-cache');
  return res.sendFile(file);
};
app.use(express.static(WEB_DIR, {
  index: false,
  setHeaders: (res, path) => {
    if (/[\\/]assets[\\/]/.test(path)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
    else if (/[\\/](images|icons|audio)[\\/]|\.(png|jpe?g|webp|svg|ico)$/i.test(path)) res.set('Cache-Control', 'public, max-age=604800');
    else res.set('Cache-Control', 'no-cache');
  }
}));
// ลิงก์หน้าใด ๆ ของแอป (/kiosk, /admin/...) → index.html ให้ React Router พาไปเอง (แทน rewrites ใน vercel.json)
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  if (/\.[a-z0-9]{2,5}$/i.test(req.path)) return next();   // ไฟล์ที่ไม่มีจริง → 404 ไม่ใช่หน้าเว็บ
  return sendIndex(res);
});

// ระบบสมาชิก: ส่งบิลที่ค้างในคิว (ตอนเน็ตหลุด/CRM ปิด) ทุก 1 นาที
if (process.env.CRM_URL) setInterval(() => { flushCrmQueue(50).catch((e) => console.error('[crm]', e)); }, 60 * 1000);
// ส่งเมนูให้ระบบสมาชิก (เลือกของฟรี/เงื่อนไขสินค้าในคูปอง) ตอนเปิดเครื่องและทุก 30 นาที
if (process.env.CRM_URL) {
  const syncMenu = () => syncMenuToCrm().then((r) => { if (!r.success && !r.skipped) console.error('[crm] ส่งเมนูไม่สำเร็จ:', r.error); }).catch((e) => console.error('[crm]', e));
  setTimeout(syncMenu, 15 * 1000);
  setInterval(syncMenu, 30 * 60 * 1000);
}

app.listen(PORT, () => {
  console.log(`POS API พร้อมใช้งานที่ http://localhost:${PORT}/api/pos`);
  console.log(existsSync(join(WEB_DIR, 'index.html')) ? `หน้าเว็บ POS: http://localhost:${PORT}/` : 'ยังไม่มีหน้าเว็บ (dist) — รัน update-api.bat หรือ npm run web:build');
  console.log(`ทดสอบการต่อฐานข้อมูล: http://localhost:${PORT}/api/pos?action=ping`);
});
