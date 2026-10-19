import React, { useEffect, useState } from 'react';
import { Printer, CheckCircle, XCircle, RotateCcw, X } from 'lucide-react';
import { PRINT_STATUS_EVENT, retryQueuedJob } from '../utils/printServer';

// แจ้งสถานะงานพิมพ์มุมจอ: กำลังพิมพ์ → พิมพ์แล้ว (หายเองใน 3 วิ) / พิมพ์ไม่สำเร็จ (ค้างไว้จนกดปิด มีปุ่มลองใหม่ถ้าเป็นงานในคิว)
// ใช้ทุกโหมด ทั้งพิมพ์ตรงจากคอมและส่งผ่านคิวจากแท็บเล็ต
const printerName = (ip) => {
  try {
    const list = JSON.parse(localStorage.getItem('printers_config') || '[]');
    const p = Array.isArray(list) ? list.find((x) => x.ip === ip) : null;
    return p ? p.name : '';
  } catch { return ''; }
};

const PrintStatusToast = () => {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const onStatus = (e) => {
      const d = e.detail || {};
      setItems((list) => {
        const rest = list.filter((x) => x.key !== d.key);
        const prev = list.find((x) => x.key === d.key) || {};
        return [...rest, { ...prev, ...d, at: Date.now() }].slice(-4);
      });
      if (d.state === 'done') setTimeout(() => setItems((list) => list.filter((x) => !(x.key === d.key && x.state === 'done'))), 3000);
    };
    window.addEventListener(PRINT_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(PRINT_STATUS_EVENT, onStatus);
  }, []);

  if (!items.length) return null;
  const close = (key) => setItems((list) => list.filter((x) => x.key !== key));
  return (
    <div aria-live="polite" style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 2500, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 'min(360px, calc(100vw - 24px))' }}>
      {items.map((it) => {
        const color = it.state === 'done' ? '#16a34a' : it.state === 'failed' ? '#dc2626' : '#2563eb';
        const name = printerName(it.ip);
        return (
          <div key={it.key} role={it.state === 'failed' ? 'alert' : 'status'}
            style={{ background: '#fff', borderRadius: 12, borderLeft: `5px solid ${color}`, boxShadow: '0 8px 24px rgba(15,23,42,0.18)', padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ color, marginTop: 2 }} aria-hidden="true">
              {it.state === 'done' ? <CheckCircle size={20} /> : it.state === 'failed' ? <XCircle size={20} /> : <Printer size={20} />}
            </span>
            <div style={{ flex: 1, minWidth: 0, fontSize: '0.9rem' }}>
              <b style={{ display: 'block' }}>
                {it.state === 'done' ? 'พิมพ์สำเร็จ' : it.state === 'failed' ? 'พิมพ์ไม่สำเร็จ' : 'กำลังพิมพ์…'} · {it.label}
              </b>
              {name && <span style={{ color: '#64748b', fontSize: '0.8rem' }}>เครื่องพิมพ์: {name}</span>}
              {it.state === 'failed' && it.error && <div style={{ color: '#b91c1c', fontSize: '0.8rem', marginTop: 2 }}>{it.error}</div>}
              {it.state === 'sending' && it.note && <div style={{ color: '#b45309', fontSize: '0.8rem', marginTop: 2 }}>{it.note}</div>}
              {it.state === 'failed' && it.jobId && (
                <button type="button" onClick={() => retryQueuedJob(it.jobId, it.key, { printerType: it.printerType, ip: it.ip, label: it.label })}
                  style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, padding: '4px 10px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <RotateCcw size={14} /> ลองพิมพ์ใหม่
                </button>
              )}
            </div>
            {it.state !== 'sending' && (
              <button type="button" onClick={() => close(it.key)} aria-label="ปิด" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}><X size={18} /></button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PrintStatusToast;
