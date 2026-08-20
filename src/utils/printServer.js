// ===============================================================
// Print Server helper
// ---------------------------------------------------------------
// เครื่องพิมพ์ ESC/POS ในวงแลนคุยกันด้วย TCP port 9100 ดิบ ๆ ซึ่ง
// JavaScript ในเบราว์เซอร์เปิด socket เองไม่ได้ จึงต้องผ่าน
// Node Print Server (server.js) เป็นตัวกลางเสมอ
// ไฟล์นี้รวมการเรียก Print Server ไว้ที่เดียว เพื่อให้ทุกหน้าจอ
// ใช้ค่า URL เดียวกัน และแสดงข้อความ error แบบเดียวกัน
// ===============================================================

const STORAGE_KEY = 'print_server_url';
const DEFAULT_PORT = 3001;

export const PRINT_SERVER_EVENT = 'print_server_url_changed';

// แปลงค่าที่ผู้ใช้พิมพ์ (เช่น "192.168.1.10" หรือ "192.168.1.10:3001")
// ให้เป็น URL เต็มรูปแบบ คืนค่า '' ถ้าแปลงไม่ได้
export const normalizePrintServerUrl = (raw) => {
  const value = String(raw || '').trim();
  if (!value) return '';
  const withScheme = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  try {
    const url = new URL(withScheme);
    if (!url.port) url.port = String(DEFAULT_PORT);
    return `${url.protocol}//${url.host}`;
  } catch (e) {
    return '';
  }
};

export const getDefaultPrintServerUrl = () =>
  `http://${window.location.hostname || 'localhost'}:${DEFAULT_PORT}`;

export const getPrintServerUrl = () => {
  try {
    return normalizePrintServerUrl(localStorage.getItem(STORAGE_KEY)) || getDefaultPrintServerUrl();
  } catch (e) {
    return getDefaultPrintServerUrl();
  }
};

// ส่งค่าว่างเพื่อกลับไปใช้ค่าเริ่มต้น (hostname ของหน้าเว็บ + :3001)
export const setPrintServerUrl = (raw) => {
  const normalized = normalizePrintServerUrl(raw);
  if (normalized) {
    localStorage.setItem(STORAGE_KEY, normalized);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  window.dispatchEvent(new Event(PRINT_SERVER_EVENT));
  return getPrintServerUrl();
};

// หน้าเว็บที่เปิดผ่าน https:// ยิง http:// ไม่ได้ (mixed content)
// เป็นสาเหตุที่พบบ่อยที่สุดเวลาเปิดแอปจากโดเมนจริงแล้วปริ้นไม่ออก
export const isMixedContentBlocked = (url = getPrintServerUrl()) =>
  window.location.protocol === 'https:' && url.startsWith('http://');

const fetchWithTimeout = async (url, options = {}, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

export const PRINT_SERVER_OFFLINE_MSG =
  'ติดต่อ Print Server ไม่ได้ — เปิด start-printer.bat หรือรัน "node server.js" ในเครื่องที่ต่อวงแลนเดียวกับเครื่องพิมพ์';

export const MIXED_CONTENT_MSG =
  'หน้าเว็บนี้เปิดผ่าน https:// เบราว์เซอร์จึงบล็อกการเชื่อมต่อไปยัง Print Server (http://) — ให้เปิดแอปผ่าน http:// ในวงแลนแทน';

// เช็คว่า Print Server ออนไลน์อยู่ไหม
// คืนค่า { online, url, blocked, info, error }
export const checkPrintServer = async (timeoutMs = 3000) => {
  const url = getPrintServerUrl();
  if (isMixedContentBlocked(url)) {
    return { online: false, url, blocked: true, info: null, error: MIXED_CONTENT_MSG };
  }
  try {
    const response = await fetchWithTimeout(`${url}/health`, {}, timeoutMs);
    if (!response.ok) {
      return { online: false, url, blocked: false, info: null, error: `Print Server ตอบกลับ HTTP ${response.status}` };
    }
    const info = await response.json();
    return { online: true, url, blocked: false, info, error: null };
  } catch (e) {
    return { online: false, url, blocked: false, info: null, error: PRINT_SERVER_OFFLINE_MSG };
  }
};

// สแกนหาเครื่องพิมพ์ในวงแลน (ผ่าน Print Server)
// options: { subnet, from, to, port, timeout } — ไม่ส่งมาก็ได้ server จะเดาวงแลนให้เอง
export const scanPrinters = async (options = {}, timeoutMs = 120000) => {
  const url = getPrintServerUrl();
  if (isMixedContentBlocked(url)) throw new Error(MIXED_CONTENT_MSG);

  const params = new URLSearchParams();
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.append(key, String(value).trim());
    }
  });
  const query = params.toString();

  let response;
  try {
    response = await fetchWithTimeout(`${url}/scan-printers${query ? `?${query}` : ''}`, {}, timeoutMs);
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'สแกนนานเกินไป (timeout) ลองลดช่วง IP ที่สแกนลง' : PRINT_SERVER_OFFLINE_MSG);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok || !data || !data.success) {
    throw new Error((data && data.error) || `การสแกนล้มเหลว (HTTP ${response.status})`);
  }
  return data;
};

// สั่งพิมพ์ผ่าน Print Server — คืนค่า { success, error }
export const sendPrintJob = async ({ ip, printerType = 'receipt', orderData }, timeoutMs = 15000) => {
  const url = getPrintServerUrl();
  if (isMixedContentBlocked(url)) return { success: false, error: MIXED_CONTENT_MSG };

  try {
    const response = await fetchWithTimeout(`${url}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, printerType, orderData })
    }, timeoutMs);
    const result = await response.json().catch(() => null);
    if (!result) return { success: false, error: `Print Server ตอบกลับ HTTP ${response.status}` };
    return { success: !!result.success, error: result.error || null };
  } catch (e) {
    return { success: false, error: PRINT_SERVER_OFFLINE_MSG };
  }
};
