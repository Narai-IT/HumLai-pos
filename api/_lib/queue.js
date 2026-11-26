// ── ระบบคิวหน้าร้าน ──
// ออกบัตรคิว (A = ทานที่ร้าน/โต๊ะใหญ่ · B = ห่อกลับ) → เรียกคิว → จัดโต๊ะ / ข้าม / ยกเลิก
// เลขคิวเริ่มใหม่ทุกวัน (เวลาไทย) แยกแต่ละสาขา · ทุกเครื่องในสาขาเห็นคิวชุดเดียวกัน
//
//   queueIssue  (พนักงาน)  ออกบัตรคิว → เลขคิว + จำนวนคิวก่อนหน้า + เวลารอโดยประมาณ + token สำหรับ QR
//   queueList   (พนักงาน)  คิวทั้งหมดของวันนี้ + สรุป
//   queueAction (พนักงาน)  call / seat / skip / cancel / requeue
//   queueBoard  (สาธารณะ) จอเรียกคิว — ไม่มีชื่อ/เบอร์ลูกค้า
//   queueStatus (สาธารณะ) ลูกค้าสแกน QR บนบัตร ดูสถานะคิวของตัวเอง (ต้องมี token ของบัตรนั้น)
import crypto from 'node:crypto';
import { query, withTransaction, lockKey } from './db.js';
import { branchForWrite, requestedBranch } from './branch.js';
import { thaiTimeISO } from './time.js';
import { logActivity, staffOf } from './activity.js';

export const QUEUE_KINDS = {
  dine: { prefix: 'A', label: 'ทานที่ร้าน' },
  large: { prefix: 'A', label: 'โต๊ะใหญ่' },
  takeaway: { prefix: 'B', label: 'ห่อกลับ' }
};
const STATUSES = new Set(['waiting', 'called', 'seated', 'skipped', 'cancelled']);
const DEFAULT_PER_QUEUE_MIN = 5;

const DDL = `
IF OBJECT_ID('dbo.QueueTickets', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.QueueTickets (
    RowId      INT IDENTITY(1,1) PRIMARY KEY,
    BranchId   NVARCHAR(60)  NOT NULL,
    BizDate    NVARCHAR(10)  NOT NULL,
    Prefix     NVARCHAR(2)   NOT NULL,
    Seq        INT           NOT NULL,
    Code       NVARCHAR(10)  NOT NULL,
    Kind       NVARCHAR(20)  NOT NULL,
    Guests     INT           NULL,
    CustName   NVARCHAR(80)  NULL,
    Phone      NVARCHAR(20)  NULL,
    [Status]   NVARCHAR(12)  NOT NULL DEFAULT 'waiting',
    Token      NVARCHAR(24)  NOT NULL,
    TableNo    NVARCHAR(30)  NULL,
    CallCount  INT           NOT NULL DEFAULT 0,
    CreatedAt  DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME(),
    CalledAt   DATETIME2(0)  NULL,
    DoneAt     DATETIME2(0)  NULL,
    StaffName  NVARCHAR(120) NULL
  );
  CREATE INDEX IX_QueueTickets_Day ON dbo.QueueTickets (BranchId, BizDate, [Status]);
  CREATE UNIQUE INDEX IX_QueueTickets_Token ON dbo.QueueTickets (Token);
END;`;

let ensured = null;
const ensureTable = () => {
  if (!ensured) {
    ensured = query(DDL).catch(err => {
      ensured = null;
      throw new Error(`ยังไม่มีตารางคิวในฐานข้อมูล และสร้างเองไม่ได้ (${err.message}) — รัน update-api.bat (npm run sql:init)`);
    });
  }
  return ensured;
};

const today = () => thaiTimeISO().slice(0, 10);
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const iso = (d) => (d instanceof Date ? d.toISOString() : d ? String(d) : null);

const mapTicket = (r, { full = true } = {}) => ({
  id: r.RowId,
  code: r.Code,
  kind: r.Kind,
  kindLabel: (QUEUE_KINDS[r.Kind] || {}).label || r.Kind,
  guests: r.Guests == null ? null : Number(r.Guests),
  status: r.Status,
  tableNo: r.TableNo || '',
  callCount: Number(r.CallCount) || 0,
  createdAt: iso(r.CreatedAt),
  calledAt: iso(r.CalledAt),
  doneAt: iso(r.DoneAt),
  ...(full ? { name: r.CustName || '', phone: r.Phone || '', staff: r.StaffName || '', token: r.Token } : {})
});

const dayRows = async (branchId, day = today()) => (await query(
  `SELECT * FROM dbo.QueueTickets WHERE BranchId = @b AND BizDate = @d ORDER BY RowId ASC`, { b: branchId, d: day }
)).recordset;

