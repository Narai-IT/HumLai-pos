// การเชื่อมต่อ SQL Server — ใช้ร่วมกันทุก action
//
// ตั้งค่าผ่าน environment variables (Vercel: Settings → Environment Variables,
// เครื่องที่ร้าน/ออฟฟิศ: ไฟล์ .env ข้าง ๆ โปรเจกต์):
//   SQL_SERVER    ชื่อเครื่องหรือ IP ของ SQL Server        เช่น 203.0.113.10  หรือ  SRV-NARAI\SQLEXPRESS
//   SQL_PORT      พอร์ต (ไม่ใส่ = 1433)
//   SQL_DATABASE  ชื่อฐานข้อมูล                             เช่น HumLaiPOS
//   SQL_USER      ชื่อผู้ใช้ SQL Authentication
//   SQL_PASSWORD  รหัสผ่าน
//   SQL_ENCRYPT   'false' ถ้าเซิร์ฟเวอร์ในร้านไม่ได้เปิด TLS (ค่าเริ่มต้น true)
//   SQL_TRUST_CERT 'false' ถ้าใช้ใบรับรองจริง (ค่าเริ่มต้น true — เซิร์ฟเวอร์ในร้านมักใช้ self-signed)
import sql from 'mssql';

const bool = (raw, fallback) => {
  if (raw === undefined || raw === null || raw === '') return fallback;
  return String(raw).toLowerCase() !== 'false' && String(raw) !== '0';
};

// รับได้ทั้ง "192.168.1.10", "SRV-NARAI" และแบบมีชื่ออินสแตนซ์ "SRV-NARAI\\SQLEXPRESS"
const [serverHost, instanceName] = String(process.env.SQL_SERVER || 'localhost').split('\\');

export const dbConfig = {
  server:   serverHost || 'localhost',
  database: process.env.SQL_DATABASE || 'HumLaiPOS',
  user:     process.env.SQL_USER     || '',
  password: process.env.SQL_PASSWORD || '',
  // ใช้ชื่ออินสแตนซ์ (SQL Express) กับพอร์ตพร้อมกันไม่ได้ ไดรเวอร์จะฟ้องทันที
  // ตั้งชื่ออินสแตนซ์มา = ให้ SQL Browser (UDP 1434) เป็นคนบอกพอร์ตเอง
  ...(instanceName ? {} : { port: Number(process.env.SQL_PORT || 1433) }),
  options: {
    encrypt: bool(process.env.SQL_ENCRYPT, true),
    trustServerCertificate: bool(process.env.SQL_TRUST_CERT, true),
    enableArithAbort: true,
    // เก็บ/อ่าน DATETIME2 ตามค่าที่ส่งไปตรง ๆ ไม่ให้ไดรเวอร์ขยับเวลาตามโซนของเครื่องเซิร์ฟเวอร์
    useUTC: true,
    ...(instanceName ? { instanceName } : {})
  },
  // คำขอที่รอคิวออกเลขบิล/โควตาจะถือการเชื่อมต่อไว้ระหว่างรอ — เผื่อให้หน้าอ่านข้อมูลยังมีที่ว่าง
  pool: { max: Number(process.env.SQL_POOL_MAX || 20), min: 0, idleTimeoutMillis: 30000 },
  requestTimeout: Number(process.env.SQL_TIMEOUT || 20000),
  connectionTimeout: Number(process.env.SQL_CONNECT_TIMEOUT || 15000)
};

