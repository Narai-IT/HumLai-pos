// ===============================================================
// ส่งข้อมูลดิบไปเครื่องพิมพ์ ESC/POS ทาง TCP (port 9100) พร้อมรายงานทีละขั้น
// ---------------------------------------------------------------
// เปิด socket ครั้งเดียวแล้วไล่ทีละขั้น — ติดขั้นไหนจะรู้ทันทีว่าปัญหาอยู่ตรงไหน
//   connect : Print Server ต่อเข้าเครื่องพิมพ์ได้ไหม
//   ready   : ถามสถานะเครื่อง (DLE EOT) — กระดาษหมด / ฝาเปิด / เครื่อง error
//   send    : ส่ง ESC @ (ล้างสถานะค้าง) ตามด้วยงานพิมพ์
//   done    : ต่อท้ายงานด้วย GS r 1 — คำสั่งนี้อยู่ในคิวต่อจากงานพิมพ์
//             เครื่องจะตอบกลับก็ต่อเมื่อพิมพ์ของก่อนหน้าเสร็จแล้ว จึงใช้ยืนยันว่า "พิมพ์เสร็จ"
//
// เดิมใช้ execute() ของ node-thermal-printer ซึ่งเปิด socket สองรอบและตัดทิ้งทันที
// ที่เขียนเสร็จ — เครื่องบางรุ่นงานหายกลางทาง หน้าเว็บขึ้นสำเร็จแต่กระดาษไม่ออก
// ===============================================================

import net from 'net';

const ESC_INIT = Buffer.from([0x1b, 0x40]);
const STATUS_QUERIES = [1, 2, 4]; // DLE EOT n: 1 = เครื่อง, 2 = สาเหตุ offline, 4 = กระดาษ
const STATUS_QUERY = Buffer.concat(STATUS_QUERIES.map(n => Buffer.from([0x10, 0x04, n])));
const CONFIRM_QUERY = Buffer.from([0x1d, 0x72, 0x01]); // GS r 1 — สถานะเซนเซอร์กระดาษ (ตอบหลังพิมพ์เสร็จ)

// ไบต์สถานะ DLE EOT มีบิตคงที่: bit1 = 1, bit4 = 1, bit0 = 0, bit7 = 0
const isStatusByte = (b) => (b & 0x93) === 0x12;
// ไบต์ตอบ GS r มีบิตคงที่: bit4 = 0, bit7 = 0
const isConfirmByte = (b) => (b & 0x90) === 0;

export const describeStatus = (bytes) => {
  if (!bytes || bytes.length < STATUS_QUERIES.length || !bytes.every(isStatusByte)) return null;
  const [printerByte, offlineByte, paperByte] = bytes;
  const problems = [];
  if (offlineByte & 0x04) problems.push('ฝาเครื่องพิมพ์เปิดอยู่ — ปิดฝาให้สนิท');
  if ((offlineByte & 0x20) || (paperByte & 0x60)) problems.push('กระดาษหมด — ใส่กระดาษม้วนใหม่');
  if ((offlineByte & 0x40) && problems.length === 0) problems.push('เครื่องพิมพ์แจ้งข้อผิดพลาด (เช่น ใบมีดตัดกระดาษติด) — ปิด-เปิดเครื่องพิมพ์ใหม่');
  return {
    offline: !!(printerByte & 0x08),
    paperNearEnd: !!(paperByte & 0x0c),
    problems
  };
};

const NO_STATUS_DETAIL =
  'อุปกรณ์ที่ IP นี้ไม่ตอบสถานะแบบเครื่องพิมพ์ใบเสร็จ — ถ้ากระดาษไม่ออก อาจใส่ IP ผิดเครื่อง ' +
  '(ปิดเครื่องพิมพ์ กดปุ่ม FEED ค้างแล้วเปิดเครื่อง จะพิมพ์ใบทดสอบที่มี IP จริงของเครื่องออกมา)';

