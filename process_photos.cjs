const fs = require('fs');
const path = require('path');

const brainDir = `C:\\Users\\IT-Narai\\.gemini\\antigravity\\brain\\ecd732c3-a372-4ca9-8e11-42e83943ad99`;
const publicImagesDir = path.join(__dirname, 'public', 'images');

// Mapping generated AI photos to item names and categories
const photoMappings = [
  { prefix: 'khao_man_gai_boiled_', name: 'ข้าวมันไก่หำไหล(ไก่ต้ม+เลือด)', category: 'ชุดอิ่มเดี่ยว', id: '1785999718411' },
  { prefix: 'khao_man_gai_tod_', name: 'ข้าวมันไก่ทอด', category: 'ชุดอิ่มเดี่ยว', id: '1785999826627' },
  { prefix: 'khao_man_gai_song_jai_', name: 'ข้าวมันไก่สองใจ(ไก่ต้ม+ไก่ทอด)', category: 'ชุดอิ่มเดี่ยว', id: '1785999919251' },
  { prefix: 'khao_man_gai_sam_sien_', name: 'ข้าวมันไก่สามเซียน(ไก่ต้ม+ตับ+เลือด)', category: 'ชุดอิ่มเดี่ยว', id: '1786000014691' },
  { prefix: 'singapore_chicken_set_', name: 'ชุดข้าวมันไก่สิงคโปร์', category: 'ชุดอิ่มเดี่ยว', id: '1786000089796' },
  { prefix: 'gai_tom_sab_', name: 'ไก่ต้มสับ(น้ำจิ้มเต้าเจี้ยว+พริกขิงสับ)', category: 'ไก่ล้วนๆ', id: '1786000146540' },
  { prefix: 'gai_tod_sab_', name: 'ไก่ทอดสับ(น้ำจิ้มไก่ทอด)', category: 'ไก่ล้วนๆ', id: '1786000228403' },
  { prefix: 'gai_singapore_sab_', name: 'ไก่ต้มสิงคโปร์สับ', category: 'ไก่ล้วนๆ', id: '1786000310643' },
  { prefix: 'tub_num_', name: 'ตับนุ่ม', category: 'ไก่ล้วนๆ', id: '1786000376740' },
  { prefix: 'khao_man_', name: 'ข้าวมัน', category: 'ท๊อปปิ้งเสริม', id: '1786000422628' },
  { prefix: 'soup_fak_toon_', name: 'ซุปฟักตุ๋น', category: 'ท๊อปปิ้งเสริม', id: '1786000505540' },
  { prefix: 'nam_jim_tao_cheow_', name: 'น้ำจิ้มเต้าเจี๊ยว+พริกขิงสับ', category: 'น้ำจิ้ม', id: '1786000603180' }
];

let copied = 0;
if (fs.existsSync(brainDir)) {
  const files = fs.readdirSync(brainDir);
  photoMappings.forEach(mapping => {
    const match = files.find(f => f.startsWith(mapping.prefix) && f.endsWith('.png'));
    if (match) {
      const srcPath = path.join(brainDir, match);
      const sanitized = mapping.name.replace(/[\\/:*?"<>|]/g, '_').trim();
      
      // Target 1: /public/images/Name.png
      const target1 = path.join(publicImagesDir, `${sanitized}.png`);
      fs.copyFileSync(srcPath, target1);

      // Target 2: /public/images/Category/Name.png
      const catDir = path.join(publicImagesDir, mapping.category);
      if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
      const target2 = path.join(catDir, `${sanitized}.png`);
      fs.copyFileSync(srcPath, target2);

      // Target 3: /public/images/item_ID.png
      const target3 = path.join(publicImagesDir, `item_${mapping.id}.png`);
      fs.copyFileSync(srcPath, target3);

      copied++;
      console.log(`Copied photo for: ${mapping.name}`);
    }
  });
}

console.log(`Total realistic photos deployed: ${copied}`);
