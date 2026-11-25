// ── บันทึกการทำงานหน้าร้าน (หลังบ้าน > บันทึกการทำงาน) ──
// เก็บทุกการกดที่สำคัญ: สั่งอาหาร · พิมพ์ใบครัว · ยกเลิกรายการ · พิมพ์ใบแจ้งยอด · ชำระเงิน · แก้ไขบิล · ยกเลิกบิล
// ใครทำ กี่โมง โต๊ะไหน บิลไหน รายการอะไร
// บันทึกไม่สำเร็จ (ตารางยังไม่มี/ฐานข้อมูลสะดุด) ไม่กระทบการขาย — แค่เขียน log ไว้
import { query } from './db.js';
import { thaiTimeISO, toThaiClock, dayStart, dayEnd } from './time.js';

export const KINDS = {
  order: 'สั่งอาหาร',
  kitchen_print: 'พิมพ์ใบครัว',
  kitchen_print_fail: 'พิมพ์ใบครัวไม่สำเร็จ',
  cancel_item: 'ยกเลิกรายการ',
  prebill: 'พิมพ์ใบแจ้งยอด',
  pay: 'ชำระเงิน',
  edit_bill: 'แก้ไขบิล',
  void_bill: 'ยกเลิกบิล'
};
// เหตุการณ์ที่เกิดที่หน้าเว็บ (เซิร์ฟเวอร์ไม่เห็นเอง) ให้หน้าเว็บส่งมาบันทึก
export const CLIENT_KINDS = new Set(['kitchen_print', 'kitchen_print_fail', 'prebill']);

const DDL = `
IF OBJECT_ID('dbo.ActivityLog', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ActivityLog (
    RowId       BIGINT IDENTITY(1,1) PRIMARY KEY,
    TsLocal     DATETIME2(0)   NOT NULL,
    At          NVARCHAR(40)   NOT NULL,
    BranchId    NVARCHAR(60)   NULL,
    Kind        NVARCHAR(30)   NOT NULL,
    TableNo     NVARCHAR(50)   NULL,
    OrderNumber NVARCHAR(60)   NULL,
    SessionId   NVARCHAR(80)   NULL,
    ItemsJson   NVARCHAR(MAX)  NULL,
    Amount      DECIMAL(18,2)  NULL,
    Detail      NVARCHAR(1000) NULL,
    Reason      NVARCHAR(300)  NULL,
    StaffName   NVARCHAR(120)  NULL,
    StaffUid    NVARCHAR(60)   NULL
  );
  CREATE INDEX IX_ActivityLog_Day ON dbo.ActivityLog (TsLocal, BranchId);
  CREATE INDEX IX_ActivityLog_Order ON dbo.ActivityLog (OrderNumber);
END;`;

let ensured = null;
export const ensureActivityTable = () => {
  if (!ensured) ensured = query(DDL).catch(err => { ensured = null; throw err; });
  return ensured;
};

const text = (v, max) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };

// ชื่อพนักงานจาก token (cache 5 นาที) · ไม่ได้ล็อกอิน → ชื่อที่หน้าเว็บส่งมา · หน้าลูกค้าสั่งเอง → "ลูกค้าสั่งเอง"
const nameCache = new Map();
export async function staffOf(user, fallback = '') {
  if (user && user.uid) {
    const c = nameCache.get(user.uid);
    if (c && Date.now() - c.at < 5 * 60 * 1000) return { name: c.name, uid: String(user.uid) };
    let name = String(user.uid);
    try {
      const r = await query(`SELECT TOP (1) username FROM dbo.Users WHERE CAST(id AS NVARCHAR(60)) = @id`, { id: String(user.uid) });
      if (r.recordset[0] && r.recordset[0].username) name = String(r.recordset[0].username);
    } catch { /* ใช้ uid */ }
    nameCache.set(user.uid, { name, at: Date.now() });
    return { name, uid: String(user.uid) };
  }
  const f = String(fallback || '').trim();
  return { name: /^self-?order$/i.test(f) ? 'ลูกค้าสั่งเอง' : (f || null), uid: null };
}

