// ===============================================================
// กล่องพิมพ์ของสาขา — รับงานพิมพ์จากแท็บเล็ต/มือถือผ่านคิวของ API
// ---------------------------------------------------------------
// แท็บเล็ต Android/iPad สั่งเครื่องพิมพ์ในร้านตรง ๆ ไม่ได้ (เบราว์เซอร์บล็อก)
// จึงส่งงานพิมพ์ไปเก็บในคิวที่ API พร้อมรหัสสาขา แล้ว Print Server ตัวนี้
// (เปิดค้างไว้ในร้าน วงแลนเดียวกับเครื่องพิมพ์) ดึงงานของสาขาตัวเองมาพิมพ์
// ทุก ~1.5 วินาที แล้วรายงานผลกลับ แท็บเล็ตจึงรู้ว่าพิมพ์ออกหรือไม่
//
// ตั้งค่าจากหน้า "ตั้งค่าเครื่องพิมพ์" บนเครื่องนี้ (บันทึกลง print-queue-config.json)
//   apiUrl  = ที่อยู่ API ของ POS · branchId = สาขาของร้านนี้ · key = PRINT_AGENT_KEY
// ===============================================================

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { printTicket } from './print-ticket.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(HERE, 'print-queue-config.json');
const DEFAULT_CONFIG = { enabled: false, apiUrl: '', branchId: '', key: '', name: os.hostname() };
const INTERVAL_MS = 1500;
const IDLE_BACKOFF_MS = 5000; // ดึงไม่สำเร็จ (เน็ตหลุด/รหัสผิด) → เว้นช่วงนานขึ้น

let config = { ...DEFAULT_CONFIG };
let timer = null;
let busy = false;
const status = { lastPullAt: null, lastOkAt: null, lastError: null, printed: 0, failed: 0, lastJobAt: null };

const load = () => {
  try { config = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; } catch { config = { ...DEFAULT_CONFIG }; }
};
const save = () => {
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); } catch (e) { console.error('[print-queue] บันทึกตั้งค่าไม่สำเร็จ:', e.message); }
};

const callApi = async (body, timeoutMs = 10000) => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(config.apiUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, signal: controller.signal,
      body: JSON.stringify({ ...body, key: config.key, branchId: config.branchId, name: config.name })
    });
    return await res.json();
  } finally { clearTimeout(t); }
};

const pullOnce = async () => {
  if (busy || !config.enabled) return;
  busy = true;
  let wait = INTERVAL_MS;
  try {
    status.lastPullAt = new Date().toISOString();
    const res = await callApi({ action: 'printAgentPull' });
    if (!res || !res.success) throw new Error((res && res.error) || 'API ตอบกลับผิดรูปแบบ');
    status.lastOkAt = status.lastPullAt; status.lastError = null;
    for (const job of res.jobs || []) {
      // พิมพ์ทีละใบตามลำดับ แล้วรายงานผลทันที แท็บเล็ตจะได้เห็นผลเร็ว
      let result;
      try { result = await printTicket({ ip: job.ip, orderData: job.orderData, printerType: job.printerType }); }
      catch (e) { result = { success: false, error: e.message }; }
      if (result.success) status.printed++; else status.failed++;
      status.lastJobAt = new Date().toISOString();
      await callApi({ action: 'printAgentReport', id: job.id, ok: !!result.success, error: result.error || null }).catch((e) => {
        console.error('[print-queue] รายงานผลงาน #' + job.id + ' ไม่สำเร็จ:', e.message);
      });
    }
  } catch (e) {
    status.lastError = e.name === 'AbortError' ? 'ติดต่อ API ไม่ได้ (หมดเวลา)' : e.message;
    wait = IDLE_BACKOFF_MS;
  } finally {
    busy = false;
    if (config.enabled) timer = setTimeout(pullOnce, wait);
  }
};

const restart = () => {
  if (timer) clearTimeout(timer);
  timer = null;
  if (config.enabled && config.apiUrl && config.branchId && config.key) {
    console.log(`[print-queue] รับงานพิมพ์ของสาขา ${config.branchId} จาก ${config.apiUrl}`);
    timer = setTimeout(pullOnce, 200);
  }
};

// endpoint สำหรับหน้าตั้งค่าเครื่องพิมพ์ (เปิดบนเครื่องนี้)
//   GET  /print-queue → { config (ไม่ส่ง key กลับ), status }
//   POST /print-queue → { enabled, apiUrl, branchId, key?, name? }
export function registerPrintQueue(app) {
  load();
  restart();
  const view = () => ({ success: true, config: { ...config, key: undefined, hasKey: !!config.key }, status });
  app.get('/print-queue', (req, res) => res.json(view()));
  app.post('/print-queue', (req, res) => {
    const b = req.body || {};
    if (typeof b.enabled === 'boolean') config.enabled = b.enabled;
    if (typeof b.apiUrl === 'string' && b.apiUrl.trim()) config.apiUrl = b.apiUrl.trim();
    if (typeof b.branchId === 'string' && b.branchId.trim()) config.branchId = b.branchId.trim();
    if (typeof b.key === 'string' && b.key.trim()) config.key = b.key.trim();
    if (typeof b.name === 'string' && b.name.trim()) config.name = b.name.trim().slice(0, 100);
    if (config.enabled && (!config.apiUrl || !config.branchId || !config.key)) {
      config.enabled = false; save();
      return res.status(400).json({ success: false, error: 'ต้องมีที่อยู่ API, สาขา และรหัสกล่องพิมพ์ ก่อนเปิดรับงาน' });
    }
    save(); status.lastError = null; restart();
    res.json(view());
  });
}