const connectErrorText = (err, ip, port) => ({
  ECONNREFUSED: `เครื่องที่ ${ip} ไม่เปิดรับงานพิมพ์ (port ${port}) — ตรวจว่า IP ถูกเครื่อง และเครื่องพิมพ์เปิดอยู่`,
  EHOSTUNREACH: `ติดต่อ ${ip} ไม่ได้ — เครื่องพิมพ์ปิดอยู่ หรือไม่ได้อยู่วงแลนเดียวกับเครื่องที่รัน Print Server`,
  ENETUNREACH: `ติดต่อ ${ip} ไม่ได้ — เครื่องที่รัน Print Server ไม่ได้ต่อวงแลนนี้`,
  ECONNRESET: `เครื่องพิมพ์ ${ip} ตัดการเชื่อมต่อกลางทาง — อาจมีเครื่องอื่นกำลังส่งงานอยู่ ลองใหม่อีกครั้ง`
}[err.code] || `${err.message} (${ip})`);

// ส่งข้อมูลไปเครื่องพิมพ์ — ไม่ throw คืนค่า
// { success, confirmed, stage, error, warning, bytes, steps: [{ key, status: ok|warn|fail|skip, detail }] }
// stage = ขั้นที่ติดปัญหา (หรือ 'done' ถ้าผ่านหมด)
export const sendToPrinter = (ip, data, {
  port = 9100, connectTimeout = 5000, statusWait = 800, confirmWait = 8000, closeWait = 1500
} = {}) =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    const steps = {
      connect: { key: 'connect', status: 'pending', detail: '' },
      ready: { key: 'ready', status: 'pending', detail: '' },
      send: { key: 'send', status: 'pending', detail: '' },
      done: { key: 'done', status: 'pending', detail: '' }
    };
    const mark = (key, status, detail = '') => { steps[key] = { key, status, detail }; };
    let phase = 'connect';
    let timer = null;
    let settled = false;
    let statusBytes = [];
    let bytes = 0;

    const finish = (stage, error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      Object.values(steps).forEach(s => { if (s.status === 'pending') s.status = 'skip'; });
      const warnings = Object.values(steps).filter(s => s.status === 'warn').map(s => s.detail);
      socket.destroy();
      resolve({
        success: !error,
        confirmed: steps.done.status === 'ok',
        stage,
        error,
        warning: error ? null : (warnings[0] || null),
        bytes,
        steps: Object.values(steps)
      });
    };
    const fail = (key, detail) => { mark(key, 'fail', detail); finish(key, detail); };

    // ปิดแบบรอข้อมูลออกครบ (FIN) แล้วจบ — ไม่ใช้ destroy() ตรง ๆ ที่ตัดทิ้งทันที
    const closeAndFinish = () => {
      phase = 'close';
      clearTimeout(timer);
      socket.end();
      timer = setTimeout(() => finish('done'), closeWait);
      socket.once('close', () => finish('done'));
    };

    const sendJob = (status) => {
      if (status) {
        if (status.problems.length) return fail('ready', `เครื่องพิมพ์ ${ip} ไม่พร้อม: ${status.problems.join(' / ')}`);
        mark('ready', status.paperNearEnd ? 'warn' : 'ok', status.paperNearEnd ? 'กระดาษใกล้หมด — เตรียมเปลี่ยนม้วนใหม่' : 'กระดาษพร้อม ฝาปิดอยู่');
      } else {
        mark('ready', 'warn', NO_STATUS_DETAIL);
      }

      phase = 'send';
      const payload = Buffer.concat([ESC_INIT, data]);
      bytes = payload.length;
      // เครื่องที่ตอบสถานะได้ → ต่อท้ายด้วยคำถามที่เครื่องจะตอบหลังพิมพ์เสร็จ
      const out = status ? Buffer.concat([payload, CONFIRM_QUERY]) : payload;
      socket.write(out, (err) => {
        if (err || settled) return; // error จะเข้า handler 'error' เอง
        mark('send', 'ok', `ส่งงานถึงเครื่องพิมพ์แล้ว (${payload.length.toLocaleString()} ไบต์)`);
        if (!status) {
          mark('done', 'warn', 'เครื่องนี้ไม่รองรับการยืนยันว่าพิมพ์เสร็จ — ดูที่เครื่องพิมพ์ว่ากระดาษออกไหม');
          return closeAndFinish();
        }
        phase = 'confirm';
        timer = setTimeout(() => {
          mark('done', 'warn', `เครื่องพิมพ์ไม่ยืนยันภายใน ${confirmWait / 1000} วินาที — ดูที่เครื่องพิมพ์ว่ากระดาษออกไหม`);
          closeAndFinish();
        }, confirmWait);
      });
    };

    socket.on('data', (chunk) => {
      if (phase === 'status') {
        statusBytes.push(...chunk);
        if (statusBytes.length >= STATUS_QUERIES.length) {
          clearTimeout(timer);
          sendJob(describeStatus(statusBytes.slice(0, STATUS_QUERIES.length)));
        }
      } else if (phase === 'confirm') {
        const b = [...chunk].find(isConfirmByte);
        if (b === undefined) return; // ไบต์อื่น (เช่น สถานะที่เครื่องส่งเอง) ข้ามไป
        clearTimeout(timer);
        if (b & 0x0c) mark('done', 'warn', 'กระดาษหมดระหว่างพิมพ์ — ใบอาจออกไม่ครบ ใส่กระดาษใหม่แล้วเครื่องจะพิมพ์ต่อ');
        else mark('done', 'ok', 'เครื่องพิมพ์ยืนยันว่าพิมพ์เสร็จแล้ว');
        closeAndFinish();
      }
    });

    socket.on('error', (err) => {
      if (phase === 'connect') return fail('connect', connectErrorText(err, ip, port));
      if (phase === 'status') return fail('ready', connectErrorText(err, ip, port));
      if (phase === 'send') return fail('send', `ส่งงานไม่ครบ: ${connectErrorText(err, ip, port)}`);
      if (phase === 'confirm') {
        // ข้อมูลออกจากเครื่องเราครบแล้ว แต่เครื่องพิมพ์ตัดสายก่อนยืนยัน
        mark('done', 'warn', 'เครื่องพิมพ์ตัดการเชื่อมต่อก่อนยืนยัน — ดูที่เครื่องพิมพ์ว่ากระดาษออกไหม');
      }
      finish('done');
    });

    // เครื่องพิมพ์ปิดการเชื่อมต่อเองโดยไม่มี error
    socket.on('close', () => {
      if (settled || phase === 'close') return;
      if (phase === 'confirm') {
        mark('done', 'warn', 'เครื่องพิมพ์ปิดการเชื่อมต่อก่อนยืนยัน — ดูที่เครื่องพิมพ์ว่ากระดาษออกไหม');
        return finish('done');
      }
      fail(phase === 'send' ? 'send' : phase === 'status' ? 'ready' : 'connect', `เครื่องพิมพ์ ${ip} ปิดการเชื่อมต่อกลางทาง — ลองใหม่อีกครั้ง`);
    });

    timer = setTimeout(
      () => fail('connect', `ติดต่อเครื่องพิมพ์ ${ip} ไม่ได้ภายใน ${connectTimeout / 1000} วินาที — เครื่องพิมพ์ปิดอยู่ หรือ IP เปลี่ยนไปแล้ว`),
      connectTimeout
    );

    socket.connect(port, ip, () => {
      clearTimeout(timer);
      mark('connect', 'ok', `ต่อเข้า ${ip}:${port} ได้`);
      phase = 'status';
      socket.write(STATUS_QUERY);
      // เครื่องที่ไม่ตอบสถานะ (บางรุ่น/บางยี่ห้อ) ก็ยังส่งงานให้ แต่ขึ้นเตือนไว้
      timer = setTimeout(() => sendJob(null), statusWait);
    });
  });
