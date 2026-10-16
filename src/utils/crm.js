// ระบบสมาชิก (CRM) ฝั่งหน้าเว็บ — คุยกับ API ของ POS เท่านั้น (API เป็นคนถือกุญแจและเรียก CRM ต่อ)
import { API_URL } from './api';

// เปิดใช้ระบบสมาชิกไหม: API ตั้ง CRM_URL แล้วหรือยัง (ถามครั้งเดียวต่อการเปิดหน้า)
let enabledPromise = null;
export const crmEnabled = () => {
  if (!enabledPromise) {
    enabledPromise = fetch(`${API_URL}?action=ping`)
      .then(r => r.json())
      .then(j => !!(j && j.crm))
      .catch(() => { enabledPromise = null; return false; });
  }
  return enabledPromise;
};

// ค้นหาสมาชิก: QR บัตรสมาชิก (QR.xxxx) / เบอร์โทร / เลขสมาชิก
//   kiosk = หน้าลูกค้าสั่งเอง (ไม่ต้องล็อกอิน ได้แค่ชื่อย่อ)
export async function lookupMember(query, branchId, { kiosk = false } = {}) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: kiosk ? 'crmKioskMember' : 'crmMemberLookup', query: String(query || '').trim(), branchId })
    });
    const json = await res.json().catch(() => null);
    if (!json) return { success: false, error: 'เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ' };
    return json;
  } catch {
    return { success: false, offline: true, error: 'ติดต่อเซิร์ฟเวอร์ไม่ได้' };
  }
}

// ***-***-1234
export const maskPhone = (p) => {
  const s = String(p || '').replace(/\D/g, '');
  return s.length >= 4 ? `***-***-${s.slice(-4)}` : '';
};
