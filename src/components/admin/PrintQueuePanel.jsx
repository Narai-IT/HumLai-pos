import React, { useCallback, useEffect, useState } from 'react';
import { Tablet, Server, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { getPrintMode, setPrintMode, supportsPrintQueue, getPrintQueueAgent, savePrintQueueAgent } from '../../utils/printServer';
import { API_URL, apiUrlAbsolute } from '../../utils/api';

// ตั้งค่าคิวงานพิมพ์ (หน้าตั้งค่าเครื่องพิมพ์)
//  1) โหมดพิมพ์ของเครื่องนี้: พิมพ์ตรง (คอมที่มี Print Server) / ส่งผ่านคิว (แท็บเล็ต Android, iPad, มือถือ)
//  2) กล่องพิมพ์ของสาขา: ให้ Print Server ในเครื่องนี้รับงานจากคิวของสาขา (แสดงเมื่อเปิดหน้านี้บนเครื่องที่มี Print Server)
const box = { border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1rem', background: '#fff' };
const pill = (ok) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 999, padding: '2px 10px', fontSize: '0.8rem', fontWeight: 800, background: ok ? '#dcfce7' : '#fee2e2', color: ok ? '#166534' : '#991b1b' });
const btn = (primary) => ({ border: primary ? 'none' : '1px solid #cbd5e1', background: primary ? '#0f172a' : '#fff', color: primary ? '#fff' : '#334155', borderRadius: 8, padding: '0.45rem 0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' });
const ago = (sec) => (sec == null ? 'ยังไม่เคยเชื่อมต่อ' : sec < 60 ? `${sec} วินาทีที่แล้ว` : sec < 3600 ? `${Math.floor(sec / 60)} นาทีที่แล้ว` : `${Math.floor(sec / 3600)} ชั่วโมงที่แล้ว`);

