import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Download, Search } from 'lucide-react';
import { API_URL } from '../../utils/api';

// ── หลังบ้าน > บันทึกการทำงาน (หัวหน้า/แอดมิน) ──
// ทุกการกดที่หน้าร้านของวันที่เลือก: สั่งอาหาร · พิมพ์ใบครัว · ยกเลิกรายการ · ใบแจ้งยอด · ชำระเงิน · แก้ไข/ยกเลิกบิล
// แบบ "ตามบิล/โต๊ะ" รวมเหตุการณ์ของโต๊ะหนึ่งตั้งแต่สั่งจนชำระเงิน · แบบ "เรียงตามเวลา" ทุกเหตุการณ์ในตารางเดียว

const KIND = {
  order: { label: 'สั่งอาหาร', color: '#2563eb' },
  kitchen_print: { label: 'พิมพ์ใบครัว', color: '#7c3aed' },
  kitchen_print_fail: { label: 'พิมพ์ใบครัวไม่สำเร็จ', color: '#b91c1c' },
  cancel_item: { label: 'ยกเลิกรายการ', color: '#dc2626' },
  prebill: { label: 'พิมพ์ใบแจ้งยอด', color: '#d97706' },
  pay: { label: 'ชำระเงิน', color: '#16a34a' },
  edit_bill: { label: 'แก้ไขบิล', color: '#0369a1' },
  void_bill: { label: 'ยกเลิกบิล', color: '#b91c1c' }
};
const FILTERS = [['', 'ทั้งหมด'], ['order', 'สั่งอาหาร'], ['kitchen', 'พิมพ์ใบครัว'], ['cancel_item', 'ยกเลิกรายการ'], ['prebill', 'ใบแจ้งยอด'], ['pay', 'ชำระเงิน'], ['edit_bill', 'แก้ไขบิล'], ['void_bill', 'ยกเลิกบิล']];

const todayYmd = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const hm = (iso) => { try { return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }); } catch { return ''; } };
const baht = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const itemsText = (items) => (items || []).map(i => `${i.name} ×${i.qty}`).join(' · ');
const mins = (a, b) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);

function describe(e) {
  const parts = [];
  if (e.kind === 'order' || e.kind === 'kitchen_print' || e.kind === 'kitchen_print_fail' || e.kind === 'cancel_item' || e.kind === 'edit_bill') {
    const it = itemsText(e.items); if (it) parts.push(e.kind === 'edit_bill' ? 'ลบ ' + it : it);
  }
  if (e.kind === 'cancel_item' && e.amount != null) parts.push('฿' + baht(e.amount));
  if ((e.kind === 'prebill' || e.kind === 'pay' || e.kind === 'void_bill') && e.amount != null) parts.push('฿' + baht(e.amount));
  if (e.detail) parts.push(e.detail);
  return parts.join(' · ');
}

// รวมเหตุการณ์เป็นกลุ่มต่อโต๊ะ: เริ่มที่การสั่ง/พิมพ์ครั้งแรก จบที่ชำระเงิน · แก้ไข/ยกเลิกบิลไปต่อท้ายกลุ่มของบิลนั้น
function groupEvents(events) {
  const groups = []; const open = new Map(); const byBill = new Map();
  for (const e of events) {
    if ((e.kind === 'edit_bill' || e.kind === 'void_bill') && e.orderNumber && byBill.has(e.orderNumber)) { byBill.get(e.orderNumber).events.push(e); continue; }
    const key = e.tableNo || (e.orderNumber ? 'bill:' + e.orderNumber : 'none:' + e.id);
    let g = open.get(key);
    if (!g) { g = { key, tableNo: e.tableNo, orderNumber: '', events: [] }; groups.push(g); open.set(key, g); }
    g.events.push(e);
    if (e.orderNumber && !g.orderNumber) { g.orderNumber = e.orderNumber; byBill.set(e.orderNumber, g); }
    if (e.kind === 'pay' || e.kind === 'void_bill') open.delete(key);
  }
  return groups.map(g => {
    const pay = g.events.find(e => e.kind === 'pay');
    const voided = g.events.find(e => e.kind === 'void_bill');
    const edits = g.events.filter(e => e.kind === 'edit_bill');
    const lastEdit = edits[edits.length - 1];
    return { ...g, pay, voided, edits: edits.length, first: g.events[0].at, last: g.events[g.events.length - 1].at,
      total: voided ? voided.amount : lastEdit ? lastEdit.amount : pay ? pay.amount : null };
  }).sort((a, b) => String(b.last).localeCompare(String(a.last)));
}

