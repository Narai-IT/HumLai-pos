// ── แก้ไขบิล (เลขบิลเดิม · เฉพาะบิลของวันนี้ · ต้องใส่หมายเหตุ) ──
//
// หน้าขาย > เพิ่มเติม > ยกเลิก/แก้ไขบิล > แก้ไข · ผู้จัดการ/แอดมินเท่านั้น (สิทธิ์เดียวกับยกเลิกบิล)
// ใช้กับบิลที่ปิดแล้วแต่ลูกค้ายังไม่ได้โอน: ลบ/ลดจำนวนรายการ · เลือกส่วนลดที่ตั้งในหลังบ้าน → ยอดใหม่
// หน้าเว็บพิมพ์ใบแจ้งยอดใหม่พร้อม QR ยอดใหม่ให้หลังบันทึกสำเร็จ
//   - แถวบิลใน Orders แก้ตามรายการที่เหลือ · ยอดรวมทุกแถว = ยอดใหม่ · PaymentSummary ยอด/ส่วนลดใหม่
//   - จดก่อน/หลัง ใคร เมื่อไหร่ เพราะอะไร ใน BillEdits (แก้ได้หลายครั้ง EditNo 1, 2, …)
//   - ระบบสมาชิก: บิลยังไม่ถึง CRM → แก้ข้อมูลในคิวให้ส่งยอดใหม่ · ถึงแล้ว → คืนเงินบางส่วนเท่าส่วนต่าง (CRM หักแต้มตามสัดส่วน)
// แก้ได้แค่ลดยอด (ลบรายการ/ใส่ส่วนลด) ไม่เพิ่มรายการใหม่ · บิลที่ใช้คูปอง/Voucher สมาชิก แก้ไม่ได้ (ใช้ยกเลิกบิล)
import { withTransaction, lockKey } from './db.js';
import { thaiTimeISO } from './time.js';
import { ensureVoidTable, todayYmd, text, num, isCancelled, crmLabel, staffName, editBlockReason } from './billVoid.js';
import { sendEditNow } from './crm.js';
import { logActivity } from './activity.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const REASON_MAX = 300;

async function hasCol(runner, table, col) {
  try { return !!(await runner(`SELECT COL_LENGTH('dbo.${table}', '${col}') AS n`)).recordset[0].n; } catch { return false; }
}

