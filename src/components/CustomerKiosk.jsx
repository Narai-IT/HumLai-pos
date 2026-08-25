import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ShoppingBag, ArrowLeft, CheckCircle, Smartphone, Globe, Plus, Minus, X, ChevronRight, QrCode, Sparkles, Utensils, Menu, Download } from 'lucide-react';
import QRCode from 'qrcode';
import { generatePromptPayPayload, generateDynamicQRFromRaw } from '../utils/promptpay';
import OrderWizardModal from './OrderWizardModal';

const CustomerKiosk = ({ liveMenu = [], categories = [], settings = {}, onSendOrder, lang: initialLang = 'th' }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tableParam = searchParams.get('table') || searchParams.get('t') || '1';
  const [tableNo, setTableNo] = useState(tableParam);

  const [lang, setLang] = useState(initialLang);
  const [activeCategory, setActiveCategory] = useState(categories[0]?.slug || 'food');
  const [cart, setCart] = useState([]);
  const [selectedFood, setSelectedFood] = useState(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [orderSentSuccess, setOrderSentSuccess] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');   // เลขบิลที่ระบบออกให้ ใช้อ้างอิงกับพนักงาน
  const [sendError, setSendError] = useState('');       // บันทึกออเดอร์ไม่สำเร็จ (ลูกค้าจ่ายไปแล้ว)
  const [needStaff, setNeedStaff] = useState(false);    // ส่งออเดอร์ได้ แต่ต้องให้พนักงานยืนยันยอดให้
  // รหัสอ้างอิงการชำระครั้งนี้ — ส่งค่าเดิมทุกครั้งที่กดส่งซ้ำ ระบบหลังบ้านจะได้ไม่ออกบิลซ้อน
  const paySessionRef = React.useRef('');

  // ── ตรวจสลิปอัตโนมัติ (SlipOK) ──
  // ลูกค้าสั่งเองต้องพิสูจน์ว่าโอนจริงตามยอดใน QR ก่อน ถึงจะส่งออเดอร์เข้าครัวได้
  const [slipPreview, setSlipPreview] = useState('');   // รูปสลิปที่เลือก (แสดงตัวอย่าง)
  const [slipChecking, setSlipChecking] = useState(false);
  const [slipResult, setSlipResult] = useState(null);   // ข้อมูลสลิปที่ผ่านการตรวจแล้ว
  const [slipError, setSlipError] = useState('');

  // ข้อความใต้ปุ่มบันทึกรูป QR ('saved' | 'error' | '')
  const [qrSaveState, setQrSaveState] = useState('');

  // ตัวตรวจสลิปใช้ไม่ได้ (ยังไม่ deploy / คีย์หมดอายุ / โควตาหมด / เน็ตร้านล่ม)
  // ลูกค้าถ่ายใหม่กี่ครั้งก็ไม่ผ่าน จึงเปิดทางให้ยืนยันเองแทน ไม่งั้นร้านเสียออเดอร์ทั้งโต๊ะ
  const [slipServiceDown, setSlipServiceDown] = useState(false);
  const [transferConfirmed, setTransferConfirmed] = useState(false);

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

  // ปิดหน้าชำระเงิน หรือยอดเปลี่ยน = ต้องตรวจสลิปใหม่
  // (ยอดที่ตรวจผ่านไปแล้ว ต้องเป็นยอดเดียวกับที่ส่งเข้าครัวเสมอ ไม่งั้นสั่งเพิ่มแล้วสลิปเดิมผ่าน)
  useEffect(() => {
    setSlipPreview('');
    setSlipResult(null);
    setSlipError('');
    setSlipServiceDown(false);
    setTransferConfirmed(false);
    setQrSaveState('');
  }, [isCheckoutOpen, cartSubtotal]);

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
  const bundledRowsFor = (food, dining) => {
    const ids = Array.isArray(food.bundledItems) ? food.bundledItems : [];
    const rows = [];
    ids.forEach((bundledId, idx) => {
      const bundledFood = liveMenu.find(m => String(m.id) === String(bundledId));
      if (!bundledFood) return;
      rows.push({
        cartId: Date.now() + Math.random() + idx,
        food: { ...bundledFood, price: 0, priceName: '', isBundled: true },
        quantity: 1,
        allPopups: [],
        dining,
        fromPopupOf: food.name
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
      plain(c) && plain(row)
    );
    if (idx >= 0) return list.map((c, i) => (i === idx ? { ...c, quantity: c.quantity + row.quantity } : c));
    return [...list, row];
  };

  const handleAddToCartDirect = (food) => {
    const dining = { id: 'dine_in', name: 'ทานที่ร้าน', nameEn: 'Dine-in' };
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

  const handleConfirmWizardOrder = (rawFood, orderDetails) => {
    const chosenPrice = orderDetails?.selectedPrice;
    const baseFood = chosenPrice ? { ...rawFood, price: Number(chosenPrice.price) || 0, priceName: chosenPrice.name } : rawFood;
    const dining = orderDetails.dining || { id: 'dine_in', name: 'ทานที่ร้าน', nameEn: 'Dine-in' };

    const rows = [{
      cartId: Date.now() + Math.random(),
      food: baseFood,
      quantity: 1,
      allPopups: orderDetails.allPopups || [],
      dining
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
        fromPopupOf: baseFood.name
      });
    });

    setCart([...rows, ...bundledRowsFor(baseFood, dining)].reduce(mergeRow, cart));
    setSelectedFood(null);
  };

  const handleUpdateQty = (cartId, delta) => {
    setCart(cart.map(item => {
      if (item.cartId === cartId) {
        const n = item.quantity + delta;
        return n > 0 ? { ...item, quantity: n } : null;
      }
      return item;
    }).filter(Boolean));
  };

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

  // ย่อรูปก่อนส่ง แต่ยังต้องคมพอให้ SlipOK อ่าน QR ในสลิปออก จึงใช้ 1400px / คุณภาพ 0.92
  const slipToDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1400;
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
        else if (height >= width && height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // ข้อความบอกสาเหตุที่สลิปไม่ผ่าน — แยกเป็น 2 กลุ่ม
  //   ก) ลูกค้าแก้เองได้ (ถ่ายใหม่ / โอนใหม่ให้ยอดตรง)
  //   ข) ปัญหาฝั่งร้าน (คีย์ผิด แพ็กเกจหมด ตั้งบัญชีผิด) → ลูกค้าถ่ายใหม่กี่ครั้งก็ไม่หาย
  // รหัสอ้างอิงจากตารางของ SlipOK — อย่าสลับ 1013 (ยอดไม่ตรง) กับ 1014 (บัญชีผู้รับไม่ใช่ของร้าน)
  const SLIP_ERRORS = {
    1000: ['ไม่พบข้อมูลในสลิป กรุณาเลือกรูปสลิปใหม่', 'No slip data found. Please pick the slip image again.'],
    1001: ['ตั้งค่าระบบตรวจสลิปของร้านไม่ถูกต้อง กรุณาแจ้งพนักงาน', 'Shop verification setup error. Please call our staff.'],
    1002: ['ระบบตรวจสลิปของร้านยังตั้งค่าไม่ถูกต้อง กรุณาแจ้งพนักงาน', 'Shop verification key error. Please call our staff.'],
    1003: ['ระบบตรวจสลิปของร้านหมดอายุ กรุณาแจ้งพนักงาน', 'The shop verification service has expired. Please call our staff.'],
    1004: ['โควตาตรวจสลิปของร้านหมด กรุณาแจ้งพนักงาน', 'The shop verification quota ran out. Please call our staff.'],
    1005: ['ไฟล์ที่เลือกไม่ใช่รูปภาพ กรุณาเลือกรูปสลิป (.jpg .png)', 'That file is not an image. Please pick a slip photo.'],
    1006: ['รูปสลิปไม่ถูกต้อง กรุณาถ่าย/เลือกใหม่', 'Invalid slip image. Please try another photo.'],
    1007: ['ไม่พบ QR ในรูปสลิป กรุณาถ่ายใหม่ให้เห็น QR ชัด ๆ', 'No QR found on the slip. Retake a clearer photo.'],
    1008: ['รูปนี้ไม่ใช่สลิปการโอนเงิน กรุณาเลือกรูปสลิปที่ถูกต้อง', 'This is not a transfer slip. Please pick the right image.'],
    1009: ['ระบบธนาคารขัดข้องชั่วคราว กรุณาลองใหม่ในอีก 15 นาที', 'The bank system is temporarily down. Please retry in 15 minutes.'],
    1010: ['ธนาคารนี้ต้องรอสักครู่หลังโอน กรุณารอ 1-2 นาทีแล้วลองใหม่', 'This bank needs a moment after transfer. Please retry shortly.'],
    1011: ['ไม่พบรายการโอนนี้ หรือสลิปหมดอายุแล้ว', 'Transfer not found or the slip has expired.'],
    1012: ['สลิปนี้ถูกใช้ยืนยันไปแล้ว กรุณาใช้สลิปของรายการนี้', 'This slip has already been used.'],
    1013: ['ยอดเงินในสลิปไม่ตรงกับยอดที่ต้องชำระ', 'Slip amount does not match the total.'],
    1014: ['บัญชีปลายทางในสลิปไม่ใช่บัญชีของร้าน กรุณาสแกน QR ในหน้านี้เท่านั้น', 'The receiving account is not the shop account. Please use the QR on this page.']
  };

  // รหัสที่แปลว่า "ฝั่งร้านมีปัญหา" — ลูกค้าทำอะไรก็ไม่ผ่าน ต้องเปิดทางยืนยันเองแทน
  const SHOP_SIDE_CODES = [1001, 1002, 1003, 1004];

  const slipErrorText = (json) => {
    const hit = SLIP_ERRORS[json && json.code];
    if (hit) return lang === 'th' ? hit[0] : hit[1];
    return (json && json.message) || (lang === 'th' ? 'ตรวจสลิปไม่สำเร็จ กรุณาลองใหม่' : 'Slip verification failed.');
  };

  const handleSlipFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;

    setSlipError('');
    setSlipResult(null);
    setSlipChecking(true);
    try {
      const dataUrl = await slipToDataUrl(file);
      setSlipPreview(dataUrl);
      const base64 = String(dataUrl).split(',')[1];

      const res = await fetch('/api/verify-slip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType: 'image/jpeg', amount: cartSubtotal })
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json && json.success && json.data) {
        // กันกรณีที่ SlipOK ไม่ได้เทียบยอดให้ — เทียบซ้ำฝั่งเราอีกชั้น
        const paid = Number(json.data.amount);
        if (!isNaN(paid) && Math.abs(paid - cartSubtotal) > 0.01) {
          setSlipError(lang === 'th'
            ? `ยอดในสลิป ฿${paid.toLocaleString()} ไม่ตรงกับยอดที่ต้องชำระ ฿${cartSubtotal.toLocaleString()}`
            : `Slip amount does not match the total.`);
        } else {
          setSlipResult(json.data);
        }
      } else {
        setSlipError(slipErrorText(json));
        // ปัญหาฝั่งร้าน หรือฟังก์ชันตรวจสลิปยังไม่พร้อม (404/500) = ตรวจอัตโนมัติใช้ไม่ได้
        if (SHOP_SIDE_CODES.includes(json && json.code) || res.status === 404 || res.status >= 500) {
          setSlipServiceDown(true);
        }
      }
    } catch (err) {
      console.error('verify slip error:', err);
      setSlipError(lang === 'th' ? 'เชื่อมต่อระบบตรวจสลิปไม่ได้ กรุณาลองใหม่' : 'Cannot reach the verification service.');
      setSlipServiceDown(true);
    }
    setSlipChecking(false);
  };

  // ส่งออเดอร์ได้เมื่อสลิปผ่าน — หรือตัวตรวจสลิปใช้ไม่ได้จริง ๆ แล้วลูกค้ายืนยันเอง
  const canSendOrder = !!slipResult || (slipServiceDown && transferConfirmed);

  const handleConfirmSelfPayment = async () => {
    if (cart.length === 0) return;
    if (!canSendOrder) return; // ต้องผ่านการตรวจสลิปก่อนเท่านั้น
    if (isPaid) return;        // กดรัว ๆ ไม่ให้ส่งซ้อน
    setSendError('');
    setIsPaid(true);

    if (!paySessionRef.current) {
      paySessionRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    let result = { success: true, orderNumber: '' };
    if (onSendOrder) {
      // เขียนวิธีชำระให้พนักงานแยกออกว่ายอดนี้ตรวจสลิปแล้ว หรือลูกค้ายืนยันเอง (ต้องกระทบยอดกับบัญชีร้านเอง)
      const payMethod = slipResult
        ? `เงินโอน (QR ตรวจสลิปแล้ว)${slipResult.transRef ? ` [${slipResult.transRef}]` : ''}`
        : 'เงินโอน (QR ลูกค้ายืนยันเอง)';
      result = (await onSendOrder(
        tableNo, cart, cartSubtotal, payMethod, paySessionRef.current
      )) || { success: true };
    }

    // ลูกค้าโอนเงินไปแล้ว ถ้าบันทึกไม่ผ่านห้ามปิดจอเงียบ ๆ — ค้างจอไว้ให้กดส่งซ้ำหรือเรียกพนักงาน
    if (result.success === false) {
      setIsPaid(false);
      setSendError(lang === 'th'
        ? 'โอนเงินเรียบร้อยแล้ว แต่ส่งออเดอร์เข้าระบบไม่สำเร็จ — กดปุ่มส่งอีกครั้ง ถ้ายังไม่ได้กรุณาแจ้งพนักงานพร้อมแสดงหน้านี้'
        : 'Your transfer went through but the order could not be sent. Please tap send again, or show this screen to our staff.');
      return;
    }

    setOrderNumber(result.orderNumber || '');
    // ระบบร้านยังบันทึกบิลอัตโนมัติไม่ได้ → ออเดอร์ถึงครัวแล้ว แต่ต้องให้พนักงานยืนยันการชำระให้
    setNeedStaff(result.needStaff === true);
    setOrderSentSuccess(true);
    setTimeout(() => {
      setCart([]);
      setIsCheckoutOpen(false);
      setIsPaid(false);
      setOrderSentSuccess(false);
      setOrderNumber('');
      setNeedStaff(false);
      setSlipPreview('');
      setSlipResult(null);
      setSlipError('');
      setSlipServiceDown(false);
      setTransferConfirmed(false);
      paySessionRef.current = '';
    }, 6000);
  };


  // ── หน้าแรกโชว์ครบทุกเมนู แยกเป็นบล็อกตามหมวด ──
  // เดิมกรองให้เห็นทีละหมวด ลูกค้าไม่รู้ว่ามีอะไรอีกบ้างถ้าไม่กดเปลี่ยนหมวด
  // ตอนนี้ไล่ดูรวดเดียวได้ ส่วนปุ่มหมวดหมู่เปลี่ยนหน้าที่เป็น "เลื่อนไปยังหมวดนั้น"
  const menuSections = useMemo(() => {
    const sections = categories.map(cat => ({
      slug: cat.slug,
      name: lang === 'th' ? cat.name : (cat.nameEn || cat.name),
      icon: cat.icon || '🍲',
      items: liveMenu.filter(item => {
        const primary = item.category || 'food';
        const extra = Array.isArray(item.categories) ? item.categories : [];
        return primary === cat.slug || extra.includes(cat.slug);
      })
    })).filter(section => section.items.length > 0);

    // เมนูที่หมวดของมันถูกลบ/เปลี่ยนชื่อไปแล้ว ต้องยังเห็นอยู่ ไม่ใช่หายไปเงียบ ๆ
    const shown = new Set(sections.flatMap(section => section.items.map(item => String(item.id))));
    const rest = liveMenu.filter(item => !shown.has(String(item.id)));
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
  const headerRef = React.useRef(null);
  const catBarRef = React.useRef(null);
  const sectionRefs = React.useRef({});
  const [headerH, setHeaderH] = useState(0);
  const [catBarH, setCatBarH] = useState(0);

  useEffect(() => {
    const measure = () => {
      setHeaderH(headerRef.current ? headerRef.current.offsetHeight : 0);
      setCatBarH(catBarRef.current ? catBarRef.current.offsetHeight : 0);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [lang, menuSections.length]);

  // หมวดที่เลือกอยู่หายไปจากเมนู (ร้านลบ/ปิดขาย) ให้กลับไปหมวดแรกที่ยังมีของ
  useEffect(() => {
    if (menuSections.length > 0 && !menuSections.some(section => section.slug === activeCategory)) {
      setActiveCategory(menuSections[0].slug);
    }
  }, [menuSections, activeCategory]);

  const scrollOffset = headerH + catBarH + 8;

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
        <div style={{ width: '100%', aspectRatio: '1 / 1', position: 'relative', background: '#f1f5f9' }}>
          <img
            src={food.image || `/images/menu/${food.id}.png`}
            alt={food.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => { e.target.src = '/images/menu/default.png'; }}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          
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
            <Plus size={16} /> {lang === 'th' ? 'สั่ง' : 'Add'}
          </button>
        </div>
      </div>
    );
  };

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
      // เผื่อที่ให้แถบตะกร้าลอย + แถบ home ของ iPhone
      paddingBottom: 'calc(110px + env(safe-area-inset-bottom))',
      WebkitTapHighlightColor: 'transparent',
      overflowX: 'hidden'
    }}>

      {/* ─── Kiosk Header (Vertical Top Sticky) ─── */}
      <header ref={headerRef} style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        // ระยะห่างและขนาดตัวอักษรยืดตามความกว้างจอ (clamp) — จอ 320px จะไม่แน่นจนชื่อร้านตกบรรทัด
        padding: 'clamp(0.6rem, 3vw, 0.85rem) clamp(0.75rem, 4vw, 1.25rem)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '0.5rem',
        boxShadow: '0 4px 15px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(0.4rem, 2vw, 0.75rem)', minWidth: 0, flex: 1 }}>
          <img src="/logo.png" alt="Logo" style={{ width: 'clamp(32px, 10vw, 42px)', height: 'clamp(32px, 10vw, 42px)', borderRadius: '12px', objectFit: 'cover', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 'clamp(0.92rem, 4.2vw, 1.15rem)', fontWeight: '800', margin: 0, color: '#0f172a', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {lang === 'th' ? 'ข้าวมันไก่หำไหล' : 'Hamlai Chicken Rice'}
            </h1>
            <span style={{ fontSize: 'clamp(0.66rem, 2.8vw, 0.78rem)', color: '#ea580c', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
              <Utensils size={12} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {lang === 'th' ? 'ระบบสั่งอาหารด้วยตนเอง' : 'Self-Ordering Kiosk'}
              </span>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
          <div style={{
            background: '#fff7ed', border: '1.5px solid #ffedd5',
            color: '#c2410c', fontWeight: '800', fontSize: 'clamp(0.72rem, 3vw, 0.85rem)',
            padding: '0.35rem 0.6rem', borderRadius: '20px', whiteSpace: 'nowrap'
          }}>
            🪑 {lang === 'th' ? `โต๊ะ ${tableNo}` : `Table ${tableNo}`}
          </div>
          <button
            onClick={() => setLang(lang === 'th' ? 'en' : 'th')}
            style={{
              background: '#f1f5f9', border: '1px solid #cbd5e1',
              borderRadius: '20px', padding: '0.35rem 0.55rem',
              color: '#0f172a', fontWeight: '700', fontSize: 'clamp(0.7rem, 3vw, 0.8rem)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px',
              whiteSpace: 'nowrap', flexShrink: 0
            }}
          >
            <Globe size={13} /> {lang === 'th' ? 'TH' : 'EN'}
          </button>
        </div>
      </header>

      {/* ─── Hero Banner ─── */}
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        color: '#ffffff', padding: '1.25rem',
        margin: '0.75rem 1rem', borderRadius: '16px',
        boxShadow: '0 8px 20px rgba(15,23,42,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div>
          <span style={{ background: '#ea580c', color: '#ffffff', fontSize: '0.7rem', fontWeight: '800', padding: '2px 8px', borderRadius: '10px', textTransform: 'uppercase' }}>
            {lang === 'th' ? 'สั่งง่าย จ่ายไว' : 'Fast Ordering'}
          </span>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '900', margin: '0.35rem 0 0.2rem 0', color: '#ffffff' }}>
            {lang === 'th' ? 'เลือกเมนูอร่อยได้เลย!' : 'Choose Your Dish!'}
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>
            {lang === 'th' ? 'สแกน QR ชำระเงินง่ายๆ ออเดอร์ตรงเข้าครัวทันที' : 'Scan QR to pay, orders sent directly to kitchen'}
          </p>
        </div>
        <Sparkles size={36} color="#f59e0b" style={{ flexShrink: 0, opacity: 0.9 }} />
      </div>

      {/* ─── แถบหมวดหมู่ (3 ขีด) — กดแล้วเลื่อนไปยังหมวดนั้นในหน้าเดียวกัน ─── */}
      <div
        ref={catBarRef}
        style={{
          position: 'sticky', top: headerH, zIndex: 95,
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

      {/* ─── Sticky Bottom Floating Cart Bar ─── */}
      {cart.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 'calc(15px + env(safe-area-inset-bottom))',
          left: '50%', transform: 'translateX(-50%)',
          width: 'calc(100% - 2rem)', maxWidth: '440px', zIndex: 90
        }}>
          <button
            onClick={() => setIsCheckoutOpen(true)}
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
                  {lang === 'th' ? 'ตะกร้าของคุณ' : 'Your Cart'}
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#ffffff' }}>
                  ฿{cartSubtotal.toLocaleString()}
                </div>
              </div>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#ffffff', fontWeight: '800', fontSize: '0.95rem',
              padding: '0.6rem 1.1rem', borderRadius: '14px',
              display: 'flex', alignItems: 'center', gap: '4px'
            }}>
              <span>{lang === 'th' ? 'ดูรายการ & ชำระเงิน' : 'Checkout'}</span>
              <ChevronRight size={18} />
            </div>
          </button>
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

      {/* ─── Self-Checkout & PromptPay QR Modal ─── */}
      {isCheckoutOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
          zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
        }} onClick={() => !isPaid && setIsCheckoutOpen(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff', width: '100%', maxWidth: '480px',
              borderTopLeftRadius: '24px', borderTopRightRadius: '24px',
              padding: '1.25rem',
              paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))',
              maxHeight: '90dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.2)', color: '#0f172a'
            }}
          >
            {orderSentSuccess ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <CheckCircle size={60} color="#16a34a" style={{ margin: '0 auto 1rem' }} />
                <h3 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#16a34a', marginBottom: '0.5rem' }}>
                  {lang === 'th' ? 'ส่งรายการอาหารเรียบร้อย!' : 'Order Sent Successfully!'}
                </h3>
                <p style={{ color: '#475569', fontSize: '0.95rem', fontWeight: '600', marginBottom: '1.5rem' }}>
                  {lang === 'th' ? 'รายการอาหารของคุณถูกส่งเข้าครัวเรียบร้อยแล้ว พนักงานกำลังจัดเตรียมอาหารให้ครับ' : 'Your order has been sent to the kitchen. We will prepare your meal shortly!'}
                </p>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '1rem', color: '#166534', fontWeight: '700' }}>
                  🪑 {lang === 'th' ? `โต๊ะ ${tableNo}` : `Table ${tableNo}`} · {lang === 'th' ? 'ยอดชำระ' : 'Paid'} ฿{cartSubtotal.toLocaleString()}
                  {orderNumber && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.95rem', letterSpacing: '0.5px' }}>
                      🧾 {lang === 'th' ? 'เลขที่บิล' : 'Bill no.'} <strong>{orderNumber}</strong>
                    </div>
                  )}
                  <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', fontWeight: '600', opacity: 0.85 }}>
                    {lang === 'th' ? 'ชำระเรียบร้อยแล้ว ไม่ต้องจ่ายซ้ำที่เคาน์เตอร์' : 'Already paid — no need to pay again at the counter.'}
                  </div>
                </div>
                {needStaff && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '0.85rem 1rem', color: '#92400e', fontWeight: '700', fontSize: '0.85rem', marginTop: '0.75rem', lineHeight: 1.5 }}>
                    ⚠️ {lang === 'th'
                      ? 'กรุณาแจ้งพนักงานว่าชำระผ่าน QR แล้ว พร้อมแสดงสลิปนี้ตอนปิดโต๊ะ'
                      : 'Please tell our staff you already paid by QR and show this slip when the table is closed.'}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShoppingBag color="#ea580c" size={22} />
                    {lang === 'th' ? 'สรุปรายการ & ชำระเงิน' : 'Checkout & Self-Payment'}
                  </h3>
                  <button onClick={() => setIsCheckoutOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    <X size={24} color="#0f172a" />
                  </button>
                </div>

                {/* Cart items list preview */}
                <div style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {cart.map(item => (
                    <div key={item.cartId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <div>
                        <div style={{ fontWeight: '800', fontSize: '0.92rem', color: '#0f172a' }}>
                          {lang === 'th' ? item.food.name : (item.food.nameEn || item.food.name)}
                        </div>
                        {item.allPopups && item.allPopups.length > 0 && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {item.allPopups.map(p => p.name).join(', ')}
                          </div>
                        )}
                        {/* รายการที่แยกออกมาจากป๊อปอัพของอีกจาน */}
                        {item.fromPopupOf && (
                          <div style={{ fontSize: '0.72rem', color: '#1d4ed8', fontWeight: 700 }}>
                            {lang === 'th' ? `พ่วงกับ ${item.fromPopupOf}` : `with ${item.fromPopupOf}`}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '1px' }}>
                          <button onClick={() => handleUpdateQty(item.cartId, -1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', color: '#0f172a' }}><Minus size={14} /></button>
                          <span style={{ fontWeight: '800', fontSize: '0.85rem', padding: '0 4px', color: '#0f172a' }}>{item.quantity}</span>
                          <button onClick={() => handleUpdateQty(item.cartId, 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', color: '#0f172a' }}><Plus size={14} /></button>
                        </div>
                        <span style={{ fontWeight: '800', color: '#ea580c', fontSize: '0.95rem' }}>
                          ฿{((Number(item.food.price) + item.allPopups.reduce((s, p) => s + (Number(p.price) || 0), 0)) * item.quantity).toLocaleString()}
                        </span>
                      </div>
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

                {/* ─── ขั้นตอนบังคับ: แนบสลิปให้ระบบตรวจก่อน ─── */}
                <div style={{
                  background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '16px',
                  padding: '1rem', marginBottom: '1rem'
                }}>
                  <div style={{ fontWeight: '900', fontSize: '0.95rem', color: '#0f172a', marginBottom: '0.15rem' }}>
                    {lang === 'th' ? 'แนบสลิปเพื่อยืนยันการโอน' : 'Attach your transfer slip'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600', marginBottom: '0.75rem', lineHeight: 1.45 }}>
                    {lang === 'th'
                      ? 'สแกน QR แล้วโอนตามยอด (ยอดถูกใส่มาให้ใน QR แล้ว ไม่ต้องพิมพ์เอง) จากนั้นถ่ายรูปหรือเลือกสลิปจากเครื่อง ระบบจะตรวจให้อัตโนมัติภายในไม่กี่วินาที'
                      : 'Pay with the QR above (the amount is already filled in), then upload the slip. It is verified automatically in a few seconds.'}
                  </div>

                  {slipPreview && (
                    <img
                      src={slipPreview}
                      alt="slip"
                      style={{
                        width: '100%', maxHeight: '200px', objectFit: 'contain',
                        borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '0.65rem', background: '#f8fafc'
                      }}
                    />
                  )}

                  {!slipResult && (
                    <label
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                        border: '2px dashed #cbd5e1', borderRadius: '12px',
                        padding: '0.9rem', cursor: slipChecking ? 'wait' : 'pointer',
                        color: '#0f172a', fontWeight: '800', fontSize: '0.9rem',
                        background: slipChecking ? '#f1f5f9' : '#ffffff'
                      }}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        disabled={slipChecking}
                        onChange={handleSlipFile}
                        style={{ display: 'none' }}
                      />
                      {slipChecking
                        ? (lang === 'th' ? '⏳ กำลังตรวจสลิป...' : '⏳ Verifying slip...')
                        : (slipPreview
                            ? (lang === 'th' ? '🔄 เลือกสลิปใหม่' : '🔄 Choose another slip')
                            : (lang === 'th' ? '📎 เลือก / ถ่ายรูปสลิป' : '📎 Upload slip photo'))}
                    </label>
                  )}

                  {slipError && (
                    <div style={{
                      marginTop: '0.65rem', background: '#fef2f2', border: '1px solid #fecaca',
                      color: '#b91c1c', borderRadius: '10px', padding: '0.65rem 0.75rem',
                      fontSize: '0.82rem', fontWeight: '700', lineHeight: 1.45
                    }}>
                      ❌ {slipError}
                    </div>
                  )}

                  {slipResult && (
                    <div style={{
                      background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '12px',
                      padding: '0.75rem 0.85rem', fontSize: '0.82rem', color: '#166534', fontWeight: '700', lineHeight: 1.6
                    }}>
                      <div style={{ fontWeight: '900', fontSize: '0.9rem', marginBottom: '0.2rem' }}>
                        ✅ {lang === 'th' ? 'ตรวจสลิปผ่านแล้ว' : 'Slip verified'}
                      </div>
                      <div>{lang === 'th' ? 'ยอดที่โอน' : 'Amount'}: ฿{Number(slipResult.amount || 0).toLocaleString()}</div>
                      {slipResult.sendingBank && <div>{lang === 'th' ? 'ธนาคารต้นทาง' : 'From bank'}: {slipResult.sendingBank}</div>}
                      {slipResult.transDate && <div>{lang === 'th' ? 'เวลาโอน' : 'Time'}: {slipResult.transDate} {slipResult.transTime || ''}</div>}
                      {slipResult.transRef && <div style={{ fontSize: '0.72rem', opacity: 0.8 }}>Ref: {slipResult.transRef}</div>}
                    </div>
                  )}
                </div>

                {/* ─── ตัวตรวจสลิปใช้ไม่ได้ → ให้ยืนยันเองแทน ไม่งั้นลูกค้าโอนแล้วส่งออเดอร์ไม่ได้เลย ─── */}
                {slipServiceDown && !slipResult && (
                  <label style={{
                    display: 'flex', alignItems: 'flex-start', gap: '0.65rem',
                    background: transferConfirmed ? '#f0fdf4' : '#fffbeb',
                    border: `1.5px solid ${transferConfirmed ? '#86efac' : '#fde68a'}`,
                    borderRadius: '16px', padding: '1rem', marginBottom: '1rem', cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={transferConfirmed}
                      onChange={e => setTransferConfirmed(e.target.checked)}
                      style={{ width: '22px', height: '22px', marginTop: '2px', accentColor: '#16a34a', flexShrink: 0 }}
                    />
                    <span>
                      <span style={{ display: 'block', fontWeight: '900', fontSize: '0.95rem', color: '#0f172a' }}>
                        {lang === 'th' ? 'ตรวจสลิปอัตโนมัติไม่ได้ตอนนี้ — ฉันโอนตามยอดนี้แล้ว' : 'Auto-check unavailable — I have completed the transfer'}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.78rem', color: '#92400e', fontWeight: '600', lineHeight: 1.45, marginTop: '0.2rem' }}>
                        {lang === 'th'
                          ? 'ติ๊กช่องนี้เพื่อส่งออเดอร์ต่อได้ กรุณาเก็บสลิปไว้แสดงพนักงานตอนปิดโต๊ะ'
                          : 'Tick this to send your order anyway. Please keep the slip to show our staff.'}
                      </span>
                    </span>
                  </label>
                )}

                {sendError && (
                  <div style={{
                    background: '#fef2f2', border: '1.5px solid #fecaca', color: '#b91c1c',
                    borderRadius: '12px', padding: '0.85rem 1rem', marginBottom: '0.75rem',
                    fontSize: '0.85rem', fontWeight: '700', lineHeight: 1.5
                  }}>
                    ⚠️ {sendError}
                  </div>
                )}

                <button
                  onClick={handleConfirmSelfPayment}
                  disabled={isPaid || !canSendOrder}
                  style={{
                    width: '100%',
                    background: (!canSendOrder || isPaid)
                      ? '#cbd5e1'
                      : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                    color: '#ffffff', border: 'none', borderRadius: '14px',
                    padding: '1rem', fontWeight: '900', fontSize: '1.1rem',
                    cursor: (isPaid || !canSendOrder) ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                    boxShadow: (!canSendOrder || isPaid) ? 'none' : '0 8px 20px rgba(22,163,74,0.35)',
                    fontFamily: 'inherit'
                  }}
                >
                  <CheckCircle size={22} />
                  {isPaid
                    ? (lang === 'th' ? 'กำลังส่งออเดอร์...' : 'Sending order...')
                    : canSendOrder
                      ? (lang === 'th' ? 'ส่งออเดอร์เข้าครัว' : 'Send order to kitchen')
                      : slipServiceDown
                        ? (lang === 'th' ? 'ติ๊กยืนยันการโอนก่อนจึงจะส่งได้' : 'Tick the confirmation to continue')
                        : (lang === 'th' ? 'แนบสลิปก่อนจึงจะส่งออเดอร์ได้' : 'Attach a slip to continue')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerKiosk;
