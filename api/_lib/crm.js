// เชื่อมระบบสมาชิก (CRM: crm.naraipizzeria.com)
//   - ค้นหาสมาชิกตอนปิดบิล (สแกน QR บัตรสมาชิก / พิมพ์เบอร์ / เลขสมาชิก)
//   - ส่งบิลที่ชำระแล้วไปให้แต้ม (ทุกบิล รวมบิลที่ไม่ใช่สมาชิก เพื่อให้ CRM รู้สัดส่วนยอดขายสมาชิก)
//
// เรียก CRM จากเซิร์ฟเวอร์ API เท่านั้น — กุญแจ CRM อยู่ใน .env ของเครื่องนี้ ไม่เคยถูกส่งไปที่หน้าเว็บ
// ตั้งค่าใน .env:
//   CRM_URL=https://crm.naraipizzeria.com
//   CRM_KEYS={"XUM":"crm_xxx"}        กุญแจเครื่อง POS ของแต่ละสาขา (ออกจากเครื่อง CRM: scripts/manage.js pos-key <สาขา>)
//   CRM_ACCESS_CLIENT_ID / CRM_ACCESS_CLIENT_SECRET   Service Token ของ Cloudflare Access (ถ้า CRM อยู่หลัง Access)
// ไม่ตั้ง CRM_URL = ปิดการเชื่อมทั้งหมด POS ทำงานเหมือนเดิมทุกอย่าง
import crypto from 'node:crypto';
import { query } from './db.js';

const TIMEOUT_MS = 6000;
const MAX_ATTEMPTS = 200;            // ราว 2-3 วันเมื่อรวมช่วงรอที่ยืดออกเรื่อย ๆ
const MEMBER_ID = /^MB-\d{7}$/;

const base = () => String(process.env.CRM_URL || '').trim().replace(/\/+$/, '');
let keysCache = null;
function keys() {
  if (keysCache) return keysCache;
  try { keysCache = JSON.parse(process.env.CRM_KEYS || '{}') || {}; } catch { keysCache = {}; console.error('[crm] CRM_KEYS ไม่ใช่ JSON ที่ถูกต้อง'); }
  return keysCache;
}
// กุญแจของสาขา · มีสาขาเดียวใส่ "*" แทนรหัสสาขาได้
const keyFor = (branchId) => keys()[String(branchId || '')] || keys()['*'] || '';
export const crmEnabled = (branchId) => !!base() && !!keyFor(branchId);