// items: [{ name, qty, price }] (price = ยอดของบรรทัด)
export async function logActivity(e) {
  try {
    if (!KINDS[e.kind]) return;
    await ensureActivityTable();
    const at = e.at || thaiTimeISO();
    const items = Array.isArray(e.items) && e.items.length
      ? JSON.stringify(e.items.slice(0, 100).map(i => ({ name: String(i.name || '').slice(0, 200), qty: Number(i.qty) || 1, price: Number(i.price) || 0 })))
      : null;
    await query(`INSERT INTO dbo.ActivityLog (TsLocal, At, BranchId, Kind, TableNo, OrderNumber, SessionId, ItemsJson, Amount, Detail, Reason, StaffName, StaffUid)
                 VALUES (@ts, @at, @b, @k, @t, @o, @s, @i, @a, @d, @r, @sn, @su)`, {
      ts: toThaiClock(at) || toThaiClock(new Date()), at, b: text(e.branchId, 60), k: e.kind, t: text(e.tableNo, 50), o: text(e.orderNumber, 60),
      s: text(e.sessionId, 80), i: items, a: e.amount == null || !Number.isFinite(Number(e.amount)) ? null : Number(e.amount),
      d: text(e.detail, 1000), r: text(e.reason, 300), sn: text(e.staff && e.staff.name, 120), su: text(e.staff && e.staff.uid, 60)
    });
  } catch (err) {
    console.error('[activity] บันทึกไม่สำเร็จ:', e.kind, err.message);
  }
}

// หน้าเว็บส่งเหตุการณ์มาเอง (พิมพ์ใบครัว/ใบแจ้งยอด)
export async function logClientActivity(data, user) {
  const kind = String(data.kind || '');
  if (!CLIENT_KINDS.has(kind)) return { success: false, error: 'ประเภทไม่ถูกต้อง' };
  const staff = await staffOf(user, data.staff);
  await logActivity({ kind, branchId: data.branchId, tableNo: data.tableNo, orderNumber: data.orderNumber, sessionId: data.sessionId,
    items: data.items, amount: data.amount, detail: data.detail, staff });
  return { success: true };
}

// ── รายงาน: เหตุการณ์ของวันที่เลือก (เวลาไทย) ──
export async function getActivityLog(params = {}) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(params.date || '')) ? String(params.date) : thaiTimeISO().slice(0, 10);
  const branchId = text(params.branch, 60);
  try { await ensureActivityTable(); } catch (err) { return { success: false, error: 'ยังไม่มีตารางบันทึกการทำงาน — รัน npm run sql:init (' + err.message + ')' }; }
  const res = await query(`SELECT TOP (20000) RowId, At, BranchId, Kind, TableNo, OrderNumber, SessionId, ItemsJson, Amount, Detail, Reason, StaffName
      FROM dbo.ActivityLog WHERE TsLocal >= @from AND TsLocal <= @to${branchId ? ' AND BranchId = @b' : ''} ORDER BY TsLocal ASC, RowId ASC`,
    { from: dayStart(day), to: dayEnd(day), ...(branchId ? { b: branchId } : {}) });
  const events = res.recordset.map(r => ({
    id: Number(r.RowId), at: r.At, branchId: r.BranchId || '', kind: r.Kind, label: KINDS[r.Kind] || r.Kind,
    tableNo: r.TableNo || '', orderNumber: r.OrderNumber || '', sessionId: r.SessionId || '',
    items: (() => { try { return r.ItemsJson ? JSON.parse(r.ItemsJson) : []; } catch { return []; } })(),
    amount: r.Amount == null ? null : Number(r.Amount), detail: r.Detail || '', reason: r.Reason || '', staff: r.StaffName || ''
  }));
  return { success: true, date: day, events };
}
