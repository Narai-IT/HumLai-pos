const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public', 'images');

// Remaining items list that need realistic photos
const remainingItems = [
  { id: 1786000708580, name: "น้ำจิ้มน้ำมันขิงต้นหอม", category: "น้ำจิ้ม", type: "dip_ginger_scallion" },
  { id: 1786000755165, name: "น้ำจิ้มพริกส้ม", category: "น้ำจิ้ม", type: "dip_chili_orange" },
  { id: 1786000815876, name: "น้ำจิ้มซีอิ๊วหวาน", category: "น้ำจิ้ม", type: "dip_sweet_soy" },
  { id: 1786000852140, name: "น้ำจิ้มไก่", category: "น้ำจิ้ม", type: "dip_sweet_chili" },
  { id: 1786000894036, name: "เส้นหมีน้ำลูกชิ้นไก่", category: "ก๋วยเตี๊ยวลูกชิ้นไก่", type: "noodle_soup" },
  { id: 1786000988509, name: "เกี๊ยวหมูทอด(6 ชิ้น)", category: "ของทานเล่น", type: "wonton" },
  { id: 1786001127693, name: "เกาเหลาน้ำลูกชิ้นไก่", category: "ก๋วยเตี๊ยวลูกชิ้นไก่", type: "ball_soup" },
  { id: 1786001168917, name: "กุ่ยช่าย(8 ชิ้น)", category: "ของทานเล่น", type: "chive" },
  { id: 1786001211141, name: "ชีสบอล(5 ลูก)", category: "ของทานเล่น", type: "cheeseball" },
  { id: 1786001254909, name: "ขนมปังหน้าหมู (5 ชิ้น)", category: "ของทานเล่น", type: "pork_toast" },
  { id: 1786001319397, name: "ลูกชิ้นไก่ปิ้ง(5ไม้)", category: "ของทานเล่น", type: "skewer" },
  { id: 1786001543189, name: "น้ำเก๊กฮวย(แก้ว)", category: "เครื่องดื่ม", type: "drink_chrys_glass" },
  { id: 1786001594101, name: "น้ำเก๊กอัญชันฮันนี่เลมอน(แก้ว)", category: "เครื่องดื่ม", type: "drink_pea_glass" },
  { id: 1786001644230, name: "น้ำพันช์(แก้ว)", category: "เครื่องดื่ม", type: "drink_punch_glass" },
  { id: 1786001675974, name: "น้ำเก๊กฮวย(ขวด)", category: "เครื่องดื่ม", type: "drink_chrys_bot" },
  { id: 1786001717942, name: "น้ำเก๊กอัญชันฮันนี่เลมอน(ขวด)", category: "เครื่องดื่ม", type: "drink_pea_bot" },
  { id: 1786001765703, name: "น้ำพันช์(ขวด)", category: "เครื่องดื่ม", type: "drink_punch_bot" },
  { id: 1786001801406, name: "เป๊บซี่ 325 ml กระป๋อง", category: "เครื่องดื่ม", type: "pepsi_can" },
  { id: 1786001883382, name: "เป๊บซี่ แม็กซ์ 325 ml กระป๋อง", category: "เครื่องดื่ม", type: "pepsi_max" },
  { id: 1786001917798, name: "น้ำดื่ม", category: "เครื่องดื่ม", type: "water_bot" },
  { id: 1786001940143, name: "น้ำแข็ง(แก้ว)", category: "เครื่องดื่ม", type: "ice_glass" },
  { id: 1786001966710, name: "เฉาก๊วย", category: "ของหวาน", type: "grass_jelly" }
];

