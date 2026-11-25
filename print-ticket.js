// ===============================================================
// พิมพ์ใบเสร็จ / ใบครัว / ใบแจ้งยอด ออกเครื่อง ESC-POS ในวงแลน
// ---------------------------------------------------------------
// แยกออกมาจาก server.js เพราะมีคนเรียกสองทาง:
//   1) POST /print — หน้าเว็บสั่งพิมพ์
//   2) auto-print.js — ตัวดึงออเดอร์จากชีตมาพิมพ์เอง
// ===============================================================

import pkg from 'node-thermal-printer';
import { sendToPrinter } from './printer-net.js';

const { printer: ThermalPrinter, types: PrinterTypes } = pkg;

// ── หัวใบครัว: ประเภท (ทานที่ร้าน/ห่อกลับบ้าน/Delivery) + โต๊ะ ──
// ลำดับ: ประเภทที่หน้าเว็บส่งมา (อ่านจากโซนโต๊ะ) → ชื่อโต๊ะที่บอกประเภทชัด ๆ (Takehome / Grab ...)
//        → การรับประทานของรายการอาหาร → ทานที่ร้าน
// เบอร์โต๊ะมาจากชื่อลูกค้า/ที่อยู่ที่ขึ้นต้นด้วย "โต๊ะ ..."
const DINE_IN = 'ทานที่ร้าน';
const TAKEAWAY = 'ห่อกลับบ้าน';
const rawTableOf = (orderData) => {
  const c = orderData.customerDetails || {};
  for (const text of [c.address, c.name]) {
    const m = String(text || '').match(/^โต๊ะ\s*(.+?)(?:\s*\(.*\))?\s*$/);
    if (m) return m[1].trim();
  }
  return '';
};
const diningFromTableName = (table) => {
  if (/take\s*-?\s*(home|away)|กลับบ้าน/i.test(table)) return TAKEAWAY;
  if (/deli|grab|line\s*man|shopee|robinhood|foodpanda|panda/i.test(table)) return 'Delivery';
  return '';
};
// ค่าการรับประทานของรายการอาหารบางทีเป็นชื่อหมวด (หมวดที่ปิดคำถามการรับประทานไว้ เช่น "ชุดอิ่มเดี่ยว")
// ไม่ใช่ประเภทจริง — รับเฉพาะค่าที่เป็นประเภทการรับประทาน ไม่งั้นหัวใบครัวขึ้นชื่อหมวดแทน
const diningKind = (name) => {
  const s = String(name || '').trim();
  if (!s) return '';
  if (s === DINE_IN || /^dine/i.test(s)) return DINE_IN;
  return diningFromTableName(s);
};
const diningOf = (orderData) => {
  if (String(orderData.dining || '').trim()) return String(orderData.dining).trim();
  const fromTable = diningFromTableName(rawTableOf(orderData));
  if (fromTable) return fromTable;
  const items = Array.isArray(orderData.items) ? orderData.items : [];
  for (const item of items) {
    const d = item && item.dining;
    const kind = diningKind(typeof d === 'string' ? d : (d && d.name));
    if (kind) return kind;
  }
  return DINE_IN;
};

// เครื่องพิมพ์ความร้อนพิมพ์ได้แค่ตัวอักษรในชุดของเครื่อง — ↳ • และ emoji ออกมาเป็น "?"
// แทนด้วยตัวที่พิมพ์ได้ก่อนส่งไปเครื่อง
const printable = (text) => String(text ?? '')
  .replace(/📝\s*/gu, 'หมายเหตุ: ')
  .replace(/↳/g, '-')
  .replace(/•/g, '*')
  .replace(/×/g, 'x')
  .replace(/\p{Extended_Pictographic}\uFE0F?/gu, '');
// บรรทัดที่สองของหัวใบ: ทานที่ร้าน = "โต๊ะ 5" / ห่อกลับบ้าน-เดลิเวอรี = ชื่อช่อง เช่น "Takehome 1", "Grab"
const tableLineOf = (orderData, dining) => {
  const table = rawTableOf(orderData);
  // หน้าลูกค้าสั่งเองแบบไม่มีเลขโต๊ะ ลงชื่อ "ทานที่ร้าน" / "Takehome" ไว้ — ไม่ใช่โต๊ะจริง
  if (!table || table === dining || /^(takehome|ทานที่ร้าน|ห่อกลับบ้าน)$/i.test(table)) return '';
  return dining === DINE_IN ? `โต๊ะ ${table}` : table;
};

