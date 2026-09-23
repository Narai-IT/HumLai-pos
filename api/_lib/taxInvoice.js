// ── ใบกำกับภาษีเต็มรูป (ออกจากหน้าหลังบ้าน > รายงาน > รายงานยอดขาย) ──
//
// ยอดเงิน/รายการคำนวณที่เซิร์ฟเวอร์จากบิลจริงในตาราง Orders — ไม่เชื่อตัวเลขที่หน้าเว็บส่งมา
// ราคาขายของร้านรวม VAT แล้ว (ตั้ง VAT ในหน้าตั้งค่าร้าน = บวกเพิ่มตอนคิดเงิน ยอดบิลก็รวม VAT แล้วเหมือนกัน)
//   → มูลค่าก่อน VAT = ยอดบิล × 100 / (100 + อัตรา)
// 1 บิลออกใบกำกับได้ 1 ใบ — ต้องการแก้ข้อมูลผู้ซื้อ ให้ยกเลิกใบเดิมแล้วออกใหม่ (เลขใหม่ เลขเดิมยังอยู่ในระบบ)
import { query, withTransaction } from './db.js';
import { thaiTimeISO } from './time.js';
import { defaultBranchId } from './branch.js';
import { getSettings } from './read.js';

const INVOICE_COLS = 'invoiceNo, orderNumber, branchId, issuedAt, buyerName, buyerTaxId, buyerAddress, buyerBranch, ' +
  'itemsJson, subtotal, vatRate, vatAmount, total, sellerJson, issuedBy, cancelled, cancelledAt, cancelReason';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const text = (v, max) => String(v ?? '').trim().slice(0, max);

const parseJson = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
const mapInvoice = (r) => ({
  invoiceNo: r.invoiceNo,
  orderNumber: r.orderNumber,
  branchId: r.branchId || '',
  issuedAt: r.issuedAt || '',
  buyer: { name: r.buyerName || '', taxId: r.buyerTaxId || '', address: r.buyerAddress || '', branch: r.buyerBranch || '' },
  items: parseJson(r.itemsJson, []),
  subtotal: Number(r.subtotal) || 0,
  vatRate: Number(r.vatRate) || 0,
  vatAmount: Number(r.vatAmount) || 0,
  total: Number(r.total) || 0,
  seller: parseJson(r.sellerJson, {}),
  issuedBy: r.issuedBy || '',
  cancelled: !!r.cancelled,
  cancelledAt: r.cancelledAt || '',
  cancelReason: r.cancelReason || ''
});

// ใบกำกับทั้งหมดของบิลในรายการ (ใบที่ยกเลิกแล้วด้วย) — ตารางยังไม่ถูกสร้าง (ยังไม่รัน sql:init) = ว่าง
export async function listTaxInvoices() {
  try {
    const res = await query(`SELECT TOP (5000) ${INVOICE_COLS} FROM dbo.TaxInvoices ORDER BY RowId DESC`);
    return res.recordset.map(mapInvoice);
  } catch {
    return [];
  }
}

// รายการในใบกำกับจากแถวของบิล: แถวที่ขึ้นต้นด้วย ↳ คือตัวเลือกของรายการก่อนหน้า → ต่อท้ายชื่อ
// Price ในตาราง Orders = ราคารวมของบรรทัด (ราคาต่อหน่วย × จำนวน)
function invoiceItems(rows) {
  const items = [];
  for (const row of rows) {
    const detail = String(row.ItemDetail || '').trim();
    if (!detail) continue;
    if (detail.startsWith('↳')) {
      const last = items[items.length - 1];
      const opt = detail.replace(/^↳\s*/, '');
      if (last && opt) last.name += ` (${opt})`;
      continue;
    }
    const qty = Number(row.Quantity) || 1;
    const amount = round2(row.Price);
    items.push({ name: detail, qty, unitPrice: round2(amount / qty), amount });
  }
  return items;
}

