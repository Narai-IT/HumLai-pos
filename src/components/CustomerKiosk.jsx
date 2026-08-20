import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ShoppingBag, ArrowLeft, CheckCircle, Smartphone, Globe, Plus, Minus, X, ChevronRight, QrCode, Sparkles, Utensils, Menu } from 'lucide-react';
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

  // ── ยืนยันการโอนด้วยตัวลูกค้าเอง ──
  // ร้านเลือกไม่ตรวจสลิปอัตโนมัติแล้ว ลูกค้าโอนตาม QR แล้วกดยืนยัน = ถือว่าชำระแล้ว
  // ต้องติ๊กช่อง "โอนแล้ว" ก่อน กันเผลอกดปุ่มโดยยังไม่ได้โอน
  const [transferConfirmed, setTransferConfirmed] = useState(false);

  // แผงเลือกหมวดหมู่ (เปิดจากปุ่ม 3 ขีด)
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);

  useEffect(() => {
    if (categories.length > 0 && !categories.some(c => c.slug === activeCategory)) {
      setActiveCategory(categories[0].slug);
    }
  }, [categories]);

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

  // ปิดหน้าชำระเงิน หรือยอดเปลี่ยน = ต้องติ๊กยืนยันการโอนใหม่
  // (ยอดที่ลูกค้ายืนยันไปแล้ว ต้องเป็นยอดเดียวกับที่ส่งเข้าครัวเสมอ)
  useEffect(() => {
    setTransferConfirmed(false);
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

  const handleAddToCartDirect = (food) => {
    const existingIndex = cart.findIndex(c => c.food.id === food.id && (!c.allPopups || c.allPopups.length === 0));
    if (existingIndex >= 0) {
      const updated = [...cart];
      updated[existingIndex].quantity += 1;
      setCart(updated);
    } else {
      setCart([...cart, {
        cartId: Date.now() + Math.random(),
        food,
        quantity: 1,
        allPopups: [],
        dining: { id: 'dine_in', name: 'ทานที่ร้าน', nameEn: 'Dine-in' }
      }]);
    }
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
    
    setCart([...cart, {
      cartId: Date.now() + Math.random(),
      food: baseFood,
      quantity: 1,
      allPopups: orderDetails.allPopups || [],
      dining: orderDetails.dining || { id: 'dine_in', name: 'ทานที่ร้าน', nameEn: 'Dine-in' }
    }]);
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

  const handleConfirmSelfPayment = async () => {
    if (cart.length === 0) return;
    if (!transferConfirmed) return; // ต้องติ๊กยืนยันว่าโอนแล้วก่อน
    if (isPaid) return;             // กดรัว ๆ ไม่ให้ส่งซ้อน
    setSendError('');
    setIsPaid(true);

    if (!paySessionRef.current) {
      paySessionRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    let result = { success: true, orderNumber: '' };
    if (onSendOrder) {
      // ระบุให้ชัดว่าลูกค้ายืนยันเอง ยังไม่ได้ตรวจสลิป — พนักงานจะได้กระทบยอดกับบัญชีร้านตอนปิดกะ
      result = (await onSendOrder(
        tableNo, cart, cartSubtotal, 'เงินโอน (QR ลูกค้ายืนยันเอง)', paySessionRef.current
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
      setTransferConfirmed(false);
      paySessionRef.current = '';
    }, 6000);
  };

  const activeCat = categories.find(c => c.slug === activeCategory) || categories[0];
  const filteredFood = liveMenu.filter(item => {
    const primary = item.category || 'food';
    const extra = Array.isArray(item.categories) ? item.categories : [];
    return primary === activeCategory || extra.includes(activeCategory);
  });

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
      <header style={{
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

      {/* ─── ปุ่มหมวดหมู่ปุ่มเดียว (3 ขีด) — กดแล้วเลือกหมวดจากรายการ ─── */}
      <div style={{ padding: '0.5rem 1rem 0.75rem' }}>
        <button
          onClick={() => setShowCategoryMenu(true)}
          style={{
            width: '100%',
            display: 'flex', alignItems: 'center', gap: '0.6rem',
            padding: '0.75rem 0.9rem', borderRadius: '14px',
            border: '2px solid #e2e8f0', background: '#ffffff',
            color: '#0f172a', fontWeight: '800', fontSize: '0.95rem',
            fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left'
          }}
        >
          <Menu size={20} color="#ea580c" />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeCat ? `${activeCat.icon || '🍲'} ${lang === 'th' ? activeCat.name : (activeCat.nameEn || activeCat.name)}` : (lang === 'th' ? 'เลือกหมวดหมู่' : 'Choose a category')}
          </span>
          <ChevronRight size={18} color="#94a3b8" style={{ transform: 'rotate(90deg)' }} />
        </button>
      </div>

      {/* ─── Large Photo Food Cards Feed ─── */}
      <main style={{ padding: '0 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span>{activeCat?.icon || '🍲'}</span>
            <span>{lang === 'th' ? activeCat?.name : activeCat?.nameEn}</span>
          </h3>
          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '700' }}>
            {filteredFood.length} {lang === 'th' ? 'รายการ' : 'items'}
          </span>
        </div>

        {/* การ์ดเมนูแบบตาราง 2 คอลัมน์ รูปเป็นสี่เหลี่ยมจัตุรัส — เห็นเมนูได้มากขึ้นต่อหนึ่งหน้าจอ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', alignItems: 'start' }}>
          {filteredFood.map(food => {
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
          })}
        </div>
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
              {categories.map(cat => {
                const isActive = cat.slug === activeCategory;
                // นับเฉพาะเมนูที่อยู่ในหมวดนั้นจริง ลูกค้าจะได้รู้ว่ากดเข้าไปแล้วมีของ
                const count = liveMenu.filter(item => {
                  const primary = item.category || 'food';
                  const extra = Array.isArray(item.categories) ? item.categories : [];
                  return primary === cat.slug || extra.includes(cat.slug);
                }).length;
                return (
                  <button
                    key={cat.slug}
                    onClick={() => { setActiveCategory(cat.slug); setShowCategoryMenu(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.6rem',
                      padding: '0.85rem 0.9rem', borderRadius: '13px',
                      border: `2px solid ${isActive ? '#ea580c' : '#e2e8f0'}`,
                      background: isActive ? '#fff7ed' : '#ffffff',
                      color: '#0f172a', fontWeight: '800', fontSize: '0.95rem',
                      fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left', width: '100%'
                    }}
                  >
                    <span style={{ flexShrink: 0, fontSize: '1.15rem' }}>{cat.icon || '🍲'}</span>
                    <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                      {lang === 'th' ? cat.name : (cat.nameEn || cat.name)}
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
                      ? 'กรุณาแจ้งพนักงานว่าชำระผ่าน QR แล้ว พร้อมแสดงสลิปจากแอปธนาคารตอนปิดโต๊ะ'
                      : 'Please tell our staff you already paid by QR, and show your bank slip when the table is closed.'}
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
                </div>

                {/* ─── ยืนยันการโอนด้วยตัวเอง (ไม่ต้องแนบสลิป) ─── */}
                <label style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.65rem',
                  background: transferConfirmed ? '#f0fdf4' : '#ffffff',
                  border: `1.5px solid ${transferConfirmed ? '#86efac' : '#cbd5e1'}`,
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
                      {lang === 'th' ? 'ฉันโอนเงินตามยอดนี้เรียบร้อยแล้ว' : 'I have completed the transfer'}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', fontWeight: '600', lineHeight: 1.45, marginTop: '0.2rem' }}>
                      {lang === 'th'
                        ? 'สแกน QR แล้วโอนตามยอดด้านบน จากนั้นติ๊กช่องนี้แล้วกดส่งออเดอร์ กรุณาเก็บสลิปไว้เผื่อพนักงานขอตรวจสอบ'
                        : 'Scan the QR and transfer the exact amount, then tick this box and send your order. Please keep your slip in case our staff needs to check.'}
                    </span>
                  </span>
                </label>

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
                  disabled={isPaid || !transferConfirmed}
                  style={{
                    width: '100%',
                    background: (!transferConfirmed || isPaid)
                      ? '#cbd5e1'
                      : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                    color: '#ffffff', border: 'none', borderRadius: '14px',
                    padding: '1rem', fontWeight: '900', fontSize: '1.1rem',
                    cursor: (isPaid || !transferConfirmed) ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                    boxShadow: (!transferConfirmed || isPaid) ? 'none' : '0 8px 20px rgba(22,163,74,0.35)',
                    fontFamily: 'inherit'
                  }}
                >
                  <CheckCircle size={22} />
                  {isPaid
                    ? (lang === 'th' ? 'กำลังส่งออเดอร์...' : 'Sending order...')
                    : transferConfirmed
                      ? (lang === 'th' ? 'ยืนยันการโอน · ส่งออเดอร์เข้าครัว' : 'Confirm transfer · Send order')
                      : (lang === 'th' ? 'ติ๊กยืนยันการโอนก่อนจึงจะส่งได้' : 'Tick the confirmation to continue')}
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