// ── ใบกำกับภาษีเต็มรูป (กระดาษม้วน) ──
// หน้าเว็บส่งข้อมูลใบที่เซิร์ฟเวอร์ออกเลขแล้วมาใน orderData.taxInvoice (+ amountText = ยอดเป็นตัวอักษร)
const LINE = 32;
// สระบน/ล่างและวรรณยุกต์ไทยไม่กินช่อง — นับความกว้างจริงเพื่อจัดชิดขวาให้ตรง
const widthOf = (s) => String(s).replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '').length;
const leftRight = (left, right) => {
  const gap = LINE - widthOf(left) - widthOf(right);
  return gap >= 1 ? left + ' '.repeat(gap) + right : `${left}\n${' '.repeat(Math.max(0, LINE - widthOf(right)))}${right}`;
};
// ตัดข้อความยาวเป็นหลายบรรทัดตามความกว้างกระดาษ (ตัดที่ช่องว่างถ้าทำได้)
const wrap = (text, width = LINE) => {
  const out = [];
  String(text || '').split(/\r?\n/).forEach(para => {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      if (widthOf(line + word) <= width) { line += word; continue; }
      if (line.trim()) out.push(line.trimEnd());
      line = word.trimStart();
      while (widthOf(line) > width) {           // คำเดียวยาวเกินบรรทัด (ภาษาไทยไม่มีช่องว่าง) → ตัดตามความกว้าง
        let cut = 0, w = 0;
        while (cut < line.length && w < width) { cut++; w = widthOf(line.slice(0, cut)); }
        while (cut < line.length && /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(line[cut])) cut++;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    if (line.trim()) out.push(line.trimEnd());
  });
  return out;
};
// สถานประกอบการตาม ภ.พ.20: ว่าง / 00000 = สำนักงานใหญ่ · อื่น ๆ = สาขาที่ 00001
const taxBranchText = (v) => {
  const d = String(v ?? '').replace(/\D/g, '');
  return !d || /^0+$/.test(d) ? 'สำนักงานใหญ่' : `สาขาที่ ${d.padStart(5, '0').slice(-5)}`;
};
const money2 = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTaxId = (id) => {
  const d = String(id || '').replace(/\D/g, '');
  return d.length === 13 ? `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}` : String(id || '');
};
const buyerBranchText = (b) => {
  const s = String(b || '').trim();
  if (!s || s === 'สำนักงานใหญ่' || /^0+$/.test(s)) return 'สำนักงานใหญ่';
  return /^\d+$/.test(s) ? `สาขาที่ ${s.padStart(5, '0')}` : s;
};
// ใบกำกับภาษีอย่างย่อ: ยอดบิลถือว่ารวม VAT แล้ว (สูตรเดียวกับใบกำกับเต็มรูปใน api/_lib/taxInvoice.js)
const parseMoney = (v) => Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0;
const vatBreakdown = (total, rate) => {
  const r = Number(rate) > 0 ? Number(rate) : 7;
  const vatable = Math.round(total * 100 / (100 + r) * 100) / 100;
  return { rate: r, vatable, vat: Math.round((total - vatable) * 100) / 100 };
};
const thaiDateTime = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso || '');
  return d.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const printTaxInvoice = (printer, inv, copy) => {
  const seller = inv.seller || {};
  const buyer = inv.buyer || {};
  const rule = () => printer.println('-'.repeat(LINE));

  printer.alignCenter();
  printer.bold(true);
  wrap(seller.name).forEach(l => printer.println(l));
  printer.bold(false);
  wrap(seller.address).forEach(l => printer.println(l));
  if (seller.phone) printer.println(`โทร ${seller.phone}`);
  printer.println(`เลขผู้เสียภาษี ${fmtTaxId(seller.taxId)}`);
  printer.println(`(${seller.branchLabel || 'สำนักงานใหญ่'})`);
  rule();
  printer.bold(true);
  printer.println('ใบกำกับภาษี/ใบเสร็จรับเงิน');
  printer.bold(false);
  printer.println('TAX INVOICE / RECEIPT');
  printer.println(inv.cancelled ? '*** ยกเลิกแล้ว ***' : (copy ? '(สำเนา)' : '(ต้นฉบับ)'));
  rule();

  printer.alignLeft();
  printer.println(`เลขที่ ${inv.invoiceNo || '-'}`);
  printer.println(`วันที่ ${thaiDateTime(inv.issuedAt)}`);
  printer.println(`อ้างอิงบิล ${inv.orderNumber || '-'}`);
  rule();
  printer.println('ผู้ซื้อ');
  wrap(buyer.name).forEach(l => printer.println(l));
  printer.println(`เลขผู้เสียภาษี ${fmtTaxId(buyer.taxId)}`);
  printer.println(buyerBranchText(buyer.branch));
  wrap(buyer.address).forEach(l => printer.println(l));
  rule();

  (inv.items || []).forEach(it => {
    if (it.adjustment) { printer.println(leftRight(it.name, money2(it.amount))); return; }
    const name = `${it.qty}x ${it.name}`;
    const amount = money2(it.amount);
    const lines = wrap(name, LINE - widthOf(amount) - 1);
    lines.forEach((l, i) => printer.println(i === lines.length - 1 ? leftRight(l, amount) : l));
    if (Number(it.qty) > 1) printer.println(`   @ ${money2(it.unitPrice)}`);
  });
  rule();
  printer.println(leftRight('มูลค่าก่อนภาษี', money2(inv.subtotal)));
  printer.println(leftRight(`ภาษีมูลค่าเพิ่ม ${inv.vatRate}%`, money2(inv.vatAmount)));
  printer.bold(true);
  printer.println(leftRight('รวมทั้งสิ้น', money2(inv.total)));
  printer.bold(false);
  if (inv.amountText) {
    printer.alignCenter();
    wrap(`(${inv.amountText})`).forEach(l => printer.println(l));
  }
  printer.alignLeft();
  rule();
  printer.println('');
  printer.println('ผู้รับเงิน ______________________');
  if (inv.cancelled && inv.cancelReason) {
    printer.println('');
    wrap(`ยกเลิก: ${inv.cancelReason}`).forEach(l => printer.println(l));
  }
};

