import React, { useEffect, useRef, useState } from 'react';
import { Volume2, Maximize } from 'lucide-react';
import { queueApi, announceQueue, unlockAudio, thaiVoiceAvailable } from '../utils/queue';

// ── จอเรียกคิวหน้าร้าน (ทีวี/แท็บเล็ต) · /queue/board?b=<สาขา> ──
// ไม่ต้องล็อกอิน · ดึงข้อมูลทุก 3 วินาที · มีการเรียกใหม่/เรียกซ้ำ → ติ๊งต่อง + อ่านออกเสียง
// เบราว์เซอร์ไม่ยอมให้เล่นเสียงเองจนกว่าจะมีคนแตะจอ → ปุ่ม "แตะเพื่อเปิดเสียง" ตอนเปิดครั้งแรก
const POLL_MS = 3000;

export default function QueueBoard({ branchId = '', shopName = '' }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [soundOn, setSoundOn] = useState(false);
  const [flash, setFlash] = useState(false);
  const [now, setNow] = useState(new Date());
  const lastKey = useRef(null);
  const soundRef = useRef(false);
  useEffect(() => { soundRef.current = soundOn; }, [soundOn]);

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const r = await queueApi('queueBoard', { branchId });
        if (stop) return;
        setData(r); setErr('');
        const c = r.calling && r.calling[0];
        const key = c ? `${c.id}:${c.callCount}:${c.calledAt}` : '';
        if (lastKey.current !== null && key && key !== lastKey.current) {
          setFlash(true); setTimeout(() => setFlash(false), 6000);
          if (soundRef.current) announceQueue(c.code, c.tableNo);
        }
        lastKey.current = key;
      } catch (e) { if (!stop) setErr(e.message); }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    const clock = setInterval(() => setNow(new Date()), 15000);
    return () => { stop = true; clearInterval(id); clearInterval(clock); };
  }, [branchId]);

  const enableSound = () => { unlockAudio(); setSoundOn(true); };
  const goFull = () => { try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); } catch { /* ไม่รองรับก็ไม่เป็นไร */ } };
  const cur = data && data.calling && data.calling[0];
  const prev = data && data.calling ? data.calling.slice(1) : [];
  const waiting = (data && data.waiting) || [];

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#1e1b4b,#312e81)', color: '#fff', fontFamily: 'inherit', padding: '2.5vh 3vw', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <style>{'@keyframes qpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}'}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ fontSize: 'clamp(1.2rem,2.6vw,2.2rem)', fontWeight: 800 }}>{shopName || 'คิวหน้าร้าน'}</div>
        <div style={{ marginLeft: 'auto', fontSize: 'clamp(1rem,2vw,1.6rem)', fontWeight: 700, opacity: 0.85 }}>
          {now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })} น.
        </div>
        <button onClick={goFull} aria-label="เต็มจอ" style={{ background: '#ffffff1f', border: 'none', color: '#fff', borderRadius: 10, padding: '0.5rem', cursor: 'pointer' }}><Maximize size={20} /></button>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: '3vw', marginTop: '2vh' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 'clamp(1rem,2.4vw,2rem)', fontWeight: 800, opacity: 0.8 }}>กำลังเรียก · NOW SERVING</div>
          <div style={{ fontSize: 'clamp(5rem,17vw,16rem)', fontWeight: 900, lineHeight: 1, color: '#fde68a', margin: '1vh 0', animation: flash ? 'qpulse 1s ease-in-out 5' : 'none' }}>
            {cur ? cur.code : '—'}
          </div>
          <div style={{ fontSize: 'clamp(1.3rem,3.2vw,3rem)', fontWeight: 800 }}>
            {cur ? (cur.tableNo ? `เชิญที่โต๊ะ ${cur.tableNo}` : 'เชิญที่เคาน์เตอร์') : 'ยังไม่มีการเรียกคิว'}
          </div>
          {prev.length > 0 && (
            <div style={{ marginTop: '3vh', fontSize: 'clamp(1rem,2vw,1.6rem)', fontWeight: 700, opacity: 0.8 }}>
              เรียกก่อนหน้า: {prev.map(p => `${p.code}${p.tableNo ? ` (โต๊ะ ${p.tableNo})` : ''}`).join(' · ')}
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 'clamp(1rem,2.2vw,1.8rem)', fontWeight: 800, opacity: 0.8, marginBottom: '1vh' }}>
            คิวถัดไป {data ? `(${data.waitingCount})` : ''}
          </div>
          {waiting.slice(0, 6).map(w => (
            <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff17', borderRadius: 12, padding: '1.2vh 1.2vw', marginBottom: '1vh' }}>
              <span style={{ fontSize: 'clamp(1.4rem,3.4vw,3rem)', fontWeight: 900 }}>{w.code}</span>
              <span style={{ fontSize: 'clamp(0.9rem,1.6vw,1.4rem)', fontWeight: 700, opacity: 0.8 }}>{w.kind === 'takeaway' ? 'ห่อกลับ' : `${w.guests || '-'} ท่าน`}</span>
            </div>
          ))}
          {data && data.waitingCount > 6 && <div style={{ opacity: 0.75, fontSize: 'clamp(0.9rem,1.6vw,1.3rem)', fontWeight: 700 }}>และอีก {data.waitingCount - 6} คิว</div>}
          {data && waiting.length === 0 && <div style={{ opacity: 0.7, fontSize: 'clamp(1rem,2vw,1.5rem)' }}>ไม่มีคิวรอ</div>}
        </div>
      </div>
      {err && <div style={{ color: '#fecaca', fontWeight: 700 }}>⚠️ {err}</div>}

      {!soundOn && (
        <button onClick={enableSound} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
          <Volume2 size={64} />
          <span style={{ fontSize: 'clamp(1.4rem,3vw,2.4rem)', fontWeight: 800 }}>แตะเพื่อเปิดเสียงเรียกคิว</span>
          <span style={{ fontSize: '1rem', opacity: 0.8 }}>เบราว์เซอร์ต้องให้แตะจอ 1 ครั้งก่อนจึงเล่นเสียงได้</span>
        </button>
      )}
      {soundOn && window.speechSynthesis && !thaiVoiceAvailable() && (
        <div style={{ position: 'fixed', bottom: 8, left: 8, fontSize: '0.8rem', opacity: 0.7 }}>เครื่องนี้ไม่มีเสียงอ่านภาษาไทย — เรียกคิวด้วยเสียงติ๊งต่องอย่างเดียว</div>
      )}
    </div>
  );
}
