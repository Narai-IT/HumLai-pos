import React, { useState, useEffect } from 'react';
import { User, ArrowRight, RefreshCw, WifiOff } from 'lucide-react';
import './LoginScreen.css';

// ชื่อสาขา = คอลัม A ของชีต Users (branch) — เผื่อข้อมูลเก่าที่ยังไม่มี branch ให้ใช้ id/username แทน
const branchName = (u) => String(u?.branch || u?.id || u?.username || '').trim();

const LoginScreen = ({ users, onLogin, lang, onRetry }) => {
  const [selectedUser, setSelectedUser] = useState(null);
  const [password, setPassword]         = useState('');
  const [error, setError]               = useState('');
  const [retrying, setRetrying]         = useState(false);
  // แสดงปุ่ม retry หลังรอ 5 วิโดยไม่มี users
  const [showRetry, setShowRetry]       = useState(false);

  useEffect(() => {
    if (users && users.length > 0) { setShowRetry(false); return; }
    const t = setTimeout(() => setShowRetry(true), 5000);
    return () => clearTimeout(t);
  }, [users]);

  const handleUserSelect = (user) => { setSelectedUser(user); setPassword(''); setError(''); };

  const verifyLogin = (entered) => {
    if (String(selectedUser.pin) === String(entered)) {
      onLogin(selectedUser);
    } else {
      setError(lang === 'th' ? 'รหัสผ่านไม่ถูกต้อง' : 'Invalid password');
      setPassword('');
    }
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!password) return;
    verifyLogin(password);
  };

  const handleDefaultAdmin = () => onLogin({ id: 'admin', username: 'Admin', branch: 'admin', canCheckout: true, isAdmin: true });

  const handleRetry = async () => {
    setRetrying(true);
    setShowRetry(false);
    if (onRetry) await onRetry();
    setRetrying(false);
    // ถ้ายังไม่มี users หลัง retry ให้แสดงปุ่มอีกครั้ง
    setTimeout(() => setShowRetry(true), 6000);
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1 className="login-title">{lang === 'th' ? 'เข้าสู่ระบบ' : 'Login'}</h1>
        <p className="login-subtitle">{lang === 'th' ? 'เลือกสาขาของคุณ' : 'Select your branch'}</p>

        {(!users || users.length === 0) ? (
          /* ── ไม่มี users ── */
          <div className="no-users-container">

            {retrying ? (
              /* กำลัง retry */
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
                <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-hover)' }} />
                <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>กำลังเชื่อมต่อ...</p>
              </div>
            ) : showRetry ? (
              /* หมดเวลารอ — แสดงปุ่ม retry + default admin */
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#b91c1c', fontSize: '0.9rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '0.65rem 1rem' }}>
                  <WifiOff size={16} />
                  {lang === 'th' ? 'เชื่อมต่อฐานข้อมูลไม่ได้' : 'Cannot connect to database'}
                </div>
                <button
                  onClick={handleRetry}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--accent)', color: 'black', border: 'none', borderRadius: 12, padding: '0.75rem 1.5rem', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <RefreshCw size={17} /> ลองเชื่อมต่อใหม่
                </button>
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>หรือ</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
                </div>
                <button onClick={handleDefaultAdmin} className="default-admin-btn">
                  {lang === 'th' ? 'เข้าในฐานะแอดมิน (ชั่วคราว)' : 'Login as Default Admin'}
                </button>
              </div>
            ) : (
              /* กำลังรอครั้งแรก (5 วิแรก) */
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '0.5rem 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                  <RefreshCw size={15} style={{ animation: 'spin 1.2s linear infinite', opacity: 0.6 }} />
                  {lang === 'th' ? 'กำลังโหลดรายชื่อพนักงาน...' : 'Loading users...'}
                </div>
                <button onClick={handleDefaultAdmin} className="default-admin-btn" style={{ opacity: 0.75 }}>
                  {lang === 'th' ? 'เข้าสู่ระบบในฐานะแอดมิน (เริ่มต้น)' : 'Login as Default Admin'}
                </button>
              </div>
            )}

          </div>
        ) : !selectedUser ? (
          /* ── มี users — เลือกสาขา ── */
          <div className="user-grid">
            {users.map(user => (
              <button key={user.id} className="user-select-btn" onClick={() => handleUserSelect(user)}>
                <div className="user-avatar"><User size={28} /></div>
                <span>{branchName(user) || user.username}</span>
              </button>
            ))}
          </div>
        ) : (
          /* ── กรอกรหัสผ่าน ── */
          <form className="pin-container" onSubmit={handleSubmit}>
            <div className="selected-user-header">
              <button type="button" className="back-btn" onClick={() => setSelectedUser(null)}>
                <ArrowRight size={20} style={{ transform: 'rotate(180deg)' }} />
              </button>
              <div className="current-user-info">
                <User size={20} />
                <span>{branchName(selectedUser) || selectedUser.username}</span>
              </div>
            </div>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              {lang === 'th' ? 'กรุณากรอกรหัสผ่านของสาขา' : 'Enter branch password'}
            </p>
            <input
              type="password"
              className="branch-password-input"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder={lang === 'th' ? 'รหัสผ่าน' : 'Password'}
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box', textAlign: 'center',
                padding: '0.85rem 1rem', fontSize: '1.1rem', letterSpacing: '0.15rem',
                background: '#ffffff', border: '1.5px solid rgba(0,0,0,0.15)',
                borderRadius: 12, color: 'var(--text-main)', outline: 'none', fontFamily: 'inherit',
              }}
            />
            {error && <div className="pin-error" style={{ marginTop: '0.75rem' }}>{error}</div>}
            <button
              type="submit"
              disabled={!password}
              style={{
                marginTop: '1.1rem', width: '100%', padding: '0.85rem',
                background: password ? 'var(--accent)' : 'rgba(0,0,0,0.05)',
                border: 'none', borderRadius: 12, color: password ? 'black' : 'var(--text-muted)',
                fontWeight: 700, fontSize: '1rem', cursor: password ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              }}
            >
              {lang === 'th' ? 'เข้าสู่ระบบ' : 'Login'} <ArrowRight size={18} />
            </button>
          </form>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default LoginScreen;