const box = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12 };
const chip = (on) => ({ border: `1px solid ${on ? '#eab308' : '#cbd5e1'}`, background: on ? '#fef9c3' : '#fff', fontWeight: on ? 700 : 500, borderRadius: 999, padding: '0.3rem 0.75rem', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', color: '#0f172a' });
const tag = (c, bg) => ({ fontSize: '0.72rem', padding: '0.1rem 0.55rem', borderRadius: 999, fontWeight: 700, color: c, background: bg });

export default function ActivityLog({ branch = '' }) {
  const branches = useMemo(() => { try { const d = JSON.parse(localStorage.getItem('gas_all_data') || '{}'); return Array.isArray(d.branches) ? d.branches : []; } catch { return []; } }, []);
  const [date, setDate] = useState(todayYmd());
  const [branchId, setBranchId] = useState(() => { const b = branches.find(x => String(x.id).toLowerCase() === String(branch).toLowerCase()); return b ? String(b.id) : ''; });
  const [kind, setKind] = useState('');
  const [staff, setStaff] = useState('');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('bills');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_URL}?action=getActivityLog&date=${date}&branch=${encodeURIComponent(branchId)}`);
      const json = await res.json();
      if (!json || !json.success) throw new Error((json && json.error) || 'โหลดไม่สำเร็จ');
      setEvents(json.events || []);
    } catch (e) { setError(e.message); setEvents([]); }
    setLoading(false);
  }, [date, branchId]);
  useEffect(() => { load(); }, [load]);

  const staffList = useMemo(() => [...new Set(events.map(e => e.staff).filter(Boolean))].sort(), [events]);
  const ql = q.trim().toLowerCase();
  const shown = events.filter(e => (!kind || (kind === 'kitchen' ? e.kind.startsWith('kitchen') : e.kind === kind))
    && (!staff || e.staff === staff)
    && (!ql || [e.tableNo, e.orderNumber, e.reason, e.detail, itemsText(e.items)].some(v => String(v || '').toLowerCase().includes(ql))));
  const groups = useMemo(() => groupEvents(shown), [shown]);

  // สรุปของวัน (ไม่ขึ้นกับตัวกรองประเภท)
  const sum = useMemo(() => {
    const paid = events.filter(e => e.kind === 'pay');
    const cancels = events.filter(e => e.kind === 'cancel_item');
    const voids = events.filter(e => e.kind === 'void_bill');
    const all = groupEvents(events).filter(g => g.pay && g.events[0].kind !== 'pay');
    const avg = all.length ? Math.round(all.reduce((t, g) => t + mins(g.first, g.pay.at), 0) / all.length) : null;
    return {
      bills: new Set(paid.map(e => e.orderNumber)).size,
      items: events.filter(e => e.kind === 'order').reduce((t, e) => t + (e.items || []).reduce((s, i) => s + (Number(i.qty) || 1), 0), 0),
      cancels: cancels.length, cancelAmt: cancels.reduce((t, e) => t + (Number(e.amount) || 0), 0),
      edits: events.filter(e => e.kind === 'edit_bill').length,
      voids: voids.length, voidAmt: voids.reduce((t, e) => t + (Number(e.amount) || 0), 0),
      kitchenFail: events.filter(e => e.kind === 'kitchen_print_fail').length, avg
    };
  }, [events]);

  const downloadCsv = () => {
    const head = ['เวลา', 'สาขา', 'โต๊ะ', 'เลขบิล', 'การทำงาน', 'รายการ', 'ยอด', 'รายละเอียด', 'เหตุผล', 'พนักงาน'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = shown.map(e => [hm(e.at), e.branchId, e.tableNo, e.orderNumber, KIND[e.kind]?.label || e.kind, itemsText(e.items), e.amount ?? '', e.detail, e.reason, e.staff].map(esc).join(','));
    const blob = new Blob(['﻿' + [head.map(esc).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `activity_${date}${branchId ? '_' + branchId : ''}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  const Ev = ({ e, prev }) => {
    const k = KIND[e.kind] || { label: e.kind, color: '#64748b' };
    const gap = prev ? mins(prev.at, e.at) : 0;
    return (
      <>
        {gap >= 5 && <div style={{ fontSize: '0.72rem', color: '#94a3b8', padding: '0 0 0.1rem 3.6rem' }}>↓ {gap} นาที</div>}
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '3.2rem 10rem 1fr 7rem', gap: '0.5rem', fontSize: '0.85rem', padding: '0.25rem 0', alignItems: 'start' }}>
          <span style={{ position: 'absolute', left: '-1.32rem', top: '0.55rem', width: 10, height: 10, borderRadius: '50%', background: k.color }} />
          <b style={{ fontVariantNumeric: 'tabular-nums' }}>{hm(e.at)}</b>
          <b style={{ color: k.color }}>{k.label}</b>
          <span>{describe(e)}{e.reason ? <i style={{ color: '#64748b' }}> · "{e.reason}"</i> : null}</span>
          <span style={{ color: '#64748b', textAlign: 'right' }}>{e.staff || '—'}</span>
        </div>
      </>
    );
  };

  return (
    <div style={{ padding: '1.25rem 1.5rem', color: '#0f172a' }}>
      <h1 style={{ margin: 0, fontSize: '1.5rem' }}>บันทึกการทำงาน</h1>
      <div style={{ color: '#64748b', fontSize: '0.85rem', margin: '0.15rem 0 0.9rem' }}>ทุกการกดที่หน้าร้าน: สั่งอาหาร · พิมพ์ใบครัว · ยกเลิกรายการ · ใบแจ้งยอด · ชำระเงิน · แก้ไข/ยกเลิกบิล · ใครทำ กี่โมง</div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.6rem' }}>
        <input type="date" value={date} max={todayYmd()} onChange={e => setDate(e.target.value || todayYmd())} style={{ ...box, padding: '0.45rem 0.6rem', fontFamily: 'inherit' }} />
        <select value={branchId} onChange={e => setBranchId(e.target.value)} style={{ ...box, padding: '0.45rem 0.6rem', fontFamily: 'inherit' }}>
          <option value="">ทุกสาขา</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name || b.id}</option>)}
        </select>
        <select value={staff} onChange={e => setStaff(e.target.value)} style={{ ...box, padding: '0.45rem 0.6rem', fontFamily: 'inherit' }}>
          <option value="">พนักงาน: ทุกคน</option>
          {staffList.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 9, top: 10, color: '#94a3b8' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="โต๊ะ / เลขบิล / เมนู / เหตุผล" style={{ ...box, padding: '0.45rem 0.6rem 0.45rem 1.9rem', fontFamily: 'inherit', minWidth: 220 }} />
        </div>
        <button onClick={load} style={{ ...box, padding: '0.45rem 0.6rem', cursor: 'pointer' }} title="โหลดใหม่"><RefreshCw size={15} /></button>
        <button onClick={downloadCsv} disabled={!shown.length} style={{ marginLeft: 'auto', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 9, padding: '0.5rem 0.85rem', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', gap: '0.35rem', alignItems: 'center', opacity: shown.length ? 1 : 0.5 }}>
          <Download size={15} /> ดาวน์โหลด Excel (CSV)
        </button>
      </div>
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
        {FILTERS.map(([v, l]) => <button key={v || 'all'} style={chip(kind === v)} onClick={() => setKind(v)}>{l}</button>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.6rem', marginBottom: '0.9rem' }}>
        {[
          [sum.bills, 'บิลที่ชำระ'], [sum.items, 'รายการที่สั่ง'],
          [sum.cancels, `ยกเลิกรายการ (฿${baht(sum.cancelAmt)})`, '#dc2626'], [sum.edits, 'แก้ไขบิล', '#0369a1'],
          [sum.voids, `ยกเลิกบิล (฿${baht(sum.voidAmt)})`, '#b91c1c'], [sum.kitchenFail, 'พิมพ์ใบครัวไม่สำเร็จ', sum.kitchenFail ? '#b91c1c' : undefined],
          [sum.avg == null ? '—' : sum.avg, 'นาที สั่ง → ชำระ (เฉลี่ย)']
        ].map(([v, l, c]) => (
          <div key={l} style={{ ...box, padding: '0.6rem 0.75rem' }}><b style={{ fontSize: '1.35rem', display: 'block', color: c }}>{v}</b><span style={{ fontSize: '0.75rem', color: '#64748b' }}>{l}</span></div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid #e2e8f0', marginBottom: '0.75rem' }}>
        {[['bills', 'ตามบิล / โต๊ะ'], ['list', 'ทั้งหมดเรียงตามเวลา']].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} style={{ padding: '0.5rem 0.8rem', border: 'none', background: 'none', borderBottom: `3px solid ${tab === v ? '#16a34a' : 'transparent'}`, fontWeight: tab === v ? 700 : 500, color: tab === v ? '#0f172a' : '#64748b', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.92rem' }}>{l}</button>
        ))}
      </div>

      {error && <div style={{ color: '#b91c1c', fontWeight: 600 }}>❌ {error}</div>}
      {!error && !loading && !shown.length && <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem 0' }}>ไม่มีบันทึกในวันที่เลือก</div>}

      {tab === 'bills' ? groups.map(g => (
        <div key={g.key + g.first} style={{ ...box, borderRadius: 14, padding: '0.75rem 0.9rem', marginBottom: '0.6rem' }}>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: '1rem' }}>{g.tableNo ? `โต๊ะ ${g.tableNo}` : 'ไม่ระบุโต๊ะ'}{g.orderNumber ? ` · ${g.orderNumber}` : ''}</b>
            {g.voided ? <span style={tag('#991b1b', '#fee2e2')}>ยกเลิกบิล ฿{baht(g.voided.amount)}</span>
              : g.pay ? <span style={tag('#166534', '#dcfce7')}>ชำระแล้ว ฿{baht(g.total)}</span>
              : <span style={tag('#92400e', '#fef3c7')}>ยังไม่ชำระ</span>}
            {g.edits > 0 && <span style={tag('#0369a1', '#e0f2fe')}>แก้ไข {g.edits} ครั้ง</span>}
            <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{hm(g.first)} → {hm(g.last)}{g.pay ? ` (${mins(g.first, g.pay.at)} นาที)` : ''}</span>
          </div>
          <div style={{ margin: '0.5rem 0 0 0.35rem', borderLeft: '2px solid #e2e8f0', paddingLeft: '0.95rem' }}>
            {g.events.map((e, i) => <Ev key={e.id} e={e} prev={g.events[i - 1]} />)}
          </div>
        </div>
      )) : shown.length > 0 && (
        <div style={{ ...box, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead><tr style={{ background: '#f8fafc', color: '#64748b', textAlign: 'left' }}>
              {['เวลา', 'โต๊ะ', 'เลขบิล', 'การทำงาน', 'รายละเอียด', 'เหตุผล', 'พนักงาน'].map(h => <th key={h} style={{ padding: '0.5rem', fontWeight: 600, fontSize: '0.75rem' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {[...shown].reverse().map(e => (
                <tr key={e.id} style={{ borderTop: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                  <td style={{ padding: '0.45rem 0.5rem', fontWeight: 700 }}>{hm(e.at)}</td>
                  <td style={{ padding: '0.45rem 0.5rem' }}>{e.tableNo ? `โต๊ะ ${e.tableNo}` : '—'}</td>
                  <td style={{ padding: '0.45rem 0.5rem' }}>{e.orderNumber || '—'}</td>
                  <td style={{ padding: '0.45rem 0.5rem', fontWeight: 700, color: KIND[e.kind]?.color }}>{KIND[e.kind]?.label || e.kind}</td>
                  <td style={{ padding: '0.45rem 0.5rem' }}>{describe(e)}</td>
                  <td style={{ padding: '0.45rem 0.5rem', color: '#475569' }}>{e.reason || ''}</td>
                  <td style={{ padding: '0.45rem 0.5rem' }}>{e.staff || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
