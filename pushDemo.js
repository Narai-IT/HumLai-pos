const GAS_URL = 'https://script.google.com/macros/s/AKfycbwz9dK329nfIhvmi-Ixy8lA9xQLLheFWHAeVQsdSm_HfciQdgvbDbBdM6y-e0544GTL/exec';

const MENU_ITEMS = [
  { id: 1, category: 'food', name: 'กะเพราหมูสับ', nameEn: 'Minced Pork Kra Pao', description: 'กะเพราหมูสับรสจัดจ้าน ผัดแห้งๆ หอมกลิ่นใบกะเพราแท้ๆ', descriptionEn: 'Spicy minced pork basil stir-fry, dry and aromatic', price: 60, image: '/images/kra_pao_moo_saap.png' },
  { id: 2, category: 'food', name: 'กะเพราหมูกรอบ', nameEn: 'Crispy Pork Kra Pao', description: 'หมูกรอบชิ้นโต หนังกรอบเนื้อนุ่ม ผัดคลุกเคล้าซอสกะเพราสูตรพิเศษ', descriptionEn: 'Large chunks of crispy pork belly tossed in special basil sauce', price: 80, image: '/images/kra_pao_moo_grob.png' },
  { id: 3, category: 'food', name: 'กะเพราทะเล', nameEn: 'Seafood Kra Pao', description: 'กุ้งและปลาหมึกสดชิ้นโต ผัดกะเพรารสเผ็ดร้อนถึงใจ', descriptionEn: 'Fresh shrimp and squid stir-fried with hot basil', price: 90, image: '/images/kra_pao_talay.png' },
  { id: 4, category: 'food', name: 'กะเพราเนื้อสับ', nameEn: 'Minced Beef Kra Pao', description: 'กะเพราเนื้อสับคัดพิเศษ ผัดแห้งหอมกลิ่นเนื้อและใบกะเพรา', descriptionEn: 'Premium minced beef, dry-fried with strong basil aroma', price: 85, image: '/images/kra_pao_nua.png' },
  { id: 5, category: 'food', name: 'กะเพราไก่สับ', nameEn: 'Minced Chicken Kra Pao', description: 'กะเพราไก่สับล้วนไม่ติดมัน รสชาติเข้มข้นถึงเครื่อง', descriptionEn: 'Lean minced chicken basil stir-fry, full of flavors', price: 55, image: '/images/kra_pao_gai.png' },
  { id: 6, category: 'food', name: 'กะเพราหมูยอ', nameEn: 'Sausage Kra Pao', description: 'หมูยอพริกไทยดำเกรดพรีเมียม ผัดกะเพรารสเด็ดจัดจ้าน', descriptionEn: 'Premium black pepper sausage in spicy basil stir-fry', price: 65, image: '/images/kra_pao_moo_yo.png' },
  { id: 101, category: 'drink', name: 'น้ำเปล่า', nameEn: 'Drinking Water', description: 'น้ำดื่มบรรจุขวดเย็นชื่นใจ', descriptionEn: 'Cold bottled drinking water', price: 15, image: 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?q=80&w=600&auto=format&fit=crop' },
  { id: 102, category: 'drink', name: 'โค้ก ออริจินัล', nameEn: 'Coca-Cola Original', description: 'โค้กกระป๋องเย็นซ่า', descriptionEn: 'Cold refreshing Coke can', price: 20, image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?q=80&w=600&auto=format&fit=crop' },
  { id: 103, category: 'drink', name: 'ชาไทยเย็น', nameEn: 'Iced Thai Tea', description: 'ชาไทยหอมเข้มข้น หวานมันกลมกล่อม', descriptionEn: 'Rich and sweet traditional Thai milk tea', price: 35, image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?q=80&w=600&auto=format&fit=crop' }
];

const CATEGORIES = [
  { slug: 'food', name: 'อาหาร', nameEn: 'Food', icon: '🍲' },
  { slug: 'drink', name: 'เครื่องดื่ม', nameEn: 'Drinks', icon: '🥤' }
];

const PROMOTIONS = [
  { id: 'soda', name: 'รับน้ำอัดลมเพิ่ม', nameEn: 'Add Soft Drink', price: 10, origPrice: 20 },
  { id: 'none', name: 'ไม่รับ', nameEn: 'No Thanks', price: 0 }
];

async function run() {
  console.log("Submitting Categories to Google Sheets...");
  let res1 = await fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'saveCategories', categories: CATEGORIES }),
    headers: { 'Content-Type': 'text/plain' }
  });
  console.log("Categories Update:", await res1.text());

  console.log("Submitting MENU_ITEMS to Google Sheets...");
  let res2 = await fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'saveMenu', items: MENU_ITEMS }),
    headers: { 'Content-Type': 'text/plain' }
  });
  console.log("Menu Update:", await res2.text());

  console.log("Submitting Promotions to Google Sheets...");
  let res3 = await fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'savePromotions', promotions: PROMOTIONS }),
    headers: { 'Content-Type': 'text/plain' }
  });
  console.log("Promotions Update:", await res3.text());

  console.log("SUCCESS! All Demo Data Pushed!");
}

run();