const PrintQueuePanel = ({ branchId = '', branchName = '', health }) => {
  const [mode, setMode] = useState(getPrintMode());
  const [queue, setQueue] = useState(null);
  const [agent, setAgent] = useState(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const localQueue = health && health.status === 'online' && supportsPrintQueue(health.info);

  const loadQueue = useCallback(async () => {
    if (!branchId) return;
    try {
      const res = await fetch(`${API_URL}?action=getPrintQueueStatus&branch=${encodeURIComponent(branchId)}`);
      setQueue(await res.json());
    } catch { setQueue({ success: false }); }
  }, [branchId]);
  const loadAgent = useCallback(async () => { if (localQueue) setAgent(await getPrintQueueAgent()); }, [localQueue]);
  useEffect(() => { loadQueue(); const t = setInterval(loadQueue, 15000); return () => clearInterval(t); }, [loadQueue]);
  useEffect(() => { loadAgent(); }, [loadAgent]);

  const chooseMode = (m) => { setPrintMode(m); setMode(m); };
  const saveAgent = async (patch) => {
    setBusy(true); setMsg(null);
    const res = await savePrintQueueAgent({ apiUrl: apiUrlAbsolute(), branchId, ...patch });
    setBusy(false);
    if (res && res.success) { setAgent(res); setKeyDraft(''); setMsg({ ok: true, text: patch.enabled === false ? 'ปิดรับงานแล้ว' : 'บันทึกแล้ว' }); setTimeout(loadQueue, 2500); }
    else setMsg({ ok: false, text: (res && res.error) || 'บันทึกไม่สำเร็จ' });
  };

  const a = queue && queue.agent;
  const c = (queue && queue.counts) || {};
  const cfg = agent && agent.config; const st = agent && agent.status;
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, marginBottom: 8 }}><Tablet size={20} /> โหมดพิมพ์ของเครื่องนี้</div>
        <div role="radiogroup" aria-label="โหมดพิมพ์" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="radio" name="print-mode" checked={mode === 'direct'} onChange={() => chooseMode('direct')} style={{ marginTop: 4 }} />
            <span><b>พิมพ์ตรง</b> — คอมที่เปิด Print Server ไว้ในเครื่องนี้</span>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="radio" name="print-mode" checked={mode === 'queue'} onChange={() => chooseMode('queue')} style={{ marginTop: 4 }} />
            <span><b>ส่งผ่านกล่องพิมพ์ของสาขา</b> — แท็บเล็ต Android / iPad / มือถือ · ส่งงานไปให้ Print Server ที่เปิดค้างในร้านพิมพ์แทน</span>
          </label>
        </div>
        {mode === 'queue' && (
          <div style={{ marginTop: 10, fontSize: '0.88rem', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>กล่องพิมพ์ของ {branchName || branchId}:</span>
            {!queue ? <span>กำลังตรวจ…</span>
              : queue.ready === false ? <span style={{ color: '#b91c1c' }}>ยังไม่ได้สร้างตารางคิว — รัน update-api.bat ที่เครื่อง API</span>
              : <span style={pill(a && a.online)}>{a && a.online ? <CheckCircle size={13} /> : <XCircle size={13} />}{a && a.online ? 'ออนไลน์' : 'ออฟไลน์'}</span>}
            {a && <span style={{ color: '#64748b' }}>{a.name ? a.name + ' · ' : ''}เห็นล่าสุด {ago(a.ago)}</span>}
            {queue && queue.ready !== false && <span style={{ color: '#64748b' }}>12 ชม. ล่าสุด: พิมพ์แล้ว {c.done || 0} · ไม่สำเร็จ {c.failed || 0}{c.pending ? ` · รอ ${c.pending}` : ''}</span>}
            <button type="button" onClick={loadQueue} style={btn(false)}><RefreshCw size={13} /> ตรวจ</button>
          </div>
        )}
        {mode === 'queue' && <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '8px 0 0' }}>ทุกงานพิมพ์จะขึ้นแจ้งที่มุมจอว่า "พิมพ์สำเร็จ" หรือ "พิมพ์ไม่สำเร็จ" พร้อมปุ่มลองใหม่ · ใช้ปุ่ม "ทดสอบพิมพ์" ด้านล่างเช็กได้</p>}
      </div>

      {localQueue && (
        <div style={box}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, marginBottom: 6 }}>
            <Server size={20} /> ให้เครื่องนี้เป็นกล่องพิมพ์ของสาขา
            {cfg && <span style={pill(cfg.enabled && !(st && st.lastError))}>{cfg.enabled ? (st && st.lastError ? 'มีปัญหา' : 'รับงานอยู่') : 'ปิดอยู่'}</span>}
          </div>
          <p style={{ fontSize: '0.85rem', color: '#475569', margin: '0 0 8px' }}>
            เครื่องนี้ต้องเปิดค้างไว้ตลอดเวลาร้านเปิด และอยู่วงแลนเดียวกับเครื่องพิมพ์ · รับงานของสาขา <b>{branchName || branchId}</b> ไปพิมพ์ตามเครื่องพิมพ์ที่ตั้งไว้ในหน้านี้
          </p>
          {cfg && cfg.enabled && st && (
            <p style={{ fontSize: '0.85rem', margin: '0 0 8px', color: st.lastError ? '#b91c1c' : '#166534' }}>
              {st.lastError ? 'ปัญหาล่าสุด: ' + st.lastError : `เชื่อมต่อปกติ · พิมพ์แล้ว ${st.printed} ใบ · ไม่สำเร็จ ${st.failed} ใบ (ตั้งแต่เปิด Print Server)`}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label htmlFor="pq-key" style={{ fontSize: '0.85rem', fontWeight: 700 }}>รหัสกล่องพิมพ์</label>
            <input id="pq-key" type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} autoComplete="off"
              placeholder={cfg && cfg.hasKey ? 'ตั้งไว้แล้ว (เว้นว่าง = ใช้รหัสเดิม)' : 'PRINT_AGENT_KEY จาก .env ของเครื่อง API'}
              style={{ flex: '1 1 220px', border: '1px solid #cbd5e1', borderRadius: 8, padding: '0.45rem 0.6rem', fontFamily: 'inherit' }} />
            {cfg && cfg.enabled
              ? <><button type="button" disabled={busy} onClick={() => saveAgent(keyDraft ? { key: keyDraft } : {})} style={btn(false)}>บันทึก</button>
                  <button type="button" disabled={busy} onClick={() => saveAgent({ enabled: false })} style={{ ...btn(true), background: '#dc2626' }}>ปิดรับงาน</button></>
              : <button type="button" disabled={busy || !branchId} onClick={() => saveAgent({ enabled: true, ...(keyDraft ? { key: keyDraft } : {}) })} style={{ ...btn(true), background: '#16a34a' }}>เปิดรับงานจากแท็บเล็ต</button>}
          </div>
          {msg && <p role="status" style={{ fontSize: '0.85rem', margin: '8px 0 0', color: msg.ok ? '#166534' : '#b91c1c' }}>{msg.text}</p>}
        </div>
      )}
    </div>
  );
};

export default PrintQueuePanel;
