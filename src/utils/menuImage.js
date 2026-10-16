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

// รูปที่อัปโหลดไว้บน ImgBB เป็นไฟล์ขนาดเต็ม — ขอฉบับย่อ (WebP) ผ่านตัวย่อรูปของ Vercel
// ขนาดที่ขอได้ต้องตรงกับ images.sizes ใน vercel.json
const OPTIMIZABLE_HOSTS = ['i.ibb.co'];
export const IMAGE_WIDTHS = [256, 640, 1080];

const optimizedUrl = (url, width) => {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !OPTIMIZABLE_HOSTS.includes(u.hostname)) return null;
  } catch {
    return null;
  }
  const w = IMAGE_WIDTHS.find(x => x >= width) || IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1];
  return `/_vercel/image?url=${encodeURIComponent(url)}&w=${w}&q=75`;
};

// ลิงก์ Google Drive (เช่น drive.google.com/file/d/<ID>/view, open?id=<ID>, uc?id=<ID>)
// → ขอฉบับย่อจากตัวย่อรูปของ Google เอง ต้องแชร์ไฟล์เป็น "ทุกคนที่มีลิงก์" ไว้
const DRIVE_HOSTS = ['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com', 'lh3.googleusercontent.com'];

const driveFileId = (url) => {
  try {
    const u = new URL(url);
    if (!DRIVE_HOSTS.includes(u.hostname)) return null;
    const m = u.pathname.match(/\/d\/([\w-]{20,})/);
    if (m) return m[1];
    const id = u.searchParams.get('id');
    return id && /^[\w-]{20,}$/.test(id) ? id : null;
  } catch {
    return null;
  }
};

const driveResizedUrls = (url, width) => {
  const id = driveFileId(url);
  if (!id) return [];
  return [
    `https://lh3.googleusercontent.com/d/${id}=w${width}`,
    `https://drive.google.com/thumbnail?id=${id}&sz=w${width}`
  ];
};

// ลำดับรูปที่จะลองโหลด (เน้นรูปภาพถ่ายเหมือนจริงก่อน)
// width = ความกว้างที่ต้องใช้จริงโดยประมาณ (px รวมความคมจอแล้ว)
// .webp = ไฟล์ย่อของรูปถ่าย (กว้างไม่เกิน 800px) โหลดเร็วกว่า PNG ต้นฉบับมาก — ลองก่อนเสมอ
export const menuImageCandidates = (food, width = 640) => {
  if (!food) return [];
  const folder = CATEGORY_FOLDERS[food.category] || food.category || 'uncategorized';
  const fileName = (food.name || '').replace(/[\\/:*?"<>|]/g, '_').trim();
  // รายการในตะกร้าอาจเป็นตัวแปรของเมนู (id ต่อท้าย) — ใช้ id ของเมนูหลักหาไฟล์
  const id = food.baseId || food.id;
  const list = [];
  // 1. รูปที่แอดมินอัปโหลด/ใส่ลิงก์ไว้เอง (เช่นรูปใน Google Drive) — มาก่อนเสมอ
  //    เพราะเป็นรูปที่ตั้งใจเลือกให้เมนูนี้ ส่วนข้อ 2-4 เป็นการ "เดา" ชื่อไฟล์ในเครื่อง
  if (food.image && String(food.image).trim()) {
    const url = String(food.image).trim();
    // ฉบับย่อก่อน — ถ้าย่อไม่ได้ (เช่นรันในเครื่อง ไม่มีตัวย่อของ Vercel) ค่อยใช้ไฟล์ต้นฉบับ
    const small = optimizedUrl(url, width);
    if (small) list.push(small);
    list.push(...driveResizedUrls(url, width));
    list.push(url);
  }
  if (fileName) {
    // 2. Check folder-based real photos (WebP/PNG/JPG)
    list.push(`/images/${folder}/${fileName}.webp`);
    list.push(`/images/${folder}/${fileName}.png`);
    list.push(`/images/${folder}/${fileName}.jpg`);
    // 3. Check root-based real photos (WebP/PNG/JPG)
    list.push(`/images/${fileName}.webp`);
    list.push(`/images/${fileName}.png`);
    list.push(`/images/${fileName}.jpg`);
  }
  // 4. Check ID-based real photos (WebP/PNG/JPG)
  list.push(`/images/item_${id}.webp`);
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
