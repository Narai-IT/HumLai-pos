import React, { useState } from 'react';
import OrderWizardModal from './OrderWizardModal';
import { bundledWithPopups } from '../utils/popupConfig';

// ── สั่งเมนูที่มีเมนูพ่วง (Bundled Items) ──
// ป๊อปอัพของเมนูหลักก่อน แล้วต่อด้วยป๊อปอัพของเมนูพ่วงที่มีตัวเลือกของตัวเอง ทีละใบ
// เมนูพ่วงตัวเองฟรี (฿0) แต่ตัวเลือกที่มีราคาคิดเงินเพิ่ม · ย้อนกลับไปแก้ใบก่อนหน้าได้
//
// onConfirm(food, details, wizardState, bundles)
//   bundles = { [ลำดับใน bundledItems]: { details, state } } เฉพาะเมนูพ่วงที่มีป๊อปอัพ
//   (ไม่มีเมนูพ่วงที่มีป๊อปอัพ = เรียกเหมือน OrderWizardModal เดิม bundles = {})
//
// initialBundles = ตัวเลือกเมนูพ่วงที่เคยเลือกไว้ (แก้ไขจากตะกร้า) รูปแบบเดียวกับ bundles
export default function BundleOrderWizard({ food, liveMenu = [], categories = [], onConfirm, onClose, confirmLabel = null, initialState = null, initialBundles = null, lang = 'th', ...rest }) {
  const th = lang === 'th';
  const bundles = bundledWithPopups(food, liveMenu, categories);
  // stage 0 = เมนูหลัก · 1..n = เมนูพ่วงลำดับที่ n
  const [stage, setStage] = useState(0);
  const [results, setResults] = useState(() => {
    const r = { 0: initialState ? { details: null, state: initialState } : null };
    bundles.forEach((b, i) => {
      const prev = initialBundles && initialBundles[b.index];
      if (prev) r[i + 1] = { details: prev.details || null, state: prev.state || null };
    });
    return r;
  });
  const total = bundles.length;

  const finish = (all) => {
    const main = all[0];
    const picked = {};
    bundles.forEach((b, i) => { const r = all[i + 1]; if (r) picked[b.index] = { details: r.details, state: r.state }; });
    onConfirm(main.food, main.details, main.state, picked);
  };

  const confirmStage = (stageFood, details, state) => {
    const next = { ...results, [stage]: { food: stageFood, details, state } };
    setResults(next);
    if (stage < total) setStage(stage + 1);
    else finish(next);
  };

  // ย้อนกลับ: ข้ามใบที่ไม่มีขั้นตอนให้เลือก (ผ่านไปเองอัตโนมัติ) ไม่งั้นจะเด้งกลับมาที่เดิม
  const prevStage = (() => {
    for (let s = stage - 1; s >= 0; s--) {
      const st = results[s] && results[s].state;
      if (!st || st.stepCount > 0) return s;
    }
    return -1;
  })();

  if (stage === 0) {
    return (
      <OrderWizardModal
        key="main"
        {...rest}
        lang={lang}
        food={food}
        liveMenu={liveMenu}
        categories={categories}
        initialState={results[0] ? results[0].state : initialState}
        confirmLabel={total > 0 ? (th ? 'ถัดไป: เมนูในชุด' : 'Next: set items') : confirmLabel}
        bundleNotice={total > 0 ? bundles.map(b => (th ? b.food.name : (b.food.nameEn || b.food.name))) : null}
        onClose={onClose}
        onConfirm={confirmStage}
      />
    );
  }

  const b = bundles[stage - 1];
  const isLast = stage === total;
  const prev = results[stage];
  return (
    <OrderWizardModal
      key={`bundle-${stage}`}
      {...rest}
      lang={lang}
      food={{ ...b.food, price: 0, priceName: '', isBundled: true }}
      liveMenu={liveMenu}
      categories={categories}
      basePrice={0}
      askDining={false}
      initialState={prev ? prev.state : null}
      bundleInfo={{ parent: th ? food.name : (food.nameEn || food.name), index: stage, total }}
      onBack={prevStage >= 0 ? () => setStage(prevStage) : null}
      confirmLabel={isLast
        ? (confirmLabel || (th ? 'ใส่ตะกร้า' : 'Add to cart'))
        : (th ? `ถัดไป (${stage + 1}/${total})` : `Next (${stage + 1}/${total})`)}
      onClose={onClose}
      onConfirm={confirmStage}
    />
  );
}
