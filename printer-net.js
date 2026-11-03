// ===============================================================
// ส่งข้อมูลดิบไปเครื่องพิมพ์ ESC/POS ทาง TCP (port 9100)
// ---------------------------------------------------------------
// เดิมใช้ execute() ของ node-thermal-printer ซึ่งเปิด socket สองรอบ
// (เช็คก่อนหนึ่งรอบ แล้วเปิดใหม่ตอนพิมพ์) และตัด socket ทิ้งทันทีที่เขียนเสร็จ
// เครื่องพิมพ์บางรุ่นรับได้ทีละการเชื่อมต่อ หรือส่งสถานะกลับมาตอนต่อเข้า
// การตัดทิ้งแบบนั้นทำให้งานหายกลางทาง — หน้าเว็บขึ้น "สำเร็จ" แต่กระดาษไม่ออก
//
// ตัวนี้เปิด socket ครั้งเดียว:
//   1) ถามสถานะเครื่อง (DLE EOT) — รู้ได้ว่ากระดาษหมด / ฝาเปิด / IP นี้ไม่ใช่เครื่องพิมพ์ใบเสร็จ
//   2) ส่ง ESC @ (ล้างสถานะค้าง) ตามด้วยงานพิมพ์
//   3) ปิดแบบสุภาพ (end) แล้วรอให้ข้อมูลออกครบก่อนตอบกลับ
// ===============================================================

import net from 'net';

const ESC_INIT = Buffer.from([0x1b, 0x40]);
// DLE EOT n — ถามสถานะแบบ real-time: 1 = เครื่อง, 2 = สาเหตุ offline, 4 = กระดาษ
const STATUS_QUERIES = [1, 2, 4];

// ไบต์สถานะของ ESC/POS มีบิตคงที่: bit1 = 1, bit4 = 1, bit0 = 0, bit7 = 0
// ใช้กรองว่าคำตอบที่ได้เป็นสถานะจริง ไม่ใช่ข้อมูลอื่น
const isStatusByte = (b) => (b & 0x93) === 0x12;

export const describeStatus = (bytes) => {
  if (!bytes || bytes.length < STATUS_QUERIES.length || !bytes.every(isStatusByte)) return null;
  const [printerByte, offlineByte, paperByte] = bytes;
  const problems = [];
  if (offlineByte & 0x04) problems.push('ฝาเครื่องพิมพ์เปิดอยู่ — ปิดฝาให้สนิท');
  if ((offlineByte & 0x20) || (paperByte & 0x60)) problems.push('กระดาษหมด — ใส่กระดาษม้วนใหม่');
  if (offlineByte & 0x40 && problems.length === 0) problems.push('เครื่องพิมพ์แจ้งข้อผิดพลาด (เช่น ใบมีดตัดกระดาษติด) — ปิดเปิดเครื่องพิมพ์ใหม่');
  return {
    offline: !!(printerByte & 0x08),
    paperNearEnd: !!(paperByte & 0x0c),
    problems
  };
};

const NO_STATUS_WARNING =
  'ส่งงานไปแล้ว แต่อุปกรณ์ที่ IP นี้ไม่ตอบสถานะแบบเครื่องพิมพ์ใบเสร็จ — ถ้ากระดาษไม่ออก อาจใส่ IP ผิดเครื่อง ' +
  '(ปิดเครื่องพิมพ์ กดปุ่ม FEED ค้างแล้วเปิดเครื่อง จะพิมพ์ใบทดสอบที่มี IP จริงของเครื่องออกมา)';

// ส่งข้อมูลไปเครื่องพิมพ์ — คืนค่า { success, error, warning, bytes, status } ไม่ throw
export const sendToPrinter = (ip, data, { port = 9100, connectTimeout = 5000, statusWait = 800, closeWait = 3000 } = {}) =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    const received = [];
    let settled = false;
    let phase = 'connect';
    let timer = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };

    const fail = (error) => finish({ success: false, error });

    const sendJob = (status) => {
      if (status && status.problems.length) {
        fail(`เครื่องพิมพ์ ${ip} ไม่พร้อม: ${status.problems.join(' / ')}`);
        return;
      }
      phase = 'send';
      const payload = Buffer.concat([ESC_INIT, data]);
      const warning = !status
        ? NO_STATUS_WARNING
        : status.paperNearEnd ? 'กระดาษใกล้หมด — เตรียมเปลี่ยนม้วนใหม่' : null;
      socket.write(payload);
      // end() = ปิดแบบรอข้อมูลส่งออกครบ (FIN) ต่างจาก destroy() ที่ตัดทิ้งทันที
      socket.end(() => {
        phase = 'close';
        clearTimeout(timer);
        // ส่วนใหญ่เครื่องพิมพ์จะปิดตามมาเอง ถ้าเงียบก็ถือว่าส่งครบแล้ว (ข้อมูลออกจากเครื่องเราหมดแล้ว)
        timer = setTimeout(() => finish({ success: true, warning, bytes: payload.length, status }), closeWait);
      });
      socket.once('close', () => finish({ success: true, warning, bytes: payload.length, status }));
    };

    socket.on('data', (chunk) => {
      if (phase !== 'status') return;
      received.push(...chunk);
      if (received.length >= STATUS_QUERIES.length) {
        clearTimeout(timer);
        sendJob(describeStatus(received.slice(0, STATUS_QUERIES.length)));
      }
    });

    socket.on('error', (err) => {
      if (phase === 'close') return finish({ success: true, bytes: data.length + ESC_INIT.length });
      const reason = {
        ECONNREFUSED: `เครื่องที่ ${ip} ไม่เปิดรับงานพิมพ์ (port ${port}) — ตรวจว่า IP ถูกเครื่อง และเครื่องพิมพ์เปิดอยู่`,
        EHOSTUNREACH: `ติดต่อ ${ip} ไม่ได้ — เครื่องพิมพ์ปิดอยู่ หรือไม่ได้อยู่วงแลนเดียวกับเครื่องที่รัน Print Server`,
        ENETUNREACH: `ติดต่อ ${ip} ไม่ได้ — เครื่องที่รัน Print Server ไม่ได้ต่อวงแลนนี้`,
        ECONNRESET: `เครื่องพิมพ์ ${ip} ตัดการเชื่อมต่อกลางทาง — อาจมีเครื่องอื่นกำลังส่งงานอยู่ ลองใหม่อีกครั้ง`
      }[err.code];
      fail(reason || `พิมพ์ไม่สำเร็จ (${ip}): ${err.message}`);
    });

    timer = setTimeout(
      () => fail(`ติดต่อเครื่องพิมพ์ ${ip} ไม่ได้ภายใน ${connectTimeout / 1000} วินาที — เครื่องพิมพ์ปิดอยู่ หรือ IP เปลี่ยนไปแล้ว`),
      connectTimeout
    );

    socket.connect(port, ip, () => {
      clearTimeout(timer);
      phase = 'status';
      socket.write(Buffer.concat(STATUS_QUERIES.map(n => Buffer.from([0x10, 0x04, n]))));
      // เครื่องที่ไม่ตอบสถานะ (บางรุ่น/บางยี่ห้อ) ก็ยังส่งงานให้ แต่แนบคำเตือนกลับไป
      timer = setTimeout(() => sendJob(null), statusWait);
    });
  });
