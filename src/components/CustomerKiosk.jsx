import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ShoppingBag, CheckCircle, Globe, Plus, Minus, X, ChevronRight, ChevronLeft, Utensils, Menu, Download, ZoomIn, Pencil, Trash2, ShoppingCart } from 'lucide-react';
import QRCode from 'qrcode';
import { generatePromptPayPayload, generateDynamicQRFromRaw } from '../utils/promptpay';
import OrderWizardModal from './OrderWizardModal';
import { categoryVisibleFor, menuVisibleFor } from '../utils/categoryVisibility';
import { resolveNoteConfig, getPriceOptions } from '../utils/popupConfig';
import { priceForSaleType } from '../utils/salePricing';

const TAKEAWAY_DINING = { id: 'takeaway', name: 'ห่อกลับบ้าน', nameEn: 'Takeaway' };
const DINE_IN_DINING = { id: 'dine_in', name: 'ทานที่ร้าน', nameEn: 'Dine-in' };
// ทานที่ร้านโดยไม่ได้สแกน QR โต๊ะ (เข้าจากหน้าแรกของเว็บ) → ไม่ถามโต๊ะ ลงชื่อนี้แทน
const DINE_IN_LABEL = 'ทานที่ร้าน';
// โลโก้ร้านแบบกว้าง (ตัดขอบขาวออกแล้ว) แสดงเต็มความกว้างหัวจอ
const LOGO_WIDE = '/logo-wide.png';

// รูปเมนูขยาย: ใช้สองนิ้วซูม/ลากดู, แตะสองครั้งที่รูปเพื่อซูมเข้า-ออก
// ตอนซูมอยู่ แตะพื้นที่ว่างจะคืนขนาดเดิม (ยังไม่ปิด) — ตอนไม่ซูม แตะพื้นที่ว่างจะปิดรูป
const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const ZoomableImage = ({ src, alt, onBackdropTap, hint }) => {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  // ระหว่างนิ้วแตะจอ ปิด transition ให้รูปตามนิ้วทันที
  const [touching, setTouching] = useState(false);
  const viewRef = useRef(view);
  const areaRef = useRef(null);
  const imgRef = useRef(null);
  const gesture = useRef(null);
  const lastTap = useRef(0);

  const apply = (scale, x, y) => {
    const img = imgRef.current;
    let next;
    if (scale <= 1.01 || !img) {
      next = { scale: 1, x: 0, y: 0 };
    } else {
      // ไม่ให้ลากรูปหลุดออกนอกกรอบ
      const maxX = (img.offsetWidth * (scale - 1)) / 2;
      const maxY = (img.offsetHeight * (scale - 1)) / 2;
      next = { scale, x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
    }
    viewRef.current = next;
    setView(next);
  };

  // ตำแหน่งนิ้ว เทียบกับจุดกึ่งกลางของรูป (ก่อนซูม)
  const fromCenter = (clientX, clientY) => {
    const r = areaRef.current.getBoundingClientRect();
    return { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) };
  };

  const startPinch = (touches) => {
    const [a, b] = [touches[0], touches[1]];
    const mid = fromCenter((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
    const { scale, x, y } = viewRef.current;
    gesture.current = {
      type: 'pinch',
      dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
      scale,
      // จุดบนรูปที่อยู่ใต้กึ่งกลางสองนิ้ว — ให้คงอยู่ใต้นิ้วตลอดการซูม
      px: (mid.x - x) / scale,
      py: (mid.y - y) / scale
    };
  };

  const startPan = (t) => {
    const { x, y } = viewRef.current;
    gesture.current = { type: 'pan', sx: t.clientX, sy: t.clientY, x, y, moved: false };
  };

  const onTouchStart = (e) => {
    setTouching(true);
    if (e.touches.length >= 2) startPinch(e.touches);
    else if (e.touches.length === 1) startPan(e.touches[0]);
  };

  const onTouchMove = (e) => {
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'pinch' && e.touches.length >= 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const scale = Math.max(1, Math.min(MAX_ZOOM, g.scale * (dist / g.dist)));
      const mid = fromCenter((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
      apply(scale, mid.x - scale * g.px, mid.y - scale * g.py);
    } else if (g.type === 'pan' && e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - g.sx;
      const dy = t.clientY - g.sy;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) g.moved = true;
      if (viewRef.current.scale > 1) apply(viewRef.current.scale, g.x + dx, g.y + dy);
    }
  };

  const onTouchEnd = (e) => {
    const g = gesture.current;
    if (e.touches.length === 1) { startPan(e.touches[0]); gesture.current.moved = true; return; }
    if (e.touches.length >= 2) { startPinch(e.touches); return; }
    gesture.current = null;
    setTouching(false);
    // แตะสองครั้งที่รูป = ซูมเข้าตรงจุดที่แตะ / ซูมออก
    if (g && g.type === 'pan' && !g.moved && e.target === imgRef.current) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        lastTap.current = 0;
        if (viewRef.current.scale > 1) apply(1, 0, 0);
        else {
          const p = fromCenter(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
          apply(DOUBLE_TAP_ZOOM, p.x * (1 - DOUBLE_TAP_ZOOM), p.y * (1 - DOUBLE_TAP_ZOOM));
        }
      } else {
        lastTap.current = now;
      }
    }
  };

  const zoomed = view.scale > 1;

  return (
    <div
      ref={areaRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => { gesture.current = null; setTouching(false); }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === imgRef.current) return;
        if (viewRef.current.scale > 1) apply(1, 0, 0);
        else onBackdropTap();
      }}
      style={{
        flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'calc(60px + env(safe-area-inset-top)) 12px 12px',
        overflow: 'hidden', position: 'relative', touchAction: 'none'
      }}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        draggable={false}
        onError={(e) => { e.target.src = '/images/menu/default.png'; }}
        style={{
          maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
          borderRadius: zoomed ? 0 : '16px', userSelect: 'none', WebkitUserSelect: 'none',
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transition: touching ? 'none' : 'transform 0.2s ease',
          willChange: 'transform'
        }}
      />
      {!zoomed && (
        <div style={{
          position: 'absolute', bottom: '18px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(15,23,42,0.7)', color: '#e2e8f0', fontSize: '0.75rem', fontWeight: '600',
          padding: '0.3rem 0.75rem', borderRadius: '20px', whiteSpace: 'nowrap', pointerEvents: 'none'
        }}>
          {hint}
        </div>
      )}
    </div>
  );
};

