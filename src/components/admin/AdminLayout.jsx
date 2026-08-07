import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, UtensilsCrossed, Tag, LogOut, Store, Layers, FileSpreadsheet, Globe, Users, Settings, Package, FlaskConical, BarChart2 } from 'lucide-react';
import './Admin.css';

const AdminLayout = ({ lang, setLang, isCashier = false, onLogout }) => {
  const navigate = useNavigate();
  // แคชเชียร์เห็นเฉพาะหน้าเหล่านี้
  const allowAll = !isCashier;

  return (
    <div className="admin-container">
       <aside className="admin-sidebar">
          <div className="admin-logo">
             <h2>👑 {lang === 'th' ? 'แผงควบคุม' : 'Admin Panel'}</h2>
             <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>ข้าวมันไก่หำไหล</p>
          </div>
          <nav className="admin-nav">
             <NavLink to="/admin" end className={({isActive}) => isActive ? "admin-link active" : "admin-link"}>
                <LayoutDashboard size={20} /> {lang === 'th' ? 'แดชบอร์ด' : 'Dashboard'}
             </NavLink>
             <NavLink to="/admin/menu" className={({isActive}) => isActive ? "admin-link active" : "admin-link"}>
                <UtensilsCrossed size={20} /> {lang === 'th' ? 'จัดการเมนู' : 'Manage Menu'}
             </NavLink>
             <NavLink to="/admin/categories" className={({isActive}) => isActive ? "admin-link active" : "admin-link"}>
                <Layers size={20} /> {lang === 'th' ? 'หมวดหมู่' : 'Categories'}
             </NavLink>
             <NavLink to="/admin/tables" className={({isActive}) => isActive ? "admin-link active" : "admin-link"}>
                <LayoutDashboard size={20} /> {lang === 'th' ? 'จัดการโต๊ะ & ราคา' : 'Manage Tables'}
             </NavLink>
             {allowAll && (
               <NavLink to="/admin/users" className={({isActive}) => isActive ? "admin-link active" : "admin-link"}>
                  <Users size={20} /> {lang === 'th' ? 'พนักงาน' : 'Users'}
               </NavLink>
             )}
             <NavLink to="/admin/promotions" className={({isActive}) => isActive ? "admin-link active" : "admin-link"}>
                <Tag size={20} /> {lang === 'th' ? 'ส่วนลด' : 'Discounts'}
             </NavLink>
             {allowAll && (
               <NavLink to="/admin/printers" className={({isActive}) => isActive ? "admin-link active" : "admin-link"}>
                  <Store size={20} /> {lang === 'th' ? 'ปริ้นเตอร์' : 'Printers'}
               </NavLink>
             )}
             {allowAll && (
               <NavLink to="/admin/bom" className={({isActive}) => isActive ? "admin-link active" : "admin-link"}>
                  <FlaskConical size={20} /> {lang === 'th' ? 'BOM / สูตรอาหาร' : 'BOM'}
               </NavLink>
             )}
             <NavLink to="/admin/stock" className={({isActive}) => isActive ? "admin-link active" : "admin-link"}>
                <Package size={20} /> {lang === 'th' ? 'สต็อกวัตถุดิบ' : 'Stock'}
             </NavLink>
             {allowAll && (
               <NavLink to="/admin/settings" className={({isActive}) => isActive ? "admin-link active" : "admin-link"}>
                  <Settings size={20} /> {lang === 'th' ? 'ตั้งค่าร้าน' : 'Settings'}
               </NavLink>
             )}
             {allowAll && (
               <NavLink to="/admin/reports" className={({isActive}) => isActive ? "admin-link active" : "admin-link"}>
                  <BarChart2 size={20} /> {lang === 'th' ? 'รายงาน' : 'Reports'}
               </NavLink>
             )}
             {allowAll && (
               <a href="/kitchen" className="admin-link" onClick={(e) => { e.preventDefault(); navigate('/kitchen'); }}>
                  <Store size={20} /> {lang === 'th' ? 'หน้าจอห้องครัว' : 'Kitchen Monitor'}
               </a>
             )}
             {allowAll && (
               <a href="https://docs.google.com/spreadsheets/" target="_blank" rel="noopener noreferrer" className="admin-link">
                  <FileSpreadsheet size={20} /> {lang === 'th' ? 'กูเกิลชีต (ข้อมูล)' : 'Google Sheets'}
               </a>
             )}
             
             <button 
               className="admin-link" 
               style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.1)', justifyContent: 'center' }} 
               onClick={() => setLang(lang === 'th' ? 'en' : 'th')}
             >
                <Globe size={20} /> {lang === 'th' ? 'English' : 'ภาษาไทย'}
             </button>

             <button className="admin-link logout" style={{ marginTop: '0.5rem' }} onClick={() => navigate('/index')}>
                <LogOut size={20} /> {lang === 'th' ? 'กลับสู่หน้าร้าน' : 'Exit to Storefront'}
             </button>

             <button
                className="admin-link logout"
                style={{ marginTop: '0.25rem', color: '#f87171' }}
                onClick={() => { if (onLogout && window.confirm(lang === 'th' ? 'ออกจากระบบ?' : 'Log out?')) onLogout(); }}
             >
                <LogOut size={20} /> {lang === 'th' ? 'ออกจากระบบ' : 'Logout'}
             </button>
          </nav>
       </aside>
       <main className="admin-main">
          <Outlet context={{ lang, isCashier, canSeeCost: !isCashier }} />
       </main>
    </div>
  );
};

export default AdminLayout;