// รายงานปิดยอดประจำวัน — หน้าเว็บคำนวณยอดมาให้ (src/utils/dailyClosePrint.js) ฝั่งนี้จัดหน้าอย่างเดียว
const printDailyClose = (printer, r) => {
  const rule = () => printer.println('-'.repeat(LINE));
  const row = (k, v) => printer.println(leftRight(k, v));

  printer.alignCenter();
  if (r.shopName) { printer.bold(true); wrap(r.shopName).forEach(l => printer.println(l)); printer.bold(false); }
  if (r.taxId) printer.println(`เลขผู้เสียภาษี ${r.taxId}`);
  if (r.posId) printer.println(`POS ID: ${r.posId}`);
  rule();
  printer.bold(true);
  printer.println('รายงานปิดยอดประจำวัน');
  printer.bold(false);
  printer.println('DAILY CLOSE REPORT');
  rule();

  printer.alignLeft();
  row('วันที่ขาย', r.dateLabel || '-');
  row('สาขา', r.branchLabel || '-');
  row('พิมพ์เมื่อ', r.printedAt || '-');
  if (r.printedBy) row('ผู้พิมพ์', r.printedBy);
  rule();
  row('จำนวนบิล', `${r.billCount || 0} บิล`);
  printer.bold(true);
  row('ยอดขายรวม', money2(r.total));
  printer.bold(false);
  row('ส่วนลด', money2(r.discount));
  if (Number(r.charges)) row('ค่าบริการ/ภาษีบวกเพิ่ม', money2(r.charges));
  row('มูลค่าสินค้าเสียภาษี', money2(r.vatable));
  row(`ภาษีมูลค่าเพิ่ม ${r.vatRate}%`, money2(r.vat));
  rule();
  printer.println('ช่องทางชำระเงิน');
  row('เงินสด', money2(r.cash));
  row('เงินโอน / QR', money2(r.transfer));
  row('บัตรเครดิต', money2(r.card));
  if (Number(r.voucher)) row('Voucher', money2(r.voucher));
  rule();
  printer.println('เลขที่ใบกำกับภาษีอย่างย่อ');
  // แยกตามตัวนำหน้าเลขบิล — รายงานทุกสาขามีหลายชุด
  const ranges = Array.isArray(r.ranges) && r.ranges.length ? r.ranges : [{ first: r.firstBill || '-', last: r.lastBill || '-' }];
  ranges.forEach(g => { row('ใบแรก', g.first || '-'); row('ใบสุดท้าย', g.last || '-'); });
  rule();
  row(`บิลยกเลิก ${r.cancelCount || 0} บิล`, money2(r.cancelTotal));
  rule();
  printer.println('ยอดขายตามเมนู');
  (r.menu || []).forEach(m => {
    const amount = money2(m.revenue);
    const lines = wrap(`${m.qty}x ${m.name}`, LINE - widthOf(amount) - 1);
    lines.forEach((l, i) => printer.println(i === lines.length - 1 ? leftRight(l, amount) : l));
  });
  rule();
  printer.println('');
  printer.println('ผู้ตรวจนับเงิน ________________');
};

