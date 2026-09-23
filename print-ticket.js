// ===============================================================
// พิมพ์ใบเสร็จ / ใบครัว / ใบแจ้งยอด ออกเครื่อง ESC-POS ในวงแลน
// ---------------------------------------------------------------
// แยกออกมาจาก server.js เพราะมีคนเรียกสองทาง:
//   1) POST /print — หน้าเว็บสั่งพิมพ์
//   2) auto-print.js — ตัวดึงออเดอร์จากชีตมาพิมพ์เอง
// ===============================================================

import pkg from 'node-thermal-printer';

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
const diningOf = (orderData) => {
  if (String(orderData.dining || '').trim()) return String(orderData.dining).trim();
  const fromTable = diningFromTableName(rawTableOf(orderData));
  if (fromTable) return fromTable;
  const items = Array.isArray(orderData.items) ? orderData.items : [];
  for (const item of items) {
    const d = item && item.dining;
    const name = typeof d === 'string' ? d : (d && d.name);
    if (name && String(name).trim()) return String(name).trim();
  }
  return DINE_IN;
};
// บรรทัดที่สองของหัวใบ: ทานที่ร้าน = "โต๊ะ 5" / ห่อกลับบ้าน-เดลิเวอรี = ชื่อช่อง เช่น "Takehome 1", "Grab"
const tableLineOf = (orderData, dining) => {
  const table = rawTableOf(orderData);
  // หน้าลูกค้าสั่งเองแบบไม่มีเลขโต๊ะ ลงชื่อ "ทานที่ร้าน" / "Takehome" ไว้ — ไม่ใช่โต๊ะจริง
  if (!table || table === dining || /^(takehome|ทานที่ร้าน|ห่อกลับบ้าน)$/i.test(table)) return '';
  return dining === DINE_IN ? `โต๊ะ ${table}` : table;
};

