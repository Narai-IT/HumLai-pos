// ย้ายค่าตั้งของเครื่องจากที่อยู่เว็บเดิม (hum-lai-pos.vercel.app) มาที่อยู่ใหม่ (เซิร์ฟเวอร์ร้าน)
// เบราว์เซอร์เก็บค่าในเครื่อง (localStorage) แยกตามที่อยู่เว็บ ย้ายที่อยู่แล้วค่าเดิมจะไม่ตามมาเอง
// หน้าเปลี่ยนทางบน Vercel ส่งค่าที่จำเป็นมาใน #migrate=... (หลัง # ไม่ถูกส่งไปเซิร์ฟเวอร์ไหน)
// รับเฉพาะค่าตั้งเครื่องที่ระบุไว้ และเฉพาะค่าที่เครื่องนี้ยังไม่มี — ลิงก์แปลก ๆ เขียนทับค่าที่ตั้งไว้แล้วไม่ได้
const KEYS = ['device_branch', 'printers_config', 'printer_receipt_ip', 'printer_kitchen_ip', 'waste_branch', 'kiosk_member_login'];
const MAX_LEN = 20000;

export function importFromOldOrigin() {
  try {
    const m = /^#migrate=([A-Za-z0-9_-]+)$/.exec(window.location.hash || '');
    if (!m) return;
    const json = decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))));
    const data = JSON.parse(json);
    if (data && typeof data === 'object') {
      for (const key of KEYS) {
        const v = data[key];
        if (typeof v !== 'string' || !v || v.length > MAX_LEN) continue;
        if (localStorage.getItem(key) !== null) continue;
        localStorage.setItem(key, v);
      }
    }
  } catch { /* ลิงก์เสีย/ไม่มีที่เก็บ — ข้ามไป ตั้งค่าเครื่องใหม่เองได้ */ }
  // ลบ #migrate ออกจากแถบที่อยู่ ไม่ให้ติดไปกับบุ๊กมาร์ก/การแชร์ลิงก์
  try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* */ }
}
