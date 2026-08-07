const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, 'public', 'images');

const categories = [
  'ชุดอิ่มเดี่ยว',
  'ไก่ล้วนๆ',
  'ท๊อปปิ้งเสริม',
  'น้ำจิ้ม',
  'ก๋วยเตี๊ยวลูกชิ้นไก่',
  'ของทานเล่น',
  'เครื่องดื่ม',
  'ของหวาน'
];

categories.forEach(cat => {
  const dir = path.join(baseDir, cat);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Helper for generating custom SVG artwork for each food item
function generateSvgForItem(item) {
  const { name, category } = item;

  let bgGradient = ['#1e293b', '#0f172a'];
  let accentColor = '#f59e0b';
  let contentSvg = '';

  switch (category) {
    case 'ชุดอิ่มเดี่ยว':
      bgGradient = ['#451a03', '#1c1917'];
      accentColor = '#fbbf24';
      if (name.includes('ทอด') && !name.includes('สองใจ')) {
        // Fried Chicken Rice
        contentSvg = `
          <!-- Plate -->
          <ellipse cx="200" cy="220" rx="140" ry="70" fill="#f8fafc" opacity="0.9" />
          <ellipse cx="200" cy="215" rx="125" ry="60" fill="#e2e8f0" />
          <!-- Rice Mound -->
          <ellipse cx="140" cy="210" rx="60" ry="35" fill="#fef08a" opacity="0.95" />
          <!-- Crispy Fried Chicken Cutlets -->
          <g filter="drop-shadow(0 8px 6px rgba(0,0,0,0.4))">
            <path d="M 180 170 Q 240 150 270 190 Q 250 230 190 220 Z" fill="#d97706" />
            <path d="M 185 175 Q 235 160 260 192 Q 245 222 195 215 Z" fill="#f59e0b" />
            <!-- Crispy flakes -->
            <circle cx="210" cy="180" r="4" fill="#b45309" />
            <circle cx="235" cy="190" r="3" fill="#78350f" />
            <circle cx="200" cy="200" r="5" fill="#b45309" />
            <circle cx="250" cy="205" r="3" fill="#fde047" />
          </g>
          <!-- Cucumber Slices -->
          <ellipse cx="270" cy="225" rx="16" ry="8" fill="#4ade80" />
          <ellipse cx="270" cy="225" rx="10" ry="5" fill="#86efac" />
          <ellipse cx="280" cy="235" rx="16" ry="8" fill="#22c55e" />
          <ellipse cx="280" cy="235" rx="10" ry="5" fill="#86efac" />
          <!-- Cilantro -->
          <circle cx="150" cy="190" r="4" fill="#16a34a" />
          <circle cx="155" cy="185" r="3" fill="#22c55e" />
        `;
      } else if (name.includes('สองใจ')) {
        // Combo Boiled + Fried Chicken
        contentSvg = `
          <ellipse cx="200" cy="220" rx="140" ry="70" fill="#f8fafc" opacity="0.9" />
          <ellipse cx="200" cy="215" rx="125" ry="60" fill="#e2e8f0" />
          <ellipse cx="140" cy="210" rx="55" ry="32" fill="#fef08a" />
          <!-- Boiled chicken side -->
          <path d="M 170 170 Q 210 155 220 195 Q 200 220 175 210 Z" fill="#fef3c7" stroke="#fcd34d" stroke-width="2" />
          <!-- Fried chicken side -->
          <path d="M 215 170 Q 260 160 270 200 Q 240 230 210 215 Z" fill="#d97706" />
          <circle cx="240" cy="185" r="3" fill="#78350f" />
          <circle cx="250" cy="195" r="4" fill="#f59e0b" />
          <ellipse cx="275" cy="225" rx="14" ry="7" fill="#22c55e" />
        `;
      } else if (name.includes('สามเซียน')) {
        // Boiled + Liver + Blood
        contentSvg = `
          <ellipse cx="200" cy="220" rx="140" ry="70" fill="#f8fafc" opacity="0.95" />
          <ellipse cx="200" cy="215" rx="125" ry="60" fill="#e2e8f0" />
          <ellipse cx="130" cy="210" rx="50" ry="30" fill="#fef08a" />
          <!-- Boiled Chicken -->
          <path d="M 165 165 Q 210 150 225 185 Q 200 210 170 200 Z" fill="#fffbeb" stroke="#fcd34d" stroke-width="2"/>
          <!-- Liver -->
          <ellipse cx="235" cy="175" rx="22" ry="12" fill="#78350f" />
          <ellipse cx="245" cy="185" rx="18" ry="10" fill="#451a03" />
          <!-- Blood Jelly -->
          <rect x="230" y="200" width="35" height="18" rx="4" fill="#881337" />
          <rect x="232" y="202" width="31" height="14" rx="3" fill="#9f1239" />
          <ellipse cx="280" cy="220" rx="12" ry="6" fill="#22c55e" />
        `;
      } else if (name.includes('สิงคโปร์')) {
        // Singapore Chicken Rice Tray Set
        contentSvg = `
          <rect x="50" y="120" width="300" height="170" rx="16" fill="#78350f" />
          <rect x="58" y="128" width="284" height="154" rx="12" fill="#451a03" />
          <!-- Main Chicken Plate -->
          <ellipse cx="160" cy="205" rx="75" ry="45" fill="#ffffff" />
          <path d="M 115 190 Q 160 170 205 190 Q 190 225 130 220 Z" fill="#fde68a" stroke="#f59e0b" stroke-width="2" />
          <ellipse cx="195" cy="215" rx="12" ry="6" fill="#22c55e" />
          <!-- Rice Bowl -->
          <ellipse cx="280" cy="165" rx="35" ry="22" fill="#ffffff" />
          <ellipse cx="280" cy="160" rx="30" ry="18" fill="#fef08a" />
          <!-- Soup Bowl -->
          <circle cx="280" cy="235" r="24" fill="#ffffff" />
          <circle cx="280" cy="235" r="20" fill="#fef9c3" />
          <circle cx="278" cy="233" r="3" fill="#22c55e" />
        `;
      } else {
        // Default Boiled Chicken Rice (ข้าวมันไก่หำไหล)
        contentSvg = `
          <!-- Plate -->
          <ellipse cx="200" cy="220" rx="140" ry="70" fill="#f8fafc" opacity="0.95" />
          <ellipse cx="200" cy="215" rx="125" ry="60" fill="#f1f5f9" />
          <!-- Fragrant Rice -->
          <ellipse cx="140" cy="210" rx="60" ry="35" fill="#fef08a" />
          <ellipse cx="140" cy="205" rx="52" ry="28" fill="#fef9c3" />
          <!-- Boiled Chicken Cutlets with Soy Glaze -->
          <g filter="drop-shadow(0 6px 4px rgba(0,0,0,0.3))">
            <path d="M 180 165 C 220 150 270 175 260 210 C 220 230 180 215 180 165 Z" fill="#fffbeb" stroke="#fcd34d" stroke-width="2" />
            <!-- Blood Cubes -->
            <rect x="235" y="215" width="30" height="18" rx="4" fill="#881337" />
            <!-- Cucumber Slices -->
            <ellipse cx="275" cy="210" rx="15" ry="8" fill="#22c55e" />
            <ellipse cx="275" cy="210" rx="9" ry="4" fill="#86efac" />
            <!-- Cilantro Top -->
            <path d="M 210 170 Q 215 160 220 170 Q 225 160 230 170 Z" fill="#15803d" />
          </g>
        `;
      }
      break;

    case 'ไก่ล้วนๆ':
      bgGradient = ['#365314', '#1a2e05'];
      accentColor = '#84cc16';
      if (name.includes('ทอด')) {
        // Chopped Fried Chicken Plate
        contentSvg = `
          <ellipse cx="200" cy="210" rx="130" ry="65" fill="#ffffff" />
          <ellipse cx="200" cy="206" rx="115" ry="55" fill="#e2e8f0" />
          <g filter="drop-shadow(0 8px 6px rgba(0,0,0,0.4))">
            <path d="M 100 190 Q 200 150 300 190 Q 280 230 120 230 Z" fill="#d97706" />
            <path d="M 110 195 Q 200 160 290 195 Q 275 225 130 225 Z" fill="#f59e0b" />
            <circle cx="160" cy="185" r="4" fill="#78350f" />
            <circle cx="210" cy="175" r="5" fill="#fef08a" />
            <circle cx="250" cy="188" r="4" fill="#b45309" />
          </g>
          <!-- Sauce Cup -->
          <circle cx="310" cy="160" r="22" fill="#dc2626" />
          <circle cx="310" cy="160" r="18" fill="#ef4444" />
        `;
      } else if (name.includes('ตับ')) {
        // Soft Chicken Liver Plate
        contentSvg = `
          <ellipse cx="200" cy="210" rx="125" ry="60" fill="#ffffff" />
          <ellipse cx="200" cy="206" rx="110" ry="50" fill="#cbd5e1" />
          <g filter="drop-shadow(0 6px 4px rgba(0,0,0,0.4))">
            <ellipse cx="160" cy="195" rx="35" ry="20" fill="#581c87" />
            <ellipse cx="210" cy="190" rx="40" ry="22" fill="#4c1d95" />
            <ellipse cx="245" cy="210" rx="30" ry="18" fill="#6b21a8" />
            <path d="M 140 180 Q 200 170 260 185" stroke="#fde047" stroke-width="3" stroke-linecap="round" fill="none" />
          </g>
        `;
      } else {
        // Chopped Boiled Chicken Plate
        contentSvg = `
          <ellipse cx="200" cy="210" rx="135" ry="65" fill="#ffffff" />
          <ellipse cx="200" cy="206" rx="120" ry="55" fill="#f1f5f9" />
          <g filter="drop-shadow(0 6px 4px rgba(0,0,0,0.3))">
            <path d="M 100 195 Q 200 160 300 195 Q 270 235 120 235 Z" fill="#fffbeb" stroke="#fcd34d" stroke-width="2" />
            <!-- Soy drizzle line -->
            <path d="M 130 195 Q 200 175 270 195" stroke="#78350f" stroke-width="4" fill="none" opacity="0.7" />
            <ellipse cx="140" cy="225" rx="14" ry="7" fill="#22c55e" />
            <ellipse cx="260" cy="225" rx="14" ry="7" fill="#22c55e" />
          </g>
        `;
      }
      break;

    case 'ท๊อปปิ้งเสริม':
      bgGradient = ['#1e1b4b', '#0f172a'];
      accentColor = '#818cf8';
      if (name.includes('ซุป') || name.includes('ฟัก')) {
        // Melon Soup Bowl
        contentSvg = `
          <circle cx="200" cy="200" r="95" fill="#cbd5e1" />
          <circle cx="200" cy="195" r="85" fill="#fef9c3" />
          <!-- Soup liquid -->
          <circle cx="200" cy="195" r="75" fill="#fef08a" opacity="0.8" />
          <!-- Winter Melon chunks -->
          <rect x="150" y="170" width="35" height="25" rx="6" fill="#86efac" opacity="0.85" />
          <rect x="205" y="185" width="40" height="30" rx="8" fill="#4ade80" opacity="0.85" />
          <rect x="175" y="210" width="30" height="20" rx="5" fill="#86efac" opacity="0.85" />
          <!-- Goji berry & cilantro -->
          <circle cx="190" cy="170" r="4" fill="#ef4444" />
          <circle cx="220" cy="175" r="3" fill="#ef4444" />
          <circle cx="165" cy="205" r="3" fill="#16a34a" />
        `;
      } else {
        // Extra Rice Bowl
        contentSvg = `
          <ellipse cx="200" cy="245" rx="70" ry="20" fill="#000000" opacity="0.3" />
          <!-- Bowl -->
          <path d="M 110 190 Q 200 280 290 190 Z" fill="#ffffff" />
          <ellipse cx="200" cy="190" rx="90" ry="30" fill="#f8fafc" />
          <!-- Steaming Rice Heap -->
          <path d="M 120 185 Q 200 110 280 185 Z" fill="#fef08a" />
          <ellipse cx="200" cy="175" rx="75" ry="35" fill="#fef9c3" />
          <circle cx="190" cy="150" r="3" fill="#d97706" />
          <circle cx="210" cy="155" r="2" fill="#d97706" />
        `;
      }
      break;

    case 'น้ำจิ้ม':
      bgGradient = ['#450a0a', '#18181b'];
      accentColor = '#f87171';
      contentSvg = `
        <ellipse cx="200" cy="245" rx="70" ry="20" fill="#000000" opacity="0.4" />
        <!-- Dipping Cup -->
        <path d="M 120 170 L 140 240 Q 200 260 260 240 L 280 170 Z" fill="#ffffff" />
        <ellipse cx="200" cy="170" rx="80" ry="30" fill="#e2e8f0" />
        <!-- Sauce liquid -->
        <ellipse cx="200" cy="172" rx="72" ry="25" fill="${
          name.includes('พริกส้ม') ? '#ea580c' :
          name.includes('ซีอิ๊ว') ? '#18181b' :
          name.includes('ขิง') ? '#65a30d' :
          name.includes('ไก่') ? '#dc2626' : '#78350f'
        }" />
        <!-- Floating bits -->
        <circle cx="180" cy="170" r="4" fill="#ef4444" />
        <circle cx="215" cy="174" r="3" fill="#fef08a" />
        <circle cx="195" cy="168" r="3" fill="#22c55e" />
      `;
      break;

    case 'ก๋วยเตี๊ยวลูกชิ้นไก่':
      bgGradient = ['#064e3b', '#022c22'];
      accentColor = '#34d399';
      contentSvg = `
        <!-- Large Noodle Bowl -->
        <ellipse cx="200" cy="250" rx="100" ry="25" fill="#000000" opacity="0.4" />
        <path d="M 90 170 Q 200 290 310 170 Z" fill="#ffffff" />
        <ellipse cx="200" cy="170" rx="110" ry="40" fill="#f1f5f9" />
        <ellipse cx="200" cy="172" rx="100" ry="34" fill="#fef08a" opacity="0.7" />
        <!-- Noodles (if any) -->
        ${name.includes('เส้น') ? `
          <path d="M 130 170 Q 180 150 230 175 Q 170 190 260 165" stroke="#fef9c3" stroke-width="6" stroke-linecap="round" fill="none" />
        ` : ''}
        <!-- Chicken Balls -->
        <circle cx="150" cy="165" r="16" fill="#fef3c7" stroke="#fde047" stroke-width="2" />
        <circle cx="185" cy="155" r="16" fill="#fef3c7" stroke="#fde047" stroke-width="2" />
        <circle cx="225" cy="160" r="16" fill="#fef3c7" stroke="#fde047" stroke-width="2" />
        <circle cx="250" cy="175" r="14" fill="#fef3c7" stroke="#fde047" stroke-width="2" />
        <!-- Herbs -->
        <circle cx="170" cy="180" r="4" fill="#16a34a" />
        <circle cx="200" cy="175" r="3" fill="#16a34a" />
      `;
      break;

    case 'ของทานเล่น':
      bgGradient = ['#7c2d12', '#1c1917'];
      accentColor = '#fb923c';
      if (name.includes('ชีสบอล')) {
        contentSvg = `
          <ellipse cx="200" cy="245" rx="90" ry="25" fill="#ffffff" opacity="0.9" />
          <g filter="drop-shadow(0 6px 4px rgba(0,0,0,0.4))">
            <circle cx="140" cy="210" r="24" fill="#f59e0b" stroke="#b45309" stroke-width="2" />
            <circle cx="180" cy="195" r="25" fill="#f59e0b" stroke="#b45309" stroke-width="2" />
            <circle cx="225" cy="205" r="24" fill="#f59e0b" stroke="#b45309" stroke-width="2" />
            <circle cx="265" cy="215" r="22" fill="#f59e0b" stroke="#b45309" stroke-width="2" />
            <circle cx="200" cy="225" r="23" fill="#d97706" stroke="#b45309" stroke-width="2" />
            <!-- Cheese Drizzle -->
            <path d="M 130 200 Q 180 180 260 210" stroke="#fef08a" stroke-width="4" stroke-linecap="round" fill="none" />
          </g>
        `;
      } else if (name.includes('เกี๊ยว')) {
        contentSvg = `
          <ellipse cx="200" cy="240" rx="100" ry="30" fill="#ffffff" />
          <!-- Crispy Wonton Triangles -->
          <polygon points="120,210 160,170 180,220" fill="#f59e0b" stroke="#b45309" stroke-width="2" />
          <polygon points="160,200 200,160 220,210" fill="#d97706" stroke="#b45309" stroke-width="2" />
          <polygon points="200,210 240,165 265,220" fill="#f59e0b" stroke="#b45309" stroke-width="2" />
          <polygon points="230,220 270,180 285,225" fill="#eab308" stroke="#b45309" stroke-width="2" />
        `;
      } else if (name.includes('ลูกชิ้นไก่ปิ้ง')) {
        contentSvg = `
          <!-- Skewers -->
          <line x1="80" y1="230" x2="310" y2="150" stroke="#d97706" stroke-width="4" stroke-linecap="round" />
          <line x1="90" y1="250" x2="320" y2="170" stroke="#d97706" stroke-width="4" stroke-linecap="round" />
          <!-- Meatballs on stick -->
          <circle cx="140" cy="210" r="16" fill="#b45309" />
          <circle cx="180" cy="195" r="16" fill="#9a3412" />
          <circle cx="220" cy="180" r="16" fill="#b45309" />
          <circle cx="260" cy="165" r="16" fill="#7c2d12" />
          <!-- Glaze -->
          <path d="M 130 210 Q 200 180 270 160" stroke="#ef4444" stroke-width="5" stroke-linecap="round" fill="none" opacity="0.8" />
        `;
      } else {
        // Generic Appetizer
        contentSvg = `
          <ellipse cx="200" cy="235" rx="110" ry="35" fill="#ffffff" />
          <rect x="120" y="180" width="40" height="35" rx="6" fill="#d97706" />
          <rect x="170" y="175" width="40" height="35" rx="6" fill="#f59e0b" />
          <rect x="220" y="180" width="40" height="35" rx="6" fill="#d97706" />
          <circle cx="280" cy="210" r="18" fill="#dc2626" />
        `;
      }
      break;

    case 'เครื่องดื่ม':
      bgGradient = ['#0f172a', '#0284c7'];
      accentColor = '#38bdf8';
      if (name.includes('แก้ว') || name.includes('เป๊บซี่') || name.includes('น้ำดื่ม') || name.includes('น้ำแข็ง')) {
        contentSvg = `
          <ellipse cx="200" cy="260" rx="55" ry="15" fill="#000000" opacity="0.4" />
          <!-- Glass Cup -->
          <path d="M 145 130 L 155 250 Q 200 265 245 250 L 255 130 Z" fill="#ffffff" opacity="0.25" />
          <path d="M 147 140 L 156 246 Q 200 260 244 246 L 253 140 Z" fill="${
            name.includes('เก๊กฮวย') ? '#f59e0b' :
            name.includes('อัญชัน') ? '#8b5cf6' :
            name.includes('พันช์') ? '#ec4899' :
            name.includes('เป๊บซี่') ? '#1e293b' : '#38bdf8'
          }" opacity="0.85" />
          <!-- Ice Cubes inside -->
          <rect x="165" y="160" width="22" height="22" rx="4" fill="#ffffff" opacity="0.7" />
          <rect x="195" y="180" width="25" height="25" rx="4" fill="#ffffff" opacity="0.7" />
          <rect x="170" y="210" width="20" height="20" rx="4" fill="#ffffff" opacity="0.6" />
          <!-- Straw -->
          <line x1="220" y1="90" x2="185" y2="240" stroke="#f43f5e" stroke-width="6" stroke-linecap="round" />
        `;
      } else {
        // Beverage Bottle
        contentSvg = `
          <ellipse cx="200" cy="260" rx="45" ry="12" fill="#000000" opacity="0.4" />
          <!-- Bottle Body -->
          <path d="M 180 100 L 180 130 L 160 160 L 160 250 Q 200 260 240 250 L 240 160 L 220 130 L 220 100 Z" fill="${
            name.includes('เก๊กฮวย') ? '#f59e0b' :
            name.includes('อัญชัน') ? '#7c3aed' :
            name.includes('พันช์') ? '#ef4444' : '#0284c7'
          }" opacity="0.9" />
          <!-- Bottle Cap -->
          <rect x="178" y="90" width="44" height="14" rx="3" fill="#ffffff" />
          <!-- Label -->
          <rect x="160" y="180" width="80" height="40" rx="4" fill="#ffffff" opacity="0.9" />
          <text x="200" y="205" font-size="14" font-weight="bold" fill="#0f172a" text-anchor="middle">สดชื่น</text>
        `;
      }
      break;

    case 'ของหวาน':
      bgGradient = ['#581c87', '#1e1b4b'];
      accentColor = '#c084fc';
      contentSvg = `
        <ellipse cx="200" cy="245" rx="80" ry="22" fill="#000000" opacity="0.4" />
        <!-- Bowl -->
        <path d="M 120 170 Q 200 260 280 170 Z" fill="#ffffff" />
        <ellipse cx="200" cy="170" rx="80" ry="28" fill="#e2e8f0" />
        <!-- Syrup / Ice -->
        <ellipse cx="200" cy="170" rx="72" ry="22" fill="#38bdf8" opacity="0.5" />
        <!-- Grass Jelly Cubes -->
        <rect x="160" y="160" width="22" height="18" rx="3" fill="#18181b" />
        <rect x="190" y="155" width="24" height="20" rx="3" fill="#09090b" />
        <rect x="220" y="162" width="22" height="18" rx="3" fill="#18181b" />
        <rect x="175" y="175" width="25" height="18" rx="3" fill="#09090b" />
        <!-- Crushed Ice & Brown Sugar -->
        <circle cx="170" cy="155" r="4" fill="#ffffff" opacity="0.8" />
        <circle cx="215" cy="150" r="5" fill="#ffffff" opacity="0.8" />
        <circle cx="205" cy="165" r="3" fill="#b45309" />
      `;
      break;

    default:
      contentSvg = `
        <circle cx="200" cy="200" r="70" fill="#f59e0b" />
      `;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgGradient[0]}" />
      <stop offset="100%" stop-color="${bgGradient[1]}" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="15" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Background Card -->
  <rect width="400" height="300" rx="20" fill="url(#bgGrad)" />
  
  <!-- Subtle Lighting Ring -->
  <circle cx="200" cy="190" r="120" fill="${accentColor}" opacity="0.08" filter="url(#glow)" />
  
  <!-- Content Visuals -->
  ${contentSvg}

  <!-- Banner overlay for dish title -->
  <rect x="0" y="250" width="400" height="50" fill="rgba(15, 23, 42, 0.75)" />
  <text x="200" y="282" font-family="'Kanit', 'Sukhumvit Set', 'Inter', sans-serif" font-size="16" font-weight="600" fill="#ffffff" text-anchor="middle">
    ${name}
  </text>
</svg>`;
}

// Full menu items list from backend
const menuItems = [
  { id: 1785999718411, name: "ข้าวมันไก่หำไหล(ไก่ต้ม+เลือด)", category: "ชุดอิ่มเดี่ยว" },
  { id: 1785999826627, name: "ข้าวมันไก่ทอด", category: "ชุดอิ่มเดี่ยว" },
  { id: 1785999919251, name: "ข้าวมันไก่สองใจ(ไก่ต้ม+ไก่ทอด)", category: "ชุดอิ่มเดี่ยว" },
  { id: 1786000014691, name: "ข้าวมันไก่สามเซียน(ไก่ต้ม+ตับ+เลือด)", category: "ชุดอิ่มเดี่ยว" },
  { id: 1786000089796, name: "ชุดข้าวมันไก่สิงคโปร์", category: "ชุดอิ่มเดี่ยว" },
  { id: 1786000146540, name: "ไก่ต้มสับ(น้ำจิ้มเต้าเจี้ยว+พริกขิงสับ)", category: "ไก่ล้วนๆ" },
  { id: 1786000228403, name: "ไก่ทอดสับ(น้ำจิ้มไก่ทอด)", category: "ไก่ล้วนๆ" },
  { id: 1786000310643, name: "ไก่ต้มสิงคโปร์สับ", category: "ไก่ล้วนๆ" },
  { id: 1786000376740, name: "ตับนุ่ม", category: "ไก่ล้วนๆ" },
  { id: 1786000422628, name: "ข้าวมัน", category: "ท๊อปปิ้งเสริม" },
  { id: 1786000505540, name: "ซุปฟักตุ๋น", category: "ท๊อปปิ้งเสริม" },
  { id: 1786000603180, name: "น้ำจิ้มเต้าเจี๊ยว+พริกขิงสับ", category: "น้ำจิ้ม" },
  { id: 1786000708580, name: "น้ำจิ้มน้ำมันขิงต้นหอม", category: "น้ำจิ้ม" },
  { id: 1786000755165, name: "น้ำจิ้มพริกส้ม", category: "น้ำจิ้ม" },
  { id: 1786000815876, name: "น้ำจิ้มซีอิ๊วหวาน", category: "น้ำจิ้ม" },
  { id: 1786000852140, name: "น้ำจิ้มไก่", category: "น้ำจิ้ม" },
  { id: 1786000894036, name: "เส้นหมีน้ำลูกชิ้นไก่", category: "ก๋วยเตี๊ยวลูกชิ้นไก่" },
  { id: 1786000988509, name: "เกี๊ยวหมูทอด(6 ชิ้น)", category: "ของทานเล่น" },
  { id: 1786001127693, name: "เกาเหลาน้ำลูกชิ้นไก่", category: "ก๋วยเตี๊ยวลูกชิ้นไก่" },
  { id: 1786001168917, name: "กุ่ยช่าย(8 ชิ้น)", category: "ของทานเล่น" },
  { id: 1786001211141, name: "ชีสบอล(5 ลูก)", category: "ของทานเล่น" },
  { id: 1786001254909, name: "ขนมปังหน้าหมู (5 ชิ้น)", category: "ของทานเล่น" },
  { id: 1786001319397, name: "ลูกชิ้นไก่ปิ้ง(5ไม้)", category: "ของทานเล่น" },
  { id: 1786001543189, name: "น้ำเก๊กฮวย(แก้ว)", category: "เครื่องดื่ม" },
  { id: 1786001594101, name: "น้ำเก๊กอัญชันฮันนี่เลมอน(แก้ว)", category: "เครื่องดื่ม" },
  { id: 1786001644230, name: "น้ำพันช์(แก้ว)", category: "เครื่องดื่ม" },
  { id: 1786001675974, name: "น้ำเก๊กฮวย(ขวด)", category: "เครื่องดื่ม" },
  { id: 1786001717942, name: "น้ำเก๊กอัญชันฮันนี่เลมอน(ขวด)", category: "เครื่องดื่ม" },
  { id: 1786001765703, name: "น้ำพันช์(ขวด)", category: "เครื่องดื่ม" },
  { id: 1786001801406, name: "เป๊บซี่ 325 ml กระป๋อง", category: "เครื่องดื่ม" },
  { id: 1786001883382, name: "เป๊บซี่ แม็กซ์ 325 ml กระป๋อง", category: "เครื่องดื่ม" },
  { id: 1786001917798, name: "น้ำดื่ม", category: "เครื่องดื่ม" },
  { id: 1786001940143, name: "น้ำแข็ง(แก้ว)", category: "เครื่องดื่ม" },
  { id: 1786001966710, name: "เฉาก๊วย", category: "ของหวาน" }
];

let createdCount = 0;

menuItems.forEach(item => {
  const sanitizedFileName = item.name.replace(/[\\/:*?"<>|]/g, '_').trim();
  const svgContent = generateSvgForItem(item);

  // Path 1: Inside category folder (e.g., /public/images/ชุดอิ่มเดี่ยว/ข้าวมันไก่ทอด.svg)
  const catPath = path.join(baseDir, item.category, `${sanitizedFileName}.svg`);
  fs.writeFileSync(catPath, svgContent, 'utf8');

  // Path 2: Directly inside /public/images/ (e.g., /public/images/ข้าวมันไก่ทอด.svg)
  const rootPath = path.join(baseDir, `${sanitizedFileName}.svg`);
  fs.writeFileSync(rootPath, svgContent, 'utf8');

  // Path 3: By item ID (e.g., /public/images/item_1785999826627.svg)
  const idPath = path.join(baseDir, `item_${item.id}.svg`);
  fs.writeFileSync(idPath, svgContent, 'utf8');

  createdCount++;
});

console.log(`Successfully generated SVG images for ${createdCount} menu items!`);
