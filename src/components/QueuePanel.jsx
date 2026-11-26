import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Volume2, VolumeX, Printer, Monitor, Check, SkipForward, RotateCcw, Ticket } from 'lucide-react';
import QueueVoicePicker from './QueueVoicePicker';
import { QUEUE_KINDS, kindOf, queueApi, printQueueTicket, announceQueue, unlockAudio, thaiVoiceAvailable, minutesSince, queueBoardUrl } from '../utils/queue';

// ── หน้า POS > ปุ่ม "คิว": ออกบัตรคิว · เรียกคิว · จัดโต๊ะ · ข้าม/ยกเลิก ──
// tables = [{ name, free }] โต๊ะทานที่ร้านของสาขานี้ · onSeat(name, guests) = เปิดโต๊ะนั้นในหน้าขาย
const SOUND_KEY = 'queue_sound_here';
const POLL_MS = 5000;
const TABS = [
  ['waiting', 'รอเรียก'],
  ['called', 'เรียกแล้ว'],
  ['seated', 'ได้โต๊ะแล้ว'],
  ['closed', 'ข้าม/ยกเลิก']
];

const btn = (bg, color = '#fff', extra = {}) => ({
  border: 'none', background: bg, color, borderRadius: 10, padding: '0.5rem 0.8rem', fontWeight: 800, fontFamily: 'inherit',
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.88rem', whiteSpace: 'nowrap', ...extra
});

