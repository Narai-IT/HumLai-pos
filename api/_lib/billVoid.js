// ── ยกเลิกบิลที่ชำระแล้ว (เฉพาะบิลของวันนี้ ต้องใส่หมายเหตุ) ──
//
// หน้าขาย > เพิ่มเติม > ยกเลิกบิล · ใช้ได้เฉพาะผู้จัดการ/แอดมิน (ผู้จัดการสาขายกเลิกได้แค่บิลสาขาตัวเอง)
//   1) บิลเป็น cancelled → หลุดจากรายงานยอดขาย/สรุปยอดเหมือนบิลที่ยกเลิกแบบเดิม
//   2) จดหมายเหตุ ใครยกเลิก เมื่อไหร่ ในตาราง BillVoids
//   3) คืนสิทธิ์เมนูสมาชิกของบิลนั้น
//   4) ระบบสมาชิก (CRM):
//        - บิลยังไม่ถึง CRM (รอส่ง/ส่งไม่ผ่าน) → ไม่ต้องส่งแล้ว ลูกค้าไม่ได้แต้มจากบิลนี้
//        - บิลถึง CRM แล้ว → ส่งคำขอคืนเงินทั้งบิล: CRM หักแต้มคืน คืนคูปอง/Voucher ที่ใช้ในบิล
//          ส่งไม่สำเร็จ (เน็ตหลุด/CRM ปิด) ส่งซ้ำเองพร้อมคิวส่งบิล (flushCrmQueue) · CRM กันซ้ำด้วยเลขคืนเงิน VOID-<เลขบิล>
// ไม่คืนเงินให้ลูกค้าเอง (โอนคืน/คืนเงินสดที่ร้าน) และไม่คืนสต็อกวัตถุดิบ (อาหารอาจทำไปแล้ว)
import { query, withTransaction, lockKey } from './db.js';
import { releaseMemberMenu } from './memberMenu.js';
import { thaiTimeISO, dayStart, dayEnd } from './time.js';
import { sendVoidNow } from './crm.js';

const REASON_MIN = 3;
const REASON_MAX = 300;

const DDL = `
IF OBJECT_ID('dbo.BillVoids', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.BillVoids (
    RowId          INT IDENTITY(1,1) PRIMARY KEY,
    OrderNumber    NVARCHAR(60)  NOT NULL,
    BranchId       NVARCHAR(60)  NULL,
    Total          DECIMAL(18,2) NULL,
    Reason         NVARCHAR(300) NOT NULL,
    VoidedBy       NVARCHAR(120) NULL,
    VoidedByUid    NVARCHAR(60)  NULL,
    VoidedAt       NVARCHAR(40)  NOT NULL,
    CrmStatus      NVARCHAR(20)  NOT NULL DEFAULT 'none',
    CrmAttempts    INT           NOT NULL DEFAULT 0,
    CrmNextAttempt DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME(),
    CrmError       NVARCHAR(500) NULL,
    PointsReversed INT           NULL,
    CreatedAt      DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE UNIQUE INDEX UX_BillVoids_Order ON dbo.BillVoids (OrderNumber);
  CREATE INDEX IX_BillVoids_Crm ON dbo.BillVoids (CrmStatus, CrmNextAttempt);
END;`;

let ensured = null;
export const ensureVoidTable = () => {
  if (!ensured) {
    ensured = query(DDL).catch(err => {
      ensured = null;
      throw new Error(`ยังไม่มีตาราง BillVoids และสร้างเองไม่ได้ (${err.message}) — รัน npm run sql:init ที่เครื่อง API`);
    });
  }
  return ensured;
};

const todayYmd = () => thaiTimeISO().slice(0, 10);
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const num = (v) => Number(v) || 0;
const isCancelled = (s) => String(s || '').toLowerCase() === 'cancelled';
const crmLabel = {
  none: 'ไม่มีแต้มที่ต้องหักคืน',
  pending: 'รอส่งหักแต้มคืนให้ระบบสมาชิก',
  sent: 'หักแต้มคืนแล้ว',
  failed: 'ระบบสมาชิกปฏิเสธการหักแต้มคืน ต้องตรวจในหลังบ้านสมาชิก'
};

// ชื่อพนักงานจาก token (token เก็บแค่ uid/role/branch)
async function staffName(user) {
  try {
    const res = await query(`SELECT TOP (1) username FROM dbo.Users WHERE CAST(id AS NVARCHAR(60)) = @id`, { id: String(user.uid) });
    return text(res.recordset[0] && res.recordset[0].username, 120) || String(user.uid);
  } catch { return String(user.uid); }
}

