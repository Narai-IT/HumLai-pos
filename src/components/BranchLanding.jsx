import React, { useState, useEffect } from 'react';
import { Building2, Store, Smartphone, ArrowLeft, Armchair } from 'lucide-react';
import './LoginScreen.css';

// ── หน้าแรกของเว็บ ──
// 1) เลือกสาขา (มีสาขาเดียว = ข้ามให้เลย)  2) เลือกโหมด: หน้าพนักงาน / หน้าลูกค้าสั่งเอง
// 3) หน้าลูกค้า: เลือกโต๊ะที่แท็บเล็ตนี้ตั้งอยู่
// เครื่องจำสาขาที่เลือกไว้ (device_branch) — ครั้งหน้ากดต่อได้ทันที

// ยังไม่เคยตั้งผังโต๊ะของสาขา → โต๊ะ 1–16 แบบเดียวกับค่าเริ่มต้นในหน้าจัดการโต๊ะ
// (ไม่ import จากหน้าหลังบ้าน จะได้ไม่ลากโค้ดหลังบ้านทั้งหน้ามาไว้ในหน้าแรก)
const FALLBACK_TABLES = Array.from({ length: 16 }, (_, i) => ({ id: `dine_${i + 1}`, name: `${i + 1}`, zone: 'DineIn', active: true }));

const card = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem',
  padding: '1.4rem 1rem', borderRadius: 16, border: '1.5px solid rgba(0,0,0,0.1)',
  background: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-main)'
};
const backBtn = {
  marginTop: '1.25rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: 6
};

export default function BranchLanding({ branches = [], branchTables = null, deviceBranch = '', loaded = false, onStaff, onCustomer, lang = 'th' }) {
  const active = branches.filter(b => b.isActive !== false);
  const single = active.length === 1;
  const known = active.some(b => String(b.id) === String(deviceBranch));
  const [branchId, setBranchId] = useState(known ? deviceBranch : '');
  const [step, setStep] = useState('branch'); // branch → mode → table

  // มีสาขาเดียว → เลือกให้เลย / เพิ่งโหลดรายการสาขาเสร็จ → ใช้สาขาที่เครื่องจำไว้เป็นค่าเริ่ม
  useEffect(() => {
    if (single && !branchId) { setBranchId(String(active[0].id)); setStep('mode'); }
    else if (!branchId && known) setBranchId(deviceBranch);
  }, [single, known, branchId, deviceBranch, active]);

  const branch = active.find(b => String(b.id) === String(branchId));
  const branchName = branch ? (branch.name || branch.id) : '';
  const t = (th, en) => (lang === 'th' ? th : en);

  // โต๊ะของสาขานี้ (ผังจากหลังบ้าน) — ยังไม่เคยตั้งผัง ใช้โต๊ะเริ่มต้น
  const tables = (() => {
    const list = branchTables && Array.isArray(branchTables[branchId]) && branchTables[branchId].length
      ? branchTables[branchId] : FALLBACK_TABLES;
    return list.filter(x => x.active !== false && (x.zone || 'DineIn') === 'DineIn');
  })();

  if (!loaded && active.length === 0) {
    return (
      <div className="login-container"><div className="login-box">
        <h1 className="login-title">HumLai POS</h1>
        <p className="login-subtitle">{t('กำลังโหลดรายการสาขา...', 'Loading branches...')}</p>
      </div></div>
    );
  }

  // ยังไม่มีสาขาในระบบ (ติดตั้งใหม่) หรือโหลดไม่ได้ → เข้าหน้าพนักงานได้เลย ไม่ให้ติดอยู่หน้านี้
  if (active.length === 0) {
    return (
      <div className="login-container"><div className="login-box">
        <h1 className="login-title">HumLai POS</h1>
        <p className="login-subtitle">{t('ยังไม่มีสาขาในระบบ — ตั้งค่าที่หลังบ้าน > สาขา', 'No branches yet')}</p>
        <button style={{ ...card, width: '100%' }} onClick={() => onStaff('')}>
          <Store size={32} color="var(--accent-hover)" /><b>{t('เข้าหน้าพนักงาน', 'Staff')}</b>
        </button>
      </div></div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-box" style={{ maxWidth: 560 }}>
        {step === 'branch' && (
          <>
            <h1 className="login-title">{t('เลือกสาขา', 'Select branch')}</h1>
            <p className="login-subtitle">{t('เครื่องนี้อยู่สาขาไหน', 'Which branch is this device at?')}</p>
            <div className="user-grid">
              {active.map(b => (
                <button key={b.id} className="user-select-btn"
                  style={String(b.id) === String(branchId) ? { borderColor: 'var(--accent)', background: 'rgba(234,179,8,0.08)' } : undefined}
                  onClick={() => { setBranchId(String(b.id)); setStep('mode'); }}>
                  <div className="user-avatar"><Building2 size={28} /></div>
                  <span>{b.name || b.id}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'mode' && (
          <>
            <h1 className="login-title">{branchName}</h1>
            <p className="login-subtitle">{t('เลือกการใช้งานของเครื่องนี้', 'Choose how this device is used')}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              <button style={card} onClick={() => onStaff(branchId)}>
                <Store size={40} color="var(--accent-hover)" />
                <b style={{ fontSize: '1.1rem' }}>{t('หน้าพนักงาน', 'Staff')}</b>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('ขายหน้าร้าน เปิดโต๊ะ เช็กบิล หลังบ้าน', 'POS, tables, back office')}</span>
              </button>
              <button style={card} onClick={() => setStep('table')}>
                <Smartphone size={40} color="#16a34a" />
                <b style={{ fontSize: '1.1rem' }}>{t('หน้าลูกค้า', 'Customer')}</b>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('ลูกค้าสั่งอาหารและจ่ายเอง', 'Self-order & pay')}</span>
              </button>
            </div>
            {!single && (
              <button style={backBtn} onClick={() => setStep('branch')}>
                <ArrowLeft size={16} /> {t('เปลี่ยนสาขา', 'Change branch')}
              </button>
            )}
          </>
        )}

        {step === 'table' && (
          <>
            <h1 className="login-title">{t('เลือกโต๊ะ', 'Select table')}</h1>
            <p className="login-subtitle">{t(`หน้าลูกค้าสำหรับโต๊ะไหน — ${branchName}`, `Table for customer screen — ${branchName}`)}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: '0.6rem' }}>
              {tables.map(tb => (
                <button key={tb.id || tb.name} style={{ ...card, padding: '0.9rem 0.5rem', gap: '0.3rem' }}
                  onClick={() => onCustomer(branchId, String(tb.name))}>
                  <Armchair size={22} color="#16a34a" />
                  <b>{tb.name}</b>
                </button>
              ))}
            </div>
            <button style={backBtn} onClick={() => setStep('mode')}>
              <ArrowLeft size={16} /> {t('ย้อนกลับ', 'Back')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