// ข้อความ error ดิบของไดรเวอร์บอกแค่ "Failed to connect to x:1433" ซึ่งไม่พอให้รู้ว่าต้องไปแก้ตรงไหน
export function explainConnectError(err) {
  const raw = String((err && err.message) || err);
  const where = instanceName ? `${serverHost}\\${instanceName}` : `${serverHost}:${dbConfig.port}`;
  if (/Failed to connect|ETIMEOUT|ESOCKET|ECONNREFUSED|getaddrinfo/i.test(raw)) {
    return [
      `ต่อ SQL Server ที่ ${where} ไม่ได้ — ${raw}`,
      'เช็กตามนี้:',
      `  1. ค่า SQL_SERVER ในไฟล์ .env ชี้ไปที่เครื่องจริงหรือยัง (ตอนนี้คือ "${process.env.SQL_SERVER || '(ไม่ได้ตั้ง)'}")`,
      '  2. เปิด TCP/IP ใน SQL Server Configuration Manager แล้วรีสตาร์ตเซอร์วิสหรือยัง',
      '  3. ไฟร์วอลล์เปิดพอร์ต 1433 หรือยัง (ถ้าใช้ SQL Express ต้องเปิด UDP 1434 ให้ SQL Browser ด้วย)',
      '  4. ทดสอบจาก PowerShell: Test-NetConnection -ComputerName <เครื่อง> -Port 1433'
    ].join('\n');
  }
  if (/Login failed/i.test(raw)) {
    return [
      `ชื่อผู้ใช้หรือรหัสผ่านไม่ถูก (SQL_USER / SQL_PASSWORD) — ${raw}`,
      'เช็กตามนี้:',
      // เจอบ่อยสุด: รหัสผ่านมี # แล้วไม่ได้ครอบด้วยเครื่องหมายคำพูด ค่าจึงถูกตัดตั้งแต่ตัว #
      '  1. รหัสผ่านมีตัว # ไหม ถ้ามีต้องเขียนเป็น SQL_PASSWORD="รหัสผ่าน" ไม่งั้นค่าจะถูกตัดตรงตัว #',
      '  2. เปิด SQL Server Authentication (Mixed Mode) แล้วหรือยัง — ถ้าเพิ่งเปิดต้องรีสตาร์ตเซอร์วิสด้วย',
      `  3. ผู้ใช้ "${dbConfig.user}" ถูกสร้างในฐานข้อมูล "${dbConfig.database}" แล้วจริงไหม`
    ].join('\n');
  }
  if (/Cannot open database/i.test(raw)) {
    return `ไม่พบฐานข้อมูล "${dbConfig.database}" หรือผู้ใช้นี้เข้าไม่ได้ — ${raw}`;
  }
  return raw;
}

// Vercel เรียกฟังก์ชันซ้ำใน container เดิม — เก็บ pool ไว้ที่ globalThis
// ไม่งั้นทุกคำขอจะเปิดการเชื่อมต่อใหม่จนเซิร์ฟเวอร์เต็ม
const KEY = Symbol.for('humlai.sql.pool');

export async function getPool() {
  let entry = globalThis[KEY];
  if (entry && entry.pool && entry.pool.connected) return entry.pool;
  if (entry && entry.promise) return entry.promise;

  const promise = new sql.ConnectionPool(dbConfig).connect()
    .then(pool => {
      globalThis[KEY] = { pool, promise: null };
      // การเชื่อมต่อหลุด (เซิร์ฟเวอร์รีสตาร์ต/เน็ตสะดุด) → ทิ้ง pool ทันที คำขอถัดไปจะต่อใหม่เอง
      pool.on('error', () => { globalThis[KEY] = null; });
      return pool;
    })
    .catch(err => { globalThis[KEY] = null; throw err; });

  globalThis[KEY] = { pool: null, promise };
  return promise;
}

// รันคำสั่งพร้อมพารามิเตอร์: query('SELECT * FROM x WHERE id=@id', { id: '1' })
// ชนิดข้อมูลปล่อยให้ mssql เดาจากค่าที่ส่ง ยกเว้นค่าที่ห่อด้วย typed() ด้านล่าง
export async function query(text, params = {}) {
  const pool = await getPool();
  const request = pool.request();
  for (const [key, value] of Object.entries(params)) {
    if (value && typeof value === 'object' && value.__sqlType) request.input(key, value.__sqlType, value.value);
    else request.input(key, value === undefined ? null : value);
  }
  return request.query(text);
}

