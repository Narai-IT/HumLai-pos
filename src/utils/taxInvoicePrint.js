// ── พิมพ์ใบกำกับภาษีเต็มรูป (A4) ──
// เปิดหน้าต่างใหม่ที่มีแต่ใบกำกับ แล้วสั่งพิมพ์ — เลือกเครื่องพิมพ์ A4 หรือ "บันทึกเป็น PDF" ในหน้าต่างพิมพ์ของเบราว์เซอร์

const DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

// จำนวนเต็มเป็นคำอ่านไทย (รองรับเกินล้านด้วยการแบ่งทีละ 6 หลัก)
// afterMillion: หลักหน่วยที่เป็น 1 หลังคำว่า "ล้าน" อ่าน "เอ็ด" (หนึ่งล้านเอ็ด)
const readInt = (n, afterMillion = false) => {
  if (n === 0) return '';
  if (n >= 1000000) return readInt(Math.floor(n / 1000000)) + 'ล้าน' + readInt(n % 1000000, true);
  if (n === 1 && afterMillion) return 'เอ็ด';
  const s = String(n);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i]);
    const place = s.length - i - 1;
    if (d === 0) continue;
    if (place === 0 && d === 1 && s.length > 1) out += 'เอ็ด';
    else if (place === 1 && d === 1) out += 'สิบ';
    else if (place === 1 && d === 2) out += 'ยี่สิบ';
    else out += DIGITS[d] + PLACES[place];
  }
  return out;
};

export const bahtText = (amount) => {
  const satang = Math.round(Math.abs(Number(amount) || 0) * 100);
  const baht = Math.floor(satang / 100);
  const st = satang % 100;
  if (baht === 0 && st === 0) return 'ศูนย์บาทถ้วน';
  return (baht ? readInt(baht) + 'บาท' : '') + (st ? readInt(st) + 'สตางค์' : 'ถ้วน');
};

const money = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formatTaxId = (id) => {
  const d = String(id || '').replace(/\D/g, '');
  return d.length === 13 ? `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}` : String(id || '');
};
const thaiDate = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return esc(iso);
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
};
const branchLabel = (b) => {
  const s = String(b || '').trim();
  if (!s || s === 'สำนักงานใหญ่' || s === '00000') return 'สำนักงานใหญ่';
  return /^\d+$/.test(s) ? `สาขาที่ ${s.padStart(5, '0')}` : s;
};

