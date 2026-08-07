import React, { useState, useEffect } from 'react';
import { X, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { resolvePopupSource, getPriceOptions } from '../utils/popupConfig';

const DINING_OPTIONS = [
  { id: 'dine_in', name: 'ทานที่ร้าน', nameEn: 'Dine-in' },
  { id: 'takeaway', name: 'ห่อกลับบ้าน', nameEn: 'Takeaway' }
];

const OrderWizardModal = ({ food, onClose, onConfirm, lang = 'th', liveMenu = [], categories = [], basePrice = 0 }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [selectedPopup1, setSelectedPopup1] = useState({});
  const [selectedPopup2, setSelectedPopup2] = useState({});
  const [selectedPopup3, setSelectedPopup3] = useState({});
  const [selectedPopup4, setSelectedPopup4] = useState({});
  const [selectedPopup5, setSelectedPopup5] = useState({});
  const [selectedPopup6, setSelectedPopup6] = useState({});
  const [selectedDining, setSelectedDining] = useState(DINING_OPTIONS[0]);

  const priceOptions = getPriceOptions(food);
  const hasMultiplePrices = priceOptions.length > 1;

  const [selectedPrice, setSelectedPrice] = useState(() => {
    const opts = getPriceOptions(food);
    const match = opts.find(o => Number(o.price) === Number(basePrice));
    return match || opts[0];
  });

  const isDrink = !!food && food.category === 'drink';
  const categoryConfig = food ? resolvePopupSource(food, categories) : {};

  const resolvePopupConfig = (configField, minField, categoryField, itemIdsField, fallbackFilter, freeField, maxField, itemsMaxField, allowRepeatField) => {
    let slugs = [];
    if (categoryConfig[categoryField]) {
      slugs.push(categoryConfig[categoryField]);
    } else if (fallbackFilter) {
      slugs = categories.filter(c =>
        (c.name && c.name.toLowerCase().replace(/\s/g, '').includes(fallbackFilter)) ||
        (c.nameEn && c.nameEn.toLowerCase().replace(/\s/g, '').includes(fallbackFilter))
      ).map(c => c.slug);
    }

    const namesTh = slugs.map(slug => categories.find(cat => cat.slug === slug)?.name).filter(Boolean).join(', ') || 'ตัวเลือกเพิ่มเติม';
    const namesEn = slugs.map(slug => categories.find(cat => cat.slug === slug)?.nameEn).filter(Boolean).join(', ') || 'Extra Options';

    let items = liveMenu.filter(m => slugs.includes(m.category));
    if (categoryConfig[itemIdsField] && categoryConfig[itemIdsField].length > 0) {
      items = items.filter(m => categoryConfig[itemIdsField].includes(m.id));
    }

    const isFree = categoryConfig[freeField] === true;
    items = items.map(m => ({ ...m, price: isFree ? 0 : m.price }));

    const itemsMaxMap = categoryConfig[itemsMaxField] || {};
    const allowRepeat = categoryConfig[allowRepeatField] !== false;
    return { namesTh, namesEn, items, minSelect: categoryConfig[minField] || 0, maxSelect: categoryConfig[maxField] || 0, itemsMaxMap, allowRepeat };
  };

  const pop1Config = resolvePopupConfig('hasPopup1', 'popup1Min', 'popup1Category', 'popup1Items', null, 'popup1Free', 'popup1Max', 'popup1ItemsMax', 'popup1AllowRepeat');
  const pop2Config = resolvePopupConfig('hasPopup2', 'popup2Min', 'popup2Category', 'popup2Items', null, 'popup2Free', 'popup2Max', 'popup2ItemsMax', 'popup2AllowRepeat');
  const pop3Config = resolvePopupConfig('hasPopup3', 'popup3Min', 'popup3Category', 'popup3Items', null, 'popup3Free', 'popup3Max', 'popup3ItemsMax', 'popup3AllowRepeat');
  const pop4Config = resolvePopupConfig('hasPopup4', 'popup4Min', 'popup4Category', 'popup4Items', null, 'popup4Free', 'popup4Max', 'popup4ItemsMax', 'popup4AllowRepeat');
  const pop5Config = resolvePopupConfig('hasPopup5', 'popup5Min', 'popup5Category', 'popup5Items', null, 'popup5Free', 'popup5Max', 'popup5ItemsMax', 'popup5AllowRepeat');
  const pop6Config = resolvePopupConfig('hasPopup6', 'popup6Min', 'popup6Category', 'popup6Items', null, 'popup6Free', 'popup6Max', 'popup6ItemsMax', 'popup6AllowRepeat');

  const getQty = (qtyMap, id) => qtyMap[id] || 0;
  const totalQty = (qtyMap) => Object.values(qtyMap).reduce((s, v) => s + v, 0);
  const expandQty = (qtyMap, items) => {
    const result = [];
    items.forEach(item => {
      const q = qtyMap[item.id] || 0;
      for (let i = 0; i < q; i++) result.push(item);
    });
    return result;
  };
  const addQty = (setter, qtyMap, id, maxSelect, itemMaxSelect) => {
    const current = getQty(qtyMap, id);
    if (maxSelect > 0 && totalQty(qtyMap) >= maxSelect) return;
    if (itemMaxSelect > 0 && current >= itemMaxSelect) return;
    setter({ ...qtyMap, [id]: current + 1 });
  };
  const removeQty = (setter, qtyMap, id) => {
    const current = getQty(qtyMap, id);
    if (current <= 0) return;
    const next = { ...qtyMap, [id]: current - 1 };
    if (next[id] === 0) delete next[id];
    setter(next);
  };

  const validSteps = [
    hasMultiplePrices ? 'price' : null,
    categoryConfig.hasPopup1 === true ? 1 : null,
    categoryConfig.hasPopup2 === true ? 2 : null,
    categoryConfig.hasPopup3 === true ? 3 : null,
    categoryConfig.hasPopup4 === true ? 4 : null,
    categoryConfig.hasPopup5 === true ? 5 : null,
    categoryConfig.hasPopup6 === true ? 6 : null,
    (!isDrink && categoryConfig.hasDining !== false) ? 7 : null
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

  const getExpandedPopups = () => [
    ...expandQty(selectedPopup1, pop1Config.items),
    ...expandQty(selectedPopup2, pop2Config.items),
    ...expandQty(selectedPopup3, pop3Config.items),
    ...expandQty(selectedPopup4, pop4Config.items),
    ...expandQty(selectedPopup5, pop5Config.items),
    ...expandQty(selectedPopup6, pop6Config.items)
  ];

  const currentTotal = () => {
    let total = hasMultiplePrices ? (Number(selectedPrice?.price) || 0) : (Number(basePrice) || Number(food?.price) || 0);
    getExpandedPopups().forEach(a => { total += Number(a.price) || 0; });
    return total;
  };

  const handleSubmit = () => {
    onConfirm(food, {
      selectedPrice: hasMultiplePrices ? selectedPrice : null,
      allPopups: getExpandedPopups(),
      dining: isDrink ? { id: 'drink', name: 'เครื่องดื่ม', nameEn: 'Drinks' } : selectedDining
    });
  };

  const renderPopupStep = (config, qtyMap, setter) => {
    const total = totalQty(qtyMap);
    const atMax = config.maxSelect > 0 && total >= config.maxSelect;
    return (
      <div className="wizard-step">
        <h3 className="step-title" style={{ color: '#0f172a', fontWeight: '800' }}>{lang === 'th' ? `เลือก ${config.namesTh}` : `Select ${config.namesEn}`}</h3>
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
              onClick={() => setter({})}
            >
              <div className="option-name" style={{ color: '#0f172a', fontWeight: '700' }}>{lang === 'th' ? 'ไม่รับ (ข้าม)' : 'No Thanks'}</div>
              <div className="option-price" style={{ color: '#64748b' }}>-</div>
            </div>
          )}
          {config.items.length > 0 ? config.items.map(addon => {
            const qty = getQty(qtyMap, addon.id);
            const perItemMax = config.allowRepeat === false ? 1 : ((config.itemsMaxMap || {})[addon.id] || 0);
            const itemAtMax = perItemMax > 0 && qty >= perItemMax;
            const cardDisabled = (atMax && qty === 0) || itemAtMax;
            const isSelected = qty > 0;
            return (
              <div
                key={addon.id}
                className={`option-card ${isSelected ? 'selected' : ''}`}
                style={{
                  position: 'relative', cursor: cardDisabled ? 'default' : 'pointer', opacity: cardDisabled ? 0.5 : 1,
                  background: isSelected ? '#fff7ed' : '#ffffff',
                  border: `2px solid ${isSelected ? '#ea580c' : '#cbd5e1'}`
                }}
                onClick={() => addQty(setter, qtyMap, addon.id, config.maxSelect, perItemMax)}
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
                      onClick={e => { e.stopPropagation(); removeQty(setter, qtyMap, addon.id); }}
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
                <div className="option-name" style={{ color: '#0f172a', fontWeight: '700' }}>{lang === 'th' ? addon.name : addon.nameEn}</div>
                <div className="option-price" style={{ color: '#ea580c', fontWeight: '800' }}>
                  {addon.price > 0 ? `+฿${addon.price}` : ''}
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
    <div className="modal-overlay" onClick={onClose}>
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

          {step === 1 && renderPopupStep(pop1Config, selectedPopup1, setSelectedPopup1)}
          {step === 2 && renderPopupStep(pop2Config, selectedPopup2, setSelectedPopup2)}
          {step === 3 && renderPopupStep(pop3Config, selectedPopup3, setSelectedPopup3)}
          {step === 4 && renderPopupStep(pop4Config, selectedPopup4, setSelectedPopup4)}
          {step === 5 && renderPopupStep(pop5Config, selectedPopup5, setSelectedPopup5)}
          {step === 6 && renderPopupStep(pop6Config, selectedPopup6, setSelectedPopup6)}

          {step === 7 && (
            <div className="wizard-step">
              <h3 className="step-title" style={{ color: '#0f172a', fontWeight: '800' }}>{lang === 'th' ? 'การรับประทาน' : 'Dining Option'}</h3>
              <div className="options-grid cols-2">
                {DINING_OPTIONS.map(option => (
                  <div
                    key={option.id}
                    className={`option-card large ${selectedDining.id === option.id ? 'selected' : ''}`}
                    onClick={() => setSelectedDining(option)}
                    style={{ background: selectedDining.id === option.id ? '#fff7ed' : '#ffffff', border: `2px solid ${selectedDining.id === option.id ? '#ea580c' : '#cbd5e1'}` }}
                  >
                    <div className="option-name" style={{ color: '#0f172a', fontWeight: '700' }}>{lang === 'th' ? option.name : option.nameEn}</div>
                    <div className="radio-circle" style={{ borderColor: selectedDining.id === option.id ? '#ea580c' : '#cbd5e1' }}>
                      {selectedDining.id === option.id && <div className="radio-fill" style={{ background: '#ea580c' }} />}
                    </div>
                  </div>
                ))}
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
  );
};

export default OrderWizardModal;
