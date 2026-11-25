import React, { useState } from 'react';
import { Ticket, QrCode, X } from 'lucide-react';
import QrScanner from './QrScanner';
import { scannerChar } from '../utils/qrScan';

// ── หน้าขาย > ปุ่ม Voucher: ใช้ Voucher กับบิลของโต๊ะนี้ก่อนพิมพ์ใบแจ้งยอด/ชำระเงิน ──
// ยิง QR / พิมพ์รหัส Voucher กระดาษ หรือสแกน QR Voucher ในบัตรสมาชิก LINE · ใช้ได้หลายใบ
// ระบบสมาชิกตรวจและจองไว้กับบิลนี้ (ชุดเดียวกับหน้าชำระเงิน) · เกินยอดไม่ทอน
const baht = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function VoucherDialog({ tableNumber, total, vouchers, busy, error, onAdd, onRemove, onClose }) {
  const [code, setCode] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const used = Math.round(vouchers.reduce((a, v) => a + (Number(v.value) || 0), 0) * 100) / 100;
  const due = Math.max(0, Math.round((total - used) * 100) / 100);
  const over = Math.max(0, Math.round((used - total) * 100) / 100);
  const add = async (text) => {
    const c = String(typeof text === 'string' ? text : code).trim();
    if (!c || busy) return;
    if (await onAdd(c)) setCode('');
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="ชำระด้วย Voucher"
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 430, padding: '1.1rem 1.2rem', color: '#0f172a', fontFamily: 'inherit', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 800 }}>
          <Ticket size={20} color="#6d28d9" /> ชำระด้วย Voucher{tableNumber ? ` · โต๊ะ ${tableNumber}` : ''}
          <button type="button" onClick={onClose} aria-label="ปิด" style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.25rem 0 0.7rem' }}>
          Voucher กระดาษ: ยิง QR หรือพิมพ์รหัสบนใบ · Voucher ในบัตรสมาชิก LINE: ให้ลูกค้ากด "ใช้ Voucher" แล้วยิง QR · ใช้ได้หลายใบ
        </div>
        <QrScanner open={scanOpen} onResult={(t) => { setScanOpen(false); add(t); }} onClose={() => setScanOpen(false)} title="สแกน QR Voucher" />
        <form onSubmit={(e) => { e.preventDefault(); add(); }} style={{ display: 'flex', gap: '0.4rem' }}>
          <input value={code} autoFocus autoComplete="off" aria-label="รหัส Voucher"
            onChange={(e) => setCode(e.target.value)}
            // อ่านตามตำแหน่งปุ่มแป้นอังกฤษ: เครื่องยิง QR ตอนคีย์บอร์ดเป็นภาษาไทยก็ได้รหัสถูก
            onKeyDown={(e) => {
              if (e.ctrlKey || e.metaKey || e.altKey || !e.key || e.key.length !== 1) return;
              const ch = scannerChar(e);
              if (ch && ch !== e.key) { e.preventDefault(); setCode(v => v + ch); }
            }}
            placeholder="ยิง QR หรือพิมพ์รหัส เช่น VC-AB12-CD34"
            style={{ flex: 1, minWidth: 0, border: '2px solid #7c3aed', borderRadius: 10, padding: '0.6rem 0.75rem', fontSize: '0.95rem', fontFamily: 'inherit' }} />
          <button type="button" onClick={() => setScanOpen(true)} aria-label="เปิดกล้องสแกน QR" style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 10, padding: '0 0.7rem', cursor: 'pointer' }}><QrCode size={18} /></button>
          <button type="submit" disabled={busy || !code.trim()} style={{ border: 'none', background: '#6d28d9', color: '#fff', borderRadius: 10, padding: '0 0.9rem', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', opacity: busy || !code.trim() ? 0.5 : 1 }}>{busy ? '…' : 'เพิ่ม'}</button>
        </form>
        {error && <div role="alert" style={{ color: '#b91c1c', fontWeight: 700, fontSize: '0.85rem', marginTop: '0.45rem' }}>{error}</div>}

        {vouchers.map(v => (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', border: '1px solid #ddd6fe', background: '#f5f3ff', borderRadius: 10, padding: '0.5rem 0.7rem', marginTop: '0.5rem' }}>
            <Ticket size={18} color="#6d28d9" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800 }}>{v.title || 'Voucher'} <span style={{ color: '#6d28d9' }}>฿{Number(v.value).toLocaleString()}</span></div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{v.code}{v.memberName ? ` · ${v.memberName}` : ''}</div>
            </div>
            <button type="button" onClick={() => onRemove(v)} disabled={busy} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, padding: '0.3rem 0.6rem', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>เอาออก</button>
          </div>
        ))}

        <div style={{ background: '#f8fafc', borderRadius: 10, padding: '0.6rem 0.8rem', marginTop: '0.75rem', fontSize: '0.9rem', lineHeight: 1.7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ยอดบิล</span><b>฿{baht(total)}</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6d28d9' }}><span>Voucher ({vouchers.length} ใบ)</span><b>-฿{baht(used)}</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', marginTop: '0.3rem', paddingTop: '0.3rem' }}>
            <b>ลูกค้าต้องจ่ายเพิ่ม</b><b style={{ color: due > 0 ? '#ea580c' : '#16a34a', fontSize: '1.15rem' }}>฿{baht(due)}</b>
          </div>
          {over > 0 && <div style={{ fontSize: '0.78rem', color: '#b45309' }}>Voucher เกินยอดบิล ฿{baht(over)} · ไม่ทอนเงิน</div>}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.4rem' }}>Voucher จองไว้กับบิลนี้ชั่วคราว · ตัดเป็นใช้แล้วตอนชำระเงิน · เอาออกได้ก่อนชำระ</div>
        <button type="button" onClick={onClose} style={{ width: '100%', marginTop: '0.8rem', padding: '0.7rem', borderRadius: 10, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>เสร็จ</button>
      </div>
    </div>
  );
}
