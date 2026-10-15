// ที่อยู่รูปเมนู — ใช้ร่วมกันทั้งหน้าขาย (POS) และหน้าลูกค้าสแกนสั่งเอง
// รูปจริงอยู่ใน public/images/<โฟลเดอร์หมวด>/<ชื่อเมนู>.png (หรือ .jpg/.svg) ไม่ได้อยู่ใน /images/menu/

const CATEGORY_FOLDERS = {
  "ชุดอิ่มเดี่ยว": "ชุดอิ่มเดี่ยว",
  "ไก่ล้วนๆ": "ไก่ล้วนๆ",
  "ท๊อปปิ้งเสริม": "ท๊อปปิ้งเสริม",
  "น้ำจิ้ม": "น้ำจิ้ม",
  "ก๋วยเตี๊ยวลูกชิ้นไก่": "ก๋วยเตี๊ยวลูกชิ้นไก่",
  "ของทานเล่น": "ของทานเล่น",
  "เครื่องดื่ม": "เครื่องดื่ม",
  "ของหวาน": "ของหวาน",
  "Promotion": "Promotion",
  "SET": "กับแกล้ม3อย่าง  ทอด ต้ม ย่าง",
  "ของกินเล่น": "ของกินเล่น",
  "ย่าง": "ย่าง",
  "อาหารจานเดียว": "อาหารจานเดียว",
  "ต้ม": "ต้ม",
  "ผัด": "ผัด",
  "ยำ": "ยำ",
  "เบียร์": "เบียร์",
  "เหล้า": "เหล้า",
  "มิกเซอร์": "มิกเซอร์",
  "โชจู": "โชจู"
};

// ลำดับรูปที่จะลองโหลด (เน้นรูปภาพถ่ายเหมือนจริง PNG/JPG ก่อน)
export const menuImageCandidates = (food) => {
  if (!food) return [];
  const folder = CATEGORY_FOLDERS[food.category] || food.category || 'uncategorized';
  const fileName = (food.name || '').replace(/[\\/:*?"<>|]/g, '_').trim();
  // รายการในตะกร้าอาจเป็นตัวแปรของเมนู (id ต่อท้าย) — ใช้ id ของเมนูหลักหาไฟล์
  const id = food.baseId || food.id;
  const list = [];
  // 1. รูปที่แอดมินอัปโหลด/ใส่ลิงก์ไว้เอง (เช่นรูปใน Google Drive) — มาก่อนเสมอ
  //    เพราะเป็นรูปที่ตั้งใจเลือกให้เมนูนี้ ส่วนข้อ 2-4 เป็นการ "เดา" ชื่อไฟล์ในเครื่อง
  if (food.image && String(food.image).trim()) {
    list.push(String(food.image).trim());
  }
  if (fileName) {
    // 2. Check folder-based real photos (PNG/JPG)
    list.push(`/images/${folder}/${fileName}.png`);
    list.push(`/images/${folder}/${fileName}.jpg`);
    // 3. Check root-based real photos (PNG/JPG)
    list.push(`/images/${fileName}.png`);
    list.push(`/images/${fileName}.jpg`);
  }
  // 4. Check ID-based real photos (PNG/JPG)
  list.push(`/images/item_${id}.png`);
  list.push(`/images/item_${id}.jpg`);
  // 5. SVG vector fallback
  if (fileName) {
    list.push(`/images/${folder}/${fileName}.svg`);
    list.push(`/images/${fileName}.svg`);
  }
  list.push(`/images/item_${id}.svg`);
  return list;
};
