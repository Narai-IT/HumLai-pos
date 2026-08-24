import React, { useState, useEffect } from 'react';
import { X, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { resolvePopupSource, getPriceOptions, hasOwnPopupSteps } from '../utils/popupConfig';

const DINING_OPTIONS = [
  { id: 'dine_in', name: 'ทานที่ร้าน', nameEn: 'Dine-in' },
  { id: 'takeaway', name: 'ห่อกลับบ้าน', nameEn: 'Takeaway' }
];

// ชื่อราคาที่เป็น "ช่องทางขาย" ไม่ใช่ขนาด/ตัวเลือกของเมนู
// แยกออกจากขั้นตอนเลือกราคา เพราะช่องทางถูกกำหนดจากหัวตะกร้าและปุ่มห่อกลับอยู่แล้ว
const TAKEHOME_ALIASES = ['takehome', 'take home', 'takeaway', 'ห่อกลับบ้าน', 'กลับบ้าน', 'ห่อกลับ'];
const DELI_ALIASES = ['deli', 'delivery', 'เดลิเวอรี่', 'lineman', 'grab', 'shopee'];
const norm = (v) => String(v || '').trim().toLowerCase();
// ความลึกสูงสุดของป๊อปอัพซ้อนป๊อปอัพ — กันการตั้งค่าที่วนหากันเองจนซ้อนไม่รู้จบ
const MAX_POPUP_DEPTH = 3;
const isChannelPrice = (name) => TAKEHOME_ALIASES.includes(norm(name)) || DELI_ALIASES.includes(norm(name));

const OrderWizardModal = ({ food, onClose, onConfirm, lang = 'th', liveMenu = [], categories = [], basePrice = 0, askDining = true, depth = 0, ancestorIds = [] }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [selectedPopup1, setSelectedPopup1] = useState({});
  const [selectedPopup2, setSelectedPopup2] = useState({});
  const [selectedPopup3, setSelectedPopup3] = useState({});
  const [selectedPopup4, setSelectedPopup4] = useState({});
  const [selectedPopup5, setSelectedPopup5] = useState({});
  const [selectedPopup6, setSelectedPopup6] = useState({});
  const [selectedDining, setSelectedDining] = useState(DINING_OPTIONS[0]);
  // ตัวเลือกย่อยของแต่ละครั้งที่เลือก (ป๊อปอัพซ้อนป๊อปอัพ)
  // รูปแบบ: { [popupNum]: { [itemId]: [ { selectedPrice, allPopups }, ... ] } }
  const [subOptions, setSubOptions] = useState({});
  // เมนูในป๊อปอัพที่กำลังเปิดป๊อปอัพของตัวเองอยู่
  const [nestedPending, setNestedPending] = useState(null);

  const allPriceOptions = getPriceOptions(food);
  // ราคาที่ให้เลือกในขั้นตอน "เลือกราคา/ขนาด" = ตัดราคาช่องทางขาย (Takehome/Deli) ออก
  const priceOptions = allPriceOptions.filter(o => !isChannelPrice(o.name));
  const hasMultiplePrices = priceOptions.length > 1;
  // ราคาห่อกลับบ้านของเมนูนี้ (ถ้าตั้งไว้) — ใช้ตอนลูกค้าเลือกห่อกลับ
  const takehomePrice = allPriceOptions.find(o => TAKEHOME_ALIASES.includes(norm(o.name)));

  const [selectedPrice, setSelectedPrice] = useState(() => {
    const opts = priceOptions.length > 0 ? priceOptions : allPriceOptions;
    const match = opts.find(o => Number(o.price) === Number(basePrice));
    return match || opts[0];
  });

  const isDrink = !!food && food.category === 'drink';
  const categoryConfig = food ? resolvePopupSource(food, categories) : {};

  // อ่านค่าตั้งของป๊อปอัพลำดับที่ n จากเมนู (หรือหมวดหมู่ ถ้าเมนูยังไม่ได้ตั้งเอง)
  const resolvePopupConfig = (n) => {
    const slug = categoryConfig[`popup${n}Category`];
    const slugs = slug ? [slug] : [];

    const namesTh = slugs.map(s => categories.find(cat => cat.slug === s)?.name).filter(Boolean).join(', ') || 'ตัวเลือกเพิ่มเติม';
    const namesEn = slugs.map(s => categories.find(cat => cat.slug === s)?.nameEn).filter(Boolean).join(', ') || 'Extra Options';

    let items = liveMenu.filter(m => slugs.includes(m.category));
    const onlyIds = categoryConfig[`popup${n}Items`];
    if (onlyIds && onlyIds.length > 0) {
      items = items.filter(m => onlyIds.includes(m.id));
    }

    const isFree = categoryConfig[`popup${n}Free`] === true;
    items = items.map(m => ({ ...m, price: isFree ? 0 : m.price }));

    return {
      namesTh,
      namesEn,
      items,
      minSelect: categoryConfig[`popup${n}Min`] || 0,
      maxSelect: categoryConfig[`popup${n}Max`] || 0,
      itemsMaxMap: categoryConfig[`popup${n}ItemsMax`] || {},
      allowRepeat: categoryConfig[`popup${n}AllowRepeat`] !== false,
      isFree,
      // แยกเป็นรายการของตัวเองในบิล/ใบครัว แทนที่จะเป็นตัวเลือกใต้เมนูหลัก
      // ไม่ได้ตั้งค่าไว้ = แยก (ค่าตั้งต้น) ต้องติ๊กออกเองถ้าอยากให้เป็นตัวเลือกห้อยใต้เมนูหลัก
      separate: categoryConfig[`popup${n}Separate`] !== false
    };
  };

  const pop1Config = resolvePopupConfig(1);
  const pop2Config = resolvePopupConfig(2);
  const pop3Config = resolvePopupConfig(3);
  const pop4Config = resolvePopupConfig(4);
  const pop5Config = resolvePopupConfig(5);
  const pop6Config = resolvePopupConfig(6);

  // ── ตารางรวมของแต่ละขั้นตอนป๊อปอัพ (1..6) ─────────────────
  const stepConfigs = { 1: pop1Config, 2: pop2Config, 3: pop3Config, 4: pop4Config, 5: pop5Config, 6: pop6Config };
  const stepQtyMaps = { 1: selectedPopup1, 2: selectedPopup2, 3: selectedPopup3, 4: selectedPopup4, 5: selectedPopup5, 6: selectedPopup6 };
  const stepSetters = { 1: setSelectedPopup1, 2: setSelectedPopup2, 3: setSelectedPopup3, 4: setSelectedPopup4, 5: setSelectedPopup5, 6: setSelectedPopup6 };

  const getQty = (qtyMap, id) => qtyMap[id] || 0;
  const totalQty = (qtyMap) => Object.values(qtyMap).reduce((s, v) => s + v, 0);

  // ตัวเลือกย่อยของเมนูที่เลือกไว้ในขั้นตอนนี้ (แต่ละครั้งที่เลือกเก็บแยกกัน)
  const getSubList = (stepNum, itemId) => ((subOptions[stepNum] || {})[itemId] || []);

  // สรุปชื่อของตัวเลือกย่อย รวมรายการซ้ำเป็นจำนวน เช่น "ชีส ×2"
  const groupSubs = (subs) => {
    const grouped = [];
    subs.forEach(sub => {
      const found = grouped.find(g => g.name === sub.name);
      if (found) found.count += 1;
      else grouped.push({ name: sub.name, nameEn: sub.nameEn || sub.name, count: 1 });
    });
    return grouped;
  };

  const subLabel = (details, useTh = true) => {
    if (!details) return '';
    const parts = [];
    if (details.selectedPrice && details.selectedPrice.name) parts.push(details.selectedPrice.name);
    groupSubs(details.allPopups || []).forEach(g => {
      const name = useTh ? g.name : g.nameEn;
      parts.push(g.count > 1 ? `${name} ×${g.count}` : name);
    });
    return parts.join(', ');
  };

  // เมนูในป๊อปอัพที่ถูกเลือก 1 ครั้ง → รายการหลัก + ตัวเลือกย่อยจากป๊อปอัพซ้อน เรียงต่อกันแบบแบนราบ
  // ชื่อของทุกรายการยังเป็นชื่อเมนูจริง บิล/ใบครัว/รายงานจึงจับคู่ชื่อได้เหมือนเดิม
  // ส่วนความสัมพันธ์ "อยู่ใต้รายการไหน" เก็บไว้ที่ parentPopupId / subPopups
  const buildEntries = (item, details) => {
    if (!details) return [item];
    const subs = details.allPopups || [];
    const chosen = details.selectedPrice;
    const suffix = [chosen && chosen.name ? chosen.name : '', ...subs.map(sub => sub.id)].filter(Boolean).join('+');
    const parentId = suffix ? `${item.id}__${suffix}` : item.id;
    const parent = {
      ...item,
      id: parentId,
      baseId: item.baseId || item.id,
      price: chosen ? (Number(chosen.price) || 0) : (Number(item.price) || 0),
      priceName: chosen ? (chosen.name || '') : (item.priceName || ''),
      selectedPrice: chosen || null,
      subPopups: subs
    };
    const entries = [parent];
    // ชื่อราคา/ขนาดที่เลือก แสดงเป็นบรรทัดตัวเลือก (ราคาถูกคิดไว้ที่รายการหลักแล้ว)
    if (chosen && chosen.name) {
      entries.push({
        id: `${parentId}__price`, name: chosen.name, nameEn: chosen.name, price: 0,
        parentPopupId: parentId, isNestedOption: true, isOptionLabel: true
      });
    }
    subs.forEach(sub => entries.push({ ...sub, parentPopupId: parentId, isNestedOption: true }));
    return entries;
  };

  const expandStep = (stepNum, config, qtyMap) => {
    const result = [];
    config.items.forEach(item => {
      const q = qtyMap[item.id] || 0;
      const picks = getSubList(stepNum, item.id);
      for (let i = 0; i < q; i++) result.push(...buildEntries(item, picks[i]));
    });
    return result;
  };

  // ราคารวมของการเลือก 1 ครั้ง (รายการหลัก + ตัวเลือกย่อย) — ใช้โชว์บนการ์ด
  const instanceTotal = (item, details) =>
    buildEntries(item, details).reduce((sum, entry) => sum + (Number(entry.price) || 0), 0);

  const perItemMaxOf = (config, itemId) => (config.allowRepeat === false ? 1 : ((config.itemsMaxMap || {})[itemId] || 0));

  const canAddMore = (config, qtyMap, itemId) => {
    if (config.maxSelect > 0 && totalQty(qtyMap) >= config.maxSelect) return false;
    const perItemMax = perItemMaxOf(config, itemId);
    if (perItemMax > 0 && getQty(qtyMap, itemId) >= perItemMax) return false;
    return true;
  };

  // กันวนซ้ำไม่รู้จบ: เมนูที่เป็นต้นทางของป๊อปอัพอยู่แล้ว หรือซ้อนลึกเกินไป จะไม่เปิดซ้อนอีก
  const chain = [...ancestorIds, food && food.id].filter(v => v !== undefined && v !== null).map(String);
  const canOpenNested = (item) =>
    depth < MAX_POPUP_DEPTH && hasOwnPopupSteps(item) && !chain.includes(String(item.id));

  // เลือกเมนูในป๊อปอัพ — ถ้าเมนูนั้นมีป๊อปอัพของตัวเอง ให้เปิดป๊อปอัพซ้อนขึ้นมาก่อน
  const handlePick = (stepNum, config, item) => {
    const qtyMap = stepQtyMaps[stepNum];
    if (!canAddMore(config, qtyMap, item.id)) return;
    if (canOpenNested(item)) {
      // ป๊อปอัพที่ตั้งเป็น "ฟรี" ไม่ควรให้เลือกราคาซ้อนเข้ามา
      const nestedFood = config.isFree ? { ...item, prices: [], price: 0 } : item;
      setNestedPending({ stepNum, item, food: nestedFood });
      return;
    }
    stepSetters[stepNum](prev => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }));
  };

  // ยืนยันตัวเลือกย่อยจากป๊อปอัพซ้อน = นับเป็นการเลือกเมนูนั้น 1 ครั้ง พร้อมตัวเลือกของครั้งนั้น
  const handleNestedConfirm = (nestedFood, details) => {
    if (!nestedPending) return;
    const { stepNum, item } = nestedPending;
    stepSetters[stepNum](prev => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }));
    setSubOptions(prev => {
      const stepMap = { ...(prev[stepNum] || {}) };
      stepMap[item.id] = [...(stepMap[item.id] || []), details];
      return { ...prev, [stepNum]: stepMap };
    });
    setNestedPending(null);
  };

  const removeQty = (stepNum, id) => {
    const qtyMap = stepQtyMaps[stepNum];
    const current = getQty(qtyMap, id);
    if (current <= 0) return;
    const next = { ...qtyMap, [id]: current - 1 };
    if (next[id] === 0) delete next[id];
    stepSetters[stepNum](next);
    // ตัดตัวเลือกย่อยของครั้งล่าสุดออกไปด้วย
    setSubOptions(prev => {
      const stepMap = { ...(prev[stepNum] || {}) };
      const list = stepMap[id];
      if (!list || list.length === 0) return prev;
      const trimmed = list.slice(0, -1);
      if (trimmed.length === 0) delete stepMap[id];
      else stepMap[id] = trimmed;
      return { ...prev, [stepNum]: stepMap };
    });
  };

  const clearStep = (stepNum) => {
    stepSetters[stepNum]({});
    setSubOptions(prev => ({ ...prev, [stepNum]: {} }));
  };

  const validSteps = [
    hasMultiplePrices ? 'price' : null,
    categoryConfig.hasPopup1 === true ? 1 : null,
    categoryConfig.hasPopup2 === true ? 2 : null,
    categoryConfig.hasPopup3 === true ? 3 : null,
    categoryConfig.hasPopup4 === true ? 4 : null,
    categoryConfig.hasPopup5 === true ? 5 : null,
    categoryConfig.hasPopup6 === true ? 6 : null,
    (askDining && !isDrink && categoryConfig.hasDining !== false) ? 7 : null
  ].filter(s => s !== null);

  const step = validSteps[currentStepIndex] || 1;
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === validSteps.length - 1;

  useEffect(() => {
    if (validSteps.length === 0) {
      handleSubmit();
    }
  }, [validSteps.length]);

  if (!food) return null;

  const handleNext = () => {
    const checkStep = (stepNum, config, selected) => {
      if (step === stepNum && config.minSelect > 0 && totalQty(selected) < config.minSelect) {
        alert(lang === 'th' ? `กรุณาเลือกอย่างน้อย ${config.minSelect} รายการในตัวเลือกนี้ครับ` : `Please select at least ${config.minSelect} items.`);
        return false;
      }
      return true;
    };

    if (!checkStep(1, pop1Config, selectedPopup1)) return;
    if (!checkStep(2, pop2Config, selectedPopup2)) return;
    if (!checkStep(3, pop3Config, selectedPopup3)) return;
    if (!checkStep(4, pop4Config, selectedPopup4)) return;
    if (!checkStep(5, pop5Config, selectedPopup5)) return;
    if (!checkStep(6, pop6Config, selectedPopup6)) return;

    if (!isLastStep) setCurrentStepIndex(currentStepIndex + 1);
  };

  const handlePrev = () => {
    if (!isFirstStep) setCurrentStepIndex(currentStepIndex - 1);
  };

  // ตัวเลือกที่อยู่ใต้เมนูหลัก (ป๊อปอัพที่ไม่ได้ตั้งให้แยกรายการ)
  const getExpandedPopups = () => [1, 2, 3, 4, 5, 6]
    .filter(n => !stepConfigs[n].separate)
    .flatMap(n => expandStep(n, stepConfigs[n], stepQtyMaps[n]));

  // ป๊อปอัพที่ตั้งไว้ว่า "แยกเป็นรายการต่างหาก" — ออกเป็นรายการของตัวเองในบิล/ใบครัว
  // รายการหลักคือตัวเมนูที่เลือก ส่วนตัวเลือกย่อยของมัน (จากป๊อปอัพซ้อน) ห้อยไว้ใต้รายการนั้น
  // ถ้าป๊อปอัพซ้อนข้างในก็ตั้งให้แยกไว้ด้วย ต้องดันรายการนั้นขึ้นมาเป็นรายการของบิลเหมือนกัน
  const getSeparateItems = () => {
    const rows = [];
    [1, 2, 3, 4, 5, 6].forEach(n => {
      const config = stepConfigs[n];
      const qtyMap = stepQtyMaps[n];
      config.items.forEach(item => {
        const q = qtyMap[item.id] || 0;
        const picks = getSubList(n, item.id);
        for (let i = 0; i < q; i++) {
          const details = picks[i];
          if (config.separate) {
            const entries = buildEntries(item, details);
            rows.push({ food: entries[0], options: entries.slice(1) });
          }
          if (details && Array.isArray(details.separateItems)) rows.push(...details.separateItems);
        }
      });
    });
    return rows;
  };

  const diningAsked = validSteps.indexOf(7) !== -1;
  const isTakeaway = diningAsked && selectedDining.id === 'takeaway';

  // ราคาฐานที่จะใช้จริง — เลือกห่อกลับบ้านแล้วเมนูมีราคา Takehome ตั้งไว้ ให้คิดราคานั้นแทน
  const effectivePrice = () => {
    if (isTakeaway && takehomePrice) return takehomePrice;
    if (hasMultiplePrices) return selectedPrice;
    return null; // ไม่ระบุ = ใช้ราคาตามที่หน้าขายส่งมา (basePrice)
  };

  const currentTotal = () => {
    const chosen = effectivePrice();
    let total = chosen ? (Number(chosen.price) || 0) : (Number(basePrice) || Number(food?.price) || 0);
    getExpandedPopups().forEach(a => { total += Number(a.price) || 0; });
    // รายการที่แยกออกไปยังอยู่ในบิลเดียวกัน ยอดรวมชั่วคราวจึงต้องนับด้วย
    getSeparateItems().forEach(row => {
      total += Number(row.food.price) || 0;
      row.options.forEach(o => { total += Number(o.price) || 0; });
    });
    return total;
  };

  const handleSubmit = () => {
    onConfirm(food, {
      selectedPrice: effectivePrice(),
      allPopups: getExpandedPopups(),
      separateItems: getSeparateItems(),
      dining: isDrink ? { id: 'drink', name: 'เครื่องดื่ม', nameEn: 'Drinks' } : selectedDining
    });
  };

  const renderPopupStep = (stepNum, config, qtyMap) => {
    const total = totalQty(qtyMap);
    const atMax = config.maxSelect > 0 && total >= config.maxSelect;
    return (
      <div className="wizard-step">
        <h3 className="step-title" style={{ color: '#0f172a', fontWeight: '800' }}>{lang === 'th' ? `เลือก ${config.namesTh}` : `Select ${config.namesEn}`}</h3>
        {config.separate && (
          <div style={{
            display: 'inline-block', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8',
            borderRadius: '999px', padding: '0.15rem 0.6rem', fontSize: '0.72rem', fontWeight: 800, marginBottom: '0.35rem'
          }}>
            {lang === 'th' ? 'รายการที่เลือกจะแยกเป็นรายการของตัวเองในบิล/ใบครัว' : 'Picks here become their own order lines'}
          </div>
        )}
        <p className="step-desc" style={{ color: '#475569', fontWeight: '600' }}>
          {lang === 'th' ? (
            <>
              {config.minSelect > 0 ? `ต้องเลือกอย่างน้อย ${config.minSelect} รายการ` : 'เลือกเพิ่มเติมได้ตามต้องการ'}
              {config.maxSelect > 0 ? ` (สูงสุด ${config.maxSelect} รายการ)` : ''}
              {` — เลือกแล้ว ${total} รายการ`}
            </>
          ) : (
            <>
              {config.minSelect > 0 ? `Min ${config.minSelect}` : 'Optional'}
              {config.maxSelect > 0 ? `, Max ${config.maxSelect}` : ''}
              {` — Selected: ${total}`}
            </>
          )}
        </p>
        <div className="options-grid">
          {config.minSelect === 0 && config.items.length > 0 && (
            <div
              className={`option-card ${total === 0 ? 'selected' : ''}`}
              style={{ background: total === 0 ? '#fff7ed' : '#ffffff', border: `2px solid ${total === 0 ? '#ea580c' : '#cbd5e1'}` }}
              onClick={() => clearStep(stepNum)}
            >
              <div className="option-name" style={{ color: '#0f172a', fontWeight: '700' }}>{lang === 'th' ? 'ไม่รับ (ข้าม)' : 'No Thanks'}</div>
              <div className="option-price" style={{ color: '#64748b' }}>-</div>
            </div>
          )}
          {config.items.length > 0 ? config.items.map(addon => {
            const qty = getQty(qtyMap, addon.id);
            const perItemMax = perItemMaxOf(config, addon.id);
            const itemAtMax = perItemMax > 0 && qty >= perItemMax;
            const cardDisabled = (atMax && qty === 0) || itemAtMax;
            const isSelected = qty > 0;
            // เมนูตัวเลือกที่มีป๊อปอัพของตัวเอง = กดแล้วเปิดป๊อปอัพซ้อนให้เลือกต่อ
            const nested = canOpenNested(addon);
            const addonDesc = lang === 'th'
              ? addon.description
              : (addon.descriptionEn || addon.description);
            const picks = getSubList(stepNum, addon.id);
            return (
              <div
                key={addon.id}
                className={`option-card ${isSelected ? 'selected' : ''}`}
                style={{
                  position: 'relative', cursor: cardDisabled ? 'default' : 'pointer', opacity: cardDisabled ? 0.5 : 1,
                  background: isSelected ? '#fff7ed' : '#ffffff',
                  border: `2px solid ${isSelected ? '#ea580c' : '#cbd5e1'}`
                }}
                onClick={() => handlePick(stepNum, config, addon)}
              >
                {qty > 0 && (
                  <div
                    style={{
                      position: 'absolute', top: '-10px', right: '-10px',
                      display: 'flex', alignItems: 'center',
                      background: '#0f172a',
                      borderRadius: '20px', overflow: 'hidden',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                      zIndex: 10, border: '1px solid #cbd5e1'
                    }}
                  >
                    <div
                      onClick={e => { e.stopPropagation(); removeQty(stepNum, addon.id); }}
                      style={{
                        background: '#ef4444', color: 'white',
                        width: '22px', height: '22px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >−</div>
                    <div style={{
                      color: 'white', fontWeight: 'bold', fontSize: '0.8rem',
                      padding: '0 6px', minWidth: '18px', textAlign: 'center'
                    }}>{qty}</div>
                  </div>
                )}
                <div className="option-name" style={{ color: '#0f172a', fontWeight: '700' }}>
                  {lang === 'th' ? addon.name : addon.nameEn}
                  {nested && (
                    <span style={{ marginLeft: '0.35rem', fontSize: '0.65rem', fontWeight: 800, color: '#c2410c', background: '#ffedd5', borderRadius: '999px', padding: '0.1rem 0.4rem', whiteSpace: 'nowrap' }}>
                      {lang === 'th' ? 'มีตัวเลือกย่อย' : 'has options'}
                    </span>
                  )}
                </div>
                {/* รายละเอียดเมนู — คนละบรรทัดกับชื่อ ตัวเล็กกว่า */}
                {addonDesc && <div className="option-desc">{addonDesc}</div>}
                {/* ตัวเลือกย่อยที่เลือกไว้ของแต่ละครั้ง */}
                {picks.length > 0 && (
                  <div style={{ marginTop: '2px', textAlign: 'left' }}>
                    {picks.map((details, pi) => {
                      const label = subLabel(details, lang === 'th');
                      return (
                        <div key={pi} style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 600, lineHeight: 1.35 }}>
                          ↳ {label || (lang === 'th' ? 'ไม่มีตัวเลือกเพิ่ม' : 'no extras')}
                          <span style={{ color: '#ea580c', fontWeight: 800, marginLeft: '0.25rem' }}>
                            ฿{instanceTotal(addon, details).toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="option-price" style={{ color: addon.price > 0 ? '#ea580c' : '#16a34a', fontWeight: '800' }}>
                  {/* ป๊อปอัพที่แยกรายการ = เป็นจานของตัวเอง จึงโชว์ราคาเต็มของรายการนั้น (ฟรีก็เป็น ฿0)
                      ส่วนป๊อปอัพที่เป็นตัวเลือกใต้เมนูหลัก ยังโชว์เป็นส่วนที่บวกเพิ่ม (+฿) เหมือนเดิม */}
                  {config.separate
                    ? (addon.price > 0 ? `฿${addon.price}` : (lang === 'th' ? 'ฟรี ฿0' : 'Free ฿0'))
                    : (addon.price > 0 ? `+฿${addon.price}` : '')}
                  {nested && addon.price <= 0 && picks.length === 0 && !config.separate ? (lang === 'th' ? 'กดเพื่อเลือก' : 'tap to choose') : ''}
                </div>
              </div>
            );
          }) : (
            <p style={{ color: '#64748b', gridColumn: '1 / -1', textAlign: 'center', fontWeight: '600' }}>
              {lang === 'th' ? 'ไม่มีตัวเลือกในหมวดนี้ กดถัดไปได้เลย' : 'No items found. Please click Next.'}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 + depth * 10 }}>
      <div className="modal-content wizard-modal" onClick={e => e.stopPropagation()} style={{ background: '#ffffff', color: '#0f172a', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
        <div className="modal-header">
          <div className="wizard-progress">
            <span style={{ color: '#475569', fontWeight: 700 }}>{lang === 'th' ? `ขั้นตอนที่ ${currentStepIndex + 1}/${validSteps.length}` : `Step ${currentStepIndex + 1}/${validSteps.length}`}</span>
            <div className="progress-bar" style={{ background: '#e2e8f0' }}>
              <div className="progress-fill" style={{ width: `${((currentStepIndex + 1) / validSteps.length) * 100}%`, background: '#ea580c' }}></div>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={24} color="#0f172a" />
          </button>
        </div>

        <div className="wizard-body">
          {step === 'price' && (
            <div className="wizard-step">
              <h3 className="step-title" style={{ color: '#0f172a', fontWeight: '800' }}>{lang === 'th' ? 'เลือกราคา / ขนาด' : 'Select Price / Size'}</h3>
              <p className="step-desc" style={{ color: '#475569', fontWeight: '600' }}>
                {lang === 'th' ? 'กรุณาเลือกตัวเลือกราคาสำหรับเมนูนี้' : 'Please select a price option for this item'}
              </p>
              <div className="options-grid cols-2">
                {priceOptions.map((opt, idx) => {
                  const isSel = selectedPrice?.name === opt.name && Number(selectedPrice?.price) === Number(opt.price);
                  return (
                    <div
                      key={idx}
                      className={`option-card large ${isSel ? 'selected' : ''}`}
                      onClick={() => setSelectedPrice(opt)}
                      style={{ cursor: 'pointer', background: isSel ? '#fff7ed' : '#ffffff', border: `2px solid ${isSel ? '#ea580c' : '#cbd5e1'}` }}
                    >
                      <div>
                        <div className="option-name" style={{ color: '#0f172a', fontWeight: '700' }}>{opt.name || (lang === 'th' ? 'ราคาปกติ' : 'Regular')}</div>
                        <div className="option-price" style={{ color: '#ea580c', fontWeight: '800', fontSize: '1.1rem', marginTop: '4px' }}>
                          ฿{Number(opt.price).toLocaleString()}
                        </div>
                      </div>
                      <div className="radio-circle" style={{ borderColor: isSel ? '#ea580c' : '#cbd5e1' }}>
                        {isSel && <div className="radio-fill" style={{ background: '#ea580c' }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {step === 1 && renderPopupStep(1, pop1Config, selectedPopup1)}
          {step === 2 && renderPopupStep(2, pop2Config, selectedPopup2)}
          {step === 3 && renderPopupStep(3, pop3Config, selectedPopup3)}
          {step === 4 && renderPopupStep(4, pop4Config, selectedPopup4)}
          {step === 5 && renderPopupStep(5, pop5Config, selectedPopup5)}
          {step === 6 && renderPopupStep(6, pop6Config, selectedPopup6)}

          {step === 7 && (
            <div className="wizard-step">
              <h3 className="step-title" style={{ color: '#0f172a', fontWeight: '800' }}>{lang === 'th' ? 'การรับประทาน' : 'Dining Option'}</h3>
              <div className="options-grid cols-2">
                {DINING_OPTIONS.map(option => {
                  // ราคาที่จะถูกใช้จริงถ้าเลือกตัวเลือกนี้ — ห่อกลับบ้านจะสลับไปใช้ราคา Takehome
                  const optPrice = (option.id === 'takeaway' && takehomePrice)
                    ? Number(takehomePrice.price) || 0
                    : (hasMultiplePrices ? (Number(selectedPrice?.price) || 0) : (Number(basePrice) || Number(food?.price) || 0));
                  return (
                  <div
                    key={option.id}
                    className={`option-card large ${selectedDining.id === option.id ? 'selected' : ''}`}
                    onClick={() => setSelectedDining(option)}
                    style={{ background: selectedDining.id === option.id ? '#fff7ed' : '#ffffff', border: `2px solid ${selectedDining.id === option.id ? '#ea580c' : '#cbd5e1'}` }}
                  >
                    <div>
                    <div className="option-name" style={{ color: '#0f172a', fontWeight: '700' }}>{lang === 'th' ? option.name : option.nameEn}</div>
                    <div className="option-price" style={{ color: '#ea580c', fontWeight: 800, marginTop: '4px' }}>
                      ฿{optPrice.toLocaleString()}
                      {option.id === 'takeaway' && takehomePrice && (
                        <span style={{ marginLeft: '0.35rem', fontSize: '0.72rem', fontWeight: 700, color: '#c2410c' }}>
                          ({lang === 'th' ? 'ราคาห่อกลับ' : 'takeaway price'})
                        </span>
                      )}
                    </div>
                    </div>
                    <div className="radio-circle" style={{ borderColor: selectedDining.id === option.id ? '#ea580c' : '#cbd5e1' }}>
                      {selectedDining.id === option.id && <div className="radio-fill" style={{ background: '#ea580c' }} />}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="wizard-footer" style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
          {!isFirstStep ? (
            <button className="nav-btn prev" onClick={handlePrev} style={{ color: '#0f172a', background: '#ffffff', border: '1px solid #cbd5e1', fontWeight: '700' }}>
              <ArrowLeft size={20} /> {lang === 'th' ? 'ย้อนกลับ' : 'Back'}
            </button>
          ) : <div></div>}

          {!isLastStep ? (
            <button className="nav-btn next" onClick={handleNext} style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#ffffff', fontWeight: '800' }}>
              {lang === 'th' ? `ถัดไป (ยอดรวมชั่วคราว: ฿${currentTotal()})` : `Next (Total: ฿${currentTotal()})`} <ArrowRight size={20} />
            </button>
          ) : (
            <button className="nav-btn confirm" onClick={handleSubmit} style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#ffffff', fontWeight: '800' }}>
              {lang === 'th' ? `ยืนยันและเพิ่ม (฿${currentTotal()})` : `Confirm & Add (฿${currentTotal()})`} <Check size={20} />
            </button>
          )}
        </div>
      </div>
    </div>

    {/* ป๊อปอัพซ้อน — เมนูที่เลือกในป๊อปอัพนี้มีป๊อปอัพของตัวเอง */}
    {nestedPending && (
      <OrderWizardModal
        food={nestedPending.food}
        lang={lang}
        liveMenu={liveMenu}
        categories={categories}
        basePrice={Number(nestedPending.food.price) || 0}
        askDining={false}
        depth={depth + 1}
        ancestorIds={chain}
        onClose={() => setNestedPending(null)}
        onConfirm={handleNestedConfirm}
      />
    )}
    </>
  );
};

export default OrderWizardModal;
