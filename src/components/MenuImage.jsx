import React, { useMemo, useState } from 'react';
import { menuImageCandidates } from '../utils/menuImage';

// รูปเมนูที่ลองโหลดไล่ตามลำดับ — ถ้าไฟล์ไหนโหลดไม่ได้ก็ขยับไปไฟล์ถัดไป
// ลองครบทุกไฟล์แล้วยังไม่ได้ = โชว์ 🍽️ แทน (ไม่วนโหลดรูปเสียซ้ำไม่จบ)
const MenuImage = ({ food, style, className, placeholderClassName, placeholderSize = '2.2rem', ref, ...imgProps }) => {
  const candidates = useMemo(
    () => menuImageCandidates(food),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [food?.image, food?.name, food?.category, food?.id, food?.baseId]
  );
  const key = candidates.join('|');
  const [state, setState] = useState({ key, idx: 0 });
  // เมนูเปลี่ยน = เริ่มลองจากไฟล์แรกใหม่
  const idx = state.key === key ? state.idx : 0;
  const src = candidates[idx];

  if (!src) {
    return (
      <div
        ref={ref}
        className={placeholderClassName}
        aria-hidden="true"
        style={{
          ...style,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f1f5f9', fontSize: placeholderSize
        }}
      >
        🍽️
      </div>
    );
  }

  return (
    <img
      ref={ref}
      src={src}
      className={className}
      /* Google Drive ปฏิเสธการโหลดรูปข้ามเว็บเมื่อมี referrer ติดไปด้วย */
      referrerPolicy="no-referrer"
      onError={() => setState({ key, idx: idx + 1 })}
      style={style}
      {...imgProps}
    />
  );
};

export default MenuImage;