async function nextInvoiceNo(runner, prefix, yymm) {
  const base = `${prefix ? `${prefix}-` : ''}TX${yymm}-`;
  const res = await runner(
    `SELECT invoiceNo FROM dbo.TaxInvoices WITH (UPDLOCK, HOLDLOCK) WHERE invoiceNo LIKE @pat`,
    { pat: `${base}%` }
  );
  let max = 0;
  for (const row of res.recordset) {
    const n = parseInt(String(row.invoiceNo).slice(base.length), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${base}${String(max + 1).padStart(4, '0')}`;
}

// ออกใบกำกับภาษีของบิลหนึ่งใบ — มีใบที่ยังใช้อยู่แล้ว = คืนใบเดิม (กดซ้ำ/เน็ตหลุดแล้วยิงใหม่ไม่ได้เลขใหม่)
export async function issueTaxInvoice(data) {
  const orderNumber = text(data.orderNumber, 60);
  const buyer = data.buyer || {};
  const buyerName = text(buyer.name, 300);
  const buyerTaxId = text(buyer.taxId, 40).replace(/[\s-]/g, '');
  const buyerAddress = text(buyer.address, 1000);
  const buyerBranch = text(buyer.branch, 100) || 'สำนักงานใหญ่';
  if (!orderNumber) return { success: false, error: 'ไม่ได้ระบุเลขบิล' };
  if (!buyerName || !buyerAddress) return { success: false, error: 'กรุณากรอกชื่อและที่อยู่ผู้ซื้อ' };
  if (!/^\d{13}$/.test(buyerTaxId)) return { success: false, error: 'เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก' };

  const orderRes = await query(
    `SELECT ItemDetail, Price, Quantity, TotalAmount, [Status], BranchId FROM dbo.Orders WHERE OrderNumber = @no ORDER BY RowId ASC`,
    { no: orderNumber }
  );
  const rows = orderRes.recordset;
  if (!rows.length) return { success: false, error: `ไม่พบบิล ${orderNumber}` };
  if (rows.every(r => String(r.Status || '').toLowerCase() === 'cancelled')) {
    return { success: false, error: 'บิลนี้ถูกยกเลิกแล้ว ออกใบกำกับภาษีไม่ได้' };
  }

  const total = round2(rows[0].TotalAmount);
  if (!(total > 0)) return { success: false, error: 'ยอดบิลเป็นศูนย์ ออกใบกำกับภาษีไม่ได้' };
  const items = invoiceItems(rows);
  // ส่วนลด / ค่าบริการ / VAT ที่บวกตอนคิดเงิน ไม่ได้อยู่ในแถวรายการ → ใส่เป็นบรรทัดปรับยอดให้รวมตรงกับบิล
  const diff = round2(total - items.reduce((s, i) => s + i.amount, 0));
  if (Math.abs(diff) >= 0.01) {
    items.push({ name: diff < 0 ? 'ส่วนลด' : 'ค่าบริการ / ภาษีที่บวกตอนชำระ', qty: 1, unitPrice: diff, amount: diff, adjustment: true });
  }

  const settings = (await getSettings().catch(() => null)) || {};
  const rateSetting = Number(settings.vat && settings.vat.rate);
  const vatRate = Number.isFinite(rateSetting) && rateSetting > 0 ? rateSetting : 7;
  const subtotal = round2(total * 100 / (100 + vatRate));
  const vatAmount = round2(total - subtotal);

  const mainBranch = await defaultBranchId().catch(() => '');
  const branchId = String(rows[0].BranchId || '').trim() || mainBranch || '';
  const branchRes = await query(
    `SELECT id, name, billPrefix, phone, [address], taxId FROM dbo.Branches WHERE id = @id`,
    { id: branchId }
  ).catch(() => ({ recordset: [] }));
  const b = branchRes.recordset[0] || {};
  const seller = {
    name: String(b.name || branchId || ''),
    address: String(b.address || ''),
    phone: String(b.phone || ''),
    taxId: String(b.taxId || ''),
    // สาขาหลัก = สำนักงานใหญ่ / สาขาอื่นระบุชื่อสาขา (กรมสรรพากรให้ระบุสถานประกอบการที่ออกใบ)
    branchLabel: !mainBranch || branchId === mainBranch ? 'สำนักงานใหญ่' : `สาขา ${String(b.name || branchId)}`
  };
  if (!/^\d{13}$/.test(seller.taxId.replace(/[\s-]/g, ''))) {
    return { success: false, error: 'ยังไม่ได้ตั้งเลขประจำตัวผู้เสียภาษีของร้าน — ไปตั้งที่ หลังบ้าน > สาขา ก่อน' };
  }

  const now = thaiTimeISO();
  const yymm = now.slice(2, 4) + now.slice(5, 7);
  const prefix = String(b.billPrefix || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  return await withTransaction(async (runner) => {
    const existing = await runner(
      `SELECT TOP (1) ${INVOICE_COLS} FROM dbo.TaxInvoices WITH (UPDLOCK, HOLDLOCK)
        WHERE orderNumber = @no AND ISNULL(cancelled, 0) = 0 ORDER BY RowId DESC`,
      { no: orderNumber }
    );
    if (existing.recordset.length) {
      return { success: true, existing: true, invoice: mapInvoice(existing.recordset[0]) };
    }
    const invoiceNo = await nextInvoiceNo(runner, prefix, yymm);
    await runner(
      `INSERT INTO dbo.TaxInvoices (invoiceNo, orderNumber, branchId, issuedAt, buyerName, buyerTaxId, buyerAddress, buyerBranch,
         itemsJson, subtotal, vatRate, vatAmount, total, sellerJson, issuedBy, cancelled)
       VALUES (@invoiceNo, @no, @branchId, @issuedAt, @buyerName, @buyerTaxId, @buyerAddress, @buyerBranch,
         @itemsJson, @subtotal, @vatRate, @vatAmount, @total, @sellerJson, @issuedBy, 0)`,
      {
        invoiceNo, no: orderNumber, branchId, issuedAt: now, buyerName, buyerTaxId, buyerAddress, buyerBranch,
        itemsJson: JSON.stringify(items), subtotal, vatRate, vatAmount, total,
        sellerJson: JSON.stringify(seller), issuedBy: text(data.issuedBy, 120)
      }
    );
    const saved = await runner(`SELECT ${INVOICE_COLS} FROM dbo.TaxInvoices WHERE invoiceNo = @invoiceNo`, { invoiceNo });
    return { success: true, invoice: mapInvoice(saved.recordset[0]) };
  });
}

// ยกเลิกใบกำกับ — ไม่ลบทิ้ง (เลขที่ออกไปแล้วต้องตรวจย้อนได้) แค่ทำเครื่องหมายไว้
export async function cancelTaxInvoice(data) {
  const invoiceNo = text(data.invoiceNo, 60);
  const reason = text(data.reason, 500);
  if (!invoiceNo) return { success: false, error: 'ไม่ได้ระบุเลขที่ใบกำกับภาษี' };
  if (!reason) return { success: false, error: 'กรุณาระบุเหตุผลที่ยกเลิก' };
  const res = await query(
    `UPDATE dbo.TaxInvoices SET cancelled = 1, cancelledAt = @at, cancelReason = @reason
      WHERE invoiceNo = @invoiceNo AND ISNULL(cancelled, 0) = 0`,
    { invoiceNo, reason, at: thaiTimeISO() }
  );
  if (!res.rowsAffected || !res.rowsAffected[0]) return { success: false, error: 'ไม่พบใบกำกับนี้ หรือถูกยกเลิกไปแล้ว' };
  return { success: true };
}