// ── บิลของวันนี้ (เวลาไทย) ทั้งที่ยกเลิกได้และที่ยกเลิกไปแล้ว ──
export async function getVoidableBills(params = {}) {
  await ensureVoidTable();
  const branchId = text(params.branch, 60);
  const day = todayYmd();
  const bounds = { from: dayStart(day), to: dayEnd(day) };
  if (branchId) bounds.branchId = branchId;
  const where = `o.OrderNumber IS NOT NULL AND o.TsLocal >= @from AND o.TsLocal <= @to${branchId ? ' AND o.BranchId = @branchId' : ''}`;

  const [orders, pays, invoices, voids, crm] = await Promise.all([
    query(`SELECT o.OrderNumber, o.[Timestamp], o.CustomerName, o.ItemDetail, o.Price, o.Quantity, o.TotalAmount, o.[Status], o.BranchId
             FROM dbo.Orders o WHERE ${where} ORDER BY o.RowId ASC`, bounds),
    query(`SELECT p.orderNumber, p.paymentMethod, p.tableNo, p.staff, p.grandTotal FROM dbo.PaymentSummary p
             WHERE p.orderNumber IN (SELECT DISTINCT o.OrderNumber FROM dbo.Orders o WHERE ${where})`, bounds),
    query(`SELECT orderNumber, invoiceNo FROM dbo.TaxInvoices WHERE ISNULL(cancelled, 0) = 0
             AND orderNumber IN (SELECT DISTINCT o.OrderNumber FROM dbo.Orders o WHERE ${where})`, bounds).catch(() => ({ recordset: [] })),
    query(`SELECT * FROM dbo.BillVoids WHERE OrderNumber IN (SELECT DISTINCT o.OrderNumber FROM dbo.Orders o WHERE ${where})`, bounds),
    query(`SELECT OrderNumber, MemberId, Points, [Status] FROM dbo.CrmBills
             WHERE OrderNumber IN (SELECT DISTINCT o.OrderNumber FROM dbo.Orders o WHERE ${where})`, bounds).catch(() => ({ recordset: [] }))
  ]);

  const pay = new Map(pays.recordset.map(p => [p.orderNumber, p]));
  const inv = new Map(invoices.recordset.map(i => [i.orderNumber, i.invoiceNo]));
  const vd = new Map(voids.recordset.map(v => [v.OrderNumber, v]));
  const cb = new Map(crm.recordset.map(c => [c.OrderNumber, c]));
  const bills = new Map();
  for (const r of orders.recordset) {
    const no = r.OrderNumber;
    let b = bills.get(no);
    if (!b) {
      const p = pay.get(no);
      b = { orderNumber: no, timestamp: r.Timestamp, customerName: r.CustomerName || '', tableNo: p ? p.tableNo || '' : '',
        total: num(p && p.grandTotal != null ? p.grandTotal : r.TotalAmount), paymentMethod: p ? p.paymentMethod || '' : '',
        staff: p ? p.staff || '' : '', status: r.Status || '', paid: !!p, cancelled: true, items: [] };
      bills.set(no, b);
    }
    if (!isCancelled(r.Status)) b.cancelled = false;
    if (String(r.Status || '').toLowerCase() === 'completed') b.paid = true;
    const name = String(r.ItemDetail || '');
    if (name && !name.startsWith('↳')) b.items.push({ name, qty: num(r.Quantity) || 1, price: num(r.Price) });
  }

  const out = [];
  for (const b of bills.values()) {
    const v = vd.get(b.orderNumber);
    const c = cb.get(b.orderNumber);
    // บิลที่ยังไม่ชำระ (โต๊ะยังเปิดอยู่) ไม่ใช่งานของหน้านี้ · บิลที่ยกเลิกแบบเดิม (ไม่มีหมายเหตุ) แสดงด้วยให้รู้ว่ายกเลิกแล้ว
    if (!b.paid && !b.cancelled) continue;
    out.push({
      ...b,
      memberId: c && c.MemberId ? c.MemberId : '',
      points: c && c.Points != null ? c.Points : null,
      taxInvoiceNo: inv.get(b.orderNumber) || '',
      void: v ? { reason: v.Reason, by: v.VoidedBy || '', at: v.VoidedAt, crmStatus: v.CrmStatus, crmLabel: crmLabel[v.CrmStatus] || v.CrmStatus,
        crmError: v.CrmError || '', pointsReversed: v.PointsReversed } : null
    });
  }
  out.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  return { success: true, day, bills: out };
}