// CRM ไม่ตอบเมื่อไม่นานนี้ → ไม่รอส่งตอนปิดบิล (ไม่ให้แคชเชียร์ต้องรอทุกบิลตอนเน็ตล่ม) ปล่อยให้คิวส่งซ้ำแทน
let downUntil = 0;
async function call(path, body, branchId, timeoutMs = TIMEOUT_MS) {
  const headers = { 'content-type': 'application/json', 'x-api-key': keyFor(branchId) };
  if (process.env.CRM_ACCESS_CLIENT_ID) {
    headers['CF-Access-Client-Id'] = process.env.CRM_ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = process.env.CRM_ACCESS_CLIENT_SECRET || '';
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(base() + path, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await res.text();
    let data = null; try { data = JSON.parse(text); } catch { /* หน้า HTML เช่นหน้า login ของ Cloudflare */ }
    if (!data) return { ok: false, status: res.status, retry: true, error: res.status === 403 || /cloudflareaccess|<html/i.test(text) ? 'ระบบสมาชิกปฏิเสธการเชื่อมต่อ (ตรวจ Service Token ของ Cloudflare Access)' : 'ระบบสมาชิกตอบกลับผิดรูปแบบ' };
    if (!res.ok) return { ok: false, status: res.status, retry: res.status >= 500 || res.status === 429, code: data.error, error: data.message || data.error || ('HTTP ' + res.status), data };
    downUntil = 0;
    return { ok: true, data };
  } catch (err) {
    downUntil = Date.now() + 60000;
    return { ok: false, retry: true, error: err.name === 'AbortError' ? 'ระบบสมาชิกไม่ตอบ (เกิน ' + timeoutMs / 1000 + ' วินาที)' : 'ต่อระบบสมาชิกไม่ได้: ' + (err.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

// ── ค้นหาสมาชิก ──
// จำกัดจำนวนครั้งต่อนาที กันการไล่เดาเบอร์ (หน้าลูกค้าเรียกได้โดยไม่ต้องล็อกอิน)
const lookups = [];
function rateLimited(limit) {
  const now = Date.now();
  while (lookups.length && now - lookups[0] > 60000) lookups.shift();
  if (lookups.length >= limit) return true;
  lookups.push(now);
  return false;
}
const maskName = (name) => {
  const s = String(name || '').trim();
  if (!s) return 'สมาชิก';
  const first = s.split(/\s+/)[0];
  return Array.from(first).slice(0, 2).join('') + '***';
};

// staff = พนักงานหน้าร้าน (เห็นชื่อเต็มและแต้ม) · ลูกค้าหน้า QR สั่งเองเห็นแค่ชื่อย่อ
export async function lookupMember({ query: q, branchId, staff }) {
  const raw = String(q || '').trim();
  if (!raw) return { success: false, error: 'สแกน QR บัตรสมาชิก หรือพิมพ์เบอร์โทร / เลขสมาชิก' };
  if (!crmEnabled(branchId)) return { success: false, error: 'สาขานี้ยังไม่ได้เชื่อมระบบสมาชิก' };
  if (rateLimited(staff ? 120 : 30)) return { success: false, error: 'ค้นหาถี่เกินไป ลองใหม่ในอีกสักครู่' };
  const body = raw.startsWith('QR.') ? { qrToken: raw } : { query: raw };
  const r = await call('/api/pos/members/resolve', body, branchId);
  if (!r.ok) {
    if (r.status === 404) return { success: false, notFound: true, error: /^(CP\.)?[A-Z0-9]{2}-/i.test(raw) ? 'ไม่พบคูปองนี้' : 'ไม่พบสมาชิก' };
    if (r.status === 410) return { success: false, error: 'QR หมดอายุ ให้ลูกค้าเปิดบัตรสมาชิกใหม่แล้วสแกนอีกครั้ง' };
    return { success: false, offline: !!r.retry, error: r.error };
  }
  const m = r.data.member || {};
  if (!staff) return { success: true, member: { id: m.id, name: maskName(m.name) } };
  // สแกน QR คูปอง (CP.xxx) → ส่งคูปองที่สแกนกลับไปด้วย ให้หน้าขายใช้กับบิลนี้ทันที
  return { success: true, member: { id: m.id, name: m.name, phone: m.phone, points: r.data.balance, tier: r.data.tier }, coupons: (r.data.coupons || []).length,
    scannedCoupon: r.data.scannedCoupon || null };
}

// ── คูปองและแลกแต้ม (ระยะ 2) ──
// kiosk = หน้าลูกค้าสั่งเอง · จองคูปองนานกว่า เพราะรอพนักงานยืนยันยอดโอน
// CRM_KIOSK_VERIFY=1 → ต้องยืนยันตัวตนด้วยรหัส 6 หลักในบัตรสมาชิก LINE ก่อน (verifyToken) · ไม่ตั้ง = แสดงคูปองและแลกแต้มได้ทันทีหลังใส่เลขสมาชิก
const MEMBER_RE = MEMBER_ID;
const kioskVerify = () => process.env.CRM_KIOSK_VERIFY === '1';
function memberBody(data, kiosk) {
  const memberId = String(data.memberId || '');
  if (!MEMBER_RE.test(memberId)) return null;
  return kiosk && kioskVerify() ? { memberId, requireVerify: true, verifyToken: String(data.verifyToken || '') } : { memberId };
}
const ref = (v) => String(v || '').replace(/[^\w.:-]/g, '').slice(0, 80);
// รายการในตะกร้า ให้ CRM ตรวจคูปองของฟรี/เงื่อนไขสินค้า · menuId มีเฉพาะหน้าลูกค้าสั่งเอง (หน้าพนักงาน CRM จับคู่จากชื่อเมนู)
const cartItems = (list) => (Array.isArray(list) ? list.slice(0, 300).map((i) => ({
  ...(i.menuId ? { menuId: String(i.menuId).slice(0, 60) } : {}), name: String(i.name || '').slice(0, 300),
  price: Math.max(0, Number(i.price) || 0), qty: Math.max(0, Number(i.qty) || 0), ...(i.category ? { category: String(i.category).slice(0, 100) } : {})
})).filter((i) => i.name && i.qty > 0) : undefined);
async function crmAction(path, body, branchId) {
  if (!crmEnabled(branchId)) return { success: false, error: 'สาขานี้ยังไม่ได้เชื่อมระบบสมาชิก' };
  const r = await call(path, body, branchId);
  if (!r.ok) return { success: false, offline: !!r.retry, code: r.code, verify: r.status === 401 && r.code === 'verify_required', error: r.error };
  return { success: true, ...r.data };
}
export async function memberWallet(data, branchId, kiosk) {
  const m = memberBody(data, kiosk);
  if (!m) return { success: false, error: 'ไม่พบเลขสมาชิก' };
  return crmAction('/api/pos/members/wallet', { ...m, subtotal: Number(data.subtotal) || 0, ref: ref(data.ref), items: cartItems(data.items) }, branchId);
}
export async function reserveCoupon(data, branchId, kiosk) {
  const m = memberBody(data, kiosk);
  if (!m || !ref(data.ref)) return { success: false, error: 'ข้อมูลไม่ครบ' };
  return crmAction('/api/pos/coupons/reserve', { ...m, couponId: String(data.couponId || ''), ref: ref(data.ref), subtotal: Number(data.subtotal) || 0, minutes: kiosk ? 120 : 30, items: cartItems(data.items) }, branchId);
}
export async function releaseCoupon(data, branchId) {
  if (!data.couponId || !ref(data.ref)) return { success: true, released: false };
  return crmAction('/api/pos/coupons/release', { couponId: String(data.couponId), ref: ref(data.ref) }, branchId);
}
export async function redeemReward(data, branchId, kiosk) {
  const m = memberBody(data, kiosk);
  if (!m || !ref(data.ref)) return { success: false, error: 'ข้อมูลไม่ครบ' };
  return crmAction('/api/pos/redeem', { ...m, rewardId: Number(data.rewardId), ref: ref(data.ref), subtotal: Number(data.subtotal) || 0, minutes: kiosk ? 120 : 30, items: cartItems(data.items) }, branchId);
}
// ยืนยันตัวตนที่หน้าลูกค้าสั่งเอง: รหัส 6 หลักในบัตรสมาชิก LINE (ไม่ส่งข้อความ) · send = ขอลิงก์เปิดบัตรสมาชิก
export async function sendMemberCode(data, branchId) {
  if (!MEMBER_RE.test(String(data.memberId || ''))) return { success: false, error: 'ไม่พบเลขสมาชิก' };
  if (rateLimited(30)) return { success: false, error: 'ขอรหัสถี่เกินไป ลองใหม่ในอีกสักครู่' };
  return crmAction('/api/pos/members/verify/send', { memberId: String(data.memberId) }, branchId);
}
export async function checkMemberCode(data, branchId) {
  if (!MEMBER_RE.test(String(data.memberId || ''))) return { success: false, error: 'ไม่พบเลขสมาชิก' };
  return crmAction('/api/pos/members/verify/check', { memberId: String(data.memberId), code: String(data.code || '').replace(/\D/g, '').slice(0, 6) }, branchId);
}

// ลิงก์สมัครสมาชิกผ่าน LINE ของสาขานี้ (ปุ่มที่หน้าลูกค้าสั่งเอง) · จำไว้ 10 นาที ไม่ต้องถาม CRM ทุกครั้งที่ลูกค้าเปิดหน้า
const joinCache = new Map();
export async function joinLink(branchId) {
  const hit = joinCache.get(branchId);
  if (hit && hit.until > Date.now()) return { success: true, url: hit.url };
  const r = await crmAction('/api/pos/join-link', {}, branchId);
  if (r.success) joinCache.set(branchId, { url: r.url || null, until: Date.now() + 10 * 60 * 1000 });
  return r.success ? { success: true, url: r.url || null } : r;
}

// ── ส่งเมนูไป CRM (ใช้เลือกของฟรี/เงื่อนไขสินค้าในหน้าคูปองของ CRM) ──
// เรียกหลังแก้เมนู/หมวด และทุก 30 นาที · เมนูไม่เปลี่ยนไม่ส่งซ้ำ (ยกเว้นครบ 6 ชั่วโมง)
let menuSent = { hash: '', at: 0 };
let menuBusy = null;
export function syncMenuToCrm({ force = false } = {}) {
  if (!menuBusy) menuBusy = sendMenu(force).finally(() => { menuBusy = null; });
  return menuBusy;
}
async function sendMenu(force) {
  const branch = Object.keys(keys()).find((k) => keys()[k]);
  if (!base() || !branch) return { success: false, skipped: true, error: 'ยังไม่ได้ตั้งค่า CRM_URL / CRM_KEYS' };
  const [menu, cats] = await Promise.all([query('SELECT id, name, category, price, isActive FROM dbo.Menu'), query('SELECT slug, name FROM dbo.Categories')]);
  const catName = new Map(cats.recordset.map((c) => [c.slug, c.name]));
  const items = menu.recordset.filter((m) => m.id && m.name).map((m) => ({ id: String(m.id), name: String(m.name), category: m.category || null,
    categoryName: catName.get(m.category) || m.category || null, price: Number(m.price) || 0, active: m.isActive !== false }));
  const hash = crypto.createHash('sha1').update(JSON.stringify(items)).digest('hex');
  if (!force && hash === menuSent.hash && Date.now() - menuSent.at < 6 * 3600 * 1000) return { success: true, unchanged: true, count: items.length };
  const r = await call('/api/pos/menu', { items }, branch, 20000);
  if (!r.ok) return { success: false, error: r.error };
  menuSent = { hash, at: Date.now() };
  return { success: true, count: r.data.count };
}

// ── ส่งบิล ──
// สร้างข้อมูลที่จะส่งจากแถว Orders ของบิล (แถวตัวเลือก ↳ ราคา 0 ไม่นับ)
//   rows: [{ name, price (ราคารวมของแถว), qty }]
export function billPayload({ orderNumber, memberId, rows, paidTotal, storeDiscount, channel, staff, couponIds, couponRef, couponDiscount }) {
  const items = rows
    .filter((r) => r.name && !String(r.name).startsWith('↳'))
    .map((r, i) => {
      const qty = Number(r.qty) || 1;
      return { id: String(i + 1), name: String(r.name).slice(0, 200), price: Math.round(((Number(r.price) || 0) / qty) * 100) / 100, qty };
    });
  return {
    posBillId: orderNumber,
    memberId: MEMBER_ID.test(String(memberId || '')) ? String(memberId) : null,
    items,
    storeDiscount: Math.max(0, Number(storeDiscount) || 0),
    paidTotal: Math.max(0, Number(paidTotal) || 0),
    channel: channel === 'kiosk' ? 'kiosk' : 'pos',
    // คูปองสมาชิกที่จองไว้กับบิลนี้ + ยอดส่วนลดที่ให้ลูกค้าไปจริง (CRM ใช้ยอดนี้แม้คูปองมีปัญหาตอนบิลมาถึง)
    ...(Array.isArray(couponIds) && couponIds.length && MEMBER_ID.test(String(memberId || ''))
      ? { couponIds: couponIds.map(String).slice(0, 3), couponRef: ref(couponRef), couponDiscount: Math.max(0, Number(couponDiscount) || 0) }
      : {}),
    staffId: staff ? String(staff).slice(0, 60) : undefined
  };
}

// คิวในตาราง CrmBills — ฐานข้อมูลที่ยังไม่ได้รัน sql:init ไม่มีตารางนี้ ถือว่าปิดการเชื่อมไว้ก่อน
let tableReady = false;
async function hasTable() {
  if (tableReady) return true;
  try {
    const res = await query(`SELECT OBJECT_ID('dbo.CrmBills', 'U') AS id`);
    tableReady = !!(res.recordset[0] && res.recordset[0].id);
  } catch { /* ยังไม่มี */ }
  return tableReady;
}

// เรียกในทรานแซกชันเดียวกับบันทึกบิล — บิลกับคิวเกิดพร้อมกันเสมอ
export async function queueBill(runner, branchId, payload) {
  if (!crmEnabled(branchId) || !payload.items.length || !(await hasTable())) return false;
  await runner(
    `IF NOT EXISTS (SELECT 1 FROM dbo.CrmBills WHERE BranchId = @b AND OrderNumber = @o)
       INSERT INTO dbo.CrmBills (BranchId, OrderNumber, MemberId, PayloadJson) VALUES (@b, @o, @m, @p)`,
    { b: String(branchId), o: payload.posBillId, m: payload.memberId, p: JSON.stringify(payload) });
  return true;
}

const backoffSeconds = (attempts) => Math.min(3600, 30 * 2 ** Math.min(attempts, 7));

// ส่งบิลหนึ่งใบในคิว คืนผลแต้มเพื่อพิมพ์ลงใบเสร็จ
async function sendRow(row, timeoutMs) {
  const payload = JSON.parse(row.PayloadJson);
  let r = await call('/api/pos/transactions', payload, row.BranchId, timeoutMs);
  // สมาชิกถูกลบไปแล้วระหว่างรอส่ง → ยังบันทึกยอดขายได้ แค่ไม่ผูกสมาชิก
  if (!r.ok && r.status === 404 && payload.memberId) {
    r = await call('/api/pos/transactions', { ...payload, memberId: null }, row.BranchId);
    if (r.ok) r.note = 'ไม่พบสมาชิก ' + payload.memberId + ' บันทึกเป็นบิลทั่วไป';
  }
  if (r.ok) {
    const d = r.data;
    await query(`UPDATE dbo.CrmBills SET [Status] = 'sent', SentAt = SYSUTCDATETIME(), Attempts = Attempts + 1, Points = @pts, Balance = @bal, LastError = @note WHERE RowId = @id`,
      { id: row.RowId, pts: d.points ?? null, bal: d.balance ?? null, note: r.note || null });
    return { sent: true, points: d.points ?? 0, balance: d.balance ?? null, duplicate: !!d.duplicate };
  }
  const attempts = row.Attempts + 1;
  const giveUp = !r.retry || attempts >= MAX_ATTEMPTS;
  await query(`UPDATE dbo.CrmBills SET [Status] = @st, Attempts = @a, LastError = @e, NextAttempt = DATEADD(SECOND, @wait, SYSUTCDATETIME()) WHERE RowId = @id`,
    { id: row.RowId, st: giveUp ? 'failed' : 'pending', a: attempts, e: String(r.error || '').slice(0, 500), wait: backoffSeconds(attempts) });
  return { sent: false, error: r.error };
}

// ส่งบิลที่เพิ่งปิดทันที (รอไม่เกิน 6 วินาที) เพื่อได้แต้มไปพิมพ์ใบเสร็จ · ไม่สำเร็จ = อยู่ในคิวรอส่งซ้ำ ไม่กระทบการขาย
export async function sendBillNow(branchId, orderNumber) {
  try {
    if (!(await hasTable())) return null;
    const res = await query(`SELECT * FROM dbo.CrmBills WHERE BranchId = @b AND OrderNumber = @o`, { b: String(branchId), o: orderNumber });
    const row = res.recordset[0];
    if (!row) return null;
    if (row.Status === 'sent') return { sent: true, points: row.Points ?? 0, balance: row.Balance, memberId: row.MemberId };
    if (row.Status === 'failed') return { sent: false, error: row.LastError, memberId: row.MemberId };
    if (Date.now() < downUntil) return { sent: false, queued: true, error: 'ระบบสมาชิกไม่ตอบ จะส่งแต้มให้อัตโนมัติภายหลัง', memberId: row.MemberId };
    return { ...(await sendRow(row, 3500)), memberId: row.MemberId };
  } catch (err) {
    console.error('[crm] sendBillNow', err);
    return { sent: false, error: String(err.message || err) };
  }
}

// ส่งบิลที่ค้างในคิว — เซิร์ฟเวอร์ API เรียกทุก 1 นาที และเรียกตอนมีบิลใหม่ด้วย (กรณีรันบน Vercel)
let flushing = false;
export async function flushCrmQueue(limit = 20) {
  if (flushing || !base() || !(await hasTable())) return 0;
  flushing = true;
  let n = 0;
  try {
    const res = await query(`SELECT TOP (${Math.max(1, Math.min(100, limit))}) * FROM dbo.CrmBills WHERE [Status] = 'pending' AND NextAttempt <= SYSUTCDATETIME() ORDER BY RowId`);
    for (const row of res.recordset) {
      if (!crmEnabled(row.BranchId)) continue;
      const r = await sendRow(row);
      if (r.sent) n++;
      else if (/ต่อระบบสมาชิกไม่ได้|ไม่ตอบ/.test(r.error || '')) break;   // CRM ล่มทั้งระบบ ไม่ต้องไล่ส่งใบที่เหลือ
    }
  } catch (err) {
    console.error('[crm] flush', err);
  } finally {
    flushing = false;
  }
  return n;
}

// สถานะคิว สำหรับหน้าหลังบ้าน/ตรวจระบบ
export async function crmStatus() {
  const out = { enabled: !!base(), url: base(), branches: Object.keys(keys()) };
  if (!(await hasTable())) return { ...out, queue: null, note: 'ยังไม่ได้รัน npm run sql:init (ไม่มีตาราง CrmBills)' };
  const res = await query(`SELECT [Status] AS s, COUNT(*) AS n FROM dbo.CrmBills GROUP BY [Status]`);
  const failed = await query(`SELECT TOP (20) BranchId, OrderNumber, MemberId, Attempts, LastError, CreatedAt FROM dbo.CrmBills WHERE [Status] <> 'sent' ORDER BY RowId DESC`);
  return { ...out, queue: Object.fromEntries(res.recordset.map((r) => [r.s, r.n])), notSent: failed.recordset };
}