export default function QueuePanel({ branchId, tables = [], onSeat, onClose, staff = '' }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('waiting');
  const [kind, setKind] = useState('dine');
  const [guests, setGuests] = useState(2);
  const [guestsOther, setGuestsOther] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [picker, setPicker] = useState(null); // { ticket, mode: 'call' | 'seat' }
  const [sound, setSound] = useState(() => { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; } });
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try { setData(await queueApi('queueList', { branchId })); setErr(''); }
    catch (e) { setErr(e.message); }
  }, [branchId]);
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, POLL_MS);
    const c = setInterval(() => setTick(x => x + 1), 30000);
    return () => { clearTimeout(first); clearInterval(t); clearInterval(c); };
  }, [load]);

  const flash = (type, msg, extra = null) => { setToast({ type, msg, extra }); if (type === 'ok') setTimeout(() => setToast(cur => (cur && cur.msg === msg ? null : cur)), 5000); };
  const toggleSound = () => { const v = !sound; setSound(v); try { localStorage.setItem(SOUND_KEY, v ? 'on' : 'off'); } catch { /* ไม่จำก็ได้ */ } if (v) unlockAudio(); };

  const tickets = useMemo(() => (data && data.tickets) || [], [data]);
  const byTab = (t) => tickets.filter(x => (t === 'closed' ? (x.status === 'skipped' || x.status === 'cancelled') : x.status === t))
    .sort((a, b) => (t === 'waiting' ? a.id - b.id : new Date(b.doneAt || b.calledAt || b.createdAt) - new Date(a.doneAt || a.calledAt || a.createdAt)));
  const calling = tickets.filter(x => x.status === 'called').sort((a, b) => new Date(b.calledAt) - new Date(a.calledAt))[0] || null;
  const nextCode = (k) => {
    const prefix = kindOf(k).prefix;
    const max = tickets.filter(x => x.code.startsWith(prefix)).reduce((m, x) => Math.max(m, parseInt(x.code.slice(1), 10) || 0), 0);
    return `${prefix}${String(max + 1).padStart(3, '0')}`;
  };
  const guestsValue = kind === 'takeaway' ? null : (guests === '8+' ? Math.max(8, parseInt(guestsOther, 10) || 8) : guests);

  const issue = async () => {
    if (busy) return;
    unlockAudio();
    setBusy(true);
    try {
      const res = await queueApi('queueIssue', { branchId, kind, guests: guestsValue, name: name.trim(), staff });
      setName(''); setGuestsOther('');
      const pr = await printQueueTicket(res);
      if (pr && pr.success) flash('ok', `🎫 ออกบัตรคิว ${res.ticket.code} แล้ว · พิมพ์บัตรออกเครื่องแคชเชียร์`);
      else flash('error', `ออกคิว ${res.ticket.code} แล้ว แต่พิมพ์บัตรไม่สำเร็จ: ${(pr && pr.error) || 'ไม่ทราบสาเหตุ'}`, { reprint: res });
      load();
    } catch (e) { flash('error', `ออกบัตรคิวไม่สำเร็จ: ${e.message}`); }
    setBusy(false);
  };

  const reprint = async (t) => {
    const ahead = t.ahead || 0;
    const per = (data && data.perQueue && data.perQueue[t.code[0]]) || 5;
    const pr = await printQueueTicket({ ticket: t, ahead, estimateMin: ahead * per });
    flash(pr && pr.success ? 'ok' : 'error', pr && pr.success ? `🖨️ พิมพ์บัตรคิว ${t.code} ซ้ำแล้ว` : `พิมพ์ไม่สำเร็จ: ${(pr && pr.error) || ''}`);
  };

  const act = async (t, op, tableNo = '') => {
    if (busy) return;
    if (op === 'cancel' && !window.confirm(`ยกเลิกคิว ${t.code}?`)) return;
    unlockAudio();
    setBusy(true);
    try {
      const res = await queueApi('queueAction', { branchId, id: t.id, op, tableNo, staff });
      if (op === 'call' && sound) announceQueue(res.ticket.code, res.ticket.tableNo);
      if (op === 'seat') {
        flash('ok', `✓ ${t.code} ได้โต๊ะ ${res.ticket.tableNo || ''} แล้ว`);
        if (res.ticket.tableNo && onSeat) { load(); setBusy(false); onSeat(res.ticket.tableNo, t.guests); return; }
      }
      load();
    } catch (e) { flash('error', e.message); }
    setBusy(false);
  };

  // เรียกคิว: ทานที่ร้าน/โต๊ะใหญ่ → เลือกโต๊ะที่จะเชิญไป (หรือเคาน์เตอร์) · ห่อกลับ → เรียกที่เคาน์เตอร์เลย
  const startCall = (t) => (t.kind === 'takeaway' ? act(t, 'call') : setPicker({ ticket: t, mode: 'call' }));
  const startSeat = (t) => (t.kind === 'takeaway' ? act(t, 'seat') : setPicker({ ticket: t, mode: 'seat' }));

  const stats = (data && data.stats) || {};
  const freeTables = tables.filter(t => t.free).length;
  const kindTag = (k) => { const x = kindOf(k); return <span style={{ fontSize: '0.75rem', fontWeight: 800, borderRadius: 6, padding: '1px 7px', marginLeft: 6, background: x.bg, color: x.color }}>{x.label}</span>; };

  const row = (t) => {
    const waited = minutesSince(t.createdAt);
    return (
      <div key={t.id} style={{ background: '#fff', border: `1px solid ${t.status === 'called' ? '#a78bfa' : '#e2e8f0'}`, borderRadius: 12, padding: '0.6rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: 8 }}>
        <div style={{ fontSize: '1.45rem', fontWeight: 900, width: 72 }}>{t.code}</div>
        <div style={{ flex: 1, minWidth: 0, fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
          <b style={{ color: '#0f172a', fontSize: '0.95rem' }}>{t.kind === 'takeaway' ? 'สั่งกลับบ้าน' : `${t.guests || '-'} ท่าน`}</b>{kindTag(t.kind)}
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {[t.name || (t.kind === 'takeaway' ? 'รับที่เคาน์เตอร์' : 'ไม่ระบุชื่อ'), t.phone, t.tableNo ? `โต๊ะ ${t.tableNo}` : '', t.status === 'called' ? `เรียก ${t.callCount} ครั้ง` : ''].filter(Boolean).join(' · ')}
          </div>
        </div>
        {(t.status === 'waiting' || t.status === 'called') && <div style={{ fontWeight: 800, fontSize: '0.85rem', color: waited >= 20 ? '#dc2626' : '#b45309', width: 64, textAlign: 'right' }}>รอ {waited} น.</div>}
        {t.status === 'waiting' && <>
          <button style={btn('#7c3aed')} onClick={() => startCall(t)}><Volume2 size={15} /> เรียก</button>
          <button style={btn('#fff', '#475569', { border: '1px solid #cbd5e1', padding: '0.5rem 0.55rem' })} title="พิมพ์บัตรซ้ำ" onClick={() => reprint(t)}><Printer size={15} /></button>
          <button style={btn('#fff', '#dc2626', { border: '1px solid #fecaca' })} onClick={() => act(t, 'cancel')}>ยกเลิก</button>
        </>}
        {t.status === 'called' && <>
          <button style={btn('#ede9fe', '#6d28d9')} onClick={() => act(t, 'call', t.tableNo)}><Volume2 size={15} /> ซ้ำ</button>
          <button style={btn('#16a34a')} onClick={() => startSeat(t)}><Check size={15} /> {t.kind === 'takeaway' ? 'รับแล้ว' : 'จัดโต๊ะ'}</button>
          <button style={btn('#f59e0b')} onClick={() => act(t, 'skip')}><SkipForward size={15} /> ข้าม</button>
        </>}
        {(t.status === 'skipped' || t.status === 'cancelled') && <>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: t.status === 'skipped' ? '#b45309' : '#b91c1c' }}>{t.status === 'skipped' ? 'ข้ามแล้ว' : 'ยกเลิกแล้ว'}</span>
          <button style={btn('#fff', '#334155', { border: '1px solid #cbd5e1' })} onClick={() => act(t, 'requeue')}><RotateCcw size={15} /> กลับเข้าคิว</button>
        </>}
        {t.status === 'seated' && <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#16a34a' }}>✓ {t.tableNo ? `โต๊ะ ${t.tableNo}` : 'รับแล้ว'} · รอ {Math.max(0, Math.round((new Date(t.doneAt) - new Date(t.createdAt)) / 60000))} น.</span>}
      </div>
    );
  };

  const stat = (v, l) => <div style={{ background: '#fff', borderRadius: 12, padding: '0.55rem 0.8rem' }}><div style={{ fontSize: '1.35rem', fontWeight: 900 }}>{v}</div><div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700 }}>{l}</div></div>;
  const seg = (on) => ({ border: `2px solid ${on ? '#7c3aed' : '#cbd5e1'}`, background: on ? '#f5f3ff' : '#fff', color: on ? '#6d28d9' : '#0f172a', borderRadius: 10, padding: '0.5rem 0', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', fontSize: '0.9rem' });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'stretch', justifyContent: 'center', padding: '1rem' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="คิวหน้าร้าน" style={{ background: '#f1f5f9', borderRadius: 16, width: '100%', maxWidth: 1200, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'inherit', color: '#0f172a' }}>
        <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0.7rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Ticket size={22} color="#7c3aed" /><b style={{ fontSize: '1.15rem' }}>คิวหน้าร้าน</b>
          <span style={{ marginLeft: 'auto' }} />
          <button style={btn(sound ? '#ede9fe' : '#f1f5f9', sound ? '#6d28d9' : '#64748b')} onClick={toggleSound} title="เสียงเรียกคิวที่เครื่องนี้">
            {sound ? <Volume2 size={16} /> : <VolumeX size={16} />} เสียงที่เครื่องนี้: {sound ? 'เปิด' : 'ปิด'}
          </button>
          <button style={btn('#0f172a')} onClick={() => window.open(queueBoardUrl(branchId), 'queue-board')}><Monitor size={16} /> เปิดจอเรียกคิว</button>
          <button style={btn('#fff', '#0f172a', { border: '1px solid #cbd5e1', padding: '0.45rem' })} onClick={onClose} aria-label="ปิด"><X size={20} /></button>
        </div>
        {sound && typeof window !== 'undefined' && window.speechSynthesis && (
          <div style={{ background: thaiVoiceAvailable() ? '#faf5ff' : '#fffbeb', borderBottom: '1px solid #ede9fe', padding: '0.4rem 1rem', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#6d28d9' }}>เสียงเรียกคิว:</span>
            <QueueVoicePicker />
          </div>
        )}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', gap: '1rem', padding: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 560px', minWidth: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
              {stat(stats.waiting ?? '-', 'รอเรียก')}
              {stat(stats.avgWait != null ? `${stats.avgWait} นาที` : '-', 'รอเฉลี่ยวันนี้')}
              {stat(stats.issued ?? '-', 'ออกบัตรวันนี้')}
              {stat(freeTables, 'โต๊ะว่างตอนนี้')}
            </div>
            {calling && (
              <div style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: '#fff', borderRadius: 14, padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.9rem', marginBottom: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, opacity: 0.85 }}>กำลังเรียก</div>
                  <div style={{ fontSize: '2.6rem', fontWeight: 900, lineHeight: 1 }}>{calling.code}</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, opacity: 0.9 }}>
                    {[calling.kind === 'takeaway' ? 'ห่อกลับ' : `${calling.guests || '-'} ท่าน`, calling.tableNo ? `โต๊ะ ${calling.tableNo}` : 'ที่เคาน์เตอร์', `เรียก ${calling.callCount} ครั้ง`, `${minutesSince(calling.calledAt)} นาทีที่แล้ว`].join(' · ')}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={btn('#fff', '#6d28d9')} onClick={() => act(calling, 'call', calling.tableNo)}><Volume2 size={16} /> เรียกซ้ำ</button>
                  <button style={btn('#16a34a')} onClick={() => startSeat(calling)}><Check size={16} /> {calling.kind === 'takeaway' ? 'รับแล้ว' : 'จัดโต๊ะ'}</button>
                  <button style={btn('#f59e0b')} onClick={() => act(calling, 'skip')}><SkipForward size={16} /> ข้าม</button>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {TABS.map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} style={{ ...btn(tab === k ? '#0f172a' : '#fff', tab === k ? '#fff' : '#0f172a'), border: '1px solid #e2e8f0', borderRadius: 999, padding: '0.35rem 0.85rem' }}>
                  {l} ({byTab(k).length})
                </button>
              ))}
            </div>
            {err && <div style={{ color: '#b91c1c', fontWeight: 700, marginBottom: 8 }}>⚠️ {err}</div>}
            {!data && !err && <div style={{ color: '#64748b' }}>กำลังโหลด…</div>}
            {data && byTab(tab).length === 0 && <div style={{ color: '#64748b', fontWeight: 600, padding: '1.5rem', textAlign: 'center', background: '#fff', borderRadius: 12 }}>ไม่มีคิว</div>}
            {byTab(tab).map(row)}
          </div>

          <div style={{ flex: '0 1 340px', minWidth: 280 }}>
            <div style={{ background: '#fff', borderRadius: 14, padding: '0.9rem' }}>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 8 }}>🎫 ออกบัตรคิว</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', margin: '6px 0' }}>ประเภท</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                {QUEUE_KINDS.map(k => <button key={k.id} style={seg(kind === k.id)} onClick={() => setKind(k.id)}>{k.label} ({k.prefix})</button>)}
              </div>
              {kind !== 'takeaway' && <>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', margin: '10px 0 6px' }}>จำนวนคน</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                  {[1, 2, 3, 4, 5, 6, 7, '8+'].map(n => <button key={n} style={seg(guests === n)} onClick={() => setGuests(n)}>{n}</button>)}
                </div>
                {guests === '8+' && <input value={guestsOther} onChange={e => setGuestsOther(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" placeholder="จำนวนคน (8 ขึ้นไป)"
                  style={{ width: '100%', boxSizing: 'border-box', marginTop: 6, border: '1.5px solid #cbd5e1', borderRadius: 10, padding: '0.55rem 0.7rem', fontFamily: 'inherit' }} />}
              </>}
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', margin: '10px 0 6px' }}>ชื่อ / เบอร์โทร (ไม่บังคับ)</div>
              <input value={name} onChange={e => setName(e.target.value.slice(0, 60))} placeholder="เช่น คุณมิ้นท์ 08x-xxx-xxxx"
                onKeyDown={e => { if (e.key === 'Enter') issue(); }}
                style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #cbd5e1', borderRadius: 10, padding: '0.55rem 0.7rem', fontFamily: 'inherit', fontSize: '0.95rem' }} />
              <button onClick={issue} disabled={busy} style={{ ...btn('#7c3aed'), width: '100%', justifyContent: 'center', marginTop: 12, padding: '0.8rem', fontSize: '1.05rem', opacity: busy ? 0.6 : 1 }}>
                <Printer size={18} /> ออกบัตรคิว {nextCode(kind)}
              </button>
              <div style={{ fontSize: '0.76rem', color: '#64748b', textAlign: 'center', marginTop: 6 }}>
                พิมพ์ออกเครื่องพิมพ์ใบเสร็จ (แคชเชียร์) · ก่อนหน้า {tickets.filter(x => x.status === 'waiting' && x.code[0] === kindOf(kind).prefix).length} คิว
              </div>
            </div>
            {toast && (
              <div role="status" style={{ marginTop: 10, borderRadius: 12, padding: '0.6rem 0.8rem', fontWeight: 700, fontSize: '0.88rem', background: toast.type === 'ok' ? '#f0fdf4' : '#fef2f2', color: toast.type === 'ok' ? '#166534' : '#b91c1c', border: `1px solid ${toast.type === 'ok' ? '#bbf7d0' : '#fecaca'}` }}>
                {toast.msg}
                {toast.extra && toast.extra.reprint && <button style={{ ...btn('#fff', '#b91c1c', { border: '1px solid #fecaca' }), marginLeft: 8, padding: '0.25rem 0.6rem' }} onClick={() => reprint({ ...toast.extra.reprint.ticket, ahead: toast.extra.reprint.ahead })}>พิมพ์ซ้ำ</button>}
              </div>
            )}
          </div>
        </div>
      </div>

      {picker && (
        <div onClick={e => { e.stopPropagation(); setPicker(null); }} style={{ position: 'fixed', inset: 0, zIndex: 1310, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: '1rem 1.1rem', width: '100%', maxWidth: 460 }}>
            <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>
              {picker.mode === 'call' ? `🔊 เรียกคิว ${picker.ticket.code} ไปที่โต๊ะไหน` : `✓ จัดโต๊ะให้ ${picker.ticket.code}`}
              <span style={{ fontSize: '0.85rem', color: '#64748b', marginLeft: 6 }}>{picker.ticket.guests ? `${picker.ticket.guests} ท่าน` : ''}</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 10px' }}>{picker.mode === 'seat' ? 'เลือกโต๊ะ → เปิดโต๊ะพร้อมจำนวนคนในหน้าขายให้ทันที' : 'เสียงเรียกจะบอกโต๊ะที่เลือก'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, maxHeight: '50vh', overflow: 'auto' }}>
              {tables.map(t => {
                const sel = picker.ticket.tableNo && String(picker.ticket.tableNo) === String(t.name);
                return (
                  <button key={t.name} disabled={!t.free && !sel}
                    onClick={() => { const p = picker; setPicker(null); act(p.ticket, p.mode, t.name); }}
                    style={{ border: `2px solid ${sel ? '#7c3aed' : t.free ? '#86efac' : '#e2e8f0'}`, background: sel ? '#f5f3ff' : t.free ? '#f0fdf4' : '#f8fafc', color: t.free || sel ? '#0f172a' : '#94a3b8', borderRadius: 10, padding: '0.55rem 0.2rem', fontWeight: 800, fontFamily: 'inherit', cursor: t.free || sel ? 'pointer' : 'not-allowed' }}>
                    {t.name}<div style={{ fontSize: '0.68rem', fontWeight: 700 }}>{sel ? 'เรียกไว้' : t.free ? 'ว่าง' : 'มีคน'}</div>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {picker.mode === 'call' && <button style={{ ...btn('#ede9fe', '#6d28d9'), flex: 1, justifyContent: 'center' }} onClick={() => { const p = picker; setPicker(null); act(p.ticket, 'call'); }}>เรียกที่เคาน์เตอร์ (ยังไม่ระบุโต๊ะ)</button>}
              {picker.mode === 'seat' && <button style={{ ...btn('#ede9fe', '#6d28d9'), flex: 1, justifyContent: 'center' }} onClick={() => { const p = picker; setPicker(null); act(p.ticket, 'seat'); }}>ได้โต๊ะแล้ว (ไม่เปิดโต๊ะในหน้าขาย)</button>}
              <button style={btn('#f1f5f9', '#334155')} onClick={() => setPicker(null)}>ปิด</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