// พิมพ์ 1 ใบ — คืนค่า { success, error } ไม่ throw ออกไป
// ให้ผู้เรียกตัดสินใจเองว่าจะตอบ HTTP อะไรหรือจะลองใหม่ไหม
export const printTicket = async ({ ip, orderData = {}, printerType = 'receipt' }) => {
  if (!ip) return { success: false, stage: 'connect', error: 'ยังไม่ได้ระบุ IP ของเครื่องพิมพ์' };

  try {
    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: `tcp://${ip}:9100`,
      characterSet: 'PC858_EURO',
      removeSpecialCharacters: false,
      lineCharacter: '=',
      options: {
        timeout: 5000
      }
    });

    // ใช้ node-thermal-printer จัดหน้าอย่างเดียว ส่วนการส่งไปเครื่องทำเองใน printer-net.js
    // (เปิด socket ครั้งเดียว ถามสถานะกระดาษ/ฝา แล้วปิดแบบรอข้อมูลออกครบ)
    const send = async (label) => {
      const buffer = typeof printer.getBuffer === 'function' ? printer.getBuffer() : printer.buffer;
      const result = await sendToPrinter(ip, Buffer.from(buffer || []));
      if (result.success) {
        const how = result.confirmed ? 'printed (confirmed by printer)' : 'sent';
        console.log(`${label} ${how} — ${ip} (${result.bytes} bytes)${result.warning ? ` — ${result.warning}` : ''}`);
      } else {
        console.error(`${label} to ${ip} failed at "${result.stage}": ${result.error}`);
      }
      return result;
    };

    // ใบกำกับภาษีเต็มรูป — รูปแบบของตัวเอง ไม่ใช้หัวใบเสร็จ และไม่เปิดลิ้นชัก
    if (printerType === 'taxinvoice') {
      if (!orderData.taxInvoice) return { success: false, stage: 'format', error: 'ไม่มีข้อมูลใบกำกับภาษี' };
      printTaxInvoice(printer, orderData.taxInvoice, !!orderData.copy);
      printer.cut();
      return send(`Tax invoice ${orderData.taxInvoice.invoiceNo}`);
    }

    // รายงานปิดยอดประจำวัน — ไม่เปิดลิ้นชัก
    if (printerType === 'closeday') {
      if (!orderData.closeDay) return { success: false, stage: 'format', error: 'ไม่มีข้อมูลรายงานปิดยอด' };
      printDailyClose(printer, orderData.closeDay);
      printer.cut();
      return send('Daily close report');
    }

    // ใบแจ้งยอด = ให้ลูกค้าตรวจก่อนจ่าย หน้าตาเหมือนใบเสร็จแต่ยังไม่ใช่ใบเสร็จ
    // และต้องไม่เปิดลิ้นชักเก็บเงิน เพราะยังไม่ได้รับเงิน
    const isPreBill = printerType === 'prebill';
    // ใบแจ้งยอดที่ส่ง QR มาแต่พิมพ์ QR ไม่ได้ → แจ้งกลับหน้าเว็บทาง warning (ใบยังพิมพ์ออกตามปกติ)
    let qrNote = '';
    const isCustomerCopy = printerType === 'receipt' || isPreBill;

    // หัวใบเสร็จของสาขา (ตั้งที่หลังบ้าน > สาขา) — หน้าเว็บ/ตัวพิมพ์อัตโนมัติส่งมาใน orderData.header
    // ไม่ได้ส่งมา (หน้าเว็บรุ่นเก่า) ใช้ข้อความเดิม
    const header = orderData.header && typeof orderData.header === 'object' ? orderData.header : {};
    const clean = (v) => String(v || '').trim();
    // ใบเสร็จของบิลที่ชำระแล้ว + สาขามีเลขผู้เสียภาษี → ใบกำกับภาษีอย่างย่อ ตามแบบสรรพากร (ม.86/6)
    // ใบที่ส่งไปเครื่องใบเสร็จตามหมวดเมนู (ไม่มี paid) ยังเป็นใบรายการแบบเดิม
    const isAbb = printerType === 'receipt' && !!orderData.paid && !!clean(header.taxId);

    // ====== Format Receipt ======
    // ชื่อร้านพิมพ์เฉพาะที่ตั้งไว้ในหน้าสาขา — ใบครัวไม่พิมพ์ชื่อร้าน (ครัวไม่ต้องใช้ ประหยัดกระดาษ)
    printer.alignCenter();
    // โลโก้ (หลังบ้าน > ใบเสร็จ): หน้าเว็บย่อเป็นขนาดพิมพ์และแปลงขาว-ดำมาแล้ว พิมพ์ได้ตรง ๆ · พิมพ์ไม่ได้ก็ข้ามไป ใบเสร็จต้องออก
    if (isCustomerCopy && header.logo) {
      const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(header.logo));
      if (m) {
        try { await printer.printImageBuffer(Buffer.from(m[1], 'base64')); }
        catch (err) { console.error('Logo print skipped:', err.message || err); }
      }
    }
    // รายละเอียดที่แสดงตั้งได้ที่ หลังบ้าน > ใบเสร็จ · ใบกำกับภาษีอย่างย่อต้องมีชื่อผู้ขายเสมอ
    const showName = header.showName !== false || isAbb;
    if (isCustomerCopy && showName && clean(header.name)) printer.println(clean(header.name));
    // ชื่อผู้ประกอบการตาม ภ.พ.20 (เช่น บริษัท ... จำกัด) — เฉพาะใบกำกับภาษีอย่างย่อ และเมื่อต่างจากชื่อร้าน
    if (isAbb && clean(header.legalName) && clean(header.legalName) !== clean(header.name)) {
      wrap(clean(header.legalName)).forEach(l => printer.println(l));
    }
    if (isCustomerCopy) {
      if (header.showAddress !== false) clean(header.address).split(/\r?\n/).map(clean).filter(Boolean).forEach(line => printer.println(line));
      if (header.showPhone !== false && clean(header.phone)) printer.println(`โทร ${clean(header.phone)}`);
      // เลขผู้เสียภาษี / สถานประกอบการ / POS ID เฉพาะใบเสร็จ — ใบแจ้งยอดยังไม่ใช่ใบกำกับภาษี ไม่พิมพ์ให้ดูคล้าย
      if (!isPreBill && clean(header.taxId)) printer.println(`เลขผู้เสียภาษี ${clean(header.taxId)}`);
      if (isAbb) printer.println(taxBranchText(header.taxBranch));
      if (isAbb && clean(header.posId)) printer.println(`POS ID: ${clean(header.posId)}`);
    }
    printer.println("--------------------------------");

    const isKitchen = printerType === 'kitchen';
    // ใบยกเลิกรายการ (หน้าขายกดยกเลิกรายการที่ส่งครัวแล้ว) — หัวใบตัวใหญ่ให้ครัวเห็นว่าต้องหยุดทำ
    const cancel = isKitchen && orderData.cancel && typeof orderData.cancel === 'object' ? orderData.cancel : null;
    if (cancel) {
      const dining = String(cancel.dining || '').trim() || diningOf({ ...orderData, dining: '' });
      const tableLine = tableLineOf(orderData, dining);
      printer.setTextQuadArea(); // สูง+กว้างสองเท่า (เรียก DoubleHeight แล้ว DoubleWidth ตัวหลังจะทับตัวแรก)
      printer.invert(true);
      printer.println(' ยกเลิกรายการ ');
      printer.invert(false);
      printer.println(tableLine || dining);
      printer.setTextNormal();
      printer.println('*** ไม่ต้องทำ / หยุดทำ ***');
    } else if (isKitchen) {
      // ตัวใหญ่ให้ครัวเห็นทันทีว่าทำให้ใคร: ประเภท + โต๊ะ
      const dining = diningOf(orderData);
      const tableLine = tableLineOf(orderData, dining);
      printer.setTextDoubleHeight();
      printer.setTextDoubleWidth();
      printer.println(dining);
      if (tableLine) printer.println(tableLine);
      printer.setTextNormal();
    } else if (isPreBill) {
      printer.setTextDoubleHeight();
      printer.println("ใบแจ้งยอด");
      printer.setTextNormal();
      printer.println("CHECK BILL");
      printer.invert(true);
      printer.println(" ไม่ใช่ใบเสร็จ / ใบกำกับภาษี ");
      printer.invert(false);
    } else if (isAbb) {
      // ม.86/6: คำว่า "ใบกำกับภาษีอย่างย่อ" ต้องอยู่ในที่เด่นชัด
      printer.setTextDoubleHeight();
      printer.println("ใบกำกับภาษีอย่างย่อ");
      printer.setTextNormal();
      printer.println("TAX INVOICE (ABB)");
    } else {
      printer.println("ใบเสร็จรับเงิน (RECEIPT)");
    }

    printer.println("--------------------------------");
    printer.alignLeft();
    if (isCustomerCopy) {
      // ใบเสร็จ/ใบแจ้งยอด: ภาษาไทย · เลขที่+โต๊ะ / วันที่+เวลา / พนักงาน
      const now = new Date();
      const day = now.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Bangkok' });
      const time = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }) + ' น.';
      const table = rawTableOf(orderData);
      const who = clean(orderData.customerDetails?.name);
      const place = who || (table ? `โต๊ะ ${table}` : '');
      const no = clean(orderData.orderNumber);
      if (no && !/^โต๊ะ/.test(no)) printer.println(printable(leftRight(`เลขที่ ${no}`, place)));
      else if (place) printer.println(printable(place));
      printer.println(leftRight(`วันที่ ${day}`, time));
      if (clean(orderData.staff)) printer.println(printable(leftRight('พนักงาน', clean(orderData.staff))));
    } else {
      printer.println(`Order No: ${orderData.orderNumber || '-'}`);
      printer.println(`Date: ${new Date().toLocaleString('th-TH')}`);
      // ใบครัว: หัวใบบอกโต๊ะแล้ว ไม่พิมพ์ "โต๊ะ ..." ซ้ำ (เดลิเวอรียังพิมพ์ชื่อลูกค้า)
      if (orderData.customerDetails?.name && !(isKitchen && /^โต๊ะ/.test(String(orderData.customerDetails.name)))) {
        printer.println(`Customer: ${orderData.customerDetails.name}`);
      }
    }
    printer.println("--------------------------------");

    // Print Items
    if (orderData.items && Array.isArray(orderData.items)) {
      orderData.items.forEach(item => {
        // Front-end formatting depends on whether it's flattened or full object
        let itemName = item.isFlattened ? item.name : item.food?.name;
        let qty = item.isFlattened ? 1 : (item.quantity || 1);

        if (item.isFlattened) {
          const match = String(itemName || '').match(/\(x(\d+)\)$/);
          if (match) {
            qty = parseInt(match[1], 10);
            itemName = itemName.replace(/\s*\(x\d+\)$/, '').trim();
          }
        }

        // ใบเสร็จ/ใบแจ้งยอดที่หน้าเว็บส่งราคาบรรทัดมาด้วย (amount) → พิมพ์ราคาชิดขวา
        if (isCustomerCopy && item.amount !== undefined && item.amount !== null && item.amount !== '') {
          // V = สินค้าที่เสียภาษีมูลค่าเพิ่ม (ร้านไม่มีสินค้ายกเว้นภาษี)
          const amount = money2(item.amount) + (isAbb ? ' V' : '');
          const lines = wrap(`${qty}x ${itemName}`, LINE - widthOf(amount) - 1);
          lines.forEach((l, i) => printer.println(i === lines.length - 1 ? leftRight(printable(l), amount) : printable(l)));
        } else if (cancel) {
          printer.setTextDoubleHeight();
          printer.println(printable(`ยกเลิก ${qty}x ${itemName}`));
          printer.setTextNormal();
        } else {
          printer.println(printable(`${qty}x ${itemName}`));
        }

        // Print SubItems / Options
        if (item.isFlattened && item.subItems) {
          item.subItems.forEach(sub => {
            printer.println(printable(`   ${sub}`));
          });
        } else if (!item.isFlattened) {
          if (item.spice && item.spice.name) {
            printer.println(printable(`   (ความเผ็ด: ${item.spice.name})`));
          }
          const popups = [...(item.allPopups || []), ...(item.addOns || [])];
          popups.forEach(p => {
            // ตัวเลือกย่อยจากป๊อปอัพซ้อน ย่อหน้าลึกกว่าเพื่อให้เห็นว่าอยู่ใต้รายการก่อนหน้า
            printer.println(printable(p.isNestedOption ? `      • ${p.name}` : `   ↳ ${p.name}`));
          });
          if (item.promo && item.promo.id !== 'none') {
            printer.println(printable(`   ↳ ${item.promo.name}`));
          }
        }
      });
    }

    printer.println("--------------------------------");

    if (printerType === 'receipt' || isPreBill) {
      // บรรทัดสรุป (ยอดอาหาร / ส่วนลด / เซอร์วิสชาร์จ / VAT) ส่งมาจากหน้าเว็บ
      // ให้ฝั่งนี้พิมพ์ตามที่ส่งมา จะได้ไม่ต้องคำนวณซ้ำสองที่แล้วเลขไม่ตรงกัน
      // แถวที่ group = 'pay' (วิธีชำระ / สมาชิก / แต้ม) พิมพ์ต่อท้ายหลังส่วนภาษี — หน้าเว็บรุ่นเก่าไม่ส่ง group ก็พิมพ์ตรงนี้เหมือนเดิม
      const rows = Array.isArray(orderData.summary) ? orderData.summary.filter(r => r && r.label) : [];
      const sumRows = rows.filter(r => r.group !== 'pay');
      const payRows = rows.filter(r => r.group === 'pay');
      const rowLine = (r) => wrap(leftRight(printable(r.label), printable(r.value ?? ''))).forEach(l => printer.println(l));
      printer.alignLeft();
      sumRows.forEach(rowLine);
      if (sumRows.length) printer.println("--------------------------------");
      // ยอดสุทธิ ตัวสูงสองเท่า · ใบแจ้งยอด = ยอดที่ลูกค้าต้องจ่าย (หัก Voucher แล้ว)
      const totalNum = Number.isFinite(Number(orderData.totalAmount)) && orderData.totalAmount !== '' && orderData.totalAmount != null
        ? Number(orderData.totalAmount) : parseMoney(orderData.total);
      printer.setTextDoubleHeight();
      printer.println(leftRight(isPreBill ? 'ยอดที่ต้องชำระ' : 'ยอดสุทธิ', money2(totalNum)));
      printer.setTextNormal();
      printer.println("--------------------------------");
      if (isAbb) {
        const { rate, vatable, vat } = vatBreakdown(parseMoney(orderData.total), header.vatRate);
        printer.alignLeft();
        printer.println(leftRight('มูลค่าสินค้าเสียภาษี (V)', money2(vatable)));
        printer.println(leftRight(`ภาษีมูลค่าเพิ่ม ${rate}%`, money2(vat)));
        printer.alignCenter();
        printer.println('ราคารวมภาษีมูลค่าเพิ่มแล้ว');
        printer.println('(VAT Included)');
        printer.println("--------------------------------");
      }
      if (payRows.length) {
        printer.alignLeft();
        payRows.forEach(rowLine);
        printer.println("--------------------------------");
      }
      printer.alignCenter();
      // ใบแจ้งยอด + QR สแกนจ่าย (หน้าเว็บสร้างรูป QR ของสาขาให้แล้ว) · พิมพ์รูปไม่ได้ก็ยังออกใบแจ้งยอดแบบเดิม
      const payQr = isPreBill && orderData.payQr && typeof orderData.payQr === 'object' ? orderData.payQr : null;
      const qrMatch = payQr ? /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(payQr.image || '')) : null;
      let qrPrinted = false;
      if (payQr && !qrMatch) qrNote = 'ไม่มี QR สแกนจ่าย: รูป QR ที่ส่งมาผิดรูปแบบ';
      if (qrMatch) {
        printer.println("สแกนจ่ายด้วยแอปธนาคาร");
        try { await printer.printImageBuffer(Buffer.from(qrMatch[1], 'base64')); qrPrinted = true; }
        catch (err) { console.error('Pay QR print skipped:', err.message || err); qrNote = `ไม่มี QR สแกนจ่าย: พิมพ์รูป QR ไม่ได้ (${err.message || err})`; }
        if (qrPrinted) {
          const amt = (Number(payQr.amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          printer.println(`ยอดชำระ B ${amt}`);
          if (clean(payQr.shop)) printer.println(clean(payQr.shop));
          printer.println(payQr.dynamic ? "ยอดเงินขึ้นอัตโนมัติ ไม่ต้องพิมพ์" : `กรุณาใส่ยอด B ${amt} ในแอปธนาคาร`);
          printer.println("โอนแล้วแสดงสลิปให้พนักงาน");
        }
      }
      if (!qrPrinted) printer.println(isPreBill ? "กรุณาชำระเงินที่เคาน์เตอร์" : (clean(header.footer) || "ขอบคุณที่ใช้บริการ"));
      if (isPreBill) {
        printer.println("--------------------------------");
        printer.println(clean(header.taxId) ? "ใบกำกับภาษีอย่างย่อออกให้หลังชำระเงิน" : "ใบเสร็จรับเงินออกให้หลังชำระเงิน");
      }
    } else if (cancel) {
      const hm = (v) => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }) : ''; };
      const orderedAt = hm(cancel.orderedAt);
      if (orderedAt) printer.println(`สั่งเมื่อ: ${orderedAt} น.`);
      printer.println(`ยกเลิกเมื่อ: ${hm(new Date())} น.`);
      if (String(cancel.staff || '').trim()) printer.println(printable(`ยกเลิกโดย: ${String(cancel.staff).trim()}`));
      printer.alignCenter();
      printer.println("*** ใบยกเลิก ***");
    } else {
      printer.alignCenter();
      printer.println("*** END OF TICKET ***");
    }

    printer.cut();

    // เปิดลิ้นชักเฉพาะใบเสร็จจริงเท่านั้น — ใบแจ้งยอดยังไม่ได้รับเงิน
    // ใบเสร็จของบิลที่จ่ายด้วยการโอน (ลูกค้าสแกน QR) ส่ง noDrawer มา — ไม่ต้องเปิดลิ้นชัก
    if (printerType === 'receipt' && !orderData.noDrawer) {
      printer.openCashDrawer();
    }

    const sent = await send(`Print job ${orderData.orderNumber || ''}`.trim());
    if (qrNote && sent.success) sent.warning = [sent.warning, qrNote].filter(Boolean).join(' · ');
    return sent;
  } catch (error) {
    // พังตอนจัดหน้าใบ (ข้อมูลออเดอร์แปลก) — ยังไม่ได้ส่งอะไรไปเครื่องพิมพ์
    console.error('Print failed:', error);
    return { success: false, stage: 'format', error: `จัดหน้าใบพิมพ์ไม่สำเร็จ: ${error.message}` };
  }
};
