// ── คิวงานพิมพ์ ──
// เครื่องที่พิมพ์ตรงไม่ได้ (แท็บเล็ต Android / iPad / มือถือ) ส่งงานพิมพ์มาเข้าคิวพร้อมสาขา
// "กล่องพิมพ์" = Print Server ที่เปิดค้างในร้านสาขานั้น ดึงงานของสาขาตัวเองไปพิมพ์ทุก ~1.5 วิ แล้วรายงานผล
// แท็บเล็ตถามสถานะงานจนได้ผล (พิมพ์แล้ว / พิมพ์ไม่สำเร็จ) เพื่อแจ้งพนักงาน
//
// กล่องพิมพ์ยืนยันตัวด้วย PRINT_AGENT_KEY ใน .env ของเครื่อง API (ใส่ค่าเดียวกันที่กล่องพิมพ์)
import crypto from 'node:crypto';
import { query } from './db.js';
import { branchForWrite, isKnownBranch } from './branch.js';

const MAX_PAYLOAD = 400 * 1024;
// งานที่ค้างนานเกินนี้ (กล่องพิมพ์ออฟไลน์) → ยกเลิก ไม่ให้ใบเก่าพ่นออกมาทีหลังตอนกล่องกลับมา
const PENDING_TTL_SEC = 30;
// กล่องพิมพ์รับงานไปแล้วเงียบหาย (ดับกลางทาง) → ให้รับใหม่ได้ ไม่เกิน 2 ครั้ง
const CLAIM_TTL_SEC = 45;
const MAX_ATTEMPTS = 2;
const AGENT_ONLINE_SEC = 20;

let tableReady = false;
async function hasTable() {
  if (tableReady) return true;
  try {
    const res = await query(`SELECT OBJECT_ID('dbo.PrintJobs', 'U') AS id`);
    tableReady = !!(res.recordset[0] && res.recordset[0].id);
  } catch { /* ยังไม่มี */ }
  return tableReady;
}
const NOT_READY = { success: false, error: 'ยังไม่ได้สร้างตารางคิวงานพิมพ์ — รัน update-api.bat (sql:init) ที่เครื่อง API' };

const agentOk = (key) => {
  const want = String(process.env.PRINT_AGENT_KEY || '');
  const got = String(key || '');
  if (!want || want.length !== got.length) return false;
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got));
};
const ids = (v) => (Array.isArray(v) ? v : [v]).map((x) => parseInt(x, 10)).filter((x) => x > 0).slice(0, 50);
const agentStatus = async (branchId) => {
  const r = await query('SELECT AgentName, LastSeen, DATEDIFF(SECOND, LastSeen, SYSUTCDATETIME()) AS ago FROM dbo.PrintAgents WHERE BranchId = @b', { b: branchId });
  const a = r.recordset[0];
  return a ? { online: a.ago <= AGENT_ONLINE_SEC, name: a.AgentName || '', lastSeen: a.LastSeen, ago: a.ago } : { online: false, name: '', lastSeen: null, ago: null };
};

// ── ฝั่งแท็บเล็ต ──
export async function enqueuePrint(data) {
  if (!(await hasTable())) return NOT_READY;
  const branchId = await branchForWrite(data);
  if (!branchId) return { success: false, error: 'ไม่รู้ว่าเครื่องนี้อยู่สาขาไหน' };
  const ip = String(data.ip || '').trim();
  if (!ip) return { success: false, error: 'ยังไม่ได้เลือกเครื่องพิมพ์' };
  const payload = JSON.stringify(data.orderData || {});
  if (payload.length > MAX_PAYLOAD) return { success: false, error: 'งานพิมพ์ใหญ่เกินไป' };
  const res = await query(`INSERT INTO dbo.PrintJobs (BranchId, PrinterIp, PrinterType, PayloadJson) OUTPUT INSERTED.JobId VALUES (@b, @ip, @t, @p)`,
    { b: branchId, ip: ip.slice(0, 100), t: String(data.printerType || 'receipt').slice(0, 30), p: payload });
  return { success: true, jobId: Number(res.recordset[0].JobId), agent: await agentStatus(branchId) };
}

export async function printJobStatus(data) {
  if (!(await hasTable())) return NOT_READY;
  const list = ids(data.ids || data.id);
  if (!list.length) return { success: true, jobs: [] };
  const branchId = await branchForWrite(data);
  // งานค้างที่หมดเวลา → ล้มเหลว (ทำตรงนี้ด้วย เผื่อกล่องพิมพ์ดับอยู่และไม่มีใครมาดึง)
  await expireStale(branchId);
  const res = await query(`SELECT JobId, [Status], LastError FROM dbo.PrintJobs WHERE JobId IN (${list.join(',')}) AND BranchId = @b`, { b: branchId });
  return { success: true, jobs: res.recordset.map((r) => ({ id: Number(r.JobId), status: r.Status, error: r.LastError || null })), agent: await agentStatus(branchId) };
}

