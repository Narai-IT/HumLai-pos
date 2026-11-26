// ── เสียงเรียกคิว: Google Text-to-Speech (เสียงผู้หญิงภาษาไทย เหมือนกันทุกเครื่อง) ──
// ตั้ง GOOGLE_TTS_KEY ใน .env ของเครื่อง API (กุญแจ API ของ Google Cloud ที่เปิด Text-to-Speech API ไว้)
// ไม่ได้ตั้ง / Google ใช้ไม่ได้ → หน้าเว็บใช้เสียงอ่านของเครื่องแทน (แบบเดิม)
//
// ข้อความที่อ่านสร้างจากคิวในฐานข้อมูลเท่านั้น (ส่งข้อความเองไม่ได้) — กันคนนอกใช้กุญแจไปสร้างเสียงอื่น
// เก็บไฟล์เสียงที่สร้างแล้วไว้ในหน่วยความจำ (ประโยคเดิมไม่เรียก Google ซ้ำ) + จำกัดจำนวนครั้งต่อวัน
import crypto from 'node:crypto';
import { query } from './db.js';

const KEY = () => String(process.env.GOOGLE_TTS_KEY || '').trim();
// th-TH-Standard-A = เสียงผู้หญิง · เปลี่ยนได้ด้วย GOOGLE_TTS_VOICE (เช่น th-TH-Neural2-C)
const VOICE = () => String(process.env.GOOGLE_TTS_VOICE || 'th-TH-Standard-A').trim();
const RATE = () => Math.min(1.5, Math.max(0.6, Number(process.env.GOOGLE_TTS_RATE) || 0.95));
const DAILY_LIMIT = () => Math.max(50, Number(process.env.GOOGLE_TTS_DAILY_LIMIT) || 3000);
const CACHE_MAX = 400;

const cache = new Map();            // ข้อความ → base64 mp3
let usage = { day: '', count: 0 };
let lastError = '';

const LETTER = { A: 'เอ', B: 'บี', C: 'ซี' };
const DIGIT = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const spokenCode = (code) => {
  const m = /^([A-Z])0*(\d+)$/.exec(String(code || '').toUpperCase());
  return m ? `${LETTER[m[1]] || m[1]} ${m[2].split('').map(d => DIGIT[Number(d)]).join(' ')}` : '';
};
// ชื่อโต๊ะที่อ่านได้: ตัวเลข/ตัวอักษร/ภาษาไทย ไม่เกิน 12 ตัว
const cleanTable = (t) => String(t || '').replace(/[^0-9A-Za-zก-๙ ]/g, '').trim().slice(0, 12);
export const callText = (code, tableNo) => {
  const c = spokenCode(code);
  if (!c) return '';
  const t = cleanTable(tableNo);
  return `ขอเชิญคิวหมายเลข ${c} ${t ? `ที่โต๊ะ ${t}` : 'ที่เคาน์เตอร์'} ค่ะ`;
};
const TEST_TEXT = 'ทดสอบเสียงเรียกคิว ขอเชิญคิวหมายเลข เอ หนึ่ง ที่โต๊ะ ห้า ค่ะ';

async function synthesize(text) {
  if (cache.has(text)) return cache.get(text);
  const day = new Date().toISOString().slice(0, 10);
  if (usage.day !== day) usage = { day, count: 0 };
  if (usage.count >= DAILY_LIMIT()) throw new Error('สร้างเสียงครบจำนวนต่อวันแล้ว');
  usage.count += 1;
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(KEY())}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'th-TH', name: VOICE() },
      audioConfig: { audioEncoding: 'MP3', speakingRate: RATE() }
    }),
    signal: AbortSignal.timeout(8000)
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.audioContent) {
    lastError = (json && json.error && json.error.message) || `HTTP ${res.status}`;
    throw new Error(`Google Text-to-Speech: ${lastError}`);
  }
  lastError = '';
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(text, json.audioContent);
  return json.audioContent;
}

// queueVoice — { info: true } = ถามว่าเปิดใช้ไหม · { test: true } = ประโยคทดสอบ · { id } = คิวที่กำลังเรียก
export async function queueVoice(data) {
  const enabled = !!KEY();
  if (data.info) return { success: true, enabled, voice: enabled ? VOICE() : '', lastError: enabled ? lastError : '' };
  if (!enabled) return { success: false, enabled: false, error: 'ยังไม่ได้ตั้ง GOOGLE_TTS_KEY' };
  let text = '';
  if (data.test) text = TEST_TEXT;
  else {
    const id = parseInt(data.id, 10);
    if (!Number.isFinite(id)) return { success: false, error: 'ไม่พบคิว' };
    const t = (await query(`SELECT Code, TableNo, [Status] FROM dbo.QueueTickets WHERE RowId = @id`, { id })).recordset[0];
    if (!t || t.Status !== 'called') return { success: false, error: 'คิวนี้ไม่ได้อยู่ระหว่างเรียก' };
    text = callText(t.Code, t.TableNo);
  }
  if (!text) return { success: false, error: 'สร้างข้อความไม่ได้' };
  try {
    const audio = await synthesize(text);
    return { success: true, enabled: true, audio, mime: 'audio/mpeg', key: crypto.createHash('sha1').update(text).digest('hex').slice(0, 12) };
  } catch (err) {
    console.error('[tts]', err.message);
    return { success: false, enabled: true, error: err.message };
  }
}
