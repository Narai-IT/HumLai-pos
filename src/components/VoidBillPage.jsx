import React, { useState, useEffect, useCallback } from 'react';
import { X, RefreshCw, Search, Ban, AlertTriangle } from 'lucide-react';
import { API_URL } from '../utils/api';

// ── หน้ายกเลิกบิลที่ชำระแล้ว (หน้าขาย > เพิ่มเติม > ยกเลิกบิล) ──
// เฉพาะบิลของวันนี้ · ต้องใส่หมายเหตุ · ใช้ได้เฉพาะผู้จัดการ/แอดมิน (เซิร์ฟเวอร์ตรวจซ้ำ)
// ยกเลิกแล้ว: บิลหลุดจากยอดขาย · บิลสมาชิกหักแต้มคืนและคืนคูปอง/Voucher ในระบบสมาชิกให้อัตโนมัติ
// เงินลูกค้า: พนักงานคืนเองที่ร้าน (โอนคืน/เงินสด)

const QUICK_REASONS = ['ลูกค้ายกเลิก', 'คิดเงินผิด', 'สั่งผิดรายการ', 'ปิดบิลผิดโต๊ะ', 'ทดสอบระบบ'];

const baht = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const timeOf = (ts) => {
  try { return new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }); }
  catch { return String(ts || ''); }
};
const thaiDay = (ymd) => {
  try { return new Date(ymd + 'T12:00:00+07:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }); }
  catch { return ymd; }
};

const overlay = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 900, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2vh 1rem', overflowY: 'auto' };
const panel = { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 880, padding: '1.1rem 1.25rem', color: '#0f172a', fontFamily: 'inherit', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' };
const tabBtn = (on) => ({ padding: '0.55rem 0.9rem', border: 'none', borderBottom: `3px solid ${on ? '#dc2626' : 'transparent'}`, background: 'none', fontWeight: on ? 700 : 500, color: on ? '#0f172a' : '#64748b', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.92rem' });
const card = { border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.75rem 0.9rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' };
const badge = (c, bg) => ({ padding: '0.12rem 0.5rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, color: c, background: bg, whiteSpace: 'nowrap' });
const btn = (bg, c = '#fff', border = bg) => ({ padding: '0.55rem 0.95rem', borderRadius: 10, border: `1.5px solid ${border}`, background: bg, color: c, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' });

export default function VoidBillPage({ onClose, branchId = '' }) {
  const [tab, setTab] = useState('open');
  const [day, setDay] = useState('');
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState(null);     // บิลที่กำลังจะยกเลิก
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState(null);          // ผลการยกเลิกล่าสุด

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_URL}?action=getVoidableBills&branch=${encodeURIComponent(branchId)}`);
      const json = await res.json();
      if (!json || !json.success) throw new Error((json && json.error) || 'โหลดรายการบิลไม่สำเร็จ');
      setDay(json.day || ''); setBills(Array.isArray(json.bills) ? json.bills : []);
    } catch (e) { setError(e.message || 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'); }
    setLoading(false);
  }, [branchId]);
  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const match = (b) => !q || [b.orderNumber, b.tableNo, b.customerName, b.memberId, b.paymentMethod].some(v => String(v || '').toLowerCase().includes(q));
  const open = bills.filter(b => !b.cancelled && match(b));
  const voided = bills.filter(b => b.cancelled && match(b));
  const shown = tab === 'open' ? open : voided;

  const startVoid = (b) => { setTarget(b); setReason(''); setFormError(''); setDone(null); };
  const confirmVoid = async () => {
    const r = reason.trim();
    if (r.length < 3) { setFormError('กรุณาใส่หมายเหตุว่ายกเลิกเพราะอะไร (อย่างน้อย 3 ตัวอักษร)'); return; }
    setBusy(true); setFormError('');
    try {
      const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'voidBill', orderNumber: target.orderNumber, reason: r, branchId }) });
      const json = await res.json().catch(() => null);
      if (!json || json.success !== true) throw new Error((json && json.error) || 'ยกเลิกบิลไม่สำเร็จ');
      setDone({ ...json, total: target.total });
      setTarget(null);
      load();
    } catch (e) { setFormError(e.message); }
    setBusy(false);
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Ban size={22} color="#dc2626" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>ยกเลิกบิลที่ชำระแล้ว</div>
            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>เฉพาะบิลของวันนี้{day ? ` · ${thaiDay(day)}` : ''}</div>
          </div>
          <button onClick={load} title="โหลดใหม่" style={{ ...btn('#fff', '#334155', '#cbd5e1'), padding: '0.45rem 0.6rem' }}><RefreshCw size={16} className={loading ? 'spin' : ''} /></button>
          <button onClick={onClose} title="ปิด" style={{ ...btn('#fff', '#334155', '#cbd5e1'), padding: '0.45rem 0.6rem' }}><X size={16} /></button>
        </div>

        {done && (
          <div style={{ marginTop: '0.8rem', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 10, padding: '0.65rem 0.8rem', fontSize: '0.86rem', lineHeight: 1.55 }}>
            <b>ยกเลิกบิล {done.orderNumber} แล้ว</b> · {done.crmLabel}{done.pointsReversed ? ` (${done.pointsReversed} แต้ม)` : ''}
            {done.crmError ? <div style={{ color: '#b45309' }}>{done.crmError}</div> : null}
            <div>อย่าลืมคืนเงิน ฿{baht(done.total)} ให้ลูกค้า (โอนคืน/เงินสด)</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.8rem', borderBottom: '1px solid #e2e8f0' }}>
          <button style={tabBtn(tab === 'open')} onClick={() => setTab('open')}>บิลวันนี้ ({bills.filter(b => !b.cancelled).length})</button>
          <button style={tabBtn(tab === 'voided')} onClick={() => setTab('voided')}>ยกเลิกแล้ว ({bills.filter(b => b.cancelled).length})</button>
        </div>

        <div style={{ position: 'relative', margin: '0.75rem 0' }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาเลขบิล โต๊ะ เลขสมาชิก วิธีชำระ"
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.7rem 0.55rem 2rem', borderRadius: 10, border: '1px solid #cbd5e1', fontFamily: 'inherit', fontSize: '0.9rem' }} />
        </div>

        {error && <div style={{ color: '#b91c1c', fontWeight: 600, margin: '0.5rem 0' }}>❌ {error}</div>}
        {!loading && !error && shown.length === 0 && (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem 0' }}>{tab === 'open' ? 'ยังไม่มีบิลที่ชำระแล้วในวันนี้' : 'วันนี้ยังไม่มีบิลที่ถูกยกเลิก'}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          {shown.map(b => (
            <div key={b.orderNumber} style={{ ...card, background: b.cancelled ? '#f8fafc' : '#fff' }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <b style={{ fontSize: '0.98rem', textDecoration: b.cancelled ? 'line-through' : 'none' }}>{b.orderNumber}</b>
                  <span style={{ color: '#64748b', fontSize: '0.82rem' }}>{timeOf(b.timestamp)}{b.tableNo ? ` · โต๊ะ ${b.tableNo}` : ''}</span>
                  {b.paymentMethod && <span style={badge('#0369a1', '#e0f2fe')}>{b.paymentMethod}</span>}
                  {b.memberId && <span style={badge('#7c2d12', '#ffedd5')}>{b.memberId}{b.points ? ` · +${b.points} แต้ม` : ''}</span>}
                  {b.taxInvoiceNo && <span style={badge('#854d0e', '#fef9c3')}>ใบกำกับ {b.taxInvoiceNo}</span>}
                </div>
                <div style={{ color: '#475569', fontSize: '0.82rem', marginTop: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {b.items.map(i => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ') || '—'}
                </div>
                {b.cancelled && (
                  <div style={{ fontSize: '0.8rem', marginTop: '0.3rem', color: '#991b1b' }}>
                    {b.void ? <>ยกเลิก {timeOf(b.void.at)} โดย {b.void.by || '—'} · หมายเหตุ: <b>{b.void.reason}</b>
                      <div style={{ color: b.void.crmStatus === 'failed' ? '#b91c1c' : '#64748b' }}>{b.void.crmLabel}{b.void.pointsReversed ? ` (${b.void.pointsReversed} แต้ม)` : ''}</div></>
                      : 'ยกเลิกแล้ว (ก่อนมีระบบหมายเหตุ)'}
                  </div>
                )}
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: b.cancelled ? '#94a3b8' : '#0f172a', minWidth: 90, textAlign: 'right' }}>฿{baht(b.total)}</div>
              {!b.cancelled && (
                <button onClick={() => startVoid(b)} disabled={!!b.taxInvoiceNo}
                  title={b.taxInvoiceNo ? 'ยกเลิกใบกำกับภาษีก่อน' : ''}
                  style={{ ...btn('#fff', b.taxInvoiceNo ? '#94a3b8' : '#dc2626', b.taxInvoiceNo ? '#cbd5e1' : '#dc2626'), cursor: b.taxInvoiceNo ? 'not-allowed' : 'pointer' }}>
                  <Ban size={15} /> ยกเลิกบิล
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {target && (
        <div style={{ ...overlay, zIndex: 950, alignItems: 'center' }} onClick={(e) => { e.stopPropagation(); if (!busy) setTarget(null); }}>
          <div style={{ ...panel, maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 800 }}>
              <AlertTriangle size={22} color="#dc2626" /> ยกเลิกบิล {target.orderNumber}?
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '0.65rem 0.8rem', marginTop: '0.75rem', fontSize: '0.86rem', lineHeight: 1.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>เวลา</span><b>{timeOf(target.timestamp)}{target.tableNo ? ` · โต๊ะ ${target.tableNo}` : ''}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ชำระด้วย</span><b>{target.paymentMethod || '—'}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ยอดชำระ</span><b style={{ color: '#dc2626' }}>฿{baht(target.total)}</b></div>
              {target.memberId && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>สมาชิก</span><b>{target.memberId}</b></div>}
              <div style={{ borderTop: '1px dashed #cbd5e1', marginTop: '0.4rem', paddingTop: '0.4rem', color: '#475569' }}>
                {target.items.map((i, k) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{i.name}{i.qty > 1 ? ` ×${i.qty}` : ''}</span><span>{baht(i.price)}</span></div>)}
              </div>
            </div>

            <label style={{ display: 'block', fontWeight: 700, marginTop: '0.85rem', fontSize: '0.9rem' }}>หมายเหตุ (จำเป็น)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', margin: '0.4rem 0' }}>
              {QUICK_REASONS.map(r => (
                <button key={r} onClick={() => setReason(reason.trim() ? `${reason.trim()} · ${r}` : r)}
                  style={{ padding: '0.3rem 0.65rem', borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', fontFamily: 'inherit', fontSize: '0.8rem', cursor: 'pointer' }}>{r}</button>
              ))}
            </div>
            <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 300))} rows={3} autoFocus
              placeholder="เช่น ลูกค้ายกเลิก รออาหารนาน โอนเงินคืนแล้ว"
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.7rem', borderRadius: 10, border: `1.5px solid ${formError ? '#dc2626' : '#cbd5e1'}`, fontFamily: 'inherit', fontSize: '0.9rem', resize: 'vertical' }} />
            <div style={{ fontSize: '0.74rem', color: '#94a3b8', textAlign: 'right' }}>{reason.length}/300</div>

            <ul style={{ fontSize: '0.8rem', color: '#475569', paddingLeft: '1.1rem', margin: '0.4rem 0 0', lineHeight: 1.6 }}>
              <li>บิลจะหลุดจากยอดขายและสรุปยอดวันนี้ ยกเลิกแล้วย้อนกลับไม่ได้</li>
              {target.memberId && <li>ระบบสมาชิกจะหักแต้มที่ได้จากบิลนี้คืน และคืนคูปอง/Voucher ที่ใช้ในบิล</li>}
              <li><b>ระบบไม่คืนเงินให้เอง</b> — คืนเงินลูกค้า ฿{baht(target.total)} ที่ร้าน (โอนคืน/เงินสด)</li>
            </ul>

            {formError && <div style={{ color: '#b91c1c', fontWeight: 600, fontSize: '0.85rem', marginTop: '0.5rem' }}>❌ {formError}</div>}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem' }}>
              <button onClick={() => setTarget(null)} disabled={busy} style={{ ...btn('#fff', '#334155', '#cbd5e1'), flex: 1, justifyContent: 'center' }}>ไม่ยกเลิก</button>
              <button onClick={confirmVoid} disabled={busy} style={{ ...btn('#dc2626'), flex: 1, justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
                <Ban size={16} /> {busy ? 'กำลังยกเลิก…' : 'ยืนยันยกเลิกบิล'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
