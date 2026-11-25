import React, { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';

// ── ยกเลิกรายการในโต๊ะ: ต้องใส่เหตุผลทุกครั้ง (จดลงหลังบ้าน > บันทึกการทำงาน) ──
const REASONS = ['ลูกค้าเปลี่ยนใจ', 'ของหมด', 'คีย์ผิด', 'รออาหารนาน', 'สั่งซ้ำ'];

const minutesSince = (ts) => {
  const t = new Date(ts).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 60000)) : null;
};

export default function CancelItemDialog({ item, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const qty = Number(item.Quantity) || 1;
  const price = (Number(item.ItemPrice) || 0) * qty;
  const mins = minutesSince(item.Timestamp);
  const submit = () => {
    const r = reason.trim();
    if (r.length < 2) { setErr('กรุณาเลือกหรือพิมพ์เหตุผลที่ยกเลิก'); return; }
    onConfirm(r);
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="ยกเลิกรายการ"
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440, padding: '1.1rem 1.2rem', color: '#0f172a', fontFamily: 'inherit', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 800 }}>
          <Trash2 size={20} color="#dc2626" /> ยกเลิกรายการ
        </div>
        <div style={{ background: '#f8fafc', borderRadius: 10, padding: '0.6rem 0.8rem', marginTop: '0.7rem', fontSize: '0.92rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
            <span>{item.ItemName}{qty > 1 ? ` ×${qty}` : ''}</span><span>฿{price.toLocaleString()}</span>
          </div>
          {item.Options && <div style={{ fontSize: '0.8rem', color: '#475569' }}>↳ {item.Options}</div>}
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
            โต๊ะ {item.TableNumber}{mins != null ? ` · สั่งไปแล้ว ${mins} นาที` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start', marginTop: '0.6rem', background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 10, padding: '0.5rem 0.7rem', fontSize: '0.82rem' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} /> ส่งครัวไปแล้ว — ระบบจะพิมพ์ใบยกเลิกพร้อมเหตุผลเข้าครัวให้เอง (ครัวอาจทำไปแล้ว)
        </div>
        <label style={{ display: 'block', fontWeight: 700, marginTop: '0.8rem', fontSize: '0.9rem' }}>เหตุผล (จำเป็น)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', margin: '0.4rem 0' }}>
          {REASONS.map(x => (
            <button key={x} type="button" onClick={() => { setReason(x); setErr(''); }}
              style={{ padding: '0.35rem 0.75rem', borderRadius: 999, border: `1.5px solid ${reason === x ? '#dc2626' : '#cbd5e1'}`, background: reason === x ? '#fef2f2' : '#fff', color: reason === x ? '#b91c1c' : '#334155', fontWeight: reason === x ? 800 : 500, fontFamily: 'inherit', fontSize: '0.85rem', cursor: 'pointer' }}>{x}</button>
          ))}
        </div>
        <input value={reason} onChange={(e) => { setReason(e.target.value.slice(0, 300)); setErr(''); }} placeholder="หรือพิมพ์เหตุผลเอง"
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          style={{ width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', borderRadius: 10, border: `1.5px solid ${err ? '#dc2626' : '#cbd5e1'}`, fontFamily: 'inherit', fontSize: '0.92rem' }} />
        {err && <div style={{ color: '#b91c1c', fontWeight: 600, fontSize: '0.85rem', marginTop: '0.4rem' }}>❌ {err}</div>}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem' }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '0.7rem', borderRadius: 10, border: '1.5px solid #cbd5e1', background: '#fff', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>ไม่ยกเลิก</button>
          <button type="button" onClick={submit} style={{ flex: 1.3, padding: '0.7rem', borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', opacity: reason.trim().length >= 2 ? 1 : 0.55 }}>
            ยืนยันยกเลิกรายการ
          </button>
        </div>
      </div>
    </div>
  );
}
