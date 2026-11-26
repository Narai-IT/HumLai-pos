// ── ระบบคิวหน้าร้าน: เรียก API · พิมพ์บัตรคิว · เสียงเรียกคิว ──
import QRCode from 'qrcode';
import { API_URL } from './api';
import { getPrinters, getPrinterByType } from './printerRouting';
import { sendPrintJob, getReceiptHeader } from './printServer';

export const QUEUE_KINDS = [
  { id: 'dine', label: 'ทานที่ร้าน', prefix: 'A', color: '#16a34a', bg: '#dcfce7' },
  { id: 'takeaway', label: 'ห่อกลับ', prefix: 'B', color: '#c2410c', bg: '#ffedd5' },
  { id: 'large', label: 'โต๊ะใหญ่', prefix: 'A', color: '#6d28d9', bg: '#ede9fe' }
];
export const kindOf = (id) => QUEUE_KINDS.find(k => k.id === id) || QUEUE_KINDS[0];

export const queueApi = async (action, body = {}) => {
  const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action, ...body }) });
  const json = await res.json().catch(() => null);
  if (!json) throw new Error(`เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ (HTTP ${res.status})`);
  if (json.success === false) throw new Error(json.error || 'ทำรายการไม่สำเร็จ');
  return json;
};

// ลิงก์หน้าดูสถานะคิวของลูกค้า (QR บนบัตร) และจอเรียกคิว
export const queueStatusUrl = (token) => `${window.location.origin}/queue/status?t=${encodeURIComponent(token)}`;
export const queueBoardUrl = (branchId) => `${window.location.origin}/queue/board${branchId ? `?b=${encodeURIComponent(branchId)}` : ''}`;

export const minutesSince = (iso, now = Date.now()) => {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 60000)) : 0;
};

// ── พิมพ์บัตรคิว: เครื่องพิมพ์ใบเสร็จ (แคชเชียร์) ──
export async function printQueueTicket({ ticket, ahead, estimateMin }) {
  const printers = getPrinters();
  const printer = getPrinterByType('receipt', printers) || printers.find(p => p.ip) || null;
  if (!printer) return { success: false, error: 'ยังไม่ได้ตั้งค่าเครื่องพิมพ์ใบเสร็จ — ไปที่ หลังบ้าน > เครื่องพิมพ์' };
  const header = getReceiptHeader() || {};
  let qr = null;
  try {
    const url = queueStatusUrl(ticket.token);
    const image = await QRCode.toDataURL(url, { width: Number(header.paper) === 58 ? 200 : 240, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
    qr = { image, url };
  } catch { /* พิมพ์บัตรได้แม้ไม่มี QR */ }
  return sendPrintJob({
    ip: printer.ip,
    printerType: 'queue',
    orderData: {
      header,
      queue: { code: ticket.code, kindLabel: ticket.kindLabel, guests: ticket.guests, name: ticket.name, ahead, estimateMin, issuedAt: ticket.createdAt, qr }
    }
  });
}

// ── เสียงเรียกคิว ──
// ติ๊งต่อง (WebAudio) แล้วอ่านออกเสียงภาษาไทยด้วยเสียงของเครื่อง (Web Speech)
// เครื่องที่ไม่มีเสียงภาษาไทย → มีแค่ติ๊งต่อง (thaiVoiceAvailable บอกหน้าจอให้แจ้งพนักงาน)
let audioCtx = null;
export const unlockAudio = () => {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    // iOS/Chrome: ต้องเริ่มพูดครั้งแรกจากการแตะของผู้ใช้
    if (window.speechSynthesis) window.speechSynthesis.getVoices();
  } catch { /* ไม่มีเสียงก็ยังเรียกคิวบนจอได้ */ }
};

const chime = () => new Promise(resolve => {
  try {
    unlockAudio();
    if (!audioCtx) return resolve();
    const t0 = audioCtx.currentTime + 0.02;
    [[880, 0], [659, 0.45]].forEach(([freq, at]) => {
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + at + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.8);
      o.connect(g).connect(audioCtx.destination); o.start(t0 + at); o.stop(t0 + at + 0.85);
    });
    setTimeout(resolve, 1300);
  } catch { resolve(); }
});