// tables = ผังโต๊ะของสาขานี้ (ใช้ตอนเข้าหน้าลูกค้าจากหน้าแรกของเว็บ ที่ไม่มีเลขโต๊ะติดมากับลิงก์)
const CustomerKiosk = ({ liveMenu: rawMenu = [], categories = [], settings = {}, onRequestPayment, onCheckPayment, lang: initialLang = 'th', tables = [] }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // QR โต๊ะมีเลขโต๊ะในลิงก์ (ส่งไปหลังบ้านให้พนักงานรู้โต๊ะ แต่ไม่แสดงให้ลูกค้าเห็น)
  const tableParam = searchParams.get('table') || searchParams.get('t') || '';
  const [tableNo, setTableNo] = useState(tableParam);

  // ทานที่ร้าน / ห่อกลับบ้าน — เลือกที่จอแรก ราคาทุกเมนูแสดงตามนี้
  const [orderType, setOrderType] = useState('');
  // ห่อกลับบ้านโดยไม่มีเลขโต๊ะ → ลงโต๊ะโซน Takehome ตัวแรกของร้าน (ไม่มีก็ใช้ชื่อ Takehome)
  const takeawayTable = (() => {
    const t = (Array.isArray(tables) ? tables : []).find(tb => tb.active !== false && tb.zone === 'Takehome');
    return t ? String(t.name) : 'Takehome';
  })();

  const chooseOrderType = (type) => {
    setOrderType(type);
    if (!tableParam) setTableNo(type === 'takeaway' ? takeawayTable : DINE_IN_LABEL);
  };

  // เมนูพร้อมราคาตามที่เลือก: ห่อกลับบ้าน = ราคา Takehome
  // เมนูที่ไม่ได้ตั้งราคา Takehome → ไม่แสดงในรายการตอนห่อกลับบ้าน (noTakehomePrice)
  //   แต่ยังอยู่ในชุดนี้ด้วยราคาปกติ ให้ป๊อปอัพ/ของแถมที่อ้างถึงยังหาเจอ
  // เมนูที่มีแต่ราคาช่องทางอื่น (เช่นเฉพาะ Delivery) ไม่แสดง เหมือนหน้าขาย
  const liveMenu = useMemo(() => {
    if (!orderType) return rawMenu;
    const out = [];
    rawMenu.forEach(food => {
      const opts = getPriceOptions(food);
      const takehome = orderType === 'takeaway' ? priceForSaleType(opts, 'Takehome') : null;
      const chosen = takehome || priceForSaleType(opts, '');
      if (!chosen) return;
      out.push({ ...food, price: Number(chosen.price) || 0, ...(takehome ? { priceName: takehome.name } : {}),
        ...(orderType === 'takeaway' && !takehome ? { noTakehomePrice: true } : {}) });
    });
    return out;
  }, [rawMenu, orderType]);

  const changeOrderType = () => {
    if (cart.length > 0 && !window.confirm(lang === 'th'
      ? 'เปลี่ยนเป็นทานที่ร้าน/ห่อกลับบ้าน ราคาจะเปลี่ยน — ล้างรายการในตะกร้าแล้วเลือกใหม่?'
      : 'Changing will clear your cart. Continue?')) return;
    setCart([]);
    setOrderType('');
    if (!tableParam) setTableNo('');
  };

  const [lang, setLang] = useState(initialLang);
  const [activeCategory, setActiveCategory] = useState(categories[0]?.slug || 'food');
  const [cart, setCart] = useState([]);
  const [selectedFood, setSelectedFood] = useState(null);
  // เมนูที่กำลังเปิดดูรูปขยายเต็มจอ (แตะที่รูปในการ์ด)
  const [previewFood, setPreviewFood] = useState(null);
  // หน้าที่ลูกค้าอยู่: 'menu' เลือกเมนู → 'cart' ตรวจ/แก้ไขตะกร้า → 'pay' ชำระเงิน
  const [screen, setScreen] = useState('menu');
  const isCheckoutOpen = screen === 'pay';
  // รายการในตะกร้าที่กำลังเปิดแก้ไขตัวเลือก (ใช้ป๊อปอัพเดิมแบบทีละขั้น เปิดมาพร้อมที่เลือกไว้)
  const [editingRow, setEditingRow] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [orderNumber, setOrderNumber] = useState('');   // เลขบิลที่ระบบออกให้ ใช้อ้างอิงกับพนักงาน
  // รหัสอ้างอิงการชำระครั้งนี้ — ส่งค่าเดิมทุกครั้งที่กดส่งซ้ำ ระบบหลังบ้านจะได้ไม่ออกบิลซ้อน
  const paySessionRef = React.useRef('');

  // ── ลูกค้ากด "ฉันโอนเงินแล้ว" → รอพนักงานหน้าขายยืนยันยอด ──
  // payStage: '' (ยังไม่แจ้ง) / 'waiting' (รอตรวจสอบ) / 'rejected' (ร้านยังไม่พบยอด) / 'approved' (สำเร็จ)
  // paySnap = รายการ/ยอดที่แจ้งโอนไป (เก็บใน sessionStorage — ปิดแท็บ/รีเฟรชแล้วกลับมารอต่อได้)
  const [payStage, setPayStage] = useState('');
  const [paySnap, setPaySnap] = useState(null);
  const [payError, setPayError] = useState('');
  const [payBusy, setPayBusy] = useState(false);

  // ข้อความใต้ปุ่มบันทึกรูป QR ('saved' | 'error' | '')
  const [qrSaveState, setQrSaveState] = useState('');

  // แผงเลือกหมวดหมู่ (เปิดจากปุ่ม 3 ขีด)
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);


  // PromptPay QR configurations
  const promptPayId = settings?.promptPayId || '004000001641684';
  const qrType = settings?.qrType || 'kshop_dynamic';
  const kshopRawPayload = settings?.kshopRawPayload || '00020101021130810016A00000067701011201150107536000315080214KB0000016416840320KPS004KB00000164168431690016A00000067701011301030040214KB0000016416840420KPS004KB00000164168453037645802TH6304A14E';
  const staticQrUrl = settings?.staticQrUrl || '/kshop_qr.png';

  // Calculate cart subtotal
  const cartSubtotal = cart.reduce((sum, item) => {
    let price = Number(item.food.price) || 0;
    if (item.allPopups) item.allPopups.forEach(p => price += Number(p.price || 0));
    return sum + (price * item.quantity);
  }, 0);

  const totalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => { setQrSaveState(''); }, [isCheckoutOpen, cartSubtotal]);

  // Generate QR Code when checkout opens
  useEffect(() => {
    if (!isCheckoutOpen || cartSubtotal <= 0) { setQrDataUrl(''); return; }
    let cancelled = false;
    let payload = '';

    if (qrType === 'kshop_dynamic') {
      payload = generateDynamicQRFromRaw(kshopRawPayload, cartSubtotal);
    } else {
      payload = generatePromptPayPayload(promptPayId, cartSubtotal);
    }

    if (payload) {
      QRCode.toDataURL(payload, { width: 320, margin: 1, errorCorrectionLevel: 'M' })
        .then(url => { if (!cancelled) setQrDataUrl(url); })
        .catch(() => { if (!cancelled) setQrDataUrl(''); });
    } else {
      setQrDataUrl('');
    }
    return () => { cancelled = true; };
  }, [isCheckoutOpen, cartSubtotal, qrType, kshopRawPayload, promptPayId]);

  // เมนูที่เพิ่มอัตโนมัติเมื่อสั่ง (Bundled Items) = เมนูจริงที่แถมไปกับจานนี้
  // ลงตะกร้าเป็นรายการของตัวเองราคา ฿0 เหมือนฝั่งพนักงานสั่ง ครัวจะได้เห็นเป็นคนละรายการ
  const bundledRowsFor = (food, dining, groupId) => {
    const ids = Array.isArray(food.bundledItems) ? food.bundledItems : [];
    const rows = [];
    ids.forEach((bundledId, idx) => {
      const bundledFood = rawMenu.find(m => String(m.id) === String(bundledId));
      if (!bundledFood) return;
      rows.push({
        cartId: Date.now() + Math.random() + idx,
        food: { ...bundledFood, price: 0, priceName: '', isBundled: true },
        quantity: 1,
        allPopups: [],
        dining,
        fromPopupOf: food.name,
        ...(groupId ? { groupId } : {})
      });
    });
    return rows;
  };

  // รายการที่เหมือนกันเป๊ะ (เมนูเดียวกัน ไม่มีตัวเลือก มาจากจานเดียวกัน) ให้บวกจำนวนแทนเพิ่มบรรทัดซ้ำ
  const mergeRow = (list, row) => {
    const plain = (r) => !r.allPopups || r.allPopups.length === 0;
    const idx = list.findIndex(c =>
      String(c.food.id) === String(row.food.id) &&
      (c.fromPopupOf || '') === (row.fromPopupOf || '') &&
      // หมายเหตุคนละแบบ = คนละบรรทัด ครัวจะได้ไม่ทำรวมกันเป็นจานเดียว
      (c.note || '') === (row.note || '') &&
      plain(c) && plain(row)
    );
    if (idx >= 0) return list.map((c, i) => (i === idx ? { ...c, quantity: c.quantity + row.quantity } : c));
    return [...list, row];
  };

  const handleAddToCartDirect = (food) => {
    const dining = orderType === 'takeaway' ? TAKEAWAY_DINING : DINE_IN_DINING;
    const rows = [
      { cartId: Date.now() + Math.random(), food, quantity: 1, allPopups: [], dining },
      ...bundledRowsFor(food, dining)
    ];
    setCart(rows.reduce(mergeRow, cart));
  };

  const handleFoodClick = (food) => {
    // Check if food has popups/options configured
    if (food.hasPopup1 || food.hasPopup2 || food.hasPopup3 || food.hasPopup4 || food.hasPopup5 || food.hasPopup6 || (food.priceOptions && food.priceOptions.length > 1)) {
      setSelectedFood(food);
    } else {
      handleAddToCartDirect(food);
    }
  };

  // รูปขยาย: ดันประวัติไว้ 1 ขั้น ให้ปุ่มย้อนกลับของมือถือปิดรูปแทนการออกจากหน้า
  // (คง state เดิมของ router ไว้ เพื่อไม่ให้ router มองว่าเปลี่ยนหน้า)
  const isPreviewOpen = !!previewFood;
  useEffect(() => {
    if (!isPreviewOpen) return;
    window.history.pushState({ ...(window.history.state || {}), kioskImgPreview: true }, '');
    const onPop = () => setPreviewFood(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isPreviewOpen]);

  const closePreview = () => {
    if (window.history.state?.kioskImgPreview) window.history.back();
    else setPreviewFood(null);
  };

  const foodImageSrc = (food) => food.image || `/images/menu/${food.id}.png`;

  // หมายเหตุฝั่งลูกค้าสั่งเอง — สวิตช์พิมพ์เองแยกจากหน้าขาย (ค่าเริ่มต้นคือเลือกได้เฉพาะปุ่ม)
  const kioskNoteConfig = useMemo(() => resolveNoteConfig(settings, { kiosk: true }), [settings]);

  // รายการจากป๊อปอัพหนึ่งครั้ง = จานหลัก + รายการที่แยกบรรทัด + ของแถม ผูกกันด้วย groupId
  // จานหลักเก็บตัวเลือกดิบ (wizardState) ไว้ เปิดแก้ไขในตะกร้าได้ภายหลัง
  // ไม่รวมบรรทัดกับรายการอื่น เพื่อให้แก้ไข/ลบทั้งชุดได้ถูกตัว
  const buildWizardRows = (rawFood, orderDetails, wizardState) => {
    const chosenPrice = orderDetails?.selectedPrice;
    const baseFood = chosenPrice ? { ...rawFood, price: Number(chosenPrice.price) || 0, priceName: chosenPrice.name } : rawFood;
    const dining = orderType === 'takeaway' ? TAKEAWAY_DINING : (orderDetails.dining || DINE_IN_DINING);
    const groupId = `g${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const rows = [{
      cartId: Date.now() + Math.random(),
      food: baseFood,
      quantity: 1,
      allPopups: orderDetails.allPopups || [],
      note: orderDetails.note || '',
      dining,
      groupId,
      sourceFoodId: rawFood.id,
      wizardState: wizardState || null
    }];

    // ป๊อปอัพที่ตั้งให้ "แยกเป็นรายการต่างหาก" — ลงตะกร้าเป็นรายการของตัวเอง
    // จะได้ขึ้นคนละบรรทัดในบิล/ใบครัว เหมือนฝั่งพนักงานสั่ง
    (orderDetails.separateItems || []).forEach((row, idx) => {
      rows.push({
        cartId: Date.now() + Math.random() + idx + 1,
        food: row.food,
        quantity: 1,
        allPopups: row.options || [],
        dining,
        fromPopupOf: baseFood.name,
        groupId
      });
    });

    return [...rows, ...bundledRowsFor(baseFood, dining, groupId)];
  };

  // แก้ไขแล้ว: แทนที่ทั้งชุดเดิม ณ ตำแหน่งเดิม — จำนวนของจานหลักคงเดิม
  // รายการพ่วงที่ยังเป็นเมนูเดิม ก็คงจำนวนที่ลูกค้าปรับไว้
  const replaceGroup = (list, oldRow, rows) => {
    const oldGroup = list.filter(r => r.cartId === oldRow.cartId || (oldRow.groupId && r.groupId === oldRow.groupId));
    const used = new Set();
    const fresh = rows.map((r, i) => {
      if (i === 0) return { ...r, quantity: oldRow.quantity };
      const prev = oldGroup.find(o => o.cartId !== oldRow.cartId && !used.has(o.cartId) && String(o.food.id) === String(r.food.id));
      if (!prev) return r;
      used.add(prev.cartId);
      return { ...r, quantity: prev.quantity };
    });
    const at = list.findIndex(r => oldGroup.includes(r));
    if (at < 0) return [...list, ...fresh];
    const rest = list.filter(r => !oldGroup.includes(r));
    rest.splice(at, 0, ...fresh);
    return rest;
  };

  const handleConfirmWizardOrder = (rawFood, orderDetails, wizardState) => {
    const rows = buildWizardRows(rawFood, orderDetails, wizardState);
    if (editingRow) setCart(prev => replaceGroup(prev, editingRow, rows));
    else setCart(prev => [...prev, ...rows]);
    setSelectedFood(null);
    setEditingRow(null);
  };

  // ลบจานหลักที่มาจากป๊อปอัพ = ลบรายการพ่วง/ของแถมของจานนั้นไปด้วย (ไม่ให้ของแถม ฿0 ค้างอยู่เดี่ยว ๆ)
  const removeRow = (row) => {
    setCart(prev => prev.filter(r => r.cartId !== row.cartId && !(row.wizardState && row.groupId && r.groupId === row.groupId)));
  };

  const handleUpdateQty = (cartId, delta) => {
    const row = cart.find(item => item.cartId === cartId);
    if (!row) return;
    if (row.quantity + delta <= 0) { removeRow(row); return; }
    setCart(cart.map(item => (item.cartId === cartId ? { ...item, quantity: item.quantity + delta } : item)));
  };

  // แก้ตัวเลือกได้เฉพาะจานที่สั่งผ่านป๊อปอัพ (มีขั้นตอนให้เลือก) และเมนูยังขายอยู่
  const editSourceFor = (row) => (row && row.wizardState && row.wizardState.stepCount > 0
    ? liveMenu.find(m => String(m.id) === String(row.sourceFoodId)) || null
    : null);

  // ── บันทึกรูป QR ลงเครื่อง ──
  // ลูกค้าถือมือถือเครื่องเดียว จะสแกน QR บนจอตัวเองไม่ได้ ต้องเซฟรูปไว้ก่อน
  // แล้วเข้าแอปธนาคาร → "สแกนจากรูปภาพ/แกลเลอรี" ถึงจะโอนได้
  // มือถือส่วนใหญ่ใช้ Web Share (มีเมนู "บันทึกรูปภาพ" ให้เลย) ส่วนเครื่องที่ไม่มีค่อยตกไปใช้ลิงก์ดาวน์โหลด
  const handleSaveQr = async () => {
    const src = qrType === 'static' ? staticQrUrl : qrDataUrl;
    if (!src) return;
    setQrSaveState('');
    const fileName = `promptpay-table${tableNo}-${Math.round(cartSubtotal)}baht.png`;

    try {
      const blob = await (await fetch(src)).blob();
      const file = new File([blob], fileName, { type: blob.type || 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: fileName });
          setQrSaveState('saved');
          return;
        } catch (err) {
          // ผู้ใช้กดยกเลิกแผงแชร์เอง = ไม่ใช่ข้อผิดพลาด ไม่ต้องขึ้นอะไร
          if (err && err.name === 'AbortError') return;
          // แชร์ไม่ได้ด้วยเหตุอื่น ค่อยลองดาวน์โหลดต่อข้างล่าง
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setQrSaveState('saved');
    } catch (err) {
      console.error('save qr error:', err);
      setQrSaveState('error');
    }
  };

  const PAY_KEY = 'kiosk_pending_payment';
  const savePending = (snap) => { try { if (snap) sessionStorage.setItem(PAY_KEY, JSON.stringify(snap)); else sessionStorage.removeItem(PAY_KEY); } catch { /* ไม่มีที่เก็บ */ } };

  // เปิดหน้าใหม่/รีเฟรชระหว่างรอพนักงานยืนยัน → กลับมาที่หน้ารอเดิม
  useEffect(() => {
    try {
      const snap = JSON.parse(sessionStorage.getItem(PAY_KEY) || 'null');
      if (snap && snap.id) {
        paySessionRef.current = snap.id;
        setPaySnap(snap);
        if (snap.orderType) setOrderType(snap.orderType);
        setPayStage('waiting');
        setScreen('pay');
      }
    } catch { /* ข้อมูลเสีย ข้าม */ }
  }, []);

  // ลูกค้ากด "ฉันโอนเงินแล้ว" (หรือแจ้งอีกครั้งหลังร้านยังไม่พบยอด)
  const handleTransferDone = async () => {
    if (cart.length === 0 || payBusy) return;
    if (!paySessionRef.current) paySessionRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const snap = {
      id: paySessionRef.current,
      total: cartSubtotal,
      orderType,
      tableNo,
      items: cart.map(item => {
        const unit = (Number(item.food.price) || 0) + (item.allPopups || []).reduce((sum, p) => sum + (Number(p.price) || 0), 0);
        return {
          name: lang === 'th' ? item.food.name : (item.food.nameEn || item.food.name),
          options: (item.allPopups || []).map(p => p.name).join(', '),
          qty: item.quantity,
          amount: unit * item.quantity
        };
      })
    };
    setPayBusy(true); setPayError('');
    const dining = orderType === 'takeaway' ? 'ห่อกลับบ้าน' : 'ทานที่ร้าน';
    const res = onRequestPayment
      ? await onRequestPayment(tableNo, cart, cartSubtotal, snap.id, dining)
      : { success: false, error: 'ระบบยังไม่พร้อม' };
    setPayBusy(false);
    if (!res || !res.success) {
      setPayError(lang === 'th'
        ? `แจ้งร้านไม่สำเร็จ${res && /Unknown action/i.test(res.error || '') ? ' (ระบบร้านยังไม่อัปเดต)' : ''} — กดอีกครั้ง หรือแจ้งพนักงาน`
        : 'Could not notify the shop — please try again or call our staff.');
      return;
    }
    setPaySnap(snap);
    savePending(snap);
    if (res.status === 'approved') {
      setOrderNumber(res.orderNumber || '');
      setPayStage('approved');
      savePending(null);
      setCart([]);
    } else {
      setPayStage('waiting');
    }
  };

  // ระหว่างรอ — ถามสถานะทุก 3 วินาที (เก็บฟังก์ชันไว้ใน ref: หน้าหลัก render ใหม่บ่อย ไม่ให้ตัวจับเวลาเริ่มใหม่ทุกครั้ง)
  const checkPaymentRef = React.useRef(onCheckPayment);
  checkPaymentRef.current = onCheckPayment;
  useEffect(() => {
    if (payStage !== 'waiting' || !paySessionRef.current) return;
    let alive = true;
    const tick = async () => {
      if (!checkPaymentRef.current) return;
      const st = await checkPaymentRef.current(paySessionRef.current);
      if (!alive || !st) return;
      if (st.status === 'approved') {
        setOrderNumber(st.orderNumber || '');
        setPayStage('approved');
        savePending(null);
        setCart([]);
      } else if (st.status === 'rejected') {
        setPayStage('rejected');
      }
    };
    tick();
    const timer = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, [payStage]);

  // ชำระสำเร็จ → กลับไปหน้าเมนู พร้อมรับออเดอร์ใหม่ (รหัสรายการใหม่)
  const finishPayment = () => {
    setScreen('menu');
    setPayStage('');
    setPaySnap(null);
    setPayError('');
    setOrderNumber('');
    paySessionRef.current = '';
    savePending(null);
  };

  // ── เปลี่ยนหน้า เมนู → ตะกร้า → ชำระเงิน ──
  // ดันประวัติไว้ทุกครั้งที่ไปหน้าถัดไป ให้ปุ่มย้อนกลับของมือถือถอยทีละหน้า ไม่หลุดออกจากเว็บ
  // ระหว่างรอพนักงานยืนยันยอด/ชำระเสร็จแล้ว ห้ามย้อนออกจากหน้าชำระเงิน
  const payLockedRef = useRef(false);
  payLockedRef.current = screen === 'pay' && (payStage === 'waiting' || payStage === 'approved');
  const menuScrollRef = useRef(0);

  const goTo = (next) => {
    if (screen === 'menu') menuScrollRef.current = window.scrollY;
    window.history.pushState({ ...(window.history.state || {}), kioskScreen: next }, '');
    setScreen(next);
  };

  const goBack = () => {
    if (window.history.state?.kioskScreen) window.history.back();
    else setScreen(screen === 'pay' ? 'cart' : 'menu');
  };

  useEffect(() => {
    const onPop = (e) => {
      if (payLockedRef.current) {
        window.history.pushState({ ...(e.state || {}), kioskScreen: 'pay' }, '');
        return;
      }
      setScreen((e.state && e.state.kioskScreen) || 'menu');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // กลับมาหน้าเมนู = กลับไปตำแหน่งที่เลื่อนดูค้างไว้ / หน้าอื่นเริ่มบนสุด
  useEffect(() => {
    window.scrollTo(0, screen === 'menu' ? menuScrollRef.current : 0);
  }, [screen]);


  // ── หน้าแรกโชว์ครบทุกเมนู แยกเป็นบล็อกตามหมวด ──
  // เดิมกรองให้เห็นทีละหมวด ลูกค้าไม่รู้ว่ามีอะไรอีกบ้างถ้าไม่กดเปลี่ยนหมวด
  // ตอนนี้ไล่ดูรวดเดียวได้ ส่วนปุ่มหมวดหมู่เปลี่ยนหน้าที่เป็น "เลื่อนไปยังหมวดนั้น"
  // หมวดที่ตั้งเป็น "เฉพาะพนักงาน" ไม่แสดงที่นี่ (ป๊อปอัพยังใช้เมนูครบชุดตามเดิม)
  const menuSections = useMemo(() => {
    const shownMenu = liveMenu.filter(item => !item.noTakehomePrice && menuVisibleFor(item, categories, 'customer'));
    const sections = categories.filter(cat => categoryVisibleFor(cat, 'customer')).map(cat => ({
      slug: cat.slug,
      name: lang === 'th' ? cat.name : (cat.nameEn || cat.name),
      icon: cat.icon || '🍲',
      items: shownMenu.filter(item => {
        const primary = item.category || 'food';
        const extra = Array.isArray(item.categories) ? item.categories : [];
        return primary === cat.slug || extra.includes(cat.slug);
      })
    })).filter(section => section.items.length > 0);

    // เมนูที่หมวดของมันถูกลบ/เปลี่ยนชื่อไปแล้ว ต้องยังเห็นอยู่ ไม่ใช่หายไปเงียบ ๆ
    const shown = new Set(sections.flatMap(section => section.items.map(item => String(item.id))));
    const rest = shownMenu.filter(item => !shown.has(String(item.id)));
    if (rest.length > 0) {
      sections.push({ slug: '__other__', name: lang === 'th' ? 'เมนูอื่น ๆ' : 'Others', icon: '🍽️', items: rest });
    }
    return sections;
  }, [categories, liveMenu, lang]);

  const totalMenuCount = menuSections.reduce((sum, section) => sum + section.items.length, 0);

  // หมวดที่กำลังดูอยู่ — อ่านจาก menuSections เพราะมี "เมนูอื่น ๆ" ที่ไม่มีใน categories ด้วย
  const activeCat = menuSections.find(section => section.slug === activeCategory) || menuSections[0];

  // หัวจอ + แถบหมวดหมู่เป็น sticky ทับเนื้อหาอยู่ ต้องรู้ความสูงจริงเพื่อ
  //   ก) วางแถบหมวดหมู่ให้พอดีใต้หัวจอ  ข) เลื่อนไปหมวดแล้วหัวข้อไม่โดนบัง
  const catBarRef = React.useRef(null);
  const sectionRefs = React.useRef({});
  const [catBarH, setCatBarH] = useState(0);

  useEffect(() => {
    const measure = () => {
      setCatBarH(catBarRef.current ? catBarRef.current.offsetHeight : 0);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [lang, menuSections.length, screen]);

  // หมวดที่เลือกอยู่หายไปจากเมนู (ร้านลบ/ปิดขาย) ให้กลับไปหมวดแรกที่ยังมีของ
  useEffect(() => {
    if (menuSections.length > 0 && !menuSections.some(section => section.slug === activeCategory)) {
      setActiveCategory(menuSections[0].slug);
    }
  }, [menuSections, activeCategory]);

  const scrollOffset = catBarH + 8;

  const scrollToCategory = (slug) => {
    setActiveCategory(slug);
    setShowCategoryMenu(false);
    // รอให้แผงหมวดหมู่ปิดก่อน ค่อยเลื่อน ไม่งั้นตำแหน่งเพี้ยนตอนคืนสกอร์ล
    requestAnimationFrame(() => {
      const el = sectionRefs.current[slug];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  // เลื่อนอ่านไปถึงหมวดไหน ให้ปุ่มด้านบนโชว์ชื่อหมวดนั้น ลูกค้าจะได้รู้ว่าอยู่ตรงไหนของเมนู
  useEffect(() => {
    const els = menuSections.map(section => sectionRefs.current[section.slug]).filter(Boolean);
    if (els.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      const slug = visible[0] && visible[0].target.dataset.slug;
      if (slug) setActiveCategory(slug);
    }, { rootMargin: `-${scrollOffset + 4}px 0px -65% 0px`, threshold: 0 });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [menuSections, scrollOffset]);

  // การ์ดเมนูหนึ่งใบ — ใช้ร่วมกันทุกหมวด
  const renderFoodCard = (food) => {
    const inCartItems = cart.filter(c => c.food.id === food.id);
    const inCartQty = inCartItems.reduce((sum, c) => sum + c.quantity, 0);
    const price = Number(food.price) || 0;

    return (
      <div
        key={food.id}
        /* ตั้งใจไม่ให้กดที่การ์ด/รูปแล้วสั่ง — ลูกค้ามักแตะรูปเพื่อดูให้ชัด
           ถ้าแตะแล้วเพิ่มของทันทีจะได้ของที่ไม่ได้ตั้งใจสั่ง ต้องกดปุ่ม "+ สั่ง" เท่านั้น */
        style={{
          background: '#ffffff', borderRadius: '18px',
          border: '1px solid #e2e8f0', overflow: 'hidden',
          boxShadow: '0 6px 20px rgba(0,0,0,0.04)',
          transition: 'transform 0.15s',
          display: 'flex', flexDirection: 'column', height: '100%',
          position: 'relative'
        }}
      >
        {/* Image Container with high visual impact */}
        {/* แตะรูป = เปิดดูรูปขยาย (ไม่เพิ่มลงตะกร้า) */}
        <div
          onClick={() => setPreviewFood(food)}
          style={{ width: '100%', aspectRatio: '1 / 1', position: 'relative', background: '#f1f5f9', cursor: 'zoom-in' }}
        >
          <img
            src={foodImageSrc(food)}
            alt={food.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => { e.target.src = '/images/menu/default.png'; }}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          
          <div style={{
            position: 'absolute', top: '8px', left: '8px',
            width: '28px', height: '28px', borderRadius: '50%',
            background: 'rgba(15,23,42,0.55)', color: '#ffffff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none'
          }}>
            <ZoomIn size={15} />
          </div>

          {/* Badge & Price tag overlay */}
          <div style={{
            position: 'absolute', bottom: '8px', right: '8px',
            background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(8px)',
            color: '#ffffff', padding: '0.28rem 0.6rem', borderRadius: '20px',
            fontWeight: '900', fontSize: '0.92rem', border: '1.5px solid rgba(255,255,255,0.2)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
          }}>
            <span style={{ color: '#ea580c', fontSize: '0.75rem', marginRight: '2px' }}>฿</span>
            {price.toLocaleString()}
          </div>

          {inCartQty > 0 && (
            <div style={{
              position: 'absolute', top: '8px', right: '8px',
              background: '#ea580c', color: 'white', fontWeight: '900',
              fontSize: '0.8rem', borderRadius: '50%', width: '26px', height: '26px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 10px rgba(234,88,12,0.4)', border: '2px solid white'
            }}>
              {inCartQty}
            </div>
          )}
        </div>

        {/* Content info */}
        <div style={{ padding: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
          <div>
            {/* ตัดชื่อที่ 2 บรรทัด เพื่อให้การ์ดในแถวเดียวกันสูงเท่ากัน */}
            <h4 style={{
              fontSize: '0.95rem', fontWeight: '800', margin: 0, color: '#0f172a', lineHeight: 1.3,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
            }}>
              {lang === 'th' ? food.name : (food.nameEn || food.name)}
            </h4>
            {food.description && (
              <p style={{
                fontSize: '0.74rem', color: '#64748b', margin: '0.2rem 0 0 0', fontWeight: '500', lineHeight: 1.35,
                display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden'
              }}>
                {food.description}
              </p>
            )}
          </div>

          <button
            onClick={() => handleFoodClick(food)}
            style={{
              marginTop: 'auto',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#ffffff', border: 'none', borderRadius: '11px',
              padding: '0.6rem 0.5rem', fontWeight: '800', fontSize: '0.88rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
              boxShadow: '0 4px 12px rgba(217,119,6,0.3)', width: '100%', fontFamily: 'inherit'
            }}
          >
            <Plus size={16} /> {lang === 'th' ? 'ใส่ตะกร้า' : 'Add to cart'}
          </button>
        </div>
      </div>
    );
  };


  // ── จอแรก: ทานที่ร้าน / ห่อกลับบ้าน ──
  if (!orderType) {
    const bigBtn = {
      display: 'flex', alignItems: 'center', gap: '1rem', width: '100%', textAlign: 'left',
      padding: '1.25rem', borderRadius: 18, border: '2px solid #e2e8f0',
      background: '#ffffff', cursor: 'pointer', fontFamily: 'inherit', color: '#0f172a',
      boxShadow: '0 6px 20px rgba(0,0,0,0.05)'
    };
    return (
      <div style={{ minHeight: '100dvh', background: '#ffffff', width: '100%', maxWidth: 480, margin: '0 auto', padding: '1rem 1rem 1.5rem', boxSizing: 'border-box', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#0f172a' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => setLang(lang === 'th' ? 'en' : 'th')}
            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 20, padding: '0.35rem 0.6rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: '#0f172a', fontFamily: 'inherit' }}>
            <Globe size={13} /> {lang === 'th' ? 'TH' : 'EN'}
          </button>
        </div>

        {/* โลโก้ร้านเต็มความกว้าง */}
        <img src={LOGO_WIDE} alt={lang === 'th' ? 'ข้าวมันไก่หำไหล' : 'Hum Lai Chicken Rice'}
          style={{ display: 'block', width: '100%', maxWidth: 340, height: 'auto', margin: '0.35rem auto 0.2rem' }} />
        <div style={{ textAlign: 'center', color: '#ea580c', fontWeight: 700, fontSize: '0.85rem', marginBottom: '1.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <Utensils size={14} /> {lang === 'th' ? 'สั่งอาหารด้วยตนเอง' : 'Self-ordering'}
        </div>

        <h2 style={{ fontSize: '1.4rem', fontWeight: 900, margin: '0 0 0.3rem' }}>{lang === 'th' ? 'ทานที่ร้าน หรือ ห่อกลับบ้าน?' : 'Dine in or take away?'}</h2>
        <p style={{ color: '#64748b', margin: '0 0 1.25rem' }}>{lang === 'th' ? 'ราคาในเมนูจะแสดงตามที่เลือก' : 'Menu prices follow your choice'}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <button style={bigBtn} onClick={() => chooseOrderType('dine_in')}>
            <span style={{ fontSize: '2.4rem' }}>🍽️</span>
            <b style={{ fontSize: '1.25rem' }}>{lang === 'th' ? 'ทานที่ร้าน' : 'Dine in'}</b>
          </button>
          <button style={bigBtn} onClick={() => chooseOrderType('takeaway')}>
            <span style={{ fontSize: '2.4rem' }}>🛍️</span>
            <b style={{ fontSize: '1.25rem' }}>{lang === 'th' ? 'ห่อกลับบ้าน' : 'Take away'}</b>
          </button>
        </div>
      </div>
    );
  }

  const th = lang === 'th';
  const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lineTotal = (item) => ((Number(item.food.price) || 0) + (item.allPopups || []).reduce((sum, p) => sum + (Number(p.price) || 0), 0)) * item.quantity;
  const cartImageSrc = (food) => food.image || `/images/menu/${food.baseId || food.id}.png`;

  // แถบบนของหน้าตะกร้า/ชำระเงิน: ปุ่มย้อนกลับ + ชื่อหน้า + โลโก้ร้าน
  const renderTopBar = (title, icon, canBack) => (
    <div style={{
      position: 'sticky', top: 0, zIndex: 100, background: '#ffffff',
      borderBottom: '1px solid #e2e8f0', padding: '0.65rem 0.9rem',
      display: 'flex', alignItems: 'center', gap: '0.6rem', boxShadow: '0 4px 15px rgba(0,0,0,0.03)'
    }}>
      {canBack ? (
        <button onClick={goBack} aria-label={th ? 'ย้อนกลับ' : 'Back'}
          style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <ChevronLeft size={22} color="#0f172a" />
        </button>
      ) : <div style={{ width: 2 }} />}
      <h2 style={{ margin: 0, flex: 1, minWidth: 0, fontSize: '1.12rem', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
        {icon}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
      </h2>
      <img src={LOGO_WIDE} alt="" style={{ height: 38, width: 'auto', flexShrink: 0 }} />
    </div>
  );

  // ขั้นตอน 1 ตะกร้า → 2 ชำระเงิน → 3 เสร็จสิ้น
  const renderSteps = (active) => {
    const labels = th ? ['ตะกร้า', 'ชำระเงิน', 'เสร็จสิ้น'] : ['Cart', 'Payment', 'Done'];
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0.8rem 1rem 0.3rem', fontSize: '0.8rem', fontWeight: 800 }}>
        {labels.map((label, i) => {
          const n = i + 1;
          const done = n < active || active === 3;
          const on = n === active && !done;
          return (
            <React.Fragment key={n}>
              {i > 0 && <div style={{ width: 20, height: 2, background: n <= active ? '#16a34a' : '#e2e8f0' }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: done ? '#16a34a' : on ? '#ea580c' : '#94a3b8' }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%', fontSize: '0.72rem',
                  background: done ? '#16a34a' : on ? '#ea580c' : '#e2e8f0', color: (done || on) ? '#ffffff' : '#64748b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>{done ? '✓' : n}</span>
                {label}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  // แถบปุ่มติดล่างจอ ของหน้าตะกร้า/ชำระเงิน
  const footerStyle = {
    position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
    width: '100%', maxWidth: '480px', zIndex: 90, boxSizing: 'border-box',
    background: '#ffffff', borderTop: '1px solid #e2e8f0',
    padding: '0.75rem 1rem', paddingBottom: 'calc(0.85rem + env(safe-area-inset-bottom))',
    boxShadow: '0 -8px 24px rgba(0,0,0,0.06)'
  };
  const bigBtnStyle = (bg, disabled) => ({
    width: '100%', border: 'none', borderRadius: '14px', padding: '0.95rem 1.1rem',
    fontWeight: 900, fontSize: '1.08rem', fontFamily: 'inherit', color: '#ffffff',
    background: disabled ? '#cbd5e1' : bg, cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
  });
  const ORANGE = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
  const GREEN = 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)';
  const chipBtn = (color, bg) => ({
    border: 'none', background: bg, color, borderRadius: '8px', padding: '0.32rem 0.65rem',
    fontSize: '0.78rem', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 4
  });

  // รายการหนึ่งบรรทัดในหน้าตะกร้า: รูป · ชื่อ/ตัวเลือก/หมายเหตุ · จำนวน · แก้ไข/ลบ
  const renderCartRow = (item) => {
    const editSource = editSourceFor(item);
    const stepBtn = { width: 34, height: 32, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f172a' };
    return (
      <div key={item.cartId} style={{
        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '0.65rem',
        display: 'flex', gap: '0.7rem', boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
      }}>
        <img src={cartImageSrc(item.food)} alt="" loading="lazy" referrerPolicy="no-referrer"
          onError={(e) => { e.target.src = '/images/menu/default.png'; }}
          style={{ width: 68, height: 68, borderRadius: '12px', objectFit: 'cover', flexShrink: 0, background: '#f1f5f9' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '0.93rem', lineHeight: 1.3, color: '#0f172a' }}>
            {th ? item.food.name : (item.food.nameEn || item.food.name)}
          </div>
          {item.allPopups && item.allPopups.length > 0 && (
            <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>
              {item.allPopups.map(p => p.name).join(', ')}
            </div>
          )}
          {item.note && (
            <div style={{ display: 'inline-block', fontSize: '0.76rem', color: '#b45309', background: '#fffbeb', borderRadius: 6, padding: '1px 6px', marginTop: 3 }}>
              📝 {item.note}
            </div>
          )}
          {/* รายการที่แยกออกมาจากป๊อปอัพ / ของแถมของอีกจาน */}
          {item.fromPopupOf && (
            <div style={{ fontSize: '0.74rem', color: '#1d4ed8', fontWeight: 700, marginTop: 2 }}>
              {item.food.isBundled
                ? (th ? `🎁 แถมกับ ${item.fromPopupOf}` : `🎁 Free with ${item.fromPopupOf}`)
                : (th ? `พ่วงกับ ${item.fromPopupOf}` : `with ${item.fromPopupOf}`)}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.45rem', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #cbd5e1', borderRadius: '10px', overflow: 'hidden' }}>
              <button onClick={() => handleUpdateQty(item.cartId, -1)} aria-label={th ? 'ลดจำนวน' : 'Decrease'} style={stepBtn}><Minus size={16} /></button>
              <span style={{ minWidth: 30, textAlign: 'center', fontWeight: 900, fontSize: '0.95rem', borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', lineHeight: '32px' }}>{item.quantity}</span>
              <button onClick={() => handleUpdateQty(item.cartId, 1)} aria-label={th ? 'เพิ่มจำนวน' : 'Increase'} style={stepBtn}><Plus size={16} /></button>
            </div>
            <span style={{ fontWeight: 900, color: '#ea580c', fontSize: '1rem' }}>฿{lineTotal(item).toLocaleString()}</span>
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: '0.45rem', flexWrap: 'wrap' }}>
            {editSource && (
              <button onClick={() => setEditingRow(item)} style={chipBtn('#0369a1', '#e0f2fe')}>
                <Pencil size={13} /> {th ? 'แก้ไขตัวเลือก' : 'Edit options'}
              </button>
            )}
            <button onClick={() => removeRow(item)} style={chipBtn('#b91c1c', '#fef2f2')}>
              <Trash2 size={13} /> {th ? 'ลบ' : 'Remove'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── หน้า 2: ตะกร้า — ตรวจ/แก้ไข/ลบ ก่อนไปชำระเงิน ──
  const renderCartPage = () => (
    <>
      {renderTopBar(th ? 'ตะกร้าของฉัน' : 'My cart', <ShoppingCart size={22} color="#ea580c" style={{ flexShrink: 0 }} />, true)}
      {renderSteps(1)}
      {cart.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: '#64748b' }}>
          <ShoppingCart size={56} color="#cbd5e1" style={{ margin: '0 auto 0.75rem', display: 'block' }} />
          <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a', marginBottom: '0.3rem' }}>{th ? 'ยังไม่มีรายการในตะกร้า' : 'Your cart is empty'}</div>
          <div style={{ fontSize: '0.88rem', marginBottom: '1.25rem' }}>{th ? 'เลือกเมนูที่ชอบใส่ตะกร้าได้เลย' : 'Add some dishes to get started.'}</div>
          <button onClick={goBack} style={{ ...bigBtnStyle(ORANGE, false), width: 'auto', display: 'inline-flex', padding: '0.8rem 1.6rem' }}>
            {th ? 'เลือกเมนู' : 'Browse menu'}
          </button>
        </div>
      ) : (
        <div style={{ padding: '0.5rem 1rem 1rem' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700, marginBottom: '0.6rem' }}>
            {th ? `${totalItemsCount} รายการ · ตรวจสอบและแก้ไขได้ก่อนชำระเงิน` : `${totalItemsCount} items · review and edit before paying`}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {cart.map(renderCartRow)}
          </div>
          <button onClick={goBack} style={{
            width: '100%', marginTop: '0.75rem', border: '2px dashed #fdba74', background: '#fff7ed', color: '#c2410c',
            borderRadius: '14px', padding: '0.75rem', fontWeight: 800, fontSize: '0.92rem', fontFamily: 'inherit', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
          }}>
            <Plus size={17} /> {th ? 'เลือกเมนูเพิ่ม' : 'Add more items'}
          </button>
        </div>
      )}

      {cart.length > 0 && (
        <div style={footerStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontWeight: 800, marginBottom: '0.6rem', color: '#0f172a' }}>
            <span>{th ? `ยอดรวม (${totalItemsCount} รายการ)` : `Total (${totalItemsCount} items)`}</span>
            <span style={{ color: '#ea580c', fontSize: '1.3rem', fontWeight: 900 }}>฿{money(cartSubtotal)}</span>
          </div>
          <button onClick={() => goTo('pay')} style={{ ...bigBtnStyle(ORANGE, false), justifyContent: 'space-between', boxShadow: '0 8px 20px rgba(217,119,6,0.3)' }}>
            <span>{th ? 'ไปหน้าชำระเงิน' : 'Continue to payment'}</span>
            <ChevronRight size={22} />
          </button>
        </div>
      )}
    </>
  );

  // ── หน้า 3: ชำระเงิน (QR พร้อมเพย์ → แจ้งโอน → รอพนักงานยืนยัน → สำเร็จ) ──
  const renderPayPage = () => {
    if (payStage === 'approved' || payStage === 'waiting') {
      return (
        <>
          {renderTopBar(th ? 'ชำระเงิน' : 'Payment', <ShoppingBag size={22} color="#ea580c" style={{ flexShrink: 0 }} />, false)}
          {renderSteps(payStage === 'approved' ? 3 : 2)}
          <div style={{ padding: '0 1rem' }}>
            {payStage === 'approved' ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0.5rem' }}>
              <CheckCircle size={64} color="#16a34a" style={{ margin: '0 auto 0.75rem' }} />
              <h3 style={{ fontSize: '1.5rem', fontWeight: '900', color: '#16a34a', marginBottom: '0.4rem' }}>
                {lang === 'th' ? 'ชำระเงินสำเร็จ!' : 'Payment confirmed!'}
              </h3>
              <p style={{ color: '#475569', fontSize: '0.95rem', fontWeight: '600', marginBottom: '1.25rem' }}>
                {lang === 'th' ? 'ร้านได้รับเงินแล้ว กำลังเตรียมอาหารให้ครับ' : 'We received your payment and are preparing your food.'}
              </p>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '1rem', color: '#166534', fontWeight: '700', textAlign: 'left', lineHeight: 1.8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{lang === 'th' ? 'ประเภท' : 'Type'}</span><span>{(paySnap?.orderType || orderType) === 'takeaway' ? (lang === 'th' ? '🛍️ ห่อกลับบ้าน' : '🛍️ Take away') : (lang === 'th' ? '🍽️ ทานที่ร้าน' : '🍽️ Dine in')}</span></div>
                {orderNumber && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{lang === 'th' ? 'เลขที่บิล' : 'Bill no.'}</span><strong>{orderNumber}</strong></div>}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{lang === 'th' ? 'ยอดชำระ' : 'Paid'}</span><strong>฿{Number(paySnap?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', fontWeight: '600', opacity: 0.85 }}>
                  {lang === 'th' ? 'ชำระเรียบร้อยแล้ว ไม่ต้องจ่ายซ้ำที่เคาน์เตอร์' : 'Already paid — no need to pay again at the counter.'}
                </div>
              </div>
              <button onClick={finishPayment}
                style={{ width: '100%', marginTop: '1.25rem', background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', color: '#fff', border: 'none', borderRadius: '14px', padding: '1rem', fontWeight: '900', fontSize: '1.05rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                🍽️ {lang === 'th' ? 'สั่งอาหารเพิ่ม' : 'Order more'}
              </button>
            </div>
          
            ) : (
            <div style={{ textAlign: 'center', padding: '1.25rem 0.25rem' }}>
              <div style={{ width: 64, height: 64, margin: '0.5rem auto 0.75rem', borderRadius: '50%', border: '7px solid #fde68a', borderTopColor: '#f59e0b', animation: 'kioskspin 1s linear infinite' }} />
              <style>{'@keyframes kioskspin { to { transform: rotate(360deg); } }'}</style>
              <h3 style={{ fontSize: '1.3rem', fontWeight: '900', color: '#b45309', margin: '0 0 0.35rem' }}>
                {lang === 'th' ? 'กำลังตรวจสอบการโอน...' : 'Checking your transfer...'}
              </h3>
              <p style={{ color: '#64748b', fontSize: '0.88rem', fontWeight: '600', margin: '0 0 1rem', lineHeight: 1.5 }}>
                {lang === 'th' ? 'พนักงานกำลังเช็กยอดเงินเข้า กรุณาอย่าปิดหน้านี้' : 'Our staff are confirming the payment. Please keep this page open.'}
              </p>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.75rem 0.9rem', textAlign: 'left' }}>
                {(paySnap?.items || []).map((it, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.88rem', padding: '0.15rem 0' }}>
                    <span>{it.qty}× {it.name}{it.options ? <span style={{ color: '#64748b' }}> ({it.options})</span> : null}</span>
                    <b>฿{Number(it.amount || 0).toLocaleString()}</b>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', marginTop: '0.4rem', paddingTop: '0.45rem', fontWeight: '900' }}>
                  <span>{lang === 'th' ? 'ยอดโอน' : 'Amount'}</span>
                  <span style={{ color: '#ea580c' }}>฿{Number(paySnap?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
              <p style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: '1rem' }}>
                {lang === 'th' ? 'รอนานเกิน 5 นาที กรุณาแจ้งพนักงาน' : 'Waiting more than 5 minutes? Please call our staff.'}
              </p>
            </div>
            )}
          </div>
        </>
      );
    }

    return (
      <>
        {renderTopBar(th ? 'ชำระเงิน' : 'Payment', <ShoppingBag size={22} color="#ea580c" style={{ flexShrink: 0 }} />, true)}
        {renderSteps(2)}
        <div style={{ padding: '0.5rem 1rem 1rem' }}>
          {/* สรุปรายการ — กดกลับไปแก้ไขตะกร้าได้ */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.7rem 0.9rem', marginBottom: '0.75rem', fontSize: '0.88rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 900, marginBottom: '0.3rem' }}>
              <span>{th ? `สรุปรายการ (${totalItemsCount})` : `Order summary (${totalItemsCount})`}</span>
              <button onClick={goBack} style={chipBtn('#0369a1', '#e0f2fe')}>
                <Pencil size={13} /> {th ? 'แก้ไขตะกร้า' : 'Edit cart'}
              </button>
            </div>
            {cart.map(item => (
              <div key={item.cartId} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '0.12rem 0' }}>
                <span style={{ minWidth: 0 }}>
                  {item.quantity}× {th ? item.food.name : (item.food.nameEn || item.food.name)}
                  {item.allPopups && item.allPopups.length > 0 && <span style={{ color: '#64748b' }}> ({item.allPopups.map(p => p.name).join(', ')})</span>}
                </span>
                <b style={{ flexShrink: 0 }}>฿{lineTotal(item).toLocaleString()}</b>
              </div>
            ))}
          </div>

          {/* PromptPay QR Code container */}
          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '16px', padding: '1rem', textAlign: 'center', marginBottom: '1.25rem', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
            <div style={{ color: '#003d6a', fontWeight: '900', fontSize: '1rem', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>
              THAI QR PAYMENT
            </div>
            <div style={{ background: '#003d6a', color: 'white', fontWeight: '800', fontSize: '0.8rem', borderRadius: '6px', padding: '0.25rem', marginBottom: '0.75rem' }}>
              PromptPay (พร้อมเพย์)
            </div>

            {qrType === 'static' ? (
              <img src={staticQrUrl} alt="Static QR" style={{ width: '220px', height: '220px', margin: '0 auto', display: 'block' }} />
            ) : qrDataUrl ? (
              <img src={qrDataUrl} alt="Dynamic PromptPay QR" style={{ width: '220px', height: '220px', margin: '0 auto', display: 'block' }} />
            ) : (
              <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                {lang === 'th' ? 'กำลังสร้าง QR Code...' : 'Generating QR Code...'}
              </div>
            )}

            <div style={{ marginTop: '0.5rem', color: '#0f172a' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{lang === 'th' ? 'ยอดชำระทั้งสิ้น' : 'Total Amount'}</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#ea580c' }}>
                ฿{cartSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            {/* บันทึกรูป QR ไว้เปิดในแอปธนาคาร (สแกนจอตัวเองด้วยเครื่องเดียวกันไม่ได้) */}
            {(qrType === 'static' ? staticQrUrl : qrDataUrl) && (
              <>
                <button
                  onClick={handleSaveQr}
                  style={{
                    width: '100%', marginTop: '0.85rem',
                    background: '#ffffff', color: '#003d6a',
                    border: '1.5px solid #003d6a', borderRadius: '12px',
                    padding: '0.75rem', fontWeight: '900', fontSize: '0.95rem',
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem'
                  }}
                >
                  <Download size={18} />
                  {lang === 'th' ? 'บันทึกรูป QR' : 'Save QR image'}
                </button>

                <div style={{
                  marginTop: '0.4rem', fontSize: '0.74rem', lineHeight: 1.45, fontWeight: '600',
                  color: qrSaveState === 'error' ? '#b91c1c' : qrSaveState === 'saved' ? '#166534' : '#64748b'
                }}>
                  {qrSaveState === 'error'
                    ? (lang === 'th' ? 'บันทึกรูปไม่สำเร็จ — กดค้างที่รูป QR แล้วเลือก "บันทึกรูปภาพ" แทนได้' : 'Could not save. Long-press the QR and choose “Save image” instead.')
                    : qrSaveState === 'saved'
                      ? (lang === 'th' ? 'บันทึกรูปแล้ว — เปิดแอปธนาคาร แล้วเลือกสแกนจากรูปภาพ' : 'Saved — open your bank app and scan from your photos.')
                      : (lang === 'th' ? 'จ่ายด้วยมือถือเครื่องนี้? บันทึกรูป QR ไว้ แล้วเปิดแอปธนาคาร → สแกนจากรูปภาพ/แกลเลอรี' : 'Paying from this phone? Save the QR, then use “scan from gallery” in your bank app.')}
                </div>
              </>
            )}
          </div>

          {payStage === 'rejected' && (
            <div style={{
              background: '#fef2f2', border: '1.5px solid #fecaca', color: '#b91c1c',
              borderRadius: '12px', padding: '0.85rem 1rem', marginBottom: '0.75rem',
              fontSize: '0.88rem', fontWeight: '700', lineHeight: 1.5
            }}>
              ⚠️ {lang === 'th'
                ? 'ร้านยังไม่พบยอดโอนของรายการนี้ — ตรวจสอบว่าโอนสำเร็จและยอดตรง แล้วกดแจ้งอีกครั้ง หรือแจ้งพนักงานพร้อมแสดงสลิป'
                : 'The shop has not received this transfer yet. Check your transfer, then notify again or show your slip to our staff.'}
            </div>
          )}

          {payError && (
            <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '0.75rem 1rem', marginBottom: '0.75rem', fontSize: '0.85rem', fontWeight: '700' }}>
              ⚠️ {payError}
            </div>
          )}
          <p style={{ textAlign: 'center', color: '#64748b', fontSize: '0.78rem', margin: '0.6rem 0 0', lineHeight: 1.45 }}>
            {th ? 'สแกน QR แล้วโอนตามยอด จากนั้นกดปุ่ม "ฉันโอนเงินแล้ว" พนักงานจะตรวจยอดแล้วส่งอาหารเข้าครัวให้' : 'Pay with the QR, then tap "I have transferred". Our staff will confirm and send your order to the kitchen.'}
          </p>
        </div>

        <div style={footerStyle}>
          <button
            onClick={handleTransferDone}
            disabled={payBusy || cart.length === 0}
            style={{ ...bigBtnStyle(GREEN, payBusy || cart.length === 0), boxShadow: (payBusy || cart.length === 0) ? 'none' : '0 8px 20px rgba(22,163,74,0.35)' }}
          >
            <CheckCircle size={22} />
            {payBusy
              ? (th ? 'กำลังแจ้งร้าน...' : 'Notifying the shop...')
              : payStage === 'rejected'
                ? (th ? 'แจ้งโอนอีกครั้ง' : 'Notify again')
                : (th ? 'ฉันโอนเงินแล้ว' : 'I have transferred')}
          </button>
          <button onClick={goBack} style={{ width: '100%', marginTop: '0.4rem', background: 'none', border: 'none', color: '#64748b', fontSize: '0.82rem', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <ChevronLeft size={15} /> {th ? 'กลับไปแก้ไขตะกร้า' : 'Back to cart'}
          </button>
        </div>
      </>
    );
  };

  // เปิดหน้าชำระเงินค้างไว้แต่ตะกร้าว่าง (เช่นกดย้อน/ไปหน้าหลังชำระเสร็จ) → แสดงหน้าตะกร้าแทน
  const page = (screen === 'pay' && !payStage && cart.length === 0) ? 'cart' : screen;

  return (
    <div style={{
      // 100dvh = ความสูงจอ "จริง" ตอนนั้น — 100vh บนมือถือจะนับรวมแถบที่อยู่เว็บที่ยุบ ๆ ยืด ๆ
      minHeight: '100dvh',
      background: '#f8fafc',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#0f172a',
      // กล่องนี้เป็นลูกของ .app-container ซึ่งเป็น flex column — พอใส่ margin auto
      // ตัวมันจะเลิก stretch แล้วกว้างตามเนื้อหา (ไปชน max-width 480) ทำให้จอ 320-430px
      // เลื่อนซ้ายขวาได้ ต้องกำหนด width 100% + min-width 0 บังคับให้กว้างเท่าจอเสมอ
      width: '100%',
      minWidth: 0,
      maxWidth: '480px',
      margin: '0 auto',
      boxShadow: '0 0 30px rgba(0,0,0,0.1)',
      position: 'relative',
      // เผื่อที่ให้แถบตะกร้าลอย / แถบปุ่มติดล่าง + แถบ home ของ iPhone
      paddingBottom: page === 'menu' ? 'calc(110px + env(safe-area-inset-bottom))' : 'calc(170px + env(safe-area-inset-bottom))',
      WebkitTapHighlightColor: 'transparent',
      overflowX: 'hidden'
    }}>

      {/* ─── หน้า 1: เมนู — ซ่อนไว้ (ไม่ถอดออก) ตอนอยู่หน้าตะกร้า/ชำระเงิน กลับมาแล้วอยู่ที่เดิม ─── */}
      <div style={{ display: page === 'menu' ? 'block' : 'none' }}>
        {/* หัวร้าน: โลโก้เต็มความกว้าง */}
        <header style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '0.6rem 0.9rem 0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
              <div style={{
                background: '#fff7ed', border: '1.5px solid #ffedd5',
                color: '#c2410c', fontWeight: '800', fontSize: 'clamp(0.72rem, 3vw, 0.85rem)',
                padding: '0.35rem 0.6rem', borderRadius: '20px', whiteSpace: 'nowrap'
              }}>
                {orderType === 'takeaway'
                  ? `🛍️ ${th ? 'ห่อกลับบ้าน' : 'Take away'}`
                  : `🍽️ ${th ? 'ทานที่ร้าน' : 'Dine in'}`}
              </div>
              <button onClick={changeOrderType} title={th ? 'เปลี่ยนทานที่ร้าน/ห่อกลับบ้าน' : 'Change'}
                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '20px', padding: '0.35rem 0.55rem', color: '#0f172a', fontWeight: '700', fontSize: 'clamp(0.66rem, 2.8vw, 0.76rem)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit' }}>
                {orderType === 'takeaway' ? (th ? 'ราคา Takehome' : 'Takehome') : (th ? 'ราคาปกติ' : 'Regular')} ⇄
              </button>
            </div>
            <button
              onClick={() => setLang(th ? 'en' : 'th')}
              style={{
                background: '#f1f5f9', border: '1px solid #cbd5e1',
                borderRadius: '20px', padding: '0.35rem 0.55rem',
                color: '#0f172a', fontWeight: '700', fontSize: 'clamp(0.7rem, 3vw, 0.8rem)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px',
                whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit'
              }}
            >
              <Globe size={13} /> {th ? 'TH' : 'EN'}
            </button>
          </div>
          <img src={LOGO_WIDE} alt={th ? 'ข้าวมันไก่หำไหล' : 'Hum Lai Chicken Rice'}
            style={{ display: 'block', width: '100%', maxWidth: 330, height: 'auto', margin: '0.45rem auto 0.15rem' }} />
          <div style={{ textAlign: 'center', color: '#ea580c', fontWeight: 700, fontSize: 'clamp(0.72rem, 3vw, 0.82rem)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <Utensils size={13} style={{ flexShrink: 0 }} />
            {th ? 'สั่งอาหารด้วยตนเอง · เลือกใส่ตะกร้า แล้วค่อยชำระเงิน' : 'Self-order · add to cart, then pay'}
          </div>
        </header>

        {/* ─── แถบหมวดหมู่ (3 ขีด) — กดแล้วเลื่อนไปยังหมวดนั้นในหน้าเดียวกัน ─── */}
        <div
          ref={catBarRef}
          style={{
            position: 'sticky', top: 0, zIndex: 95,
            background: '#f8fafc', padding: '0.5rem 1rem 0.6rem'
          }}
        >
          <button
            onClick={() => setShowCategoryMenu(true)}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              padding: '0.75rem 0.9rem', borderRadius: '14px',
              border: '2px solid #e2e8f0', background: '#ffffff',
              color: '#0f172a', fontWeight: '800', fontSize: '0.95rem',
              fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
              boxShadow: '0 4px 12px rgba(15,23,42,0.05)'
            }}
          >
            <Menu size={20} color="#ea580c" />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeCat ? `${activeCat.icon} ${activeCat.name}` : (lang === 'th' ? 'เลือกหมวดหมู่' : 'Choose a category')}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '700', flexShrink: 0 }}>
              {lang === 'th' ? 'ข้ามไปหมวด' : 'Jump to'}
            </span>
            <ChevronRight size={18} color="#94a3b8" style={{ transform: 'rotate(90deg)', flexShrink: 0 }} />
          </button>
        </div>

        {/* ─── เมนูทั้งหมด แยกเป็นบล็อกตามหมวด ไล่ดูรวดเดียวได้ ─── */}
        <main style={{ padding: '0 1rem' }}>
          {menuSections.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#64748b', fontWeight: '700', padding: '2.5rem 1rem' }}>
              {lang === 'th' ? 'ยังไม่มีเมนูให้สั่งตอนนี้' : 'No menu items available right now.'}
            </div>
          ) : (
            <>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '700', marginBottom: '0.75rem' }}>
                {lang === 'th'
                  ? `ทั้งหมด ${totalMenuCount} รายการ · ${menuSections.length} หมวด — เลื่อนดูได้ทั้งหน้า`
                  : `${totalMenuCount} items in ${menuSections.length} categories — scroll to browse`}
              </div>

              {menuSections.map(section => (
                <section
                  key={section.slug}
                  data-slug={section.slug}
                  ref={el => { sectionRefs.current[section.slug] = el; }}
                  style={{ scrollMarginTop: `${scrollOffset}px`, marginBottom: '1.5rem' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
                      <span style={{ flexShrink: 0 }}>{section.icon}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{section.name}</span>
                    </h3>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '700', flexShrink: 0 }}>
                      {section.items.length} {lang === 'th' ? 'รายการ' : 'items'}
                    </span>
                  </div>

                  {/* การ์ดเมนูแบบตาราง 2 คอลัมน์ รูปเป็นสี่เหลี่ยมจัตุรัส — เห็นเมนูได้มากขึ้นต่อหนึ่งหน้าจอ */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', alignItems: 'start' }}>
                    {section.items.map(renderFoodCard)}
                  </div>
                </section>
              ))}
            </>
          )}
        </main>

        {/* ─── แถบตะกร้าลอยด้านล่าง ─── */}
        {cart.length > 0 && (
          <div style={{
            position: 'fixed', bottom: 'calc(15px + env(safe-area-inset-bottom))',
            left: '50%', transform: 'translateX(-50%)',
            width: 'calc(100% - 2rem)', maxWidth: '440px', zIndex: 90
          }}>
            <button
              onClick={() => goTo('cart')}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                color: '#ffffff', border: '1.5px solid #334155', borderRadius: '20px',
                padding: '0.95rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                boxShadow: '0 12px 30px rgba(15,23,42,0.4)', cursor: 'pointer', fontFamily: 'inherit'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  background: '#ea580c', color: 'white', borderRadius: '50%',
                  width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: '900', fontSize: '0.95rem'
                }}>
                  {totalItemsCount}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: '600' }}>
                    {th ? 'ตะกร้าของคุณ' : 'Your Cart'}
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#ffffff' }}>
                    ฿{cartSubtotal.toLocaleString()}
                  </div>
                </div>
              </div>

              <div style={{
                background: ORANGE,
                color: '#ffffff', fontWeight: '800', fontSize: '0.95rem',
                padding: '0.6rem 1.1rem', borderRadius: '14px',
                display: 'flex', alignItems: 'center', gap: '4px'
              }}>
                <span>{th ? 'ดูตะกร้า' : 'View cart'}</span>
                <ChevronRight size={18} />
              </div>
            </button>
          </div>
        )}
      </div>

      {page === 'cart' && renderCartPage()}
      {page === 'pay' && renderPayPage()}

      {/* ─── รูปเมนูขยายเต็มจอ ─── */}
      {previewFood && (
        <div
          onClick={closePreview}
          style={{
            position: 'fixed', inset: 0, zIndex: 950,
            background: 'rgba(2,6,23,0.92)',
            display: 'flex', flexDirection: 'column'
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); closePreview(); }}
            aria-label={lang === 'th' ? 'ปิด' : 'Close'}
            style={{
              position: 'absolute', top: 'calc(12px + env(safe-area-inset-top))', right: '12px', zIndex: 1,
              width: '42px', height: '42px', borderRadius: '50%', border: 'none',
              background: 'rgba(255,255,255,0.15)', color: '#ffffff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <X size={22} />
          </button>

          <ZoomableImage
            key={previewFood.id}
            src={foodImageSrc(previewFood)}
            alt={previewFood.name}
            onBackdropTap={closePreview}
            hint={lang === 'th' ? 'ใช้สองนิ้วซูม หรือแตะสองครั้ง' : 'Pinch or double-tap to zoom'}
          />

          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff', width: '100%', maxWidth: '480px', margin: '0 auto',
              borderTopLeftRadius: '22px', borderTopRightRadius: '22px',
              padding: '1rem', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))',
              display: 'flex', flexDirection: 'column', gap: '0.5rem'
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '900', color: '#0f172a', lineHeight: 1.3 }}>
              {lang === 'th' ? previewFood.name : (previewFood.nameEn || previewFood.name)}
            </h3>
            {previewFood.description && (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', lineHeight: 1.45, maxHeight: '20dvh', overflowY: 'auto' }}>
                {previewFood.description}
              </p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '0.25rem' }}>
              <div style={{ fontSize: '1.35rem', fontWeight: '900', color: '#ea580c' }}>
                ฿{(Number(previewFood.price) || 0).toLocaleString()}
              </div>
              <button
                onClick={() => { const food = previewFood; closePreview(); handleFoodClick(food); }}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: '#ffffff', border: 'none', borderRadius: '11px',
                  padding: '0.75rem 1.4rem', fontWeight: '800', fontSize: '1rem',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                  boxShadow: '0 4px 12px rgba(217,119,6,0.3)', fontFamily: 'inherit'
                }}
              >
                <Plus size={18} /> {lang === 'th' ? 'ใส่ตะกร้า' : 'Add to cart'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Order Wizard Option Modal ─── */}
      {selectedFood && (
        <OrderWizardModal
          food={selectedFood}
          lang={lang}
          liveMenu={liveMenu}
          categories={categories}
          basePrice={Number(selectedFood.price) || 0}
          askDining={false}
          hasPriceForCustomerType={(m) => !m.noTakehomePrice}
          noteOptions={kioskNoteConfig.options}
          allowCustomNote={kioskNoteConfig.allowCustom}
          customerView
          onClose={() => setSelectedFood(null)}
          onConfirm={handleConfirmWizardOrder}
        />
      )}

      {/* ─── แผงเลือกหมวดหมู่ (เปิดจากปุ่ม 3 ขีด) ─── */}
      {showCategoryMenu && (
        <div
          onClick={() => setShowCategoryMenu(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 900,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff', width: '100%', maxWidth: '480px',
              borderTopLeftRadius: '22px', borderTopRightRadius: '22px',
              padding: '1rem',
              paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))',
              maxHeight: '80dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900', color: '#0f172a' }}>
                {lang === 'th' ? 'หมวดหมู่' : 'Categories'}
              </h3>
              <button
                onClick={() => setShowCategoryMenu(false)}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <X size={18} color="#0f172a" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {menuSections.map(cat => {
                const isActive = cat.slug === activeCategory;
                // หมวดที่ไม่มีเมนูไม่ต้องโชว์ (menuSections กรองออกให้แล้ว) กดแล้วต้องเจอของเสมอ
                const count = cat.items.length;
                return (
                  <button
                    key={cat.slug}
                    onClick={() => scrollToCategory(cat.slug)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.6rem',
                      padding: '0.85rem 0.9rem', borderRadius: '13px',
                      border: `2px solid ${isActive ? '#ea580c' : '#e2e8f0'}`,
                      background: isActive ? '#fff7ed' : '#ffffff',
                      color: '#0f172a', fontWeight: '800', fontSize: '0.95rem',
                      fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left', width: '100%'
                    }}
                  >
                    <span style={{ flexShrink: 0, fontSize: '1.15rem' }}>{cat.icon}</span>
                    <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                      {cat.name}
                    </span>
                    <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#94a3b8', flexShrink: 0 }}>
                      {count}
                    </span>
                    {isActive && <CheckCircle size={17} color="#ea580c" style={{ flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── แก้ไขตัวเลือกของรายการในตะกร้า — ป๊อปอัพเดิม เปิดมาพร้อมที่เลือกไว้ ─── */}
      {editingRow && editSourceFor(editingRow) && (() => {
        const source = editSourceFor(editingRow);
        return (
          <OrderWizardModal
            key={editingRow.cartId}
            food={source}
            lang={lang}
            liveMenu={liveMenu}
            categories={categories}
            basePrice={Number(source.price) || 0}
            askDining={false}
            hasPriceForCustomerType={(m) => !m.noTakehomePrice}
            noteOptions={kioskNoteConfig.options}
            allowCustomNote={kioskNoteConfig.allowCustom}
            customerView
            initialState={editingRow.wizardState}
            confirmLabel={th ? 'บันทึกการแก้ไข' : 'Save changes'}
            onClose={() => setEditingRow(null)}
            onConfirm={handleConfirmWizardOrder}
          />
        );
      })()}
    </div>
  );
};

export default CustomerKiosk;
