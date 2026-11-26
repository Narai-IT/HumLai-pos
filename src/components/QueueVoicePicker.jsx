import React, { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { onVoicesChanged, savedVoiceName, saveVoiceName, voiceGender, currentVoice, announceQueue, unlockAudio } from '../utils/queue';

// ── เลือกเสียงเรียกคิวของเครื่องนี้ + ทดสอบเสียง ──
// dark = ใช้บนจอเรียกคิว (พื้นเข้ม)
const GENDER = { female: 'ผู้หญิง', male: 'ผู้ชาย' };

export default function QueueVoicePicker({ dark = false }) {
  const [voices, setVoices] = useState([]);
  const [name, setName] = useState(savedVoiceName);
  useEffect(() => onVoicesChanged(setVoices), []);

  const pick = (v) => { setName(v); saveVoiceName(v); };
  const test = () => { unlockAudio(); announceQueue('A001', '5', { repeat: 1 }); };
  const active = currentVoice();
  const onlyMale = voices.length > 0 && voices.every(v => voiceGender(v) === 'male');
  const fg = dark ? '#fff' : '#0f172a';
  const sub = dark ? 'rgba(255,255,255,0.75)' : '#92400e';

  if (!window.speechSynthesis) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {voices.length > 0 ? (
        <select value={active ? active.name : name} onChange={e => pick(e.target.value)} aria-label="เสียงเรียกคิว"
          style={{ border: `1px solid ${dark ? '#ffffff55' : '#cbd5e1'}`, background: dark ? '#ffffff1a' : '#fff', color: fg, borderRadius: 10, padding: '0.4rem 0.5rem', fontFamily: 'inherit', fontWeight: 700, maxWidth: 260 }}>
          {voices.map(v => (
            <option key={v.name} value={v.name} style={{ color: '#0f172a' }}>
              {GENDER[voiceGender(v)] ? `${GENDER[voiceGender(v)]} · ` : ''}{v.name.replace(/^Microsoft\s+/, '').replace(/\s*-\s*Thai.*$/i, '').replace(/\s*Online\s*\(Natural\)/i, ' (ธรรมชาติ)')}
            </option>
          ))}
        </select>
      ) : (
        <span style={{ color: sub, fontSize: '0.8rem', fontWeight: 700 }}>เครื่องนี้ไม่มีเสียงอ่านภาษาไทย (มีแค่ติ๊งต่อง)</span>
      )}
      <button type="button" onClick={test}
        style={{ border: 'none', background: dark ? '#ffffff26' : '#ede9fe', color: dark ? '#fff' : '#6d28d9', borderRadius: 10, padding: '0.45rem 0.7rem', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Volume2 size={15} /> ทดสอบเสียง
      </button>
      {onlyMale && (
        <span style={{ color: sub, fontSize: '0.78rem', fontWeight: 700, flexBasis: '100%' }}>
          เครื่องนี้มีแต่เสียงผู้ชาย — เปิดหน้านี้ด้วย Microsoft Edge จะมีเสียงผู้หญิง "Premwadee" ให้เลือก
        </span>
      )}
    </div>
  );
}