export async function editBill(data) {
  const user = data._user;
  if (!user) return { success: false, error: 'ต้องล็อกอินก่อนแก้ไขบิล' };
  // แคชเชียร์: แก้ไขบิลได้แค่ลบ/ลดรายการ · ส่วนลดเปลี่ยนได้เฉพาะหัวหน้า/แอดมิน
  if (user.role !== 'admin' && user.role !== 'cashier') return { success: false, error: 'แก้ไขบิลได้เฉพาะแคชเชียร์ หัวหน้า และแอดมิน' };
  const canDiscount = user.role === 'admin';
  const orderNumber = text(data.orderNumber, 60);
  const reason = text(data.reason, REASON_MAX);
  if (!orderNumber) return { success: false, error: 'ไม่ได้ระบุเลขบิล' };
  if (reason.length < 3) return { success: false, error: 'กรุณาใส่หมายเหตุว่าแก้ไขเพราะอะไร' };
  const want = new Map((Array.isArray(data.lines) ? data.lines : []).map(l => [Number(l && l.line), Number(l && l.qty)]));
  await ensureVoidTable();
  const branchScope = text(data.branchId, 60);
  const by = await staffName(user);
  const day = todayYmd();

  const result = await withTransaction(async (runner) => {
    await lockKey(runner, `void:${orderNumber}`);   // คิวเดียวกับยกเลิกบิล — ยกเลิกกับแก้ไขพร้อมกันไม่ได้
    const rows = (await runner(`SELECT RowId, ItemDetail, Price, Quantity, TotalAmount, [Status], TsLocal, BranchId FROM dbo.Orders WHERE OrderNumber = @n ORDER BY RowId ASC`, { n: orderNumber })).recordset;
    if (!rows.length) return { success: false, error: `ไม่พบบิล ${orderNumber}` };
    const billBranch = String(rows[0].BranchId || '');
    if (branchScope && billBranch && billBranch !== branchScope) return { success: false, error: 'บิลนี้เป็นของสาขาอื่น' };
    if (rows.every(r => isCancelled(r.Status))) return { success: false, error: 'บิลนี้ถูกยกเลิกไปแล้ว' };
    const ts = rows.map(r => r.TsLocal).find(Boolean);
    if (!ts || new Date(ts).toISOString().slice(0, 10) !== day) return { success: false, error: 'แก้ไขได้เฉพาะบิลของวันนี้' };
    const discCols = await hasCol(runner, 'PaymentSummary', 'DiscountName');
    const pay = (await runner(`SELECT TOP (1) RowId, paymentMethod, grandTotal, splitDetail, tableNo${discCols ? ', DiscountName, DiscountAmount, DiscountKind' : ''} FROM dbo.PaymentSummary WHERE orderNumber = @n`, { n: orderNumber })).recordset[0];
    if (!pay) return { success: false, error: 'บิลนี้ยังไม่ได้ปิดบิล แก้ที่หน้าโต๊ะแทน' };
    const blocked = editBlockReason(pay);
    if (blocked) return { success: false, error: blocked };
    let invoice = null;
    try { invoice = (await runner(`SELECT TOP (1) invoiceNo FROM dbo.TaxInvoices WHERE orderNumber = @n AND ISNULL(cancelled, 0) = 0`, { n: orderNumber })).recordset[0]; } catch { /* ไม่มีตาราง */ }
    if (invoice) return { success: false, error: `บิลนี้ออกใบกำกับภาษี ${invoice.invoiceNo} แล้ว ต้องยกเลิกใบกำกับภาษีก่อน` };

    // รายการหลัก + แถวตัวเลือก (↳) ที่ตามหลัง
    const lines = [];
    for (const r of rows) {
      const name = String(r.ItemDetail || '');
      if (!name) continue;
      if (!name.startsWith('↳')) lines.push({ line: lines.length, row: r, name, qty: num(r.Quantity) || 1, price: num(r.Price), opts: [] });
      else if (lines.length) lines[lines.length - 1].opts.push(r);
    }
    for (const [ln, q] of want) {
      const l = lines[ln];
      if (!l) return { success: false, error: 'รายการในบิลเปลี่ยนไปแล้ว กรุณาโหลดใหม่' };
      if (!Number.isInteger(q) || q < 0 || q > l.qty) return { success: false, error: `จำนวน ${l.name} ไม่ถูกต้อง (แก้ได้แค่ลดจำนวน)` };
    }
    const after = lines.map(l => {
      const qty = want.has(l.line) ? want.get(l.line) : l.qty;
      const unit = l.qty ? l.price / l.qty : 0;
      return { ...l, newQty: qty, newPrice: round2(unit * qty), unit };
    });
    if (after.every(l => l.newQty === 0)) return { success: false, error: 'ลบทุกรายการไม่ได้ ใช้ยกเลิกบิลแทน' };
    const subtotal = round2(after.reduce((s, l) => s + l.newPrice, 0));

    // ส่วนลด: ต้องเป็นส่วนลดที่ตั้งในหลังบ้าน · ยอดคิดที่หน้าเว็บ (ส่วนลดเฉพาะหมวด) แต่ห้ามเกินยอดรายการ
    let discName = null; let discAmount = 0;
    const discountId = text(data.discountId, 60);
    const oldDiscName = discCols && pay.DiscountName && String(pay.DiscountKind || 'store') === 'store' ? String(pay.DiscountName) : null;
    if (discountId) {
      const d = (await runner(`SELECT TOP (1) id, name FROM dbo.Discounts WHERE CAST(id AS NVARCHAR(60)) = @id`, { id: discountId })).recordset[0];
      if (!d) return { success: false, error: 'ไม่พบส่วนลดนี้ในหลังบ้าน' };
      discName = text(d.name, 200) || 'ส่วนลด';
      if (!canDiscount && discName !== oldDiscName) return { success: false, error: 'ส่วนลดใส่/เปลี่ยนได้เฉพาะหัวหน้าและแอดมิน' };
      discAmount = round2(data.discountAmount);
      if (discAmount < 0 || discAmount > subtotal + 0.001) return { success: false, error: 'ยอดส่วนลดไม่ถูกต้อง' };
    }
    if (!discountId && oldDiscName && !canDiscount) return { success: false, error: 'ส่วนลดเอาออกได้เฉพาะหัวหน้าและแอดมิน' };
    const sc = Math.max(0, round2(data.serviceCharge));
    const vat = Math.max(0, round2(data.vat));
    const newTotal = round2(subtotal - discAmount + sc + vat);
    if (data.newTotal != null && Math.abs(newTotal - round2(data.newTotal)) > 0.01) return { success: false, error: 'ยอดไม่ตรงกับที่คำนวณ กรุณาโหลดใหม่แล้วลองอีกครั้ง' };
    const oldTotal = round2(pay.grandTotal != null ? pay.grandTotal : rows[0].TotalAmount);
    if (newTotal > oldTotal + 0.001) return { success: false, error: 'แก้ไขบิลได้แค่ลดยอด (ลบรายการ/ใส่ส่วนลด)' };
    const oldDisc = discCols ? { name: pay.DiscountName || null, amount: num(pay.DiscountAmount) } : { name: null, amount: 0 };
    const itemsChanged = after.some(l => l.newQty !== l.qty);
    if (!itemsChanged && Math.abs(newTotal - oldTotal) < 0.005 && (discName || null) === (oldDisc.name || null)) {
      return { success: false, error: 'ยังไม่ได้แก้ไขรายการหรือส่วนลด' };
    }

    // ── บันทึก ──
    for (const l of after) {
      if (l.newQty === l.qty) continue;
      if (l.newQty === 0) {
        const ids = [l.row.RowId, ...l.opts.map(o => o.RowId)];
        await runner(`DELETE FROM dbo.Orders WHERE OrderNumber = @n AND RowId IN (${ids.map(Number).join(',')})`, { n: orderNumber });
      } else {
        await runner(`UPDATE dbo.Orders SET Price = @p, Quantity = @q WHERE RowId = @id AND OrderNumber = @n`, { p: l.newPrice, q: l.newQty, id: l.row.RowId, n: orderNumber });
      }
    }
    await runner(`UPDATE dbo.Orders SET TotalAmount = @t WHERE OrderNumber = @n`, { t: newTotal, n: orderNumber });
    await runner(`UPDATE dbo.PaymentSummary SET grandTotal = @t${discCols ? ', DiscountName = @dn, DiscountAmount = @da, DiscountKind = @dk' : ''} WHERE RowId = @id`,
      { t: newTotal, id: pay.RowId, ...(discCols ? { dn: discName, da: discName ? discAmount : null, dk: discName ? 'store' : null } : {}) });

    // ── ระบบสมาชิก ──
    let crmStatus = 'none'; let crmAmount = null; let crmNote = '';
    let crmBill = null;
    try { crmBill = (await runner(`SELECT RowId, [Status], PayloadJson FROM dbo.CrmBills WHERE OrderNumber = @n`, { n: orderNumber })).recordset[0] || null; } catch { /* ไม่ได้เชื่อม CRM */ }
    if (crmBill && (crmBill.Status === 'pending' || crmBill.Status === 'failed')) {
      // ยังไม่ถึง CRM → ส่งยอดใหม่แทน (รายการ/ส่วนลดร้าน/ยอดจ่าย)
      let pl = {}; try { pl = JSON.parse(crmBill.PayloadJson) || {}; } catch { /* ข้อมูลเก่าเสีย */ }
      pl.items = after.filter(l => l.newQty > 0).map((l, i) => ({ id: String(i + 1), name: l.name.slice(0, 200), price: round2(l.unit), qty: l.newQty }));
      pl.storeDiscount = discAmount;
      pl.paidTotal = newTotal;
      await runner(`UPDATE dbo.CrmBills SET PayloadJson = @p WHERE RowId = @id AND [Status] IN ('pending', 'failed')`, { p: JSON.stringify(pl), id: crmBill.RowId });
      crmNote = 'ระบบสมาชิกจะได้ยอดใหม่ แต้มคิดจากยอดใหม่';
    } else if (crmBill && crmBill.Status === 'sent' && oldTotal - newTotal > 0.005) {
      crmStatus = 'pending'; crmAmount = round2(oldTotal - newTotal);
    }

    const editNo = ((await runner(`SELECT ISNULL(MAX(EditNo), 0) AS n FROM dbo.BillEdits WHERE OrderNumber = @n`, { n: orderNumber })).recordset[0].n || 0) + 1;
    const snap = (arr, key) => JSON.stringify(arr.filter(l => l[key] > 0).map(l => ({ name: l.name, qty: l[key], price: key === 'qty' ? l.price : l.newPrice })));
    await runner(`INSERT INTO dbo.BillEdits (OrderNumber, EditNo, BranchId, OldTotal, NewTotal, DiscountName, DiscountAmount, BeforeJson, AfterJson, Reason, EditedBy, EditedByUid, EditedAt, CrmStatus, CrmAmount, CrmNextAttempt)
                  VALUES (@n, @no, @b, @ot, @nt, @dn, @da, @bj, @aj, @r, @by, @uid, @at, @crm, @ca, DATEADD(SECOND, -1, SYSUTCDATETIME()))`,
      { n: orderNumber, no: editNo, b: billBranch || null, ot: oldTotal, nt: newTotal, dn: discName, da: discName ? discAmount : null,
        bj: JSON.stringify({ items: JSON.parse(snap(lines.map(l => ({ ...l })), 'qty')), discount: oldDisc }), aj: JSON.stringify({ items: JSON.parse(snap(after, 'newQty')), discount: { name: discName, amount: discAmount } }),
        r: reason, by, uid: String(user.uid), at: thaiTimeISO(), crm: crmStatus, ca: crmAmount });

    return {
      success: true, orderNumber, editNo, oldTotal, newTotal, subtotal, crmStatus, crmNote,
      _before: lines.map(l => ({ name: l.name, qty: l.qty, unit: l.qty ? l.price / l.qty : 0 })), _branch: billBranch, _table: pay.tableNo || '',
      discount: discName ? { name: discName, amount: discAmount } : null, serviceCharge: sc, vat,
      paymentMethod: pay.paymentMethod || '',
      items: after.filter(l => l.newQty > 0).map(l => ({ name: l.name, qty: l.newQty, price: l.newPrice, options: l.opts.map(o => String(o.ItemDetail || '').replace(/^↳\s*/, '')) }))
    };
  }, { isolation: 'READ_COMMITTED' });

  if (!result.success) return result;
  {
    const removed = [];
    // รายการที่ลบ/ลดจำนวน (ก่อน → หลัง) สำหรับบันทึกการทำงาน
    for (const ln of (Array.isArray(data.lines) ? data.lines : [])) {
      const was = result._before && result._before[Number(ln.line)];
      if (was && Number(ln.qty) < was.qty) removed.push({ name: was.name, qty: was.qty - Number(ln.qty), price: round2(was.unit * (was.qty - Number(ln.qty))) });
    }
    await logActivity({ kind: 'edit_bill', branchId: result._branch, tableNo: result._table, orderNumber, amount: result.newTotal, reason, items: removed,
      detail: 'ครั้งที่ ' + result.editNo + ' · ฿' + result.oldTotal.toFixed(2) + ' → ฿' + result.newTotal.toFixed(2) + (result.discount ? ' · ส่วนลด ' + result.discount.name + ' ' + result.discount.amount.toFixed(2) : ''),
      staff: { name: by, uid: String(user.uid) } });
    delete result._before; delete result._branch; delete result._table;
  }
  if (result.crmStatus === 'pending') {
    const r = await sendEditNow(orderNumber, result.editNo);
    if (r) result.crmStatus = r.status;
    if (r && r.pointsReversed != null) result.pointsReversed = r.pointsReversed;
    if (r && r.error) result.crmError = r.error;
  }
  result.crmLabel = result.crmStatus === 'none' ? result.crmNote : (crmLabel[result.crmStatus] || result.crmStatus);
  return result;
}

