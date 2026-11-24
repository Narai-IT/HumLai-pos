// ── ตรวจราคาออเดอร์ที่ลูกค้าสั่งเองผ่าน QR กับเมนูในหลังบ้าน ──
//
// เดิมเซิร์ฟเวอร์เชื่อราคาและยอดรวมที่มือถือส่งมาทั้งหมด — คนที่ยิงคำขอเองตั้งราคาเมนู 500 บาทเป็น 5 บาทได้
// ตอนนี้ตรวจทีละบรรทัดกับเมนูของสาขา (ราคาหลัก/ราคาแบบต่าง ๆ/ราคาที่สาขาปรับ · ป๊อปอัพฟรี · ของแถม)
// แล้วรวมยอดเองที่เซิร์ฟเวอร์
//
//   • ข้อมูลที่ผิดชัด ๆ (เมนูไม่มีจริง ราคา/จำนวนติดลบ) → ปฏิเสธ ลูกค้าปกติส่งแบบนี้ไม่ได้อยู่แล้ว
//   • ราคาไม่ตรงเมนู → ไม่ปฏิเสธ (อาจเป็นลูกค้าที่เปิดหน้าค้างไว้ตอนร้านเพิ่งเปลี่ยนราคา)
//     แต่ใช้ราคาตามเมนูแทน และติดธง priceCheck ให้การ์ดของพนักงานขึ้นสีแดง
//
// ราคา 0 บาทผ่านได้เมื่อเป็นของจริง: เมนูที่ตั้งราคา 0 · ตัวเลือกในป๊อปอัพที่ตั้งว่าฟรี · ของแถมที่ผูกกับเมนู · คูปองครอบคลุมทั้งบิล
import { getMenuRows, getCategoryRows } from './read.js';
import { getMenuBranchRows, applyBranchMenu } from './menuBranch.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const MAX_LINES = 200;
const MAX_QTY = 999;
const MEMBER_ID = /^MB-\d{7}$/;

// รหัสรายการจากป๊อปอัพถูกต่อท้ายด้วยตัวเลือกที่เลือก เช่น HL00012__ใหญ่+HL00030 → รหัสเมนูจริงคือ HL00012
const menuIdOf = (entry) => {
  const raw = String((entry && (entry.baseId ?? entry.id)) ?? '');
  const i = raw.indexOf('__');
  return i >= 0 ? raw.slice(0, i) : raw;
};
// บรรทัดบอกชื่อราคาที่เลือก (เช่น "จานใหญ่") — ราคาคิดไว้ที่รายการหลักแล้ว บรรทัดนี้เป็น 0 เสมอ
const isOptionLabel = (entry) => !!entry && (entry.isOptionLabel === true || /__price$/.test(String(entry.id ?? '')));

// ชื่อราคาที่เป็นช่องทางขาย — ตรงกับ src/utils/salePricing.js
const TAKEHOME = ['takehome', 'take home', 'takeaway', 'ห่อกลับบ้าน', 'กลับบ้าน', 'ห่อกลับ'];
const DELI = ['deli', 'delivery', 'เดลิเวอรี่', 'lineman', 'grab', 'shopee'];
const norm = (v) => String(v || '').trim().toLowerCase();

const priceList = (food) => {
  const list = [];
  if (Array.isArray(food.prices)) {
    for (const p of food.prices) {
      if (p && p.price !== '' && p.price !== null && p.price !== undefined && Number.isFinite(Number(p.price))) list.push({ name: p.name || '', price: round2(p.price) });
    }
  }
  return list.length ? list : [{ name: '', price: round2(food.price) }];
};
// ราคาที่เมนูนี้ขายได้ทั้งหมด (ราคาหลัก + ทุกราคาที่ตั้งไว้ หลังปรับตามสาขาแล้ว)
const allowedPrices = (food) => new Set([round2(food.price), ...priceList(food).map(o => o.price)]);
// ราคาปกติของเมนู — ใช้แทนเมื่อราคาที่ส่งมาไม่ตรง (ห่อกลับบ้านใช้ราคา Takehome ถ้าตั้งไว้)
const normalPrice = (food, takeaway) => {
  const opts = priceList(food);
  if (takeaway) {
    const t = opts.find(o => TAKEHOME.includes(norm(o.name)));
    if (t) return t.price;
  }
  const regular = opts.find(o => norm(o.name) === 'ปกติ') || opts.find(o => !TAKEHOME.includes(norm(o.name)) && !DELI.includes(norm(o.name)));
  return regular ? regular.price : round2(food.price);
};

