// ประเภทการขาย (customerType) และชุดราคาที่ผูกกับโต๊ะ
// ใช้ร่วมกันระหว่างหน้าขายกับหน้าสรุปบิล จะได้ไม่ตีความคนละแบบ

// ค่าที่ส่งออกคือ customerType ซึ่งเป็นตัวกำหนดชุดราคาของทุกเมนู
// '' = ราคาปกติ, 'Takehome' = ราคาห่อกลับบ้าน, 'Deli' = ราคาเดลิเวอรี่
export const SALE_TYPES = [
  { value: '',         th: '🍽️ ทานที่ร้าน',  en: '🍽️ Dine-in' },
  { value: 'Takehome', th: '🛍️ ห่อกลับบ้าน', en: '🛍️ Takeaway' },
  { value: 'Deli',     th: '🛵 เดลิเวอรี่',   en: '🛵 Delivery' }
];

export const sameTable = (a, b) =>
  String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

// โต๊ะที่ตั้งค่าไว้หลังบ้าน (หน้าจัดการโต๊ะเขียนลง localStorage ตัวนี้)
export const readTablesConfig = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('pos_tables_config') || '[]');
    if (Array.isArray(saved) && saved.length > 0) return saved.filter(x => x.active !== false);
  } catch { /* ยังไม่ได้ตั้งค่า → ให้ผู้เรียกใช้ค่าเริ่มต้นของตัวเอง */ }
  return [];
};

// ชุดราคาที่ควรใช้เมื่อเลือกโต๊ะนั้น ๆ — โต๊ะแต่ละตัวตั้ง priceTier ไว้ตัวเดียว
// ยังไม่ได้ตั้งค่าโต๊ะไว้ ให้เดาจากชื่อโต๊ะแทน (Takehome 1 / LineMan / Grab ฯลฯ)
export const priceTypeForTable = (name, configuredTables = []) => {
  const cfg = configuredTables.find(x => sameTable(x.name, name));
  if (cfg) {
    if (cfg.priceTier === 'takehome') return 'Takehome';
    if (cfg.priceTier === 'deli') return 'Deli';
    return '';
  }
  const s = String(name).toLowerCase();
  if (s.startsWith('takehome') || s.includes('กลับบ้าน')) return 'Takehome';
  if (['lineman', 'grab', 'shopee', 'deli', 'delivery'].some(d => s.includes(d))) return 'Deli';
  return '';
};

// ประเภทการขายที่โต๊ะนี้เลือกได้ — ล็อกไว้ตาม priceTier ของโต๊ะ
// ยังไม่ได้เลือกโต๊ะ = โชว์ครบทุกแบบ ไว้ให้เห็นว่าร้านขายช่องทางไหนบ้าง
export const saleTypesForTable = (name, configuredTables = []) => {
  if (!name) return SALE_TYPES;
  const tier = priceTypeForTable(name, configuredTables);
  const only = SALE_TYPES.filter(o => o.value === tier);
  return only.length > 0 ? only : SALE_TYPES;
};
