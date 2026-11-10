// ===============================================================
// รับงานพิมพ์จากมือถือ/แท็บเล็ต — Print Server ดึงคิวงานพิมพ์จาก API มาพิมพ์
// ---------------------------------------------------------------
// หน้าเว็บบนมือถือ/แท็บเล็ตยิงเข้า Print Server ตรง ๆ ไม่ได้ (เบราว์เซอร์บล็อก https → http ในวงแลน)
// จึงฝากงานไว้ที่ API (api/_lib/printQueue.js) แล้วตัวนี้คอยดึงไปพิมพ์ทุก ~3 วินาที
//
//   claimPrintJobs → พิมพ์ด้วย printTicket (ตัวเดียวกับ POST /print) → reportPrintJob
//
// ตั้งค่าจากหน้าตั้งค่าเครื่องพิมพ์ (กด "เปิดรับงานพิมพ์จากมือถือ/แท็บเล็ต" บนคอมเครื่องนี้)
// ค่าที่ได้ (ที่อยู่ API + สาขา + กุญแจของสาขา) เก็บไว้ใน print-queue-config.json ข้าง ๆ ไฟล์นี้
// ===============================================================

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { printTicket } from './print-ticket.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(HERE, 'print-queue-config.json');

const DEFAULT_CONFIG = { enabled: false, apiUrl: '', branchId: '', key: '', pollSeconds: 3 };
const IDLE_BACKOFF_MS = 60 * 1000;   // API ยังไม่รองรับ / กุญแจผิด → ลองใหม่ช้า ๆ
const ERROR_BACKOFF_MS = 10 * 1000;  // เน็ตสะดุด → ลองใหม่ในไม่กี่วินาที

let config = { ...DEFAULT_CONFIG };
let version = '';
let timer = null;
let running = false;
let generation = 0;           // เปลี่ยนค่าตั้ง = เริ่มรอบใหม่ รอบเก่าที่ค้างอยู่หยุดเอง
const unsentReports = [];     // ผลที่ส่งกลับ API ไม่สำเร็จ — ส่งซ้ำรอบถัดไป

const status = {
  lastPollAt: null,
  lastJobAt: null,
  lastError: null,
  printed: 0,
  failed: 0
};

const readConfig = () => {
  try {
    config = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch (e) {
    config = { ...DEFAULT_CONFIG };
  }
};

const saveConfig = () => {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('[print-queue] บันทึกไฟล์ตั้งค่าไม่สำเร็จ:', e.message);
  }
};

const ready = () => config.enabled && !!config.apiUrl && !!config.key;

// POST ไป API — หน้าบ้านส่ง text/plain มาตลอด API รับได้ทั้งสองแบบ
const callApi = async (action, body = {}, timeoutMs = 15000) => {
  const res = await fetch(config.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, branchId: config.branchId, key: config.key, ...body }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const textBody = await res.text();
  let data = null;
  try { data = JSON.parse(textBody.replace(/^﻿/, '')); } catch (e) { data = null; }
  if (!data) throw new Error(`API ตอบกลับ HTTP ${res.status} ที่อ่านไม่ได้`);
  return data;
};

const sendReport = async (report) => {
  try {
    const res = await callApi('reportPrintJob', report);
    if (res && res.success) return true;
    console.error(`[print-queue] รายงานผลงาน ${report.jobId} ไม่สำเร็จ: ${(res && res.error) || 'ไม่ทราบสาเหตุ'}`);
    return res && res.auth === 'key'; // กุญแจผิด = ส่งซ้ำก็ไม่ผ่าน ทิ้งไป
  } catch (e) {
    return false;
  }
};

const flushReports = async () => {
  while (unsentReports.length) {
    if (!(await sendReport(unsentReports[0]))) return false;
    unsentReports.shift();
  }
  return true;
};

const printJob = async (job) => {
  const result = await printTicket({ ip: job.printerIp, orderData: job.orderData || {}, printerType: job.printerType });
  status.lastJobAt = new Date().toISOString();
  if (result.success) status.printed += 1; else status.failed += 1;
  console.log(`[print-queue] งาน ${job.label || job.id} → ${job.printerIp}: ${result.success ? (result.confirmed ? 'พิมพ์เสร็จ' : 'ส่งแล้ว') : `ไม่สำเร็จ (${result.error})`}`);
  return {
    jobId: job.id,
    success: !!result.success,
    confirmed: !!result.confirmed,
    stage: result.stage || null,
    error: result.error || null,
    warning: result.warning || null,
    steps: Array.isArray(result.steps) ? result.steps : []
  };
};

