// ย่อรูปเมนูจากลิงก์ภายนอก (ImgBB / Google Drive) — ใช้แทนตัวย่อรูปของ Vercel (/_vercel/image) ตอนเปิดหน้าเว็บจากเซิร์ฟเวอร์ร้านเอง
//   GET /api/img?url=<ลิงก์รูป>&w=<256|640|1080>
// ดึงรูปต้นฉบับครั้งเดียว ย่อเป็น JPEG แล้วเก็บไว้ในโฟลเดอร์ cache/img — ครั้งต่อไปส่งไฟล์ที่ย่อแล้วทันที
// มือถือลูกค้าไม่ต้องโหลดจาก Google Drive ตรง ๆ (Drive จำกัดจำนวนครั้งต่อ IP ลูกค้าหลายโต๊ะใช้ Wi-Fi ร้านเดียวกันแล้วรูปไม่ขึ้น)
import crypto from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { Jimp } from 'jimp';

const ALLOWED_HOSTS = new Set(['i.ibb.co', 'lh3.googleusercontent.com']);   // ตรงกับ remotePatterns เดิมใน vercel.json
const WIDTHS = [256, 640, 1080];                                             // ตรงกับ IMAGE_WIDTHS ใน src/utils/menuImage.js
const MAX_BYTES = 15 * 1024 * 1024;
const CACHE_DIR = join(process.cwd(), 'cache', 'img');
const inflight = new Map();

const allowed = (raw) => {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && ALLOWED_HOSTS.has(u.hostname) ? u : null;
  } catch { return null; }
};

async function fetchOriginal(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    // ตามลิงก์ต่อแล้วต้องยังอยู่ในโดเมนที่อนุญาต (กันใช้เซิร์ฟเวอร์ร้านเป็นทางผ่านไปที่อื่น)
    if (!allowed(res.url)) throw new Error('ลิงก์รูปพาไปโดเมนที่ไม่อนุญาต');
    if (!res.ok) throw new Error('โหลดรูปต้นฉบับไม่สำเร็จ (' + res.status + ')');
    const type = String(res.headers.get('content-type') || '');
    if (!/^image\//i.test(type)) throw new Error('ลิงก์นี้ไม่ใช่ไฟล์รูป');
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) throw new Error('รูปต้นฉบับใหญ่เกินไป');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error('รูปต้นฉบับใหญ่เกินไป');
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

async function makeResized(url, width, file) {
  const img = await Jimp.read(await fetchOriginal(url));
  if (img.bitmap.width > width) img.resize({ w: width });
  // รูป PNG โปร่งใส → พื้นขาว (JPEG ไม่มีความโปร่งใส)
  const bg = new Jimp({ width: img.bitmap.width, height: img.bitmap.height, color: 0xffffffff });
  bg.composite(img, 0, 0);
  const out = await bg.getBuffer('image/jpeg', { quality: 75 });
  await mkdir(CACHE_DIR, { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  await writeFile(tmp, out);
  await rename(tmp, file).catch(() => {});   // อีกคำขอเขียนเสร็จก่อนก็ใช้ไฟล์นั้น
  return out;
}

export async function imageProxy(req, res) {
  const u = allowed(String(req.query.url || ''));
  if (!u) return res.status(400).json({ success: false, error: 'ลิงก์รูปไม่ถูกต้อง หรือไม่ใช่โดเมนที่อนุญาต' });
  const want = parseInt(req.query.w, 10) || 640;
  const width = WIDTHS.find(x => x >= want) || WIDTHS[WIDTHS.length - 1];
  const key = crypto.createHash('sha1').update(u.href + '|' + width).digest('hex');
  const file = join(CACHE_DIR, key + '.jpg');

  let body = await readFile(file).catch(() => null);
  if (!body) {
    // หลายเครื่องขอรูปเดียวกันพร้อมกัน → ย่อครั้งเดียว
    if (!inflight.has(key)) inflight.set(key, makeResized(u.href, width, file).finally(() => inflight.delete(key)));
    try {
      body = await inflight.get(key);
    } catch (err) {
      // ย่อไม่ได้ → หน้าเว็บลองรูปลำดับถัดไปเอง (ลิงก์ต้นฉบับ)
      return res.status(502).set('Cache-Control', 'no-store').json({ success: false, error: String(err.message || err) });
    }
  }
  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'public, max-age=2592000');   // 30 วัน เท่า minimumCacheTTL เดิมของ Vercel
  return res.send(body);
}
