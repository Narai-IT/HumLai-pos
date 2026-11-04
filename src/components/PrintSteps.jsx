import React from 'react';
import { PRINT_STEPS, PRINT_STEP_LABEL, PRINT_STAGE_TIPS } from '../utils/printServer';

// รายการขั้นตอนการพิมพ์ ✓ / ⚠ / ✗ — ติดขั้นไหนเห็นทันทีพร้อมวิธีแก้
// ใช้ทั้งในกล่องสถานะการพิมพ์มุมจอ และใต้ปุ่ม "ทดสอบพิมพ์"
const ICON = {
  ok: { char: '✓', color: '#16a34a', bg: '#dcfce7' },
  warn: { char: '!', color: '#b45309', bg: '#fef3c7' },
  fail: { char: '✕', color: '#dc2626', bg: '#fee2e2' },
  wait: { char: '…', color: '#2563eb', bg: '#dbeafe' },
  skip: { char: '', color: '#94a3b8', bg: '#f1f5f9' }
};

const PrintSteps = ({ steps, stage, error, printing = false, compact = false }) => {
  const byKey = Object.fromEntries((steps || []).map(s => [s.key, s]));
  // ขั้นที่ไม่อยู่ในรายการมาตรฐาน (เช่น format = จัดหน้าใบพิมพ์ไม่สำเร็จ) แสดงต่อท้าย
  const keys = PRINT_STEPS.map(s => s.key);
  if (stage && !keys.includes(stage)) keys.push(stage);
  const failed = !printing && !!error;
  const extraFail = failed && stage && !byKey[stage] ? { key: stage, status: 'fail', detail: error } : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '0.3rem' : '0.45rem' }}>
      {keys.map((key, i) => {
        let step = byKey[key] || (extraFail && extraFail.key === key ? extraFail : null);
        if (!step && printing) step = { key, status: i === 0 ? 'wait' : 'skip', detail: i === 0 ? 'กำลังส่งงาน...' : '' };
        if (!step && !keys.slice(PRINT_STEPS.length).includes(key)) step = { key, status: 'skip', detail: '' };
        if (!step) return null;
        const status = step.status === 'pending' ? 'skip' : step.status;
        const icon = ICON[status] || ICON.skip;
        return (
          <div key={key} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', opacity: status === 'skip' ? 0.55 : 1 }}>
            <span style={{
              flexShrink: 0, width: 18, height: 18, borderRadius: 999, marginTop: 1,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: icon.color, background: icon.bg,
              border: status === 'skip' ? '1px dashed #cbd5e1' : 'none'
            }}>{icon.char}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: compact ? '0.78rem' : '0.82rem', fontWeight: 700, color: status === 'skip' ? '#64748b' : '#0f172a' }}>
                {PRINT_STEP_LABEL[key] || key}
                {status === 'skip' && !printing && <span style={{ fontWeight: 500 }}> — ไม่ได้ทำ</span>}
              </div>
              {step.detail && status !== 'skip' && (
                <div style={{ fontSize: compact ? '0.74rem' : '0.78rem', color: icon.color === '#16a34a' ? '#475569' : icon.color, lineHeight: 1.45, wordBreak: 'break-word' }}>
                  {step.detail}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {failed && PRINT_STAGE_TIPS[stage] && (
        <div style={{ marginTop: '0.2rem', padding: '0.5rem 0.65rem', borderRadius: 8, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', fontSize: compact ? '0.76rem' : '0.8rem', lineHeight: 1.45 }}>
          <strong>วิธีแก้:</strong> {PRINT_STAGE_TIPS[stage]}
        </div>
      )}
    </div>
  );
};

export default PrintSteps;
