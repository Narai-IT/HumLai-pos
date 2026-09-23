import React, { useState } from 'react';
import { X, FileText, Printer, Ban } from 'lucide-react';
import { API_URL } from '../../utils/api';
import { printTaxInvoice } from '../../utils/taxInvoicePrint';

// ── ออก / พิมพ์ซ้ำ / ยกเลิก ใบกำกับภาษีของบิลหนึ่งใบ ──
// ยอดเงินและรายการคำนวณที่เซิร์ฟเวอร์จากบิลจริง หน้านี้ส่งแค่ข้อมูลผู้ซื้อ
// ผู้ซื้อที่เคยออกให้ จำไว้ในเครื่องนี้ (localStorage) — พิมพ์เลขผู้เสียภาษีแล้วเติมชื่อ/ที่อยู่ให้เอง

const BUYERS_KEY = 'tax_invoice_buyers';
const readBuyers = () => {
  try { const v = JSON.parse(localStorage.getItem(BUYERS_KEY) || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
};
const rememberBuyer = (buyer) => {
  try {
    const list = [buyer, ...readBuyers().filter(b => b.taxId !== buyer.taxId)].slice(0, 30);
    localStorage.setItem(BUYERS_KEY, JSON.stringify(list));
  } catch { /* เครื่องไม่ให้เก็บก็แค่ไม่จำ */ }
};

const money = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const overlay = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' };
const panel = { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', padding: '1.25rem 1.4rem', color: 'var(--text-main)', fontFamily: 'inherit' };
const label = { display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', margin: '0.75rem 0 0.3rem' };
const input = { width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.7rem', borderRadius: 8, border: '1px solid rgba(0,0,0,0.18)', fontFamily: 'inherit', fontSize: '0.92rem' };
const btn = (bg, color = '#fff') => ({ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', borderRadius: 10, border: 'none', background: bg, color, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem' });

export default function TaxInvoiceModal({ order, invoice, onClose, onChanged, canCancel = false, userName = '' }) {
  const [buyer, setBuyer] = useState({ name: '', taxId: '', address: '', branchType: 'hq', branchNo: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [askCancel, setAskCancel] = useState(false);
  const buyers = readBuyers();

  const set = (k, v) => setBuyer(prev => ({ ...prev, [k]: v }));
  const onTaxId = (v) => {
    const digits = v.replace(/\D/g, '').slice(0, 13);
    const known = digits.length === 13 && buyers.find(b => b.taxId === digits);
    if (known) {
      const hq = !known.branch || known.branch === 'สำนักงานใหญ่';
      setBuyer({ name: known.name, taxId: digits, address: known.address, branchType: hq ? 'hq' : 'branch', branchNo: hq ? '' : known.branch });
    } else set('taxId', digits);
  };

  const openPrint = (inv, copy = false) => {
    if (!printTaxInvoice(inv, { copy })) setError('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ — กดอนุญาตป๊อปอัพของเว็บนี้แล้วกดพิมพ์อีกครั้ง');
  };

  const post = async (body) => {
    const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (!json) throw new Error('เซิร์ฟเวอร์ไม่ตอบ');
    if (json.success !== true) {
      throw new Error(/Unknown action/i.test(json.error || '') ? 'API ยังเป็นรุ่นเก่า — รัน update-api.bat ที่เครื่อง SQL ก่อน' : (json.error || 'ไม่สำเร็จ'));
    }
    return json;
  };

  const issue = async () => {
    setError('');
    if (!buyer.name.trim() || !buyer.address.trim()) { setError('กรุณากรอกชื่อและที่อยู่ผู้ซื้อ'); return; }
    if (buyer.taxId.length !== 13) { setError('เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก'); return; }
    if (buyer.branchType === 'branch' && !buyer.branchNo.trim()) { setError('กรุณาระบุเลขที่สาขาของผู้ซื้อ'); return; }
    const payloadBuyer = {
      name: buyer.name.trim(), taxId: buyer.taxId, address: buyer.address.trim(),
      branch: buyer.branchType === 'hq' ? 'สำนักงานใหญ่' : buyer.branchNo.trim()
    };
    setBusy(true);
    try {
      const json = await post({ action: 'issueTaxInvoice', orderNumber: order.orderNumber, buyer: payloadBuyer, issuedBy: userName });
      rememberBuyer(payloadBuyer);
      onChanged && onChanged(json.invoice);
      openPrint(json.invoice);
    } catch (e) { setError(e.message || String(e)); }
    setBusy(false);
  };

  const cancel = async () => {
    setError('');
    if (!cancelReason.trim()) { setError('กรุณาระบุเหตุผลที่ยกเลิก'); return; }
    setBusy(true);
    try {
      await post({ action: 'cancelTaxInvoice', invoiceNo: invoice.invoiceNo, reason: cancelReason.trim() });
      onChanged && onChanged({ ...invoice, cancelled: true, cancelReason: cancelReason.trim() });
      setAskCancel(false);
      setCancelReason('');
    } catch (e) { setError(e.message || String(e)); }
    setBusy(false);
  };

  const active = invoice && !invoice.cancelled ? invoice : null;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={20} /> ใบกำกับภาษี — บิล {order.orderNumber}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={22} /></button>
        </div>
        <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
          {order.customerName || '—'} · ยอดบิล <b style={{ color: 'var(--text-main)' }}>฿{money(order.total)}</b>
        </div>

        {active ? (
          <>
            <div style={{ marginTop: '1rem', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 12, padding: '0.85rem 1rem', lineHeight: 1.7, fontSize: '0.9rem' }}>
              <div>เลขที่ <b>{active.invoiceNo}</b></div>
              <div>ผู้ซื้อ {active.buyer.name} ({active.buyer.branch || 'สำนักงานใหญ่'})</div>
              <div>เลขผู้เสียภาษี {active.buyer.taxId}</div>
              <div>ก่อน VAT ฿{money(active.subtotal)} · VAT {active.vatRate}% ฿{money(active.vatAmount)} · รวม <b>฿{money(active.total)}</b></div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              <button style={btn('#0f172a')} onClick={() => openPrint(active)}><Printer size={16} /> พิมพ์ต้นฉบับ</button>
              <button style={btn('#475569')} onClick={() => openPrint(active, true)}><Printer size={16} /> พิมพ์สำเนา</button>
              {canCancel && !askCancel && (
                <button style={btn('rgba(220,38,38,0.1)', '#dc2626')} onClick={() => setAskCancel(true)}><Ban size={16} /> ยกเลิกใบนี้</button>
              )}
            </div>
            {askCancel && (
              <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: '0.75rem' }}>
                <label style={label}>เหตุผลที่ยกเลิก (เช่น ชื่อผู้ซื้อผิด) — ยกเลิกแล้วออกใบใหม่ได้ เลขใหม่</label>
                <input style={input} value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <button style={btn('#dc2626')} disabled={busy} onClick={cancel}>{busy ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}</button>
                  <button style={btn('#e2e8f0', '#0f172a')} onClick={() => setAskCancel(false)}>ไม่ยกเลิก</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {invoice && invoice.cancelled && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#b45309' }}>
                ใบเดิม {invoice.invoiceNo} ถูกยกเลิกแล้ว ({invoice.cancelReason}) — ออกใบใหม่ได้ด้านล่าง
              </div>
            )}
            <label style={label}>เลขประจำตัวผู้เสียภาษีผู้ซื้อ (13 หลัก)</label>
            <input style={input} inputMode="numeric" value={buyer.taxId} onChange={e => onTaxId(e.target.value)} list="tax-buyers" placeholder="0105551234567" />
            <datalist id="tax-buyers">{buyers.map(b => <option key={b.taxId} value={b.taxId}>{b.name}</option>)}</datalist>

            <label style={label}>ชื่อผู้ซื้อ / บริษัท</label>
            <input style={input} value={buyer.name} onChange={e => set('name', e.target.value)} placeholder="บริษัท ตัวอย่าง จำกัด" />

            <label style={label}>ที่อยู่</label>
            <textarea style={{ ...input, minHeight: 70, resize: 'vertical' }} value={buyer.address} onChange={e => set('address', e.target.value)} />

            <label style={label}>สถานประกอบการของผู้ซื้อ</label>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.9rem' }}>
              <label><input type="radio" checked={buyer.branchType === 'hq'} onChange={() => set('branchType', 'hq')} /> สำนักงานใหญ่</label>
              <label><input type="radio" checked={buyer.branchType === 'branch'} onChange={() => set('branchType', 'branch')} /> สาขาที่</label>
              {buyer.branchType === 'branch' && (
                <input style={{ ...input, width: 110 }} inputMode="numeric" value={buyer.branchNo} onChange={e => set('branchNo', e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="00001" />
              )}
            </div>

            <div style={{ marginTop: '1.1rem', display: 'flex', gap: '0.5rem' }}>
              <button style={btn('#16a34a')} disabled={busy} onClick={issue}>
                <FileText size={16} /> {busy ? 'กำลังออกใบ...' : 'ออกใบกำกับภาษีและพิมพ์'}
              </button>
              <button style={btn('#e2e8f0', '#0f172a')} onClick={onClose}>ปิด</button>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.75rem 0 0' }}>
              ยอดเงินคิดจากบิลจริง ราคารวม VAT แล้ว (ถอด VAT ตามอัตราในตั้งค่าร้าน ไม่ได้ตั้ง = 7%) · ข้อมูลร้านและเลขผู้เสียภาษีของร้านมาจาก หลังบ้าน &gt; สาขา
            </p>
          </>
        )}

        {error && <div style={{ marginTop: '0.85rem', color: '#dc2626', fontSize: '0.88rem', fontWeight: 600 }}>{error}</div>}
      </div>
    </div>
  );
}
