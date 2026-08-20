// ===============================================================
// พิมพ์ใบเสร็จ / ใบครัว / ใบแจ้งยอด ออกเครื่อง ESC-POS ในวงแลน
// ---------------------------------------------------------------
// แยกออกมาจาก server.js เพราะมีคนเรียกสองทาง:
//   1) POST /print — หน้าเว็บสั่งพิมพ์
//   2) auto-print.js — ตัวดึงออเดอร์จากชีตมาพิมพ์เอง
// ===============================================================

import pkg from 'node-thermal-printer';

const { printer: ThermalPrinter, types: PrinterTypes } = pkg;

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

    // ====== Format Receipt ======
    printer.alignCenter();
    printer.println("กะเพรา 10 หน้า");
    printer.println("--------------------------------");

    // ใบแจ้งยอด = ให้ลูกค้าตรวจก่อนจ่าย หน้าตาเหมือนใบเสร็จแต่ยังไม่ใช่ใบเสร็จ
    // และต้องไม่เปิดลิ้นชักเก็บเงิน เพราะยังไม่ได้รับเงิน
    const isPreBill = printerType === 'prebill';

    if (printerType === 'kitchen') {
      printer.setTextDoubleHeight();
      printer.setTextDoubleWidth();
      printer.println("ใบสั่งทำอาหาร (KITCHEN)");
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
    if (orderData.customerDetails?.name) {
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
      printer.println(isPreBill ? "กรุณาชำระเงินที่เคาน์เตอร์" : "Thank you!");
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