// พิมพ์ 1 ใบ — คืนค่า { success, error } ไม่ throw ออกไป
// ให้ผู้เรียกตัดสินใจเองว่าจะตอบ HTTP อะไรหรือจะลองใหม่ไหม
export const printTicket = async ({ ip, orderData = {}, printerType = 'receipt' }) => {
  if (!ip) return { success: false, error: 'Printer IP address is required' };

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

    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) {
      return { success: false, error: 'Printer is not connected or reachable at ' + ip };
    }

    // ใบแจ้งยอด = ให้ลูกค้าตรวจก่อนจ่าย หน้าตาเหมือนใบเสร็จแต่ยังไม่ใช่ใบเสร็จ
    // และต้องไม่เปิดลิ้นชักเก็บเงิน เพราะยังไม่ได้รับเงิน
    const isPreBill = printerType === 'prebill';
    const isCustomerCopy = printerType === 'receipt' || isPreBill;

    // หัวใบเสร็จของสาขา (ตั้งที่หลังบ้าน > สาขา) — หน้าเว็บ/ตัวพิมพ์อัตโนมัติส่งมาใน orderData.header
    // ไม่ได้ส่งมา (หน้าเว็บรุ่นเก่า) ใช้ข้อความเดิม
    const header = orderData.header && typeof orderData.header === 'object' ? orderData.header : {};
    const clean = (v) => String(v || '').trim();

    // ====== Format Receipt ======
    // ชื่อร้านพิมพ์เฉพาะที่ตั้งไว้ในหน้าสาขา — ใบครัวไม่พิมพ์ชื่อร้าน (ครัวไม่ต้องใช้ ประหยัดกระดาษ)
    printer.alignCenter();
    if (isCustomerCopy && clean(header.name)) printer.println(clean(header.name));
    if (isCustomerCopy) {
      clean(header.address).split(/\r?\n/).map(clean).filter(Boolean).forEach(line => printer.println(line));
      if (clean(header.phone)) printer.println(`โทร ${clean(header.phone)}`);
      if (clean(header.taxId)) printer.println(`เลขผู้เสียภาษี ${clean(header.taxId)}`);
    }
    printer.println("--------------------------------");

    const isKitchen = printerType === 'kitchen';
    if (isKitchen) {
      // ตัวใหญ่ให้ครัวเห็นทันทีว่าทำให้ใคร: ประเภท + โต๊ะ
      const dining = diningOf(orderData);
      const tableLine = tableLineOf(orderData, dining);
      printer.setTextDoubleHeight();
      printer.setTextDoubleWidth();
      printer.println(dining);
      if (tableLine) printer.println(tableLine);
      printer.setTextNormal();
    } else if (isPreBill) {
      printer.println("ใบแจ้งยอด (CHECK BILL)");
      printer.println("*** ยังไม่ชำระเงิน ***");
    } else {
      printer.println("ใบเสร็จรับเงิน (RECEIPT)");
    }

    printer.println("--------------------------------");
    printer.alignLeft();
    printer.println(`Order No: ${orderData.orderNumber || '-'}`);
    printer.println(`Date: ${new Date().toLocaleString('th-TH')}`);
    // ใบครัว: หัวใบบอกโต๊ะแล้ว ไม่พิมพ์ "โต๊ะ ..." ซ้ำ (เดลิเวอรียังพิมพ์ชื่อลูกค้า)
    if (orderData.customerDetails?.name && !(isKitchen && /^โต๊ะ/.test(String(orderData.customerDetails.name)))) {
      printer.println(`Customer: ${orderData.customerDetails.name}`);
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

        printer.println(`${qty}x ${itemName}`);

        // Print SubItems / Options
        if (item.isFlattened && item.subItems) {
          item.subItems.forEach(sub => {
            printer.println(`   ${sub}`);
          });
        } else if (!item.isFlattened) {
          if (item.spice && item.spice.name) {
            printer.println(`   (ความเผ็ด: ${item.spice.name})`);
          }
          const popups = [...(item.allPopups || []), ...(item.addOns || [])];
          popups.forEach(p => {
            // ตัวเลือกย่อยจากป๊อปอัพซ้อน ย่อหน้าลึกกว่าเพื่อให้เห็นว่าอยู่ใต้รายการก่อนหน้า
            printer.println(p.isNestedOption ? `      • ${p.name}` : `   ↳ ${p.name}`);
          });
          if (item.promo && item.promo.id !== 'none') {
            printer.println(`   ↳ ${item.promo.name}`);
          }
        }
      });
    }

    printer.println("--------------------------------");

    if (printerType === 'receipt' || isPreBill) {
      // บรรทัดสรุป (ยอดอาหาร / ส่วนลด / เซอร์วิสชาร์จ / VAT) ส่งมาจากหน้าเว็บ
      // ให้ฝั่งนี้พิมพ์ตามที่ส่งมา จะได้ไม่ต้องคำนวณซ้ำสองที่แล้วเลขไม่ตรงกัน
      if (Array.isArray(orderData.summary) && orderData.summary.length > 0) {
        printer.alignRight();
        orderData.summary.forEach(row => {
          printer.println(`${row.label}: ${row.value}`);
        });
      }
      printer.alignRight();
      printer.println(`TOTAL: B ${orderData.total || 0}`);
      printer.println("--------------------------------");
      printer.alignCenter();
      printer.println(isPreBill ? "กรุณาชำระเงินที่เคาน์เตอร์" : (clean(header.footer) || "Thank you!"));
    } else {
      printer.alignCenter();
      printer.println("*** END OF TICKET ***");
    }

    printer.cut();

    // เปิดลิ้นชักเฉพาะใบเสร็จจริงเท่านั้น — ใบแจ้งยอดยังไม่ได้รับเงิน
    if (printerType === 'receipt') {
      printer.openCashDrawer();
    }

    await printer.execute();
    console.log(`Print job sent successfully to ${ip}`);
    return { success: true };
  } catch (error) {
    console.error('Print failed:', error);
    return { success: false, error: error.message };
  }
};
