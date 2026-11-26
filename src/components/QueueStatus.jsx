import React, { useEffect, useRef, useState } from 'react';
import { queueApi } from '../utils/queue';
import { LOGO_WIDE } from '../utils/banner';

// ── ลูกค้าสแกน QR บนบัตรคิว · /queue/status?t=<token> ──
// ดูว่าเหลืออีกกี่คิว · ถึงคิวแล้วจอเปลี่ยนสีและมือถือสั่น · อัปเดตเองทุก 10 วินาที
const POLL_MS = 10000;

export default function QueueStatus({ token = '', nameOf = () => '' }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const prevStatus = useRef('');

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const r = await queueApi('queueStatus', { token });
        if (stop) return;
        setData(r); setErr('');
        const st = r.ticket.status;
        if (st === 'called' && prevStatus.current && prevStatus.current !== 'called') {
          try { navigator.vibrate && navigator.vibrate([400, 200, 400, 200, 400]); } catch { /* ไม่รองรับ */ }
        }
        prevStatus.current = st;
      } catch (e) { if (!stop) setErr(e.message); }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { stop = true; clearInterval(id); };
  }, [token]);

  const t = data && data.ticket;
  const status = t ? (data.expired ? 'expired' : t.status) : '';
  const look = {
    waiting: { bg: '#f5f3ff', color: '#6d28d9', title: data ? (data.ahead > 0 ? `รออีก ${data.ahead} คิว` : 'คิวถัดไปคือคุณ') : '', sub: data && data.ahead > 0 ? `ประมาณ ${data.estimateMin} นาที · กรุณารอบริเวณหน้าร้าน` : 'เตรียมตัวได้เลย กรุณารอบริเวณหน้าร้าน' },
    called: { bg: '#16a34a', color: '#fff', title: 'ถึงคิวของคุณแล้ว!', sub: t && t.tableNo ? `เชิญที่โต๊ะ ${t.tableNo}` : 'เชิญที่เคาน์เตอร์' },
    seated: { bg: '#f0fdf4', color: '#166534', title: t && t.kind === 'takeaway' ? 'รับอาหารแล้ว' : 'ได้โต๊ะแล้ว', sub: 'ขอให้อร่อยกับมื้อนี้ค่ะ' },
    skipped: { bg: '#fff7ed', color: '#9a3412', title: 'เลยคิวแล้ว', sub: 'กรุณาติดต่อพนักงานที่หน้าร้าน' },
    cancelled: { bg: '#fef2f2', color: '#b91c1c', title: 'คิวนี้ถูกยกเลิก', sub: 'ติดต่อพนักงานหากต้องการคิวใหม่' },
    expired: { bg: '#f1f5f9', color: '#475569', title: 'บัตรคิวนี้หมดอายุแล้ว', sub: 'บัตรคิวใช้ได้เฉพาะวันที่ออกบัตร' }
  }[status];

  return (
    <div style={{ minHeight: '100vh', background: look && status === 'called' ? '#16a34a' : '#f8fafc', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: 380, background: '#fff', borderRadius: 22, padding: '1.4rem 1.2rem', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', color: '#0f172a' }}>
        {/* โลโก้ร้าน (ไฟล์เดียวกับหน้าลูกค้าสั่งเอง) + ชื่อสาขา */}
        <img src={LOGO_WIDE} alt="ข้าวมันไก่หำไหล" style={{ display: 'block', width: '68%', maxWidth: 230, height: 'auto', margin: '0 auto 0.3rem' }} />
        <div style={{ fontWeight: 800, color: '#475569', fontSize: '0.92rem' }}>{(data && nameOf(data.branchId)) || 'คิวหน้าร้าน'}</div>
        {err && <div style={{ color: '#b91c1c', fontWeight: 700, marginTop: '1rem' }}>{err}</div>}
        {!t && !err && <div style={{ color: '#64748b', marginTop: '1rem' }}>กำลังโหลด…</div>}
        {t && look && (
          <>
            <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 700, marginTop: '0.8rem' }}>คิวของคุณ</div>
            <div style={{ fontSize: '4.2rem', fontWeight: 900, color: '#6d28d9', lineHeight: 1.05 }}>{t.code}</div>
            <div style={{ fontWeight: 700, color: '#475569' }}>{t.kind === 'takeaway' ? 'ห่อกลับบ้าน' : `${t.kindLabel} · ${t.guests || '-'} ท่าน`}</div>
            <div style={{ background: look.bg, color: look.color, borderRadius: 14, padding: '0.9rem', marginTop: '1rem' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>{look.title}</div>
              <div style={{ fontWeight: 700, marginTop: 2 }}>{look.sub}</div>
            </div>
            {status === 'waiting' && data.calling && (
              <div style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 700, marginTop: '0.8rem' }}>
                ตอนนี้กำลังเรียก {data.calling.code}
              </div>
            )}
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.9rem' }}>หน้านี้อัปเดตเองอัตโนมัติ · เปิดค้างไว้ได้</div>
          </>
        )}
      </div>
    </div>
  );
}
