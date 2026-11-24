import React, { useState, useEffect, useCallback } from 'react';
import { X, RefreshCw, Search, Ban, AlertTriangle, Pencil, Trash2, Minus, Plus, RotateCcw, Printer } from 'lucide-react';
import { API_URL } from '../utils/api';
import { menuCategoryLookup, discountAmount as calcDiscount } from '../utils/discount';

// ── หน้ายกเลิกบิลที่ชำระแล้ว (หน้าขาย > เพิ่มเติม > ยกเลิกบิล) ──
// เฉพาะบิลของวันนี้ · ต้องใส่หมายเหตุ · ใช้ได้เฉพาะผู้จัดการ/แอดมิน (เซิร์ฟเวอร์ตรวจซ้ำ)
// ยกเลิกแล้ว: บิลหลุดจากยอดขาย · บิลสมาชิกหักแต้มคืนและคืนคูปอง/Voucher ในระบบสมาชิกให้อัตโนมัติ
// เงินลูกค้า: พนักงานคืนเองที่ร้าน (โอนคืน/เงินสด)

const QUICK_REASONS = ['ลูกค้ายกเลิก', 'คิดเงินผิด', 'สั่งผิดรายการ', 'ปิดบิลผิดโต๊ะ', 'ทดสอบระบบ'];
const EDIT_REASONS = ['ลูกค้าขอยกเลิกบางรายการ', 'คีย์รายการผิด', 'ของหมด', 'ให้ส่วนลดเพิ่ม'];

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