// นาทีต่อคิวโดยประมาณ: ช่วงห่างเฉลี่ยของการเรียกคิววันนี้ (แยก A/B) · ยังไม่มีข้อมูล = 5 นาที
const perQueueMinutes = (rows, prefix) => {
  const calls = rows.filter(r => r.Prefix === prefix && r.CalledAt).map(r => new Date(r.CalledAt).getTime()).sort((a, b) => a - b);
  if (calls.length < 3) return DEFAULT_PER_QUEUE_MIN;
  const gaps = [];
  for (let i = 1; i < calls.length; i++) gaps.push((calls[i] - calls[i - 1]) / 60000);
  const recent = gaps.slice(-8);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  return Math.min(20, Math.max(2, Math.round(avg)));
};
const aheadOf = (rows, t) => rows.filter(r => r.Prefix === t.Prefix && r.Status === 'waiting' && r.RowId < t.RowId).length;

// ── ออกบัตรคิว ──
export async function queueIssue(data, user) {
  await ensureTable();
  const branchId = await branchForWrite(data);
  if (!branchId) return { success: false, error: 'ยังไม่มีสาขาในระบบ' };
  const kind = QUEUE_KINDS[data.kind] ? data.kind : 'dine';
  const prefix = QUEUE_KINDS[kind].prefix;
  const guests = kind === 'takeaway' ? null : Math.min(99, Math.max(1, parseInt(data.guests, 10) || 1));
  const day = today();
  const token = crypto.randomBytes(12).toString('base64url').slice(0, 16);
  const staff = await staffOf(user, data.staff);
  const row = await withTransaction(async (run) => {
    // ออกเลขทีละคำขอต่อสาขา/วัน/ชุดเลข — สองเครื่องกดพร้อมกันไม่ได้เลขซ้ำ
    await lockKey(run, `queue:${branchId}:${day}:${prefix}`);
    const next = (await run(`SELECT ISNULL(MAX(Seq), 0) + 1 AS n FROM dbo.QueueTickets WHERE BranchId = @b AND BizDate = @d AND Prefix = @p`,
      { b: branchId, d: day, p: prefix })).recordset[0].n;
    const code = `${prefix}${String(next).padStart(3, '0')}`;
    const ins = await run(
      `INSERT INTO dbo.QueueTickets (BranchId, BizDate, Prefix, Seq, Code, Kind, Guests, CustName, Phone, Token, StaffName)
       OUTPUT inserted.* VALUES (@b, @d, @p, @n, @c, @k, @g, @nm, @ph, @t, @s)`,
      { b: branchId, d: day, p: prefix, n: next, c: code, k: kind, g: guests, nm: text(data.name, 80) || null,
        ph: text(data.phone, 20).replace(/[^0-9+\- ]/g, '') || null, t: token, s: text(staff && staff.name, 120) || null });
    return ins.recordset[0];
  }, { isolation: 'READ_COMMITTED' });
  const rows = await dayRows(branchId, day);
  const ahead = aheadOf(rows, row);
  const per = perQueueMinutes(rows, prefix);
  await logActivity({ kind: 'queue_issue', branchId, detail: `${row.Code} · ${QUEUE_KINDS[kind].label}${guests ? ` · ${guests} ท่าน` : ''} · ก่อนหน้า ${ahead} คิว`, staff });
  return { success: true, ticket: mapTicket(row), ahead, estimateMin: ahead * per };
}

// ── รายการคิววันนี้ (หน้าพนักงาน) ──
export async function queueList(data) {
  await ensureTable();
  const branchId = await branchForWrite(data);
  const rows = await dayRows(branchId);
  const seated = rows.filter(r => r.Status === 'seated' && r.DoneAt);
  const avgWait = seated.length
    ? Math.round(seated.reduce((a, r) => a + (new Date(r.DoneAt) - new Date(r.CreatedAt)) / 60000, 0) / seated.length)
    : null;
  return {
    success: true,
    serverTime: new Date().toISOString(),
    tickets: rows.map(r => ({ ...mapTicket(r), ahead: r.Status === 'waiting' ? aheadOf(rows, r) : 0 })),
    stats: {
      waiting: rows.filter(r => r.Status === 'waiting').length,
      called: rows.filter(r => r.Status === 'called').length,
      issued: rows.length,
      seated: seated.length,
      avgWait
    },
    perQueue: { A: perQueueMinutes(rows, 'A'), B: perQueueMinutes(rows, 'B') }
  };
}