// ── เลือกเสียงอ่าน ──
// Windows มีเสียงไทยติดเครื่องตัวเดียวคือ "Microsoft Pattara" (ผู้ชาย)
// เสียงผู้หญิง: Microsoft Edge มี "Premwadee" (Natural · ต้องต่ออินเทอร์เน็ต) · iPhone/Mac "Kanya" · Android ค่าเริ่มต้นเป็นผู้หญิง
// เลือกเองได้ที่หน้าคิว/จอเรียกคิว (จำไว้ในเครื่องนั้น) · ไม่ได้เลือก = เสียงผู้หญิงก่อน
const VOICE_KEY = 'queue_voice';
const FEMALE = /premwadee|kanya|narisa|achara|niwat-?f|female|woman|ผู้หญิง/i;
const MALE = /pattara|niwat|male|ผู้ชาย/i;
export const thaiVoices = () => ((window.speechSynthesis && window.speechSynthesis.getVoices()) || []).filter(v => /^th/i.test(v.lang));
export const voiceGender = (v) => (v && FEMALE.test(v.name) ? 'female' : v && MALE.test(v.name) ? 'male' : '');
export const savedVoiceName = () => { try { return localStorage.getItem(VOICE_KEY) || ''; } catch { return ''; } };
export const saveVoiceName = (name) => { try { if (name) localStorage.setItem(VOICE_KEY, name); else localStorage.removeItem(VOICE_KEY); } catch { /* ไม่จำก็ใช้ค่าเริ่มต้น */ } };
const thaiVoice = () => {
  const list = thaiVoices();
  const saved = savedVoiceName();
  return (saved && list.find(v => v.name === saved))
    || list.find(v => FEMALE.test(v.name))
    || list.find(v => !MALE.test(v.name) && /google/i.test(v.name))
    || list.find(v => !MALE.test(v.name))
    || list[0] || null;
};
export const thaiVoiceAvailable = () => !!thaiVoice();
export const currentVoice = () => thaiVoice();
// รายชื่อเสียงโหลดช้ากว่าหน้าเว็บ (Chrome/Edge) — เรียก cb เมื่อพร้อม/เปลี่ยน · คืนฟังก์ชันยกเลิก
export const onVoicesChanged = (cb) => {
  const synth = window.speechSynthesis;
  if (!synth) return () => {};
  const h = () => cb(thaiVoices());
  synth.addEventListener ? synth.addEventListener('voiceschanged', h) : (synth.onvoiceschanged = h);
  const t = setTimeout(h, 300);
  return () => { clearTimeout(t); if (synth.removeEventListener) synth.removeEventListener('voiceschanged', h); };
};

const LETTER = { A: 'เอ', B: 'บี', C: 'ซี' };
const DIGIT = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
// "A014" → "เอ หนึ่ง สี่" (อ่านทีละตัว ไม่อ่านศูนย์นำหน้า) — ลูกค้าเทียบกับบัตรได้ง่าย
export const spokenCode = (code) => {
  const m = /^([A-Z])0*(\d+)$/.exec(String(code || '').toUpperCase());
  if (!m) return String(code || '');
  return `${LETTER[m[1]] || m[1]} ${m[2].split('').map(d => DIGIT[Number(d)]).join(' ')}`;
};
export const callPhrase = (code, tableNo) =>
  `ขอเชิญคิวหมายเลข ${spokenCode(code)}${tableNo ? ` ที่โต๊ะ ${tableNo}` : ' ที่เคาน์เตอร์'} ค่ะ`;

// ── เสียงจาก Google (เครื่อง API สร้างให้ · เสียงผู้หญิงเหมือนกันทุกเครื่อง) ──
let infoPromise = null;
export const cloudVoiceInfo = () => {
  if (!infoPromise) infoPromise = queueApi('queueVoice', { info: true }).catch(() => ({ enabled: false }));
  return infoPromise;
};
const fetchCloudVoice = async (body) => {
  try {
    const info = await cloudVoiceInfo();
    if (!info.enabled) return null;
    const r = await queueApi('queueVoice', body);
    return r.audio ? `data:${r.mime || 'audio/mpeg'};base64,${r.audio}` : null;
  } catch { return null; }
};
const playAudio = (src) => new Promise(resolve => {
  try {
    const a = new Audio(src);
    a.onended = resolve; a.onerror = resolve;
    const p = a.play(); if (p && p.catch) p.catch(resolve);
    setTimeout(resolve, 12000);
  } catch { resolve(); }
});

// id = คิวที่กำลังเรียก (ให้เครื่อง API สร้างเสียง Google) · test = ประโยคทดสอบ · ไม่มีเสียง Google → เสียงของเครื่อง
export async function announceQueue(code, tableNo, { repeat = 2, id = null, test = false } = {}) {
  const cloud = (id || test) ? fetchCloudVoice(test ? { test: true } : { id }) : Promise.resolve(null);
  await chime();
  const src = await cloud;
  if (src) {
    for (let i = 0; i < repeat; i++) await playAudio(src);
    return { spoke: true, cloud: true };
  }
  const synth = window.speechSynthesis;
  if (!synth) return { spoke: false };
  const voice = thaiVoice();
  const say = () => new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(callPhrase(code, tableNo));
    u.lang = 'th-TH';
    try { if (voice) u.voice = voice; } catch { /* เสียงที่เลือกใช้ไม่ได้แล้ว → ใช้เสียงไทยค่าเริ่มต้นของเครื่อง */ }
    u.rate = 0.9; u.onend = resolve; u.onerror = resolve;
    synth.speak(u);
    setTimeout(resolve, 9000);
  });
  synth.cancel();
  for (let i = 0; i < repeat; i++) await say();
  return { spoke: !!voice };
}