export default function VoidBillPage({ onClose, branchId = '', discounts = [], settings = {}, menu = [], onPrintPreBill }) {
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
  const [editing, setEditing] = useState(null);    // บิลที่กำลังแก้ไข (หน้าตัวอย่าง)

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

  // พิมพ์ใบแจ้งยอด (ยอดปัจจุบันของบิล + QR) ซ้ำ — ใช้หลังแก้ไขบิลแล้วพิมพ์ไม่ออก หรือลูกค้าทำใบหาย
  const [printing, setPrinting] = useState('');
  const printStatement = async (b) => {
    if (!onPrintPreBill) return;
    setPrinting(b.orderNumber);
    const summary = [];
    if (b.edits && b.edits.length) summary.push({ label: 'แก้ไขบิล', value: `ครั้งที่ ${b.edits.length} (แทนใบแจ้งยอดเดิม)` });
    if (b.discount) {
      summary.push({ label: 'ยอดอาหาร', value: money2(b.items.reduce((t, i) => t + (Number(i.price) || 0), 0)) });
      summary.push({ label: `ส่วนลด ${b.discount.name}`, value: `-${money2(b.discount.amount)}` });
    }
    try {
      await onPrintPreBill({
        orderNumber: b.orderNumber,
        customerDetails: { name: b.tableNo ? `โต๊ะ ${b.tableNo}` : '' },
        items: b.items.map(i => ({ isFlattened: true, name: i.qty > 1 ? `${i.name} (x${i.qty})` : i.name, amount: Number(i.price) || 0, subItems: i.options || [] })),
        summary, total: money2(b.total), totalAmount: Number(b.total) || 0
      });
    } finally { setPrinting(''); }
  };

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
            <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>ยกเลิก / แก้ไขบิลที่ชำระแล้ว</div>
            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>เฉพาะบิลของวันนี้{day ? ` · ${thaiDay(day)}` : ''}</div>
          </div>
          <button onClick={load} title="โหลดใหม่" style={{ ...btn('#fff', '#334155', '#cbd5e1'), padding: '0.45rem 0.6rem' }}><RefreshCw size={16} className={loading ? 'spin' : ''} /></button>
          <button onClick={onClose} title="ปิด" style={{ ...btn('#fff', '#334155', '#cbd5e1'), padding: '0.45rem 0.6rem' }}><X size={16} /></button>
        </div>

        {done && (
          <div style={{ marginTop: '0.8rem', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 10, padding: '0.65rem 0.8rem', fontSize: '0.86rem', lineHeight: 1.55 }}>
            {done.edited ? <>
              <b>แก้ไขบิล {done.orderNumber} ครั้งที่ {done.editNo} แล้ว</b> · ยอดใหม่ ฿{baht(done.newTotal)}{done.crmLabel ? ` · ${done.crmLabel}` : ''}{done.pointsReversed ? ` (${done.pointsReversed} แต้ม)` : ''}
              <div style={{ color: done.printed ? undefined : '#b91c1c', fontWeight: done.printed ? 400 : 700 }}>{done.printed ? 'พิมพ์ใบแจ้งยอดใหม่พร้อม QR ยอดใหม่แล้ว' : `พิมพ์ใบแจ้งยอดใหม่ไม่สำเร็จ${done.printError ? ` (${done.printError})` : ''} — บิลแก้ไขแล้ว พิมพ์ใหม่ได้ด้วยปุ่มเครื่องพิมพ์ข้างบิล`}</div>
            </> : <>
              <b>ยกเลิกบิล {done.orderNumber} แล้ว</b> · {done.crmLabel}{done.pointsReversed ? ` (${done.pointsReversed} แต้ม)` : ''}
              <div>อย่าลืมคืนเงิน ฿{baht(done.total)} ให้ลูกค้า (โอนคืน/เงินสด)</div>
            </>}
            {done.crmError ? <div style={{ color: '#b45309' }}>{done.crmError}</div> : null}
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
                {b.edits && b.edits.length > 0 && (
                  <div style={{ fontSize: '0.78rem', marginTop: '0.25rem', color: '#0369a1' }}>
                    {b.edits.map(e => <div key={e.no}>แก้ไขครั้งที่ {e.no} · {timeOf(e.at)} โดย {e.by || '—'} · ฿{baht(e.oldTotal)} → ฿{baht(e.newTotal)} · {e.reason}</div>)}
                  </div>
                )}
                {b.cancelled && (
                  <div style={{ fontSize: '0.8rem', marginTop: '0.3rem', color: '#991b1b' }}>
                    {b.void ? <>ยกเลิก {timeOf(b.void.at)} โดย {b.void.by || '—'} · หมายเหตุ: <b>{b.void.reason}</b>
                      <div style={{ color: b.void.crmStatus === 'failed' ? '#b91c1c' : '#64748b' }}>{b.void.crmLabel}{b.void.pointsReversed ? ` (${b.void.pointsReversed} แต้ม)` : ''}</div></>
                      : 'ยกเลิกแล้ว (ก่อนมีระบบหมายเหตุ)'}
                  </div>
                )}
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: b.cancelled ? '#94a3b8' : '#0f172a', minWidth: 90, textAlign: 'right' }}>฿{baht(b.total)}</div>
              {!b.cancelled && onPrintPreBill && (
                <button onClick={() => printStatement(b)} disabled={printing === b.orderNumber} title="พิมพ์ใบแจ้งยอด (QR ยอดปัจจุบัน)"
                  style={{ ...btn('#fff', '#334155', '#cbd5e1'), padding: '0.55rem 0.65rem', opacity: printing === b.orderNumber ? 0.5 : 1 }}>
                  <Printer size={15} />
                </button>
              )}
              {!b.cancelled && (
                <button onClick={() => setEditing(b)} disabled={!!b.taxInvoiceNo}
                  title={b.taxInvoiceNo ? 'ยกเลิกใบกำกับภาษีก่อน' : (b.editBlocked || '')}
                  style={{ ...btn('#fff', b.taxInvoiceNo || b.editBlocked ? '#94a3b8' : '#0369a1', b.taxInvoiceNo || b.editBlocked ? '#cbd5e1' : '#0369a1'), cursor: b.taxInvoiceNo ? 'not-allowed' : 'pointer' }}>
                  <Pencil size={15} /> แก้ไข
                </button>
              )}
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

      {editing && <EditBillModal bill={editing} discounts={discounts} settings={settings} menu={menu} branchId={branchId} onPrintPreBill={onPrintPreBill}
        onClose={() => setEditing(null)} onDone={(r) => { setEditing(null); setDone({ ...r, edited: true, total: r.newTotal }); load(); }} />}

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

// ── แก้ไขบิล: ใช้เลขบิลเดิม · ลบ/ลดจำนวนรายการ · ใส่ส่วนลด (ที่ตั้งในหลังบ้าน) · พิมพ์ใบแจ้งยอดใหม่พร้อม QR ยอดใหม่ ──
// คิดเงินแบบเดียวกับหน้าชำระเงิน: ส่วนลด (เฉพาะหมวดได้) → เซอร์วิสชาร์จ → VAT
const calcCharges = (subtotal, settings = {}, discountIn = 0) => {
  const discountAmount = Math.min(Math.max(0, Number(discountIn) || 0), subtotal);
  const afterDiscount = subtotal - discountAmount;
  const scRate = settings?.serviceCharge?.enabled ? (settings.serviceCharge.rate || 0) : 0;
  const vatRate = settings?.vat?.enabled ? (settings.vat.rate || 0) : 0;
  const sc = Math.round(afterDiscount * scRate) / 100;
  const vat = Math.round((afterDiscount + sc) * vatRate) / 100;
  return { discountAmount, sc, vat, grand: Math.round((afterDiscount + sc + vat) * 100) / 100 };
};
const money2 = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function EditBillModal({ bill, discounts = [], settings = {}, menu = [], branchId = '', onPrintPreBill, onClose, onDone }) {
  const [rows, setRows] = useState(() => bill.items.map(i => ({ line: i.line, name: i.name, options: i.options || [], unit: (Number(i.price) || 0) / (Number(i.qty) || 1), orig: Number(i.qty) || 1, qty: Number(i.qty) || 1 })));
  const [discountId, setDiscountId] = useState(() => {
    const cur = bill.discount && bill.discount.kind !== 'coupon' ? discounts.find(d => d.name === bill.discount.name) : null;
    return cur ? String(cur.id) : '';
  });
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const categoriesOf = React.useMemo(() => menuCategoryLookup(menu), [menu]);
  const setQty = (line, q) => setRows(rs => rs.map(r => (r.line === line ? { ...r, qty: Math.max(0, Math.min(r.orig, q)) } : r)));
  const subtotal = Math.round(rows.reduce((s, r) => s + r.unit * r.qty, 0) * 100) / 100;
  const disc = discounts.find(d => String(d.id) === String(discountId)) || null;
  const lines = rows.filter(r => r.qty > 0).map(r => ({ name: r.name, amount: r.unit * r.qty }));
  const { discountAmount: off, sc, vat, grand: newTotal } = calcCharges(subtotal, settings, calcDiscount(disc, lines, categoriesOf));
  const itemsChanged = rows.some(r => r.qty !== r.orig);
  const changed = itemsChanged || Math.abs(newTotal - Number(bill.total)) > 0.005 || (disc ? disc.name : null) !== (bill.discount ? bill.discount.name : null);
  const allGone = rows.every(r => r.qty === 0);
  const diff = Number(bill.total) - newTotal;
  const blocked = bill.editBlocked || '';

  const submit = async () => {
    if (!changed) { setErr('ยังไม่ได้แก้ไขรายการหรือส่วนลด'); return; }
    if (allGone) { setErr('ลบทุกรายการไม่ได้ ใช้ปุ่ม "ยกเลิกบิล" แทน'); return; }
    if (newTotal > Number(bill.total) + 0.005) { setErr('แก้ไขบิลได้แค่ลดยอด'); return; }
    if (reason.trim().length < 3) { setErr('กรุณาใส่หมายเหตุว่าแก้ไขเพราะอะไร'); return; }
    setBusy(true); setErr('');
    try {
      const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({
        action: 'editBill', orderNumber: bill.orderNumber, branchId, reason: reason.trim(),
        lines: rows.map(r => ({ line: r.line, qty: r.qty })),
        discountId: disc ? String(disc.id) : '', discountAmount: off, serviceCharge: sc, vat, newTotal
      }) });
      const json = await res.json().catch(() => null);
      if (!json || json.success !== true) throw new Error((json && json.error) || 'แก้ไขบิลไม่สำเร็จ');
      // ใบแจ้งยอดใหม่ เลขบิลเดิม + QR ยอดใหม่ (ใช้ตัวพิมพ์ใบแจ้งยอดเดียวกับหน้าขาย)
      const summary = [{ label: 'แก้ไขบิล', value: `ครั้งที่ ${json.editNo} (แทนใบแจ้งยอดเดิม)` }];
      if (json.discount || json.serviceCharge > 0 || json.vat > 0) summary.push({ label: 'ยอดอาหาร', value: money2(json.subtotal) });
      if (json.discount) summary.push({ label: `ส่วนลด ${json.discount.name}`, value: `-${money2(json.discount.amount)}` });
      if (json.serviceCharge > 0) summary.push({ label: `เซอร์วิสชาร์จ ${settings.serviceCharge.rate}%`, value: money2(json.serviceCharge) });
      if (json.vat > 0) summary.push({ label: `VAT ${settings.vat.rate}%`, value: money2(json.vat) });
      let printed = false; let printError = 'ไม่มีเครื่องพิมพ์ใบแจ้งยอด';
      if (onPrintPreBill) {
        try {
          const pr = await onPrintPreBill({
            orderNumber: bill.orderNumber,
            customerDetails: { name: bill.tableNo ? `โต๊ะ ${bill.tableNo}` : '' },
            items: json.items.map(i => ({ isFlattened: true, name: i.qty > 1 ? `${i.name} (x${i.qty})` : i.name, amount: i.price, subItems: i.options || [] })),
            summary,
            total: money2(json.newTotal),
            totalAmount: json.newTotal
          });
          printed = !!(pr && pr.printed);
          printError = (pr && pr.error) || '';
        } catch (e) { printError = e.message || String(e); }
      }
      onDone({ ...json, printed, printError });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const chip = (on) => ({ padding: '0.35rem 0.7rem', borderRadius: 999, border: `1.5px solid ${on ? '#0369a1' : '#cbd5e1'}`, background: on ? '#e0f2fe' : '#fff', color: on ? '#0369a1' : '#334155', fontWeight: on ? 800 : 500, fontFamily: 'inherit', fontSize: '0.82rem', cursor: 'pointer' });
  const line = (k, v, style = {}) => <div style={{ display: 'flex', justifyContent: 'space-between', ...style }}><span>{k}</span><span>{v}</span></div>;
  return (
    <div style={{ ...overlay, zIndex: 950, alignItems: 'center' }} onClick={(e) => { e.stopPropagation(); if (!busy) onClose(); }}>
      <div style={{ ...panel, maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 800 }}>
          <Pencil size={20} color="#0369a1" /> แก้ไขบิล {bill.orderNumber}
        </div>
        {blocked ? (
          <>
            <div style={{ marginTop: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '0.65rem 0.8rem', fontSize: '0.88rem' }}>{blocked}</div>
            <button onClick={onClose} style={{ ...btn('#fff', '#334155', '#cbd5e1'), width: '100%', justifyContent: 'center', marginTop: '0.9rem' }}>ปิด</button>
          </>
        ) : (<>
        <div style={{ marginTop: '0.6rem', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', borderRadius: 10, padding: '0.55rem 0.75rem', fontSize: '0.82rem', lineHeight: 1.55 }}>
          ใช้<b>เลขบิลเดิม {bill.orderNumber}</b> · ลบรายการหรือใส่ส่วนลดได้ · กดบันทึกแล้ว<b>พิมพ์ใบแจ้งยอดใหม่พร้อม QR ยอดใหม่</b>
          {bill.edits && bill.edits.length ? <div>แก้ไขไปแล้ว {bill.edits.length} ครั้ง</div> : null}
        </div>

        <div style={{ marginTop: '0.75rem', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
          {rows.map(r => {
            const gone = r.qty === 0;
            return (
              <div key={r.line} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.7rem', borderBottom: '1px solid #f1f5f9', background: gone ? '#fef2f2' : '#fff' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', textDecoration: gone ? 'line-through' : 'none', color: gone ? '#b91c1c' : '#0f172a' }}>{r.name}</div>
                  {r.options.length > 0 && <div style={{ fontSize: '0.75rem', color: '#475569' }}>↳ {r.options.join(', ')}</div>}
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>฿{baht(r.unit)} / ชิ้น{r.qty !== r.orig && !gone ? ` · เดิม ${r.orig}` : ''}{gone ? ' · ลบออก' : ''}</div>
                </div>
                {gone ? (
                  <button onClick={() => setQty(r.line, r.orig)} style={{ ...btn('#fff', '#334155', '#cbd5e1'), padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}><RotateCcw size={14} /> คืนรายการ</button>
                ) : (
                  <>
                    {r.orig > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <button onClick={() => setQty(r.line, r.qty - 1)} style={{ ...btn('#fff', '#334155', '#cbd5e1'), padding: '0.3rem' }}><Minus size={14} /></button>
                        <b style={{ minWidth: 22, textAlign: 'center' }}>{r.qty}</b>
                        <button onClick={() => setQty(r.line, r.qty + 1)} disabled={r.qty >= r.orig} style={{ ...btn('#fff', r.qty >= r.orig ? '#cbd5e1' : '#334155', '#cbd5e1'), padding: '0.3rem' }}><Plus size={14} /></button>
                      </div>
                    )}
                    <div style={{ minWidth: 70, textAlign: 'right', fontWeight: 700 }}>฿{baht(r.unit * r.qty)}</div>
                    <button onClick={() => setQty(r.line, 0)} title="ลบรายการ" style={{ ...btn('#fff', '#dc2626', '#fecaca'), padding: '0.35rem' }}><Trash2 size={15} /></button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <label style={{ display: 'block', fontWeight: 700, marginTop: '0.8rem', fontSize: '0.9rem' }}>ส่วนลด <span style={{ fontWeight: 500, color: '#64748b', fontSize: '0.78rem' }}>(ตั้งที่หลังบ้าน &gt; ส่วนลด)</span></label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
          <button style={chip(!discountId)} onClick={() => setDiscountId('')}>ไม่มีส่วนลด</button>
          {discounts.map(d => (
            <button key={d.id} style={chip(String(discountId) === String(d.id))} onClick={() => setDiscountId(String(d.id))}>
              {d.name}{d.type === 'percent' && !String(d.name || '').includes('%') ? ` (${d.value}%)` : ''}
            </button>
          ))}
        </div>

        <div style={{ marginTop: '0.75rem', background: '#f8fafc', borderRadius: 10, padding: '0.6rem 0.8rem', fontSize: '0.88rem', lineHeight: 1.7 }}>
          {line('ยอดบิลเดิม', <span style={{ textDecoration: changed ? 'line-through' : 'none', color: '#64748b' }}>฿{baht(bill.total)}</span>)}
          {line('รวมรายการ', `฿${baht(subtotal)}`)}
          {off > 0 && line(`ส่วนลด ${disc.name}`, <span style={{ color: '#16a34a' }}>-฿{baht(off)}</span>)}
          {sc > 0 && line(`เซอร์วิสชาร์จ ${settings.serviceCharge.rate}%`, `+฿${baht(sc)}`)}
          {vat > 0 && line(`VAT ${settings.vat.rate}%`, `+฿${baht(vat)}`)}
          {line(<b>ยอดใหม่ (QR ในใบแจ้งยอด)</b>, <b style={{ color: '#0369a1', fontSize: '1.1rem' }}>฿{baht(newTotal)}</b>, { borderTop: '1px dashed #cbd5e1', marginTop: '0.3rem', paddingTop: '0.3rem' })}
          {diff > 0.005 && line('ส่วนต่างจากยอดเดิม', <span style={{ color: '#dc2626', fontWeight: 700 }}>-฿{baht(diff)}</span>)}
          {diff < -0.005 && <div style={{ color: '#b91c1c', fontWeight: 700 }}>ยอดใหม่สูงกว่ายอดเดิม — แก้ไขบิลได้แค่ลดยอด</div>}
          {bill.memberId && <div style={{ fontSize: '0.78rem', color: '#64748b' }}>สมาชิก {bill.memberId}: แต้มคิดใหม่จากยอดใหม่</div>}
        </div>

        <label style={{ display: 'block', fontWeight: 700, marginTop: '0.8rem', fontSize: '0.9rem' }}>หมายเหตุ (จำเป็น)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', margin: '0.4rem 0' }}>
          {EDIT_REASONS.map(x => (
            <button key={x} onClick={() => setReason(reason.trim() ? `${reason.trim()} · ${x}` : x)}
              style={{ padding: '0.3rem 0.65rem', borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', fontFamily: 'inherit', fontSize: '0.8rem', cursor: 'pointer' }}>{x}</button>
          ))}
        </div>
        <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 300))} rows={2}
          placeholder="เช่น ลูกค้ายกเลิกไก่ทอด ให้ส่วนลดสมาชิก"
          style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.7rem', borderRadius: 10, border: '1.5px solid #cbd5e1', fontFamily: 'inherit', fontSize: '0.9rem', resize: 'vertical' }} />

        {err && <div style={{ color: '#b91c1c', fontWeight: 600, fontSize: '0.85rem', marginTop: '0.5rem' }}>❌ {err}</div>}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem' }}>
          <button onClick={onClose} disabled={busy} style={{ ...btn('#fff', '#334155', '#cbd5e1'), flex: 1, justifyContent: 'center' }}>ไม่แก้ไข</button>
          <button onClick={submit} disabled={busy} style={{ ...btn('#0369a1'), flex: 1.6, justifyContent: 'center', opacity: busy ? 0.6 : (changed && !allGone ? 1 : 0.5) }}>
            <Pencil size={16} /> {busy ? 'กำลังบันทึก…' : 'บันทึก + พิมพ์ใบแจ้งยอดใหม่'}
          </button>
        </div>
        </>)}
      </div>
    </div>
  );
}