// พิมพ์ใหม่: งานที่ล้มเหลวกลับเข้าคิว (นับเวลาใหม่)
export async function retryPrintJob(data) {
  if (!(await hasTable())) return NOT_READY;
  const [id] = ids(data.id);
  if (!id) return { success: false, error: 'ไม่พบงานพิมพ์' };
  const branchId = await branchForWrite(data);
  const res = await query(`UPDATE dbo.PrintJobs SET [Status] = 'pending', LastError = NULL, Attempts = 0, CreatedAt = SYSUTCDATETIME(), ClaimedAt = NULL
    WHERE JobId = @id AND BranchId = @b AND [Status] = 'failed'`, { id, b: branchId });
  return res.rowsAffected[0] ? { success: true, jobId: id } : { success: false, error: 'งานนี้พิมพ์ไปแล้วหรือไม่มีในคิว' };
}

async function expireStale(branchId) {
  await query(`UPDATE dbo.PrintJobs SET [Status] = 'failed', DoneAt = SYSUTCDATETIME(),
      LastError = N'กล่องพิมพ์ของสาขาไม่ได้รับงานภายใน ${PENDING_TTL_SEC} วินาที (ปิดอยู่หรือเน็ตหลุด?)'
    WHERE BranchId = @b AND [Status] = 'pending' AND CreatedAt < DATEADD(SECOND, -${PENDING_TTL_SEC}, SYSUTCDATETIME())`, { b: branchId });
  await query(`UPDATE dbo.PrintJobs SET [Status] = CASE WHEN Attempts >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'pending' END,
      LastError = CASE WHEN Attempts >= ${MAX_ATTEMPTS} THEN N'กล่องพิมพ์รับงานแล้วไม่ตอบกลับ' ELSE LastError END,
      CreatedAt = CASE WHEN Attempts >= ${MAX_ATTEMPTS} THEN CreatedAt ELSE SYSUTCDATETIME() END, ClaimedAt = NULL
    WHERE BranchId = @b AND [Status] = 'printing' AND ClaimedAt < DATEADD(SECOND, -${CLAIM_TTL_SEC}, SYSUTCDATETIME())`, { b: branchId });
}

// ── ฝั่งกล่องพิมพ์ ──
export async function agentPull(data) {
  if (!agentOk(data.key)) return { success: false, error: 'รหัสกล่องพิมพ์ (PRINT_AGENT_KEY) ไม่ถูกต้อง' };
  if (!(await hasTable())) return NOT_READY;
  const branchId = String(data.branchId || '').trim();
  if (!branchId || !(await isKnownBranch(branchId))) return { success: false, error: 'ไม่พบสาขา ' + branchId };
  await query(`MERGE dbo.PrintAgents AS t USING (SELECT @b AS BranchId) AS s ON t.BranchId = s.BranchId
    WHEN MATCHED THEN UPDATE SET LastSeen = SYSUTCDATETIME(), AgentName = @n
    WHEN NOT MATCHED THEN INSERT (BranchId, AgentName) VALUES (@b, @n);`, { b: branchId, n: String(data.name || '').slice(0, 100) });
  await expireStale(branchId);
  const res = await query(`WITH c AS (SELECT TOP (5) * FROM dbo.PrintJobs WITH (ROWLOCK, UPDLOCK, READPAST) WHERE BranchId = @b AND [Status] = 'pending' ORDER BY JobId)
    UPDATE c SET [Status] = 'printing', ClaimedAt = SYSUTCDATETIME(), Attempts = Attempts + 1
    OUTPUT INSERTED.JobId, INSERTED.PrinterIp, INSERTED.PrinterType, INSERTED.PayloadJson`, { b: branchId });
  const jobs = res.recordset.sort((a, b) => Number(a.JobId) - Number(b.JobId)).map((r) => {
    let orderData = {};
    try { orderData = JSON.parse(r.PayloadJson); } catch { /* งานเสีย ให้กล่องรายงานล้มเหลวเอง */ }
    return { id: Number(r.JobId), ip: r.PrinterIp, printerType: r.PrinterType, orderData };
  });
  return { success: true, jobs };
}

export async function agentReport(data) {
  if (!agentOk(data.key)) return { success: false, error: 'รหัสกล่องพิมพ์ (PRINT_AGENT_KEY) ไม่ถูกต้อง' };
  if (!(await hasTable())) return NOT_READY;
  const [id] = ids(data.id);
  const ok = !!data.ok;
  await query(`UPDATE dbo.PrintJobs SET [Status] = @s, DoneAt = SYSUTCDATETIME(), LastError = @e WHERE JobId = @id AND BranchId = @b AND [Status] = 'printing'`,
    { s: ok ? 'done' : 'failed', e: ok ? null : String(data.error || 'พิมพ์ไม่สำเร็จ').slice(0, 500), id: id || 0, b: String(data.branchId || '') });
  return { success: true };
}

// หน้าตั้งค่าเครื่องพิมพ์: กล่องพิมพ์ของสาขาออนไลน์ไหม · งานวันนี้
export async function printQueueStatus(params) {
  if (!(await hasTable())) return { success: true, ready: false };
  const branchId = String(params.branch || '').trim();
  if (!branchId) return { success: true, ready: true, agent: null };
  const counts = await query(`SELECT [Status], COUNT(*) AS n FROM dbo.PrintJobs WHERE BranchId = @b AND CreatedAt > DATEADD(HOUR, -12, SYSUTCDATETIME()) GROUP BY [Status]`, { b: branchId });
  return { success: true, ready: true, agent: await agentStatus(branchId), counts: Object.fromEntries(counts.recordset.map((r) => [r.Status, r.n])) };
}
