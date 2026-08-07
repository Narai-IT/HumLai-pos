import React, { useState } from 'react';
import { Clock, X, CheckCircle, Printer } from 'lucide-react';
import { print80mm } from '../utils/print80mm';

const ShiftModal = ({ mode, currentShift, shiftSales, currentUser, pendingTables = [], onConfirmOpen, onConfirmClose, onClose }) => {
  const [openCash, setOpenCash]   = useState('');
  const [closeCash, setCloseCash] = useState('');
  const [note, setNote]           = useState('');
  const [saving, setSaving]       = useState(false);
  const [billInfo, setBillInfo]   = useState({}); // { [tableNo]: { name, phone } }

  const setInfo = (tableNo, field, value) => {
    setBillInfo(prev => ({ ...prev, [tableNo]: { ...prev[tableNo], [field]: value } }));
  };
  const pendingTotal = pendingTables.reduce((s, t) => s + (Number(t.total) || 0), 0);

  const fmt  = (n) => (Number(n) || 0).toLocaleString('th-TH');
  const fmtD = (ts) => {
    if (!ts) return '—';
    try { return new Date(ts).toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch { return ts; }
  };

  const sales        = shiftSales || {};
  const openCashAmt  = Number(currentShift?.openCash) || 0;
  const cashReceived = Number(sales.totalCash) || 0;
  const closeAmt     = Number(closeCash) || 0;
  const cashDiff     = closeCash !== '' ? closeAmt - openCashAmt - cashReceived : null;

  const handleConfirm = async () => {
    setSaving(true);
    if (mode === 'open') await onConfirmOpen(Number(openCash) || 0);
    else                 await onConfirmClose(Number(closeCash) || 0, note, billInfo);
    setSaving(false);
  };

  const buildShiftReportHtml = () => {
    const line = (k, v) => `<div class="row"><span>${k}</span><span>${v}</span></div>`;
    const pendingRows = pendingTables.map(t => {
      const info = billInfo[t.tableNo] || {};
      const who = [info.name, info.phone].filter(Boolean).join(' ');
      return `<div class="it"><div class="row"><span>โต๊ะ ${t.tableNo}${who ? ' · ' + who : ''}</span><span>฿${fmt(t.total)}</span></div></div>`;
    }).join('');
    return `
      <div class="c xl">ข้าวมันไก่หำไหล</div>
      <div class="c sm">รายงานปิดกะ / SHIFT REPORT</div>
      <div class="hr"></div>
      ${line('กะ', currentShift?.id || '-')}
      ${line('เปิดกะ', fmtD(currentShift?.openTime))}
      ${line('โดย', currentShift?.openStaff || '-')}
      ${line('ปิดกะ', fmtD(new Date().toISOString()))}
      ${line('ปิดโดย', currentUser?.username || '-')}
      <div class="hr"></div>
      <div class="b">ยอดขาย</div>
      ${line('ยอดขายรวม', `฿${fmt(sales.totalSales)}`)}
      ${line('จำนวนบิล', `${sales.totalOrders || 0} บิล`)}
      ${line('เงินสด', `฿${fmt(sales.totalCash)}`)}
      ${line('โอน / QR', `฿${fmt(sales.totalTransfer)}`)}
      ${line('บัตรเครดิต', `฿${fmt(sales.totalCard)}`)}
      <div class="hr"></div>
      <div class="b">สรุปเงินสด</div>
      ${line('เงินเปิดกะ', `฿${fmt(openCashAmt)}`)}
      ${line('รับเงินสด', `฿${fmt(cashReceived)}`)}
      ${line('เงินในลิ้นชักปิด', `฿${fmt(closeAmt)}`)}
      ${line('ส่วนต่าง', cashDiff !== null ? `฿${fmt(cashDiff)}` : '-')}
      ${pendingTables.length > 0 ? `<div class="hr"></div><div class="b">บิลค้าง ${pendingTables.length} โต๊ะ (฿${fmt(pendingTotal)})</div>${pendingRows}` : ''}
      ${note ? `<div class="hr"></div><div>หมายเหตุ: ${note}</div>` : ''}
      <div class="hr"></div>
      <div class="c sm">${new Date().toLocaleString('th-TH')}</div>
    `;
  };

  const inp = { width: '100%', padding: '0.7rem 0.9rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, color: 'white', fontSize: '1rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };
  const lbl = { display: 'block', color: 'rgba(255,255,255,0.55)', fontSize: '0.8rem', marginBottom: '0.4rem' };
  const accent = mode === 'open' ? '#22c55e' : '#ef4444';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '1rem' }} onClick={onClose}>
      <div style={{ background: '#1a1a2e', border: `1px solid ${mode === 'open' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 18, padding: '1.75rem', width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', color: accent }}>
            <Clock size={20} /> {mode === 'open' ? 'เปิดกะ' : 'ปิดกะ'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}><X size={22} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Open shift form */}
          {mode === 'open' && (
            <>
              <div style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '0.85rem 1rem', fontSize: '0.88rem', color: 'rgba(255,255,255,0.65)' }}>
                พนักงาน: <strong style={{ color: '#22c55e' }}>{currentUser?.username || 'ไม่ระบุ'}</strong>
                &nbsp;•&nbsp; เวลา: <strong style={{ color: 'white' }}>{fmtD(new Date().toISOString())}</strong>
              </div>
              <div>
                <label style={lbl}>เงินสดในลิ้นชัก (บาท)</label>
                <input type="number" min="0" style={inp} placeholder="0" value={openCash} onChange={e => setOpenCash(e.target.value)} autoFocus />
              </div>
            </>
          )}

          {/* Close shift form */}
          {mode === 'close' && (
            <>
              {/* Shift info */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '0.85rem 1rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.55)' }}>
                เปิดกะ: <strong style={{ color: 'white' }}>{fmtD(currentShift?.openTime)}</strong>
                &nbsp;•&nbsp; โดย <strong style={{ color: '#22c55e' }}>{currentShift?.openStaff}</strong>
              </div>

              {/* Sales summary grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                {[
                  { label: 'ยอดขายรวม', value: `฿${fmt(sales.totalSales)}`, color: '#a78bfa' },
                  { label: 'จำนวนบิล', value: `${sales.totalOrders || 0} บิล`, color: 'white' },
                  { label: 'เงินสด', value: `฿${fmt(sales.totalCash)}`, color: '#22c55e' },
                  { label: 'โอน / QR', value: `฿${fmt(sales.totalTransfer)}`, color: '#38bdf8' },
                  { label: 'บัตรเครดิต', value: `฿${fmt(sales.totalCard)}`, color: '#f97316' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '0.65rem 0.85rem' }}>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem', marginBottom: 3 }}>{label}</div>
                    <div style={{ color, fontWeight: 700, fontSize: '1rem' }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Closing cash */}
              <div>
                <label style={lbl}>เงินสดในลิ้นชักตอนปิด (บาท)</label>
                <input type="number" min="0" style={inp} placeholder="0" value={closeCash} onChange={e => setCloseCash(e.target.value)} autoFocus />
              </div>

              {/* Cash reconciliation */}
              {closeCash !== '' && (
                <div style={{ background: cashDiff !== null && Math.abs(cashDiff) < 1 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${cashDiff !== null && Math.abs(cashDiff) < 1 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 10, padding: '0.9rem 1rem' }}>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem', marginBottom: '0.5rem', fontWeight: 600, letterSpacing: '0.05em' }}>สรุปเงินสด</div>
                  {[
                    ['เงินในลิ้นชักตอนปิด', `฿${fmt(closeCash)}`, 'white'],
                    ['หัก เงินเปิดกะ', `-฿${fmt(openCashAmt)}`, 'rgba(255,255,255,0.6)'],
                    ['หัก รับเงินสด', `-฿${fmt(cashReceived)}`, 'rgba(255,255,255,0.6)'],
                  ].map(([k, v, c]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: 4 }}>
                      <span style={{ color: 'rgba(255,255,255,0.55)' }}>{k}</span>
                      <span style={{ color: c }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8, marginTop: 6 }}>
                    <span>ส่วนต่าง</span>
                    <span style={{ color: cashDiff !== null && Math.abs(cashDiff) < 1 ? '#22c55e' : '#ef4444' }}>
                      {cashDiff !== null && cashDiff >= 0 ? '+' : ''}{cashDiff !== null ? `฿${fmt(cashDiff)}` : '—'}
                      {cashDiff !== null && (Math.abs(cashDiff) < 1 ? ' ✓ ตรง' : cashDiff > 0 ? ' (เกิน)' : ' (ขาด)')}
                    </span>
                  </div>
                </div>
              )}

              {/* บิลค้าง: โต๊ะที่ยังไม่ชำระ */}
              {pendingTables.length > 0 && (
                <div style={{ background: 'rgba(180,83,9,0.1)', border: '1px solid rgba(180,83,9,0.35)', borderRadius: 10, padding: '0.9rem 1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                    <span style={{ color: '#f1592a', fontWeight: 700, fontSize: '0.9rem' }}>🧾 บิลค้าง {pendingTables.length} โต๊ะ</span>
                    <span style={{ color: '#f1592a', fontWeight: 800 }}>฿{fmt(pendingTotal)}</span>
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.76rem', margin: '0 0 0.75rem' }}>
                    กรอกชื่อ/เบอร์ลูกค้าของบิลที่ค้างไว้ — เมื่อปิดกะ โต๊ะทั้งหมดจะถูกเคลียร์และย้ายไปที่ "รายการบิลค้าง"
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {pendingTables.map(t => (
                      <div key={t.tableNo} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '0.7rem 0.8rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                          <strong style={{ color: 'white' }}>โต๊ะ {t.tableNo}</strong>
                          <span style={{ color: 'rgba(255,255,255,0.6)' }}>{t.count} รายการ · ฿{fmt(t.total)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input style={{ ...inp, padding: '0.5rem 0.7rem', fontSize: '0.9rem' }} placeholder="ชื่อลูกค้า" value={billInfo[t.tableNo]?.name || ''} onChange={e => setInfo(t.tableNo, 'name', e.target.value)} />
                          <input style={{ ...inp, padding: '0.5rem 0.7rem', fontSize: '0.9rem' }} placeholder="เบอร์โทร" type="tel" value={billInfo[t.tableNo]?.phone || ''} onChange={e => setInfo(t.tableNo, 'phone', e.target.value)} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Note */}
              <div>
                <label style={lbl}>หมายเหตุ (ถ้ามี)</label>
                <input style={inp} placeholder="หมายเหตุ..." value={note} onChange={e => setNote(e.target.value)} />
              </div>

              {/* พิมพ์รายงานปิดกะ 80mm */}
              <button
                onClick={() => print80mm(buildShiftReportHtml())}
                style={{ width: '100%', padding: '0.75rem', background: 'rgba(96,165,250,0.12)', border: '1.5px solid rgba(96,165,250,0.4)', borderRadius: 10, color: '#60a5fa', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                <Printer size={17} /> พิมพ์รายงานปิดกะ (80mm)
              </button>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '0.8rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'white', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
            ยกเลิก
          </button>
          <button onClick={handleConfirm} disabled={saving} style={{ flex: 2, padding: '0.8rem', background: saving ? '#444' : mode === 'open' ? '#16a34a' : '#dc2626', border: 'none', color: 'white', borderRadius: 10, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <CheckCircle size={17} /> {saving ? 'กำลังบันทึก...' : mode === 'open' ? 'เปิดกะ' : 'ปิดกะและบันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShiftModal;