// หนึ่งรอบ: ส่งผลที่ค้าง → ของานใหม่ → พิมพ์ทีละงาน → รายงานผล
// คืนค่าเวลาที่ควรรอก่อนรอบถัดไป
const pollOnce = async () => {
  if (!(await flushReports())) {
    status.lastError = 'ส่งผลการพิมพ์กลับไปที่ API ไม่ได้ — เช็กอินเทอร์เน็ตของเครื่องนี้';
    return ERROR_BACKOFF_MS;
  }

  let data;
  try {
    data = await callApi('claimPrintJobs', { agent: os.hostname(), version, max: 5 });
  } catch (e) {
    status.lastError = `ติดต่อ API ไม่ได้: ${e.message}`;
    return ERROR_BACKOFF_MS;
  }
  status.lastPollAt = new Date().toISOString();

  if (!data.success) {
    if (/Unknown action/i.test(data.error || '')) {
      status.lastError = 'API ยังเป็นเวอร์ชันเก่า (ยังไม่มีคิวงานพิมพ์) — อัปเดต API ก่อน';
      return IDLE_BACKOFF_MS;
    }
    status.lastError = data.error || 'API ไม่ยอมให้รับงาน';
    return data.auth === 'key' ? IDLE_BACKOFF_MS : ERROR_BACKOFF_MS;
  }
  status.lastError = null;

  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  for (const job of jobs) {
    const report = await printJob(job);
    if (!(await sendReport(report))) unsentReports.push(report);
  }
  // ได้งานมา = อาจมีงานต่อคิวอยู่อีก ดึงต่อทันที
  return jobs.length ? 0 : Math.max(2, Number(config.pollSeconds) || 3) * 1000;
};

const schedule = (gen, waitMs) => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (gen !== generation || !ready()) return;
    running = true;
    let next = ERROR_BACKOFF_MS;
    try {
      next = await pollOnce();
    } catch (e) {
      status.lastError = e.message;
      console.error('[print-queue] ผิดพลาด:', e);
    } finally {
      running = false;
    }
    schedule(gen, next);
  }, waitMs);
};

const restart = () => {
  generation += 1;
  clearTimeout(timer);
  timer = null;
  if (!ready()) return;
  schedule(generation, 0);
  console.log(`[print-queue] เปิดรับงานพิมพ์จากมือถือ/แท็บเล็ต — สาขา ${config.branchId || '(สาขาหลัก)'} ผ่าน ${config.apiUrl}`);
};

const publicState = () => ({
  enabled: config.enabled,
  apiUrl: config.apiUrl,
  branchId: config.branchId,
  keySet: !!config.key,
  pollSeconds: config.pollSeconds,
  running,
  unsentReports: unsentReports.length,
  ...status
});

// ผูก endpoint เข้ากับ Express app ของ Print Server
export const registerPrintQueue = (app, options = {}) => {
  version = String(options.version || '');
  readConfig();

  app.get('/print-queue', (req, res) => {
    res.json({ success: true, ...publicState() });
  });

  // หน้าตั้งค่าเครื่องพิมพ์ส่งค่ามา: { enabled, apiUrl, branchId, key }
  app.post('/print-queue', (req, res) => {
    const body = req.body || {};
    if (body.apiUrl !== undefined) config.apiUrl = String(body.apiUrl || '').trim();
    if (body.branchId !== undefined) config.branchId = String(body.branchId || '').trim();
    if (body.key !== undefined) config.key = String(body.key || '').trim();
    if (body.pollSeconds !== undefined) config.pollSeconds = Math.max(2, Number(body.pollSeconds) || 3);
    if (body.enabled !== undefined) config.enabled = !!body.enabled;
    if (config.enabled && (!config.apiUrl || !config.key)) {
      return res.status(400).json({ success: false, error: 'ต้องมีที่อยู่ API และกุญแจของสาขา' });
    }
    status.lastError = null;
    saveConfig();
    restart();
    res.json({ success: true, ...publicState() });
  });

  restart();
};