export const typed = (sqlType, value) => ({ __sqlType: sqlType, value });
export { sql };

// รันหลายคำสั่งในทรานแซกชันเดียว
//   isolation: ค่าเริ่มต้น SERIALIZABLE (ของเดิม) · งานที่ต่อคิวด้วย lockKey() ใช้ 'READ_COMMITTED' ได้ ไม่ล็อกช่องว่างในตาราง จึงไม่ติดกันเอง
//   SQL Server ตัดทิ้งเพราะสองคำขอรอกันเอง (deadlock 1205) → ทุกอย่างในทรานแซกชันถูกยกเลิกแล้ว ลองใหม่เองสูงสุด 3 ครั้ง
const DEADLOCK = 1205;
const isDeadlock = (err) => !!err && (err.number === DEADLOCK || (err.originalError && err.originalError.number === DEADLOCK) || /deadlock/i.test(String(err.message || '')));
export async function withTransaction(fn, { isolation = 'SERIALIZABLE', retries = 3 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await runTransaction(fn, isolation);
    } catch (err) {
      if (!isDeadlock(err)) throw err;
      if (attempt >= retries) {
        console.error('[db] deadlock ซ้ำ', attempt, 'ครั้ง:', err.message);
        throw new Error('ระบบกำลังบันทึกรายการอื่นอยู่ กรุณากดอีกครั้ง');
      }
      await new Promise(r => setTimeout(r, 40 + Math.floor(Math.random() * 120) * attempt));
    }
  }
}
async function runTransaction(fn, isolation) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL[isolation] ?? sql.ISOLATION_LEVEL.SERIALIZABLE);
  const txQuery = (text, params = {}) => {
    const request = new sql.Request(tx);
    for (const [key, value] of Object.entries(params)) {
      if (value && typeof value === 'object' && value.__sqlType) request.input(key, value.__sqlType, value.value);
      else request.input(key, value === undefined ? null : value);
    }
    return request.query(text);
  };
  try {
    const out = await fn(txQuery);
    await tx.commit();
    return out;
  } catch (err) {
    try { await tx.rollback(); } catch { /* ทรานแซกชันถูกยกเลิกไปแล้ว */ }
    throw err;
  }
}

// ต่อคิวตามชื่อ (เช่น "bill:A" = ออกเลขบิลสาขา A, "member-menu:MB-0000001") จนจบทรานแซกชัน
// คำขอชื่อเดียวกันทำทีละคำขอ ชื่อต่างกันไม่รอกัน · ใช้ในทรานแซกชันเท่านั้น
export async function lockKey(runner, resource, timeoutMs = 15000) {
  const res = await runner(
    `DECLARE @r INT; EXEC @r = sp_getapplock @Resource = @res, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = @t; SELECT @r AS r`,
    { res: String(resource).slice(0, 255), t: timeoutMs });
  const r = res.recordset && res.recordset[0] ? res.recordset[0].r : -999;
  if (r < 0) throw new Error('ระบบกำลังบันทึกรายการอื่นอยู่ กรุณากดอีกครั้ง');
}

// เขียนหลายแถวในคำสั่งเดียว แบ่งก้อนไม่ให้เกินเพดานพารามิเตอร์ของ SQL Server (2100 ตัว)
export async function insertRows(table, columns, rows, runner = query) {
  if (!rows || rows.length === 0) return 0;
  const perRow = columns.length;
  const chunkSize = Math.max(1, Math.floor(2000 / perRow));
  let written = 0;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const params = {};
    const tuples = chunk.map((row, r) => {
      const names = columns.map((col, c) => {
        const key = `p${r}_${c}`;
        params[key] = row[c] === undefined ? null : row[c];
        return `@${key}`;
      });
      return `(${names.join(', ')})`;
    });
    await runner(
      `INSERT INTO dbo.${table} (${columns.map(c => `[${c}]`).join(', ')}) VALUES ${tuples.join(', ')}`,
      params
    );
    written += chunk.length;
  }
  return written;
}