// เมนูที่ถูกตั้งเป็นตัวเลือกในป๊อปอัพแบบ "ฟรี" ที่ไหนสักที่ (ตั้งที่เมนูหรือที่หมวด) → ราคา 0 ได้เมื่อมาจากป๊อปอัพ
function freePopupIds(menu, categories) {
  const out = new Set();
  const sources = [
    ...menu.map(m => (m.popupConfig && typeof m.popupConfig === 'object' ? m.popupConfig : null)).filter(Boolean),
    ...categories
  ];
  for (const cfg of sources) {
    for (let n = 1; n <= 6; n++) {
      if (cfg[`popup${n}Free`] !== true || !cfg[`popup${n}Category`]) continue;
      const slug = String(cfg[`popup${n}Category`]);
      const only = Array.isArray(cfg[`popup${n}Items`]) ? cfg[`popup${n}Items`].map(String) : [];
      for (const m of menu) {
        if (String(m.category) === slug && (!only.length || only.includes(String(m.id)))) out.add(String(m.id));
      }
    }
  }
  return out;
}
// เมนูที่ถูกผูกเป็นของแถม (Bundled Items) ของเมนูอื่น → ราคา 0 ได้เมื่อเป็นรายการของแถม
function bundledIds(menu) {
  const out = new Set();
  for (const m of menu) if (Array.isArray(m.bundledItems)) m.bundledItems.forEach(id => out.add(String(id)));
  return out;
}

async function branchMenu(branchId) {
  const [rawMenu, categories, rows] = await Promise.all([getMenuRows(), getCategoryRows().catch(() => []), getMenuBranchRows(branchId)]);
  return { menu: applyBranchMenu(rawMenu, rows, [], branchId), categories };
}

const money = (n) => `฿${round2(n).toLocaleString('en-US')}`;

