// ปลายทาง API ของระบบ POS
//
// เดิมหน้าบ้านยิงตรงไปที่ Google Apps Script (/exec) โดยฮาร์ดโค้ด URL ไว้ในทุกไฟล์
// ตอนนี้ข้อมูลอยู่บน SQL Server แล้ว ทุกหน้าจึงเรียกผ่านปลายทางเดียวกันที่นี่ที่เดียว
//
// ค่าเริ่มต้น '/api/pos' = เรียก API ที่ deploy อยู่โดเมนเดียวกับหน้าเว็บ
// ถ้า API อยู่คนละที่ (เช่นรันที่เครื่องออฟฟิศ) ตั้ง VITE_API_URL ตอน build:
//   VITE_API_URL=https://pos-api.example.com/api/pos npm run build
const configured = String(import.meta.env.VITE_API_URL || '').trim();

export const API_URL = configured || '/api/pos';

// URL แบบเต็มสำหรับส่งให้โปรแกรมอื่นเรียก (Print Server อยู่คนละเครื่อง ใช้ path สั้น ๆ ไม่ได้)
export const apiUrlAbsolute = () => {
  if (/^https?:\/\//i.test(API_URL)) return API_URL;
  if (typeof window === 'undefined') return API_URL;
  return new URL(API_URL, window.location.origin).href;
};

// รหัสถัดไปสำหรับเมนู/หมวดหมู่ที่กำลังจะสร้าง — รูปแบบ HL + เลข 5 หลัก
// ขอจากเซิร์ฟเวอร์เป็นหลัก (เป็นตัวเดียวที่เห็นข้อมูลครบทุกเครื่อง)
// ถ้าเรียกไม่ได้ค่อยคำนวณเองจากรายการที่โหลดมาแล้ว เพื่อให้ยังกดเพิ่มรายการได้ตอนเน็ตสะดุด
export const nextItemId = async (existingIds = []) => {
  try {
    const res = await fetch(`${API_URL}?action=nextId`);
    const data = await res.json();
    if (data && data.success && Array.isArray(data.ids) && data.ids[0]) return data.ids[0];
  } catch {
    // ตกไปใช้การคำนวณฝั่งเครื่องด้านล่าง
  }
  const max = existingIds.reduce((best, value) => {
    const s = String(value ?? '');
    return /^HL\d{5}$/.test(s) ? Math.max(best, Number(s.slice(2))) : best;
  }, 0);
  return `HL${String(max + 1).padStart(5, '0')}`;
};