export const buildTaxInvoiceHtml = (inv, { copy = false } = {}) => {
  const seller = inv.seller || {};
  const buyer = inv.buyer || {};
  const rows = (inv.items || []).map((it, i) => `
    <tr>
      <td class="c">${it.adjustment ? '' : i + 1}</td>
      <td>${esc(it.name)}</td>
      <td class="r">${it.adjustment ? '' : esc(it.qty)}</td>
      <td class="r">${it.adjustment ? '' : money(it.unitPrice)}</td>
      <td class="r">${money(it.amount)}</td>
    </tr>`).join('');
  return `<!doctype html><html lang="th"><head><meta charset="utf-8">
<title>ใบกำกับภาษี ${esc(inv.invoiceNo)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Sarabun", "Leelawadee UI", "Tahoma", sans-serif; color: #111; font-size: 13px; margin: 0; }
  .top { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #111; padding-bottom: 10px; }
  .shop b { font-size: 18px; }
  .title { text-align: right; }
  .title h1 { margin: 0; font-size: 20px; }
  .title .sub { font-size: 12px; color: #444; }
  .copy { display: inline-block; margin-top: 6px; padding: 2px 10px; border: 1.5px solid #111; font-weight: 700; }
  .void { color: #b91c1c; border-color: #b91c1c; }
  .meta { display: grid; grid-template-columns: 1fr 220px; gap: 16px; margin: 12px 0; }
  .box { border: 1px solid #999; border-radius: 6px; padding: 8px 10px; line-height: 1.6; }
  .box .h { font-weight: 700; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 5px 8px; vertical-align: top; }
  th { background: #f1f1f1; }
  .c { text-align: center; width: 36px; }
  .r { text-align: right; white-space: nowrap; }
  .sum td { border: none; padding: 3px 8px; }
  .sum .lbl { text-align: right; }
  .sum .grand td { font-weight: 700; font-size: 15px; border-top: 2px solid #111; }
  .words { margin-top: 8px; padding: 6px 10px; background: #f6f6f6; border-radius: 6px; }
  .sign { display: flex; justify-content: space-between; margin-top: 48px; text-align: center; }
  .sign div { width: 40%; border-top: 1px dotted #333; padding-top: 4px; }
  .note { margin-top: 10px; font-size: 11px; color: #555; }
</style></head><body>
  <div class="top">
    <div class="shop">
      <b>${esc(seller.name)}</b><br>
      ${esc(seller.address).replace(/\n/g, '<br>')}<br>
      ${seller.phone ? `โทร ${esc(seller.phone)}<br>` : ''}
      เลขประจำตัวผู้เสียภาษี ${esc(formatTaxId(seller.taxId))} (${esc(seller.branchLabel || 'สำนักงานใหญ่')})
    </div>
    <div class="title">
      <h1>ใบกำกับภาษี / ใบเสร็จรับเงิน</h1>
      <div class="sub">TAX INVOICE / RECEIPT</div>
      ${inv.cancelled ? '<span class="copy void">ยกเลิกแล้ว</span>' : `<span class="copy">${copy ? 'สำเนา' : 'ต้นฉบับ'}</span>`}
    </div>
  </div>

  <div class="meta">
    <div class="box">
      <div class="h">ผู้ซื้อ / ลูกค้า</div>
      ${esc(buyer.name)} (${esc(branchLabel(buyer.branch))})<br>
      ${esc(buyer.address).replace(/\n/g, '<br>')}<br>
      เลขประจำตัวผู้เสียภาษี ${esc(formatTaxId(buyer.taxId))}
    </div>
    <div class="box">
      <div><b>เลขที่</b> ${esc(inv.invoiceNo)}</div>
      <div><b>วันที่</b> ${thaiDate(inv.issuedAt)}</div>
      <div><b>อ้างอิงบิล</b> ${esc(inv.orderNumber)}</div>
    </div>
  </div>

  <table>
    <thead><tr><th class="c">ลำดับ</th><th>รายการ</th><th class="r">จำนวน</th><th class="r">ราคาต่อหน่วย</th><th class="r">จำนวนเงิน</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="sum" style="margin-top:6px">
    <tr><td class="lbl">รวมเป็นเงิน (รวมภาษีมูลค่าเพิ่มแล้ว)</td><td class="r" style="width:140px">${money(inv.total)}</td></tr>
    <tr><td class="lbl">มูลค่าสินค้า/บริการก่อนภาษี</td><td class="r">${money(inv.subtotal)}</td></tr>
    <tr><td class="lbl">ภาษีมูลค่าเพิ่ม ${esc(inv.vatRate)}%</td><td class="r">${money(inv.vatAmount)}</td></tr>
    <tr class="grand"><td class="lbl">จำนวนเงินรวมทั้งสิ้น</td><td class="r">${money(inv.total)}</td></tr>
  </table>
  <div class="words">(${esc(bahtText(inv.total))})</div>

  <div class="sign">
    <div>ผู้รับเงิน</div>
    <div>ผู้มีอำนาจลงนาม</div>
  </div>
  ${inv.cancelled ? `<div class="note">ยกเลิกเมื่อ ${thaiDate(inv.cancelledAt)} — ${esc(inv.cancelReason)}</div>` : ''}
</body></html>`;
};

// เปิดหน้าต่างพิมพ์ — คืน false ถ้าเบราว์เซอร์บล็อกป๊อปอัพ
export const printTaxInvoice = (inv, opts) => {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.open();
  w.document.write(buildTaxInvoiceHtml(inv, opts));
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* ผู้ใช้กดพิมพ์เองได้ */ } }, 400);
  return true;
};