// items = ตะกร้าจากหน้าลูกค้า ({ food, quantity, allPopups[] } — food.price = ราคาต่อชิ้นรวมตัวเลือกแล้ว)
// คืน { success:false, error } = ปฏิเสธ · { success:true, items, total, couponDiscount, check } = ใช้ items/total นี้แทนของที่ส่งมา
export async function priceKioskOrder(items, branchId, { takeaway = false, couponIds, couponDiscount, memberId, claimedTotal } = {}) {
  if (!Array.isArray(items) || items.length === 0) return { success: false, error: 'ไม่มีรายการอาหาร' };
  if (items.length > MAX_LINES) return { success: false, error: 'รายการในตะกร้ามากเกินไป' };

  const { menu, categories } = await branchMenu(branchId);
  const byId = new Map(menu.map(m => [String(m.id), m]));
  const free = freePopupIds(menu, categories);
  const bundled = bundledIds(menu);

  const problems = [];
  const priced = [];
  let subtotal = 0;

  for (const item of items) {
    const food = item && item.food;
    const qty = Number(item && item.quantity);
    if (!food || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { success: false, error: 'จำนวนในตะกร้าไม่ถูกต้อง' };
    const id = menuIdOf(food);
    const m = byId.get(id);
    if (!m) return { success: false, error: `เมนู "${String(food.name || id).slice(0, 80)}" ไม่มีขายในสาขานี้แล้ว — ลบออกจากตะกร้าแล้วสั่งใหม่` };

    // ตัวเลือก/ป๊อปอัพ: ตรวจทีละตัว
    const popups = Array.isArray(item.allPopups) ? item.allPopups : [];
    let claimedPopups = 0;
    let expectedPopups = 0;
    const cleanPopups = [];
    for (const p of popups) {
      const claimed = round2(p && p.price);
      if (!p || !Number.isFinite(Number(p.price ?? 0)) || claimed < 0) return { success: false, error: 'ราคาตัวเลือกไม่ถูกต้อง' };
      claimedPopups += claimed;
      if (isOptionLabel(p)) {
        if (claimed !== 0) problems.push(`${m.name} · ${p.name || 'ตัวเลือก'}: ${money(claimed)} (ควรเป็น ฿0)`);
        cleanPopups.push({ ...p, price: 0 });
        continue;
      }
      const pm = byId.get(menuIdOf(p));
      if (!pm) {
        // ไม่ใช่เมนูในร้าน — ราคาเทียบไม่ได้ แต่ชื่อพิมพ์ลงใบครัว ต้องให้พนักงานเห็น
        problems.push(`ตัวเลือก "${String(p.name || '').slice(0, 60)}" ไม่อยู่ในเมนูของร้าน`);
        expectedPopups += claimed;
        cleanPopups.push({ ...p, price: claimed });
        continue;
      }
      const ok = allowedPrices(pm).has(claimed) || (claimed === 0 && free.has(String(pm.id)));
      const expected = ok ? claimed : normalPrice(pm, takeaway);
      if (!ok) problems.push(`${m.name} · ${pm.name}: ${money(claimed)} (ราคาเมนู ${money(expected)})`);
      expectedPopups += expected;
      cleanPopups.push({ ...p, name: pm.name, price: expected });
    }

    // จานหลัก: food.price รวมตัวเลือกมาแล้ว → ราคาจานเอง = ทั้งหมด − ตัวเลือก
    if (!Number.isFinite(Number(food.price ?? 0))) return { success: false, error: 'ราคาในตะกร้าไม่ถูกต้อง' };
    const claimedBase = round2(round2(food.price) - round2(claimedPopups));
    if (claimedBase < 0) return { success: false, error: 'ราคาในตะกร้าไม่ถูกต้อง' };
    const isBundled = food.isBundled === true && bundled.has(id);
    const zeroOk = isBundled || (!!item.fromPopupOf && free.has(id));
    const baseOk = allowedPrices(m).has(claimedBase) || (claimedBase === 0 && zeroOk);
    const expectedBase = baseOk ? claimedBase : (food.isBundled === true && bundled.has(id) ? 0 : normalPrice(m, takeaway));
    if (!baseOk) problems.push(`${m.name}: ${money(claimedBase)} (ราคาเมนู ${money(expectedBase)})`);
    if (m.isActive === false && !isBundled) problems.push(`${m.name}: ปิดขายอยู่ในหลังบ้าน`);

    const unit = round2(expectedBase + expectedPopups);
    subtotal = round2(subtotal + unit * qty);
    priced.push({ ...item, quantity: qty, allPopups: cleanPopups, food: { ...food, name: m.name, nameEn: m.nameEn || food.nameEn || '', price: unit } });
  }

  // คูปองสมาชิก: ต้องมีเลขสมาชิกและคูปองที่จองไว้ · ส่วนลดเกินยอดอาหารไม่ได้
  const hasCoupon = Array.isArray(couponIds) && couponIds.length > 0 && MEMBER_ID.test(String(memberId || ''));
  const coupon = hasCoupon ? Math.min(Math.max(0, round2(couponDiscount)), subtotal) : 0;
  const total = round2(Math.max(0, subtotal - coupon));

  const claimed = Number(claimedTotal);
  if (Number.isFinite(claimed) && Math.abs(round2(claimed) - total) >= 0.01) {
    problems.push(`ยอดที่หน้าลูกค้า ${money(claimed)} ไม่ตรงกับราคาเมนู ${money(total)}`);
  }

  return {
    success: true,
    items: priced,
    total,
    couponDiscount: coupon,
    check: { claimedTotal: Number.isFinite(claimed) ? round2(claimed) : null, serverTotal: total, problems: problems.slice(0, 20) }
  };
}