// ── ยกเลิกบิล ──
export async function voidBill(data) {
  const user = data._user;
  if (!user) return { success: false, error: 'ต้องล็อกอินก่อนยกเลิกบิล' };
  if (user.role !== 'admin') return { success: false, error: 'ยกเลิกบิลได้เฉพาะผู้จัดการ/แอดมิน' };
  const orderNumber = text(data.orderNumber, 60);
  const reason = text(data.reason, REASON_MAX);
  if (!orderNumber) return { success: false, error: 'ไม่ได้ระบุเลขบิล' };
  if (reason.length < REASON_MIN) return { success: false, error: 'กรุณาใส่หมายเหตุว่ายกเลิกเพราะอะไร' };
  await ensureVoidTable();
  const branchScope = text(data.branchId, 60);   // ผู้จัดการสาขา: auth ใส่สาขาใน token ให้ · แอดมินใหญ่: สาขาที่หน้าเว็บเปิดอยู่
  const by = await staffName(user);
  const day = todayYmd();

  const result = await withTransaction(async (runner) => {
    await lockKey(runner, `void:${orderNumber}`);
    const rows = (await runner(`SELECT [Status], TsLocal, TotalAmount, BranchId FROM dbo.Orders WHERE OrderNumber = @n`, { n: orderNumber })).recordset;
    if (!rows.length) return { success: false, error: `ไม่พบบิล ${orderNumber}` };
    const billBranch = String(rows[0].BranchId || '');
    if (branchScope && billBranch && billBranch !== branchScope) return { success: false, error: 'บิลนี้เป็นของสาขาอื่น' };
    if (rows.every(r => isCancelled(r.Status))) return { success: false, error: 'บิลนี้ถูกยกเลิกไปแล้ว' };
    // วันนี้ตามเวลาไทย (TsLocal เก็บเวลาไทยไว้แล้ว)
    const ts = rows.map(r => r.TsLocal).find(Boolean);
    const billDay = ts ? new Date(ts).toISOString().slice(0, 10) : '';
    if (billDay !== day) return { success: false, error: 'ยกเลิกได้เฉพาะบิลของวันนี้' };
    const pay = (await runner(`SELECT TOP (1) grandTotal FROM dbo.PaymentSummary WHERE orderNumber = @n`, { n: orderNumber })).recordset[0];
    const paid = !!pay || rows.some(r => String(r.Status || '').toLowerCase() === 'completed');
    if (!paid) return { success: false, error: 'บิลนี้ยังไม่ได้ชำระ ให้ยกเลิกรายการที่หน้าโต๊ะแทน' };
    let invoice = null;
    try {
      invoice = (await runner(`SELECT TOP (1) invoiceNo FROM dbo.TaxInvoices WHERE orderNumber = @n AND ISNULL(cancelled, 0) = 0`, { n: orderNumber })).recordset[0];
    } catch { /* ยังไม่มีตารางใบกำกับ */ }
    if (invoice) return { success: false, error: `บิลนี้ออกใบกำกับภาษี ${invoice.invoiceNo} แล้ว ต้องยกเลิกใบกำกับภาษีก่อน` };

    await runner(`UPDATE dbo.Orders SET [Status] = 'cancelled' WHERE OrderNumber = @n`, { n: orderNumber });

    // CRM: บิลยังไม่ถึง → ไม่ต้องส่ง · ถึงแล้ว → เข้าคิวคืนเงิน
    let crmStatus = 'none';
    let crmBill = null;
    try {
      crmBill = (await runner(`SELECT RowId, [Status] FROM dbo.CrmBills WHERE OrderNumber = @n`, { n: orderNumber })).recordset[0] || null;
    } catch { /* ยังไม่เปิดการเชื่อม CRM */ }
    if (crmBill) {
      const stopped = (await runner(`UPDATE dbo.CrmBills SET [Status] = 'cancelled', LastError = N'ยกเลิกบิลก่อนส่งถึงระบบสมาชิก'
                                      WHERE RowId = @id AND [Status] IN ('pending', 'failed')`, { id: crmBill.RowId })).rowsAffected[0];
      if (!stopped && crmBill.Status === 'sent') crmStatus = 'pending';
    }

    await runner(`INSERT INTO dbo.BillVoids (OrderNumber, BranchId, Total, Reason, VoidedBy, VoidedByUid, VoidedAt, CrmStatus)
                  VALUES (@n, @b, @t, @r, @by, @uid, @at, @crm)`,
      { n: orderNumber, b: billBranch || null, t: num(pay ? pay.grandTotal : rows[0].TotalAmount), r: reason, by, uid: String(user.uid), at: thaiTimeISO(), crm: crmStatus });
    return { success: true, orderNumber, crmStatus };
  }, { isolation: 'READ_COMMITTED' });

  if (!result.success) return result;
  await releaseMemberMenu(orderNumber);
  if (result.crmStatus === 'pending') {
    const r = await sendVoidNow(orderNumber);
    if (r) result.crmStatus = r.status;
    if (r && r.pointsReversed != null) result.pointsReversed = r.pointsReversed;
    if (r && r.error) result.crmError = r.error;
  }
  result.crmLabel = crmLabel[result.crmStatus] || result.crmStatus;
  return result;
}
