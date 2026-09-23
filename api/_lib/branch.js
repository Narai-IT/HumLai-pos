// ── สาขาของรายการขาย ──
// หน้าบ้านส่ง branchId (POST) หรือ ?branch= (GET) มากับคำขอ
// ไม่ส่งมา (เครื่องที่ยังเปิดหน้าเว็บรุ่นเก่า / ลิงก์ QR โต๊ะแบบเดิม) → ใช้สาขาหลัก
// = สาขาแรกที่เปิดใช้งานในหน้าตั้งค่าสาขา
import { query } from './db.js';

const TTL_MS = 60 * 1000;
let cached = { id: null, at: 0 };

export async function defaultBranchId() {
  if (cached.id !== null && Date.now() - cached.at < TTL_MS) return cached.id;
  let id = '';
  try {
    const res = await query(`SELECT TOP (1) id FROM dbo.Branches WHERE ISNULL(isActive, 1) = 1 ORDER BY Seq ASC`);
    id = res.recordset.length ? String(res.recordset[0].id) : '';
  } catch {
    id = ''; // ยังไม่มีตารางสาขา — เก็บเป็นค่าว่างไปก่อน
  }
  cached = { id, at: Date.now() };
  return id;
}

// เรียกหลังแก้รายการสาขา ให้สาขาหลักตัวใหม่มีผลทันที
export const clearBranchCache = () => { cached = { id: null, at: 0 }; };

// สาขาที่คำขอระบุมาเอง ('' = ไม่ได้ระบุ)
export const requestedBranch = (data) => String((data && (data.branchId ?? data.branch)) || '').trim();

// สาขาที่จะเขียนลงแถวใหม่ — ไม่ระบุมาก็ลงสาขาหลัก แถวจะได้ไม่หลุดจากทุกสาขา
export async function branchForWrite(data) {
  return requestedBranch(data) || (await defaultBranchId()) || null;
}

// เงื่อนไขกรองสาขาต่อท้าย WHERE — ไม่ระบุสาขา = ไม่กรอง (พฤติกรรมเดิม)
export const branchFilter = (branchId, column = 'BranchId') => (branchId ? ` AND ${column} = @branchId` : '');