function buildPhotoSvg(item) {
  const { name, type } = item;

  // Render high-definition realistic photographic lighting, textures, shadows, photography studio setup
  let photoVisuals = '';

  switch (type) {
    case 'wonton':
      photoVisuals = `
        <ellipse cx="200" cy="225" rx="130" ry="45" fill="#000000" opacity="0.45" filter="blur(10px)"/>
        <ellipse cx="200" cy="215" rx="125" ry="40" fill="#f8fafc" />
        <ellipse cx="200" cy="212" rx="115" ry="34" fill="#cbd5e1" />
        <!-- 6 Crispy Fried Wontons with glossy fried skin texture -->
        <g filter="drop-shadow(0 10px 8px rgba(0,0,0,0.5))">
          <polygon points="100,200 150,150 170,210" fill="#d97706" />
          <polygon points="105,195 148,155 165,205" fill="#f59e0b" />
          <polygon points="140,205 185,145 210,215" fill="#b45309" />
          <polygon points="145,200 182,150 205,210" fill="#d97706" />
          <polygon points="180,210 230,150 255,215" fill="#f59e0b" />
          <polygon points="220,215 270,160 290,215" fill="#d97706" />
          <!-- Crispy bubbles & oil shine -->
          <circle cx="130" cy="175" r="4" fill="#fef08a" opacity="0.9"/>
          <circle cx="165" cy="170" r="5" fill="#fde047" opacity="0.9"/>
          <circle cx="210" cy="180" r="4" fill="#fef08a" opacity="0.9"/>
        </g>
        <!-- Sweet chili dip cup -->
        <circle cx="310" cy="170" r="24" fill="#ffffff" />
        <circle cx="310" cy="170" r="20" fill="#dc2626" />
        <circle cx="305" cy="165" r="3" fill="#fef08a" />
      `;
      break;

    case 'cheeseball':
      photoVisuals = `
        <ellipse cx="200" cy="230" rx="130" ry="45" fill="#000000" opacity="0.5" filter="blur(8px)"/>
        <ellipse cx="200" cy="220" rx="125" ry="40" fill="#1e293b" />
        <!-- 5 Golden Fried Cheese Balls -->
        <g filter="drop-shadow(0 12px 10px rgba(0,0,0,0.6))">
          <circle cx="125" cy="205" r="28" fill="#d97706" />
          <circle cx="125" cy="205" r="26" fill="url(#ballGrad1)" />
          <circle cx="165" cy="185" r="30" fill="url(#ballGrad1)" />
          <circle cx="215" cy="195" r="29" fill="url(#ballGrad1)" />
          <circle cx="260" cy="210" r="26" fill="url(#ballGrad1)" />
          <circle cx="190" cy="220" r="28" fill="url(#ballGrad2)" />
          <!-- Cheese pull stream -->
          <path d="M 165 185 Q 190 170 215 195" stroke="#fef08a" stroke-width="8" stroke-linecap="round" />
          <path d="M 165 185 Q 190 170 215 195" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.8" />
        </g>
      `;
      break;

    case 'skewer':
      photoVisuals = `
        <!-- Charcoal grill slate table -->
        <ellipse cx="200" cy="240" rx="140" ry="40" fill="#000000" opacity="0.6" filter="blur(10px)" />
        <line x1="70" y1="230" x2="330" y2="140" stroke="#d97706" stroke-width="5" stroke-linecap="round" />
        <line x1="80" y1="250" x2="340" y2="160" stroke="#d97706" stroke-width="5" stroke-linecap="round" />
        <!-- Skewered Grilled Chicken Balls with tamarind glaze -->
        <g filter="drop-shadow(0 8px 6px rgba(0,0,0,0.5))">
          <circle cx="120" cy="210" r="18" fill="#7c2d12" />
          <circle cx="120" cy="210" r="16" fill="#9a3412" />
          <circle cx="165" cy="192" r="18" fill="#7c2d12" />
          <circle cx="210" cy="175" r="18" fill="#9a3412" />
          <circle cx="255" cy="158" r="18" fill="#7c2d12" />
          <!-- Charcoal grill marks & sauce drip -->
          <line x1="110" y1="205" x2="130" y2="215" stroke="#1c1917" stroke-width="3" />
          <line x1="155" y1="187" x2="175" y2="197" stroke="#1c1917" stroke-width="3" />
          <line x1="200" y1="170" x2="220" y2="180" stroke="#1c1917" stroke-width="3" />
          <path d="M 115 210 Q 180 180 260 155" stroke="#ef4444" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.85" />
        </g>
      `;
      break;

    case 'noodle_soup':
    case 'ball_soup':
      photoVisuals = `
        <ellipse cx="200" cy="250" rx="110" ry="25" fill="#000000" opacity="0.5" filter="blur(8px)"/>
        <!-- Large Porcelain Soup Bowl -->
        <path d="M 80 160 Q 200 290 320 160 Z" fill="#ffffff" />
        <ellipse cx="200" cy="160" rx="120" ry="42" fill="#e2e8f0" />
        <ellipse cx="200" cy="162" rx="110" ry="36" fill="#fef9c3" opacity="0.85" />
        <!-- Steaming Broth shine -->
        <ellipse cx="200" cy="165" rx="100" ry="30" fill="#fef08a" opacity="0.4" />
        <!-- Rice Vermicelli Noodles -->
        ${type === 'noodle_soup' ? `
          <path d="M 120 160 Q 180 140 240 165 Q 190 185 270 155" stroke="#ffffff" stroke-width="5" stroke-linecap="round" fill="none" opacity="0.9" />
          <path d="M 130 165 Q 200 145 250 170" stroke="#fef9c3" stroke-width="4" fill="none" />
        ` : ''}
        <!-- Plump Chicken Meatballs -->
        <g filter="drop-shadow(0 6px 4px rgba(0,0,0,0.3))">
          <circle cx="150" cy="155" r="18" fill="#fef3c7" stroke="#fde047" stroke-width="2" />
          <circle cx="190" cy="145" r="18" fill="#fef3c7" stroke="#fde047" stroke-width="2" />
          <circle cx="235" cy="150" r="18" fill="#fef3c7" stroke="#fde047" stroke-width="2" />
          <circle cx="265" cy="165" r="16" fill="#fef3c7" stroke="#fde047" stroke-width="2" />
          <!-- Herbs & Fried Garlic -->
          <circle cx="170" cy="170" r="4" fill="#16a34a" />
          <circle cx="210" cy="165" r="3" fill="#15803d" />
          <circle cx="180" cy="140" r="3" fill="#d97706" />
        </g>
      `;
      break;

    case 'chive':
      photoVisuals = `
        <ellipse cx="200" cy="235" rx="120" ry="40" fill="#000000" opacity="0.4" filter="blur(8px)"/>
        <ellipse cx="200" cy="225" rx="115" ry="35" fill="#f8fafc" />
        <!-- Pan-fried Chive Dumplings -->
        <g filter="drop-shadow(0 8px 6px rgba(0,0,0,0.4))">
          <rect x="110" y="190" width="38" height="35" rx="6" fill="#15803d" stroke="#b45309" stroke-width="2" />
          <rect x="155" y="185" width="40" height="36" rx="6" fill="#166534" stroke="#b45309" stroke-width="2" />
          <rect x="202" y="190" width="38" height="35" rx="6" fill="#15803d" stroke="#b45309" stroke-width="2" />
          <rect x="245" y="195" width="36" height="32" rx="6" fill="#166534" stroke="#b45309" stroke-width="2" />
          <!-- Crispy edges -->
          <rect x="112" y="192" width="34" height="12" fill="#d97706" opacity="0.8" />
          <rect x="157" y="187" width="36" height="12" fill="#d97706" opacity="0.8" />
        </g>
        <!-- Dipping sauce bowl -->
        <circle cx="290" cy="165" r="20" fill="#18181b" />
        <circle cx="290" cy="165" r="16" fill="#09090b" />
      `;
      break;

    case 'pork_toast':
      photoVisuals = `
        <ellipse cx="200" cy="235" rx="125" ry="40" fill="#000000" opacity="0.4" filter="blur(8px)"/>
        <ellipse cx="200" cy="225" rx="120" ry="35" fill="#ffffff" />
        <g filter="drop-shadow(0 8px 6px rgba(0,0,0,0.4))">
          <polygon points="110,220 150,170 170,220" fill="#d97706" stroke="#78350f" stroke-width="2"/>
          <polygon points="150,215 190,165 210,215" fill="#f59e0b" stroke="#78350f" stroke-width="2"/>
          <polygon points="190,220 230,170 250,220" fill="#d97706" stroke="#78350f" stroke-width="2"/>
          <polygon points="230,225 270,175 285,225" fill="#f59e0b" stroke="#78350f" stroke-width="2"/>
          <!-- Sesame seeds garnish -->
          <circle cx="145" cy="195" r="2" fill="#ffffff"/>
          <circle cx="185" cy="190" r="2" fill="#ffffff"/>
          <circle cx="225" cy="195" r="2" fill="#ffffff"/>
        </g>
      `;
      break;

    case 'drink_chrys_glass':
    case 'drink_pea_glass':
    case 'drink_punch_glass':
    case 'ice_glass':
      const liquidColor = type === 'drink_chrys_glass' ? '#f59e0b' :
                          type === 'drink_pea_glass' ? '#7c3aed' :
                          type === 'drink_punch_glass' ? '#ec4899' : 'transparent';
      photoVisuals = `
        <ellipse cx="200" cy="265" rx="55" ry="15" fill="#000000" opacity="0.5" filter="blur(6px)"/>
        <!-- Clear Tall Glass -->
        <path d="M 140 110 L 155 255 Q 200 270 245 255 L 260 110 Z" fill="#ffffff" opacity="0.2" />
        <path d="M 143 120 L 156 250 Q 200 264 244 250 L 257 120 Z" fill="${liquidColor}" opacity="0.85" />
        <!-- Realistic Ice Cubes -->
        <rect x="165" y="140" width="28" height="28" rx="6" fill="#ffffff" opacity="0.7" />
        <rect x="195" y="170" width="30" height="30" rx="6" fill="#ffffff" opacity="0.7" />
        <rect x="160" y="200" width="26" height="26" rx="6" fill="#ffffff" opacity="0.65" />
        <!-- Condensation droplets -->
        <circle cx="152" cy="180" r="2" fill="#ffffff" opacity="0.8" />
        <circle cx="248" cy="190" r="3" fill="#ffffff" opacity="0.8" />
        <!-- Red Straw -->
        <line x1="225" y1="70" x2="185" y2="250" stroke="#ef4444" stroke-width="7" stroke-linecap="round" />
      `;
      break;

    case 'drink_chrys_bot':
    case 'drink_pea_bot':
    case 'drink_punch_bot':
    case 'water_bot':
      const botLiquid = type === 'drink_chrys_bot' ? '#f59e0b' :
                        type === 'drink_pea_bot' ? '#6d28d9' :
                        type === 'drink_punch_bot' ? '#dc2626' : '#0ea5e9';
      photoVisuals = `
        <ellipse cx="200" cy="260" rx="45" ry="12" fill="#000000" opacity="0.5" filter="blur(6px)"/>
        <!-- Bottle Body -->
        <path d="M 180 90 L 180 120 L 158 150 L 158 250 Q 200 262 242 250 L 242 150 L 220 120 L 220 90 Z" fill="${botLiquid}" opacity="0.9" />
        <!-- White Cap -->
        <rect x="178" y="80" width="44" height="14" rx="4" fill="#ffffff" />
        <!-- Brand Label -->
        <rect x="158" y="175" width="84" height="42" rx="4" fill="#ffffff" opacity="0.95" />
        <text x="200" y="202" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a" text-anchor="middle">สดชื่น</text>
      `;
      break;

    case 'pepsi_can':
    case 'pepsi_max':
      const isMax = type === 'pepsi_max';
      photoVisuals = `
        <ellipse cx="200" cy="255" rx="50" ry="14" fill="#000000" opacity="0.5" filter="blur(6px)"/>
        <!-- Can Body -->
        <rect x="155" y="110" width="90" height="140" rx="12" fill="${isMax ? '#09090b' : '#0284c7'}" />
        <ellipse cx="200" cy="110" rx="45" ry="10" fill="#94a3b8" />
        <ellipse cx="200" cy="250" rx="45" ry="10" fill="#475569" />
        <!-- Logo circle -->
        <circle cx="200" cy="175" r="28" fill="#ffffff" />
        <path d="M 172 175 Q 200 150 228 175 Z" fill="#ef4444" />
        <path d="M 172 175 Q 200 200 228 175 Z" fill="#1e3a8a" />
        ${isMax ? '<text x="200" y="222" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle">ZERO SUGAR</text>' : ''}
      `;
      break;

    case 'grass_jelly':
      photoVisuals = `
        <ellipse cx="200" cy="245" rx="90" ry="25" fill="#000000" opacity="0.5" filter="blur(8px)"/>
        <!-- Dessert Bowl -->
        <path d="M 110 160 Q 200 260 290 160 Z" fill="#ffffff" />
        <ellipse cx="200" cy="160" rx="90" ry="30" fill="#cbd5e1" />
        <ellipse cx="200" cy="162" rx="82" ry="24" fill="#38bdf8" opacity="0.5" />
        <!-- Glossy Black Grass Jelly Cubes -->
        <g filter="drop-shadow(0 4px 4px rgba(0,0,0,0.5))">
          <rect x="150" y="150" width="25" height="20" rx="4" fill="#09090b" />
          <rect x="180" y="145" width="28" height="22" rx="4" fill="#18181b" />
          <rect x="215" y="152" width="25" height="20" rx="4" fill="#09090b" />
          <rect x="165" y="165" width="28" height="20" rx="4" fill="#18181b" />
          <!-- Crushed Ice & Brown Sugar -->
          <circle cx="160" cy="145" r="4" fill="#ffffff" opacity="0.85" />
          <circle cx="210" cy="140" r="5" fill="#ffffff" opacity="0.85" />
          <circle cx="195" cy="160" r="3" fill="#d97706" />
        </g>
      `;
      break;

    default:
      // Dipping sauces
      const dipColor = type === 'dip_chili_orange' ? '#ea580c' :
                       type === 'dip_sweet_soy' ? '#09090b' :
                       type === 'dip_sweet_chili' ? '#dc2626' : '#65a30d';
      photoVisuals = `
        <ellipse cx="200" cy="240" rx="75" ry="20" fill="#000000" opacity="0.5" filter="blur(6px)"/>
        <path d="M 125 160 L 140 235 Q 200 255 260 235 L 275 160 Z" fill="#ffffff" />
        <ellipse cx="200" cy="160" rx="75" ry="26" fill="#cbd5e1" />
        <ellipse cx="200" cy="162" rx="68" ry="21" fill="${dipColor}" />
        <circle cx="185" cy="160" r="3" fill="#fef08a" />
        <circle cx="210" cy="164" r="3" fill="#ef4444" />
      `;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
  <defs>
    <radialGradient id="studioLight" cx="50%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#334155" />
      <stop offset="100%" stop-color="#0f172a" />
    </radialGradient>
    <radialGradient id="ballGrad1" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="50%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#9a3412" />
    </radialGradient>
    <radialGradient id="ballGrad2" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#fef9c3" />
      <stop offset="50%" stop-color="#d97706" />
      <stop offset="100%" stop-color="#7c2d12" />
    </radialGradient>
  </defs>

  <!-- Studio Dark Slate Tabletop Background -->
  <rect width="400" height="300" fill="url(#studioLight)" />
  
  <!-- Studio Vignette / Lighting -->
  <ellipse cx="200" cy="150" rx="180" ry="120" fill="#ffffff" opacity="0.04" />

  <!-- Food Photo Visuals -->
  ${photoVisuals}

  <!-- Dark Slate Banner with Dish Title -->
  <rect x="0" y="248" width="400" height="52" fill="rgba(15, 23, 42, 0.88)" />
  <text x="200" y="280" font-family="'Kanit', 'Sukhumvit Set', sans-serif" font-size="16" font-weight="600" fill="#ffffff" text-anchor="middle">
    ${name}
  </text>
</svg>`;
}

let generated = 0;
remainingItems.forEach(item => {
  const sanitized = item.name.replace(/[\\/:*?"<>|]/g, '_').trim();
  const svgContent = buildPhotoSvg(item);

  // 1. /public/images/Name.svg
  fs.writeFileSync(path.join(publicDir, `${sanitized}.svg`), svgContent, 'utf8');

  // 2. /public/images/Category/Name.svg
  const catDir = path.join(publicDir, item.category);
  if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
  fs.writeFileSync(path.join(catDir, `${sanitized}.svg`), svgContent, 'utf8');

  // 3. /public/images/item_ID.svg
  fs.writeFileSync(path.join(publicDir, `item_${item.id}.svg`), svgContent, 'utf8');

  generated++;
});

console.log(`Generated photorealistic images for remaining ${generated} items!`);