// ── เรียก / จัดโต๊ะ / ข้าม / ยกเลิก / กลับเข้าคิว ──
const OPS = {
  call: { kind: 'queue_call', label: 'เรียกคิว' },
  seat: { kind: 'queue_seat', label: 'จัดโต๊ะ' },
  skip: { kind: 'queue_skip', label: 'ข้ามคิว' },
  cancel: { kind: 'queue_cancel', label: 'ยกเลิกคิว' },
  requeue: { kind: 'queue_call', label: 'กลับเข้าคิว' }
};
export async function queueAction(data, user) {
  await ensureTable();
  const op = String(data.op || '');
  if (!OPS[op]) return { success: false, error: 'คำสั่งไม่ถูกต้อง' };
  const id = parseInt(data.id, 10);
  const cur = (await query(`SELECT * FROM dbo.QueueTickets WHERE RowId = @id`, { id })).recordset[0];
  if (!cur) return { success: false, error: 'ไม่พบคิวนี้' };
  const branchId = requestedBranch(data);
  if (branchId && cur.BranchId !== branchId) return { success: false, error: 'คิวนี้เป็นของสาขาอื่น' };
  const tableNo = text(data.tableNo, 30) || null;
  let sqlText;
  if (op === 'call') {
    if (!['waiting', 'called', 'skipped'].includes(cur.Status)) return { success: false, error: `คิว ${cur.Code} ${cur.Status === 'seated' ? 'ได้โต๊ะแล้ว' : 'ถูกยกเลิกแล้ว'}` };
    sqlText = `UPDATE dbo.QueueTickets SET [Status] = 'called', CalledAt = SYSUTCDATETIME(), CallCount = CallCount + 1,
               TableNo = COALESCE(@t, TableNo) OUTPUT inserted.* WHERE RowId = @id`;
  } else if (op === 'seat') {
    sqlText = `UPDATE dbo.QueueTickets SET [Status] = 'seated', DoneAt = SYSUTCDATETIME(), TableNo = COALESCE(@t, TableNo),
               CalledAt = COALESCE(CalledAt, SYSUTCDATETIME()) OUTPUT inserted.* WHERE RowId = @id`;
  } else if (op === 'requeue') {
    sqlText = `UPDATE dbo.QueueTickets SET [Status] = 'waiting', DoneAt = NULL OUTPUT inserted.* WHERE RowId = @id`;
  } else {
    sqlText = `UPDATE dbo.QueueTickets SET [Status] = @st, DoneAt = SYSUTCDATETIME() OUTPUT inserted.* WHERE RowId = @id`;
  }
  const row = (await query(sqlText, { id, t: tableNo, st: op === 'skip' ? 'skipped' : 'cancelled' })).recordset[0];
  const staff = await staffOf(user, data.staff);
  await logActivity({ kind: OPS[op].kind, branchId: cur.BranchId, tableNo: row.TableNo || '',
    detail: `${OPS[op].label} ${row.Code}${row.Guests ? ` · ${row.Guests} ท่าน` : ''}${op === 'call' && row.CallCount > 1 ? ` · ครั้งที่ ${row.CallCount}` : ''}`,
    reason: text(data.reason, 300), staff });
  return { success: true, ticket: mapTicket(row) };
}

// ── จอเรียกคิว (สาธารณะ) ──
export async function queueBoard(data) {
  await ensureTable();
  const branchId = await branchForWrite(data);
  const rows = await dayRows(branchId);
  const called = rows.filter(r => r.Status === 'called' && r.CalledAt)
    .sort((a, b) => new Date(b.CalledAt) - new Date(a.CalledAt));
  return {
    success: true,
    serverTime: new Date().toISOString(),
    calling: called.slice(0, 3).map(r => mapTicket(r, { full: false })),
    waiting: rows.filter(r => r.Status === 'waiting').slice(0, 8).map(r => mapTicket(r, { full: false })),
    waitingCount: rows.filter(r => r.Status === 'waiting').length
  };
}

// ── ลูกค้าดูคิวของตัวเอง (สาธารณะ · ต้องมี token จาก QR บนบัตร) ──
export async function queueStatus(data) {
  await ensureTable();
  const token = text(data.token, 24);
  if (!/^[A-Za-z0-9_-]{8,24}$/.test(token)) return { success: false, error: 'ไม่พบบัตรคิวนี้' };
  const t = (await query(`SELECT * FROM dbo.QueueTickets WHERE Token = @t`, { t: token })).recordset[0];
  if (!t) return { success: false, error: 'ไม่พบบัตรคิวนี้' };
  const rows = await dayRows(t.BranchId, t.BizDate);
  const calling = rows.filter(r => r.Status === 'called' && r.Prefix === t.Prefix && r.CalledAt)
    .sort((a, b) => new Date(b.CalledAt) - new Date(a.CalledAt))[0];
  const ahead = t.Status === 'waiting' ? aheadOf(rows, t) : 0;
  return {
    success: true,
    ticket: mapTicket(t, { full: false }),
    branchId: t.BranchId,
    expired: t.BizDate !== today(),
    ahead,
    estimateMin: ahead * perQueueMinutes(rows, t.Prefix),
    calling: calling ? { code: calling.Code, tableNo: calling.TableNo || '' } : null
  };
}

export const QUEUE_STATUSES = STATUSES;
