import express from 'express';
import cors from 'cors';
import os from 'os';
import net from 'net';
import pkg from 'node-thermal-printer';

const { printer: ThermalPrinter, types: PrinterTypes } = pkg;

const SERVER_NAME = 'humlai-print-server';
const SERVER_VERSION = '1.1.0';
const DEFAULT_PRINTER_PORT = 9100;

const app = express();
app.use(cors());
app.use(express.json()); // For handling JSON payloads

// รายการ IPv4 ของทุกการ์ดแลน/ไวไฟบนเครื่องนี้ (ข้าม loopback)
const getLocalIPv4s = () => {
  const interfaces = os.networkInterfaces();
  const found = [];
  for (const name in interfaces) {
    for (const details of interfaces[name] || []) {
      if (details.family === 'IPv4' && !details.internal) {
        found.push({ name, address: details.address, netmask: details.netmask });
      }
    }
  }
  return found;
};

const toBaseIp = (ip) => `${ip.split('.').slice(0, 3).join('.')}.`;

// รับได้ทั้ง "192.168.1", "192.168.1.", "192.168.1.0" และ "192.168.1.0/24"
const normalizeSubnet = (raw) => {
  const value = String(raw || '').trim().replace(/\/\d+$/, '');
  if (!value) return null;
  const parts = value.split('.').filter(part => part !== '');
  if (parts.length < 3) return null;
  const octets = parts.slice(0, 3);
  if (!octets.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)) return null;
  return `${octets.join('.')}.`;
};

const clampInt = (raw, fallback, min, max) => {
  const value = parseInt(raw, 10);
  if (Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
};

// Health check — ให้หน้าเว็บเช็คได้ว่า Print Server เปิดอยู่ไหม
app.get('/health', (req, res) => {
  const localIps = getLocalIPv4s();
  res.json({
    success: true,
    service: SERVER_NAME,
    version: SERVER_VERSION,
    localIps,
    subnets: [...new Set(localIps.map(entry => toBaseIp(entry.address)))],
    defaultPort: DEFAULT_PRINTER_PORT
  });
});

// LAN Printer Discovery endpoint
// Query (ไม่ใส่ก็ได้): subnet=192.168.1. | from=1 | to=254 | port=9100 | timeout=600
app.get('/scan-printers', async (req, res) => {
  try {
    const localIps = getLocalIPv4s();
    const requestedSubnet = normalizeSubnet(req.query.subnet);

    if (req.query.subnet && !requestedSubnet) {
      return res.status(400).json({ success: false, error: `รูปแบบวงแลนไม่ถูกต้อง: ${req.query.subnet} (ตัวอย่างที่ถูก: 192.168.1.)` });
    }

    if (!requestedSubnet && localIps.length === 0) {
      return res.status(500).json({ success: false, error: 'หา IP วงแลนของเครื่องนี้ไม่เจอ — ตรวจสอบว่าเสียบสาย LAN หรือต่อ Wi-Fi อยู่' });
    }

    const localIp = localIps.length > 0 ? localIps[0].address : null;
    const baseIp = requestedSubnet || toBaseIp(localIp);

    const from = clampInt(req.query.from, 1, 1, 254);
    const to = clampInt(req.query.to, 254, from, 254);
    const scanPort = clampInt(req.query.port, DEFAULT_PRINTER_PORT, 1, 65535);
    const timeoutMs = clampInt(req.query.timeout, 600, 100, 5000);

    const scanHost = (targetIp) => {
      return new Promise((resolve) => {
        const socket = new net.Socket();
        let settled = false;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          socket.destroy();
          resolve(result);
        };

        socket.setTimeout(timeoutMs);
        socket.on('connect', () => finish({ ip: targetIp, port: scanPort }));
        socket.on('timeout', () => finish(null));
        socket.on('error', () => finish(null));
        socket.connect(scanPort, targetIp);
      });
    };

    const ips = [];
    for (let i = from; i <= to; i++) ips.push(`${baseIp}${i}`);

    const foundPrinters = [];
    const chunkSize = 50;
    for (let i = 0; i < ips.length; i += chunkSize) {
      const chunk = ips.slice(i, i + chunkSize);
      const results = await Promise.all(chunk.map(ip => scanHost(ip)));
      results.forEach(result => {
        if (result) foundPrinters.push(result);
      });
    }

    console.log(`Scanned ${baseIp}${from}-${to} on port ${scanPort} — found ${foundPrinters.length} printer(s)`);

    res.json({
      success: true,
      localIp,
      localIps,
      baseIp,
      from,
      to,
      port: scanPort,
      scanned: ips.length,
      printers: foundPrinters
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/print', async (req, res) => {
  const { ip, orderData, printerType = 'receipt' } = req.body;

  if (!ip) {
    return res.status(400).json({ success: false, error: 'Printer IP address is required' });
  }

  try {
    let printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: `tcp://${ip}:9100`,
      characterSet: "PC858_EURO",
      removeSpecialCharacters: false,
      lineCharacter: "=",
      options:{
        timeout: 5000
      }
    });

    let isConnected = await printer.isPrinterConnected();
    if (!isConnected) {
      return res.status(500).json({ success: false, error: 'Printer is not connected or reachable at ' + ip });
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
          const match = itemName.match(/\(x(\d+)\)$/);
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
    
    res.json({ success: true });
  } catch (error) {
    console.error("Print failed:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = 3001;
// ผูกข้อความไว้กับ event 'listening' ไม่ใช่ callback ของ app.listen
// เพราะ Express 5 เรียก callback ทันทีแม้ bind พอร์ตไม่สำเร็จ
const server = app.listen(PORT);

server.on('listening', () => {
  console.log(`[${new Date().toLocaleString('th-TH')}] Print bridge server running on http://localhost:${PORT}`);
  console.log(`Ready to print to LAN ESP/POS thermal printers`);
});

// ถ้ามี Print Server ตัวอื่นเปิดอยู่แล้ว ให้จบการทำงานเงียบ ๆ
// (ตัว daemon ที่เปิดอัตโนมัติจะได้ไม่วนเปิดซ้ำ)
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} ถูกใช้งานอยู่แล้ว — มี Print Server เปิดอยู่ก่อนหน้า ปิดตัวนี้ลง`);
    process.exit(0);
  }
  console.error('Server error:', err);
  process.exit(1);
});
