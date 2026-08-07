import React, { useState, lazy, Suspense } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { ShoppingCart, ClipboardList, Store, Globe, ShoppingBag, RefreshCw, LogOut, LayoutGrid } from 'lucide-react';
import FoodCard from './components/FoodCard';
import OrderWizardModal from './components/OrderWizardModal';
import CartModal from './components/CartModal';
import TableSelection from './components/TableSelection';
import PaymentApprovalListener from './components/PaymentApprovalListener';
import TableOrderView from './components/TableOrderView';
import LoginScreen from './components/LoginScreen';
import ShiftModal from './components/ShiftModal';
// โหลดแบบ lazy: 2 โมดอลนี้ลากไลบรารีหนัก (html2canvas, qrcode) เปิดตอนกดเท่านั้น → bundle หน้าแรกเล็กลง
const SalesSummaryModal = lazy(() => import('./components/SalesSummaryModal'));
const CheckoutModal = lazy(() => import('./components/CheckoutModal'));
// โหลดแบบ lazy: หน้าหลังบ้าน/ครัว/เหล้า/บิลค้าง ไม่ต้องโหลดตอนเปิดหน้าร้าน → เริ่มแอปไวขึ้น
const KitchenMonitor = lazy(() => import('./components/KitchenMonitor'));
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'));
const Dashboard = lazy(() => import('./components/admin/Dashboard'));
const ManageMenu = lazy(() => import('./components/admin/ManageMenu'));
const ManagePromotions = lazy(() => import('./components/admin/ManagePromotions'));
const ManageCategories = lazy(() => import('./components/admin/ManageCategories'));
const ManageTables = lazy(() => import('./components/admin/ManageTables'));
const ManagePrinters = lazy(() => import('./components/admin/ManagePrinters'));
const ManageUsers = lazy(() => import('./components/admin/ManageUsers'));
const ManageSettings = lazy(() => import('./components/admin/ManageSettings'));
const ManageStock = lazy(() => import('./components/admin/ManageStock'));
const ManageBOM = lazy(() => import('./components/admin/ManageBOM'));
const Reports = lazy(() => import('./components/admin/Reports'));
const OutstandingBills = lazy(() => import('./components/OutstandingBills'));
const LiquorStorage = lazy(() => import('./components/LiquorStorage'));
const WasteRecord = lazy(() => import('./components/WasteRecord'));
const CustomerKiosk = lazy(() => import('./components/CustomerKiosk'));
import { resolvePopupSource, flattenPopupConfig, getPriceOptions } from './utils/popupConfig';
import './index.css';

const MENU_ITEMS = [];

// รหัสสาขานำหน้าเลขบิล — ตัดช่องว่าง/อักขระพิเศษ เป็นตัวพิมพ์ใหญ่ (เช่น "xum" → "XUM")
// กันเลขบิลชนกันข้ามสาขา (แต่ละสาขานับเลขของตัวเองแยกกัน)
const branchPrefix = (b) => {
  const p = String(b || '').trim().toUpperCase().replace(/\s+/g, '').replace(/[^0-9A-Zก-๙]/g, '');
  return p || 'POS';
};

// ⚠️ ปิดหน้าล็อกอินชั่วคราว — เข้าเป็นแอดมินอัตโนมัติ ไม่ต้องกรอกรหัส
// เมื่อตั้ง user/รหัสในชีท Users เรียบร้อยแล้ว เปลี่ยนเป็น false เพื่อเปิดหน้าล็อกอินกลับ
const SKIP_LOGIN = true;
const DEFAULT_ADMIN = { id: 'admin', username: 'admin', branch: 'admin', canCheckout: true, isAdmin: true };


function App() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState('food');
  const [lang, setLang] = useState('th');
  // ประเภทลูกค้าที่เลือกอยู่ (กำหนดราคาของทุกเมนู) — '' = ราคาปกติ
  const [customerType, setCustomerType] = useState('');
  // ชื่อลูกค้า (ไม่บังคับกรอก)
  const [customerName, setCustomerName] = useState('');
  // เริ่มต้นด้วยค่าว่างเพื่อให้ระบบบังคับให้ผู้ใช้เลือกโต๊ะก่อนสั่งอาหาร
  const [tableNumber, setTableNumber] = useState('');

  // Users & Auth — seed from cache so login shows immediately without waiting for GAS
  const [users, setUsers] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cached_users') || '[]'); } catch { return []; }
  });
  // ให้ล็อกอินใหม่ทุกครั้งที่เปิดโปรแกรม — ไม่กู้สถานะล็อกอินเดิมจาก localStorage
  // (SKIP_LOGIN = true → ข้ามหน้าล็อกอิน เข้าเป็นแอดมินทันที)
  const [currentUser, setCurrentUser] = useState(SKIP_LOGIN ? DEFAULT_ADMIN : null);
  // ล้าง key เก่าที่เคยจำล็อกอินไว้ (เผื่อเครื่องที่อัปเดตมาจากเวอร์ชันก่อน)
  React.useEffect(() => {
    try { localStorage.removeItem('current_user'); } catch {}
  }, []);

  // สิทธิ์แอดมิน: รองรับ flag isAdmin จากชีต และเผื่อ user ชื่อ admin
  const isAdmin = !!(currentUser && (currentUser.isAdmin === true || currentUser.isAdmin === 'TRUE' || String(currentUser.username || '').toLowerCase() === 'admin'));
  // สิทธิ์แคชเชียร์: เข้าหลังบ้านได้บางหน้า (ไม่เห็นราคาต้นทุน)
  const isCashier = !isAdmin && !!(currentUser && (currentUser.isCashier === true || currentUser.isCashier === 'TRUE'));
  // สาขาของผู้ใช้ปัจจุบัน = คอลัม A ของชีต Users (branch) — ใช้บันทึกลง Orders.RecordedBy และกรองรายงาน
  const branch = String(currentUser?.branch || currentUser?.id || currentUser?.username || '').trim();

  // Shift state
  const [currentShift, setCurrentShift] = useState(() => {
    try { return JSON.parse(localStorage.getItem('current_shift') || 'null'); } catch { return null; }
  });
  const [shiftSales, setShiftSales] = useState(() => {
    try { return JSON.parse(localStorage.getItem('shift_sales') || 'null') || { totalSales: 0, totalCash: 0, totalCard: 0, totalTransfer: 0, totalOrders: 0 }; } catch { return { totalSales: 0, totalCash: 0, totalCard: 0, totalTransfer: 0, totalOrders: 0 }; }
  });
  const [shiftModalMode, setShiftModalMode] = useState(null); // null | 'open' | 'close'

  // แจ้งเตือนเมื่อบันทึกบิล/การชำระเงินขึ้น Google Sheet ไม่สำเร็จ (เน็ตหลุด/แบ็กเอนด์ error)
  // — กันเคส payment หายเงียบ ๆ แบบช่วงบิล #233–#296 ที่ผ่านมา
  // ค่า: null | { type: 'error' | 'success', msg: string }
  const [saveAlert, setSaveAlert] = useState(null);

  const handleOpenShift = async (openCash) => {
    try {
      await fetch(GAS_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'openShift', staff: currentUser?.username || '', openCash }) });
    } catch (e) {}
    const shiftId = 'SHIFT-' + Date.now();
    const shift = { id: shiftId, openTime: new Date().toISOString(), openStaff: currentUser?.username || '', openCash };
    const freshSales = { totalSales: 0, totalCash: 0, totalCard: 0, totalTransfer: 0, totalOrders: 0 };
    setCurrentShift(shift);
    setShiftSales(freshSales);
    localStorage.setItem('current_shift', JSON.stringify(shift));
    localStorage.setItem('shift_sales', JSON.stringify(freshSales));
    setShiftModalMode(null);
  };

  // โต๊ะที่ยังไม่ชำระ (ใช้ตอนปิดกะ → บิลค้าง)
  const getPendingTables = () => {
    const pending = (tableOrders || []).filter(o => o.Status !== 'paid');
    const map = {};
    pending.forEach(o => {
      const t = String(o.TableNumber);
      if (!map[t]) map[t] = { tableNo: t, count: 0, total: 0, items: [] };
      map[t].count += Number(o.Quantity) || 1;
      map[t].total += (Number(o.ItemPrice) || 0) * (Number(o.Quantity) || 1);
      map[t].items.push(o);
    });
    return Object.values(map).sort((a, b) => String(a.tableNo).localeCompare(String(b.tableNo), 'th', { numeric: true }));
  };

  const handleCloseShift = async (closeCash, note, billInfo = {}) => {
    if (!currentShift) return;

    // สร้างบิลค้างจากโต๊ะที่ยังไม่ชำระ
    const pendingTables = getPendingTables();
    const createdAt = getThaiTimeISO();
    const bills = pendingTables.map(t => {
      const info = billInfo[t.tableNo] || {};
      return {
        id: `OB-${currentShift.id}-${t.tableNo}`,
        shiftId: currentShift.id,
        tableNo: t.tableNo,
        customerName: (info.name || '').trim(),
        phone: (info.phone || '').trim(),
        total: t.total,
        items: t.items,
        createdAt,
        status: 'unpaid'
      };
    });

    if (bills.length > 0) {
      // เก็บลง localStorage ทันที (ให้หน้าบิลค้างแสดงได้เลย)
      try {
        const prev = JSON.parse(localStorage.getItem('outstanding_bills') || '[]');
        localStorage.setItem('outstanding_bills', JSON.stringify([...prev, ...bills]));
      } catch (e) {}
      // บันทึกขึ้นเซิร์ฟเวอร์ + ล้างโต๊ะทั้งหมด
      try {
        await fetch(GAS_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'saveOutstandingBills', bills }) });
        await fetch(GAS_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'clearAllTableOrders' }) });
      } catch (e) {}
      // เคลียร์โต๊ะในเครื่อง + ลบจำนวนลูกค้า
      setTableOrders(prev => prev.filter(o => o.Status === 'paid'));
      pendingTables.forEach(t => localStorage.removeItem('customer_count_' + t.tableNo));
    }

    try {
      await fetch(GAS_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'closeShift', shiftId: currentShift.id, staff: currentUser?.username || '', closeCash, note, ...shiftSales }) });
    } catch (e) {}
    setCurrentShift(null);
    setShiftSales({ totalSales: 0, totalCash: 0, totalCard: 0, totalTransfer: 0, totalOrders: 0 });
    localStorage.removeItem('current_shift');
    localStorage.removeItem('shift_sales');
    setShiftModalMode(null);
  };

  // เวลาที่ล็อกอินเข้าระบบ — ใช้เช็ก auto-logout เมื่อครบ 8 ชั่วโมง
  const loginAtRef = React.useRef(null);

  const handleLogin = (user) => {
    setCurrentUser(user);
    loginAtRef.current = Date.now();
    // ไม่บันทึกลง localStorage — ปิด/รีเฟรชโปรแกรมแล้วต้องล็อกอินใหม่เสมอ
    // เข้าสู่ระบบใหม่ → ไปที่หน้าสั่งอาหารทันที
    setTableNumber('');
    navigate('/index', { replace: true });
  };

  const handleLogout = () => {
    // ระหว่างปิดหน้าล็อกอิน (SKIP_LOGIN) การออกจากระบบแค่รีเซ็ตกลับเป็นแอดมิน ไม่เด้งไปหน้าล็อกอิน
    setCurrentUser(SKIP_LOGIN ? DEFAULT_ADMIN : null);
    loginAtRef.current = null;
    try { localStorage.removeItem('current_user'); } catch {}
    setTableNumber('');
    navigate('/', { replace: true });
  };

  // อยู่ในระบบเกิน 8 ชั่วโมง → ล็อกเอาต์อัตโนมัติ
  // เช็กทุก 1 นาที + เช็กซ้ำตอนแท็บกลับมาโฟกัส (กัน browser หน่วง timer ตอนพับจอ)
  React.useEffect(() => {
    if (!currentUser) return;
    const SESSION_MAX_MS = 8 * 60 * 60 * 1000;
    const check = () => {
      if (loginAtRef.current && Date.now() - loginAtRef.current >= SESSION_MAX_MS) {
        handleLogout();
        setSaveAlert({ type: 'error', msg: '⏰ อยู่ในระบบครบ 8 ชั่วโมงแล้ว ระบบล็อกเอาต์อัตโนมัติ — กรุณาล็อกอินใหม่' });
      }
    };
    const id = setInterval(check, 60 * 1000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', check); };
  }, [currentUser]);



  React.useEffect(() => {
    if (tableNumber) localStorage.setItem('table_number', tableNumber);
    else localStorage.removeItem('table_number');
  }, [tableNumber]);

  const GAS_URL = 'https://script.google.com/macros/s/AKfycbwz9dK329nfIhvmi-Ixy8lA9xQLLheFWHAeVQsdSm_HfciQdgvbDbBdM6y-e0544GTL/exec';

  // ── Retry บิลที่ค้างใน localStorage (pending_orders) ──
  // เรียกตอนเปิดแอปและเมื่อเน็ตกลับมา — ส่งซ้ำเฉพาะที่ backend ยังไม่ตอบ success
  const flushingRef = React.useRef(false);
  const flushPendingOrders = React.useCallback(async () => {
    if (flushingRef.current) return; // กันรันซ้อน (mount + online event)
    let pending;
    try { pending = JSON.parse(localStorage.getItem('pending_orders') || '[]'); } catch { pending = []; }
    if (!Array.isArray(pending) || pending.length === 0) return;

    flushingRef.current = true;
    const stillPending = [];
    for (const entry of pending) {
      try {
        const res = await fetch(GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(entry.payload)
        });
        const json = await res.json().catch(() => null);
        if (!json || json.success !== true) throw new Error('retry failed');
      } catch {
        stillPending.push(entry); // ยังส่งไม่ได้ เก็บไว้รอบหน้า
      }
    }
    localStorage.setItem('pending_orders', JSON.stringify(stillPending));
    flushingRef.current = false;

    const sent = pending.length - stillPending.length;
    if (sent > 0) {
      if (stillPending.length === 0) {
        setSaveAlert({ type: 'success', msg: `✅ ส่งบิลที่ค้าง ${sent} รายการขึ้นระบบสำเร็จแล้ว` });
        setTimeout(() => setSaveAlert(cur => (cur && cur.type === 'success' ? null : cur)), 5000);
      } else {
        setSaveAlert({ type: 'error', msg: `⚠️ ส่งบิลค้างได้ ${sent} รายการ เหลืออีก ${stillPending.length} รายการที่ยังส่งไม่ได้ — กรุณาเช็กอินเทอร์เน็ต` });
      }
    }
  }, [GAS_URL]);

  React.useEffect(() => {
    flushPendingOrders();
    window.addEventListener('online', flushPendingOrders);
    return () => window.removeEventListener('online', flushPendingOrders);
  }, [flushPendingOrders]);

  const [orders, setOrders] = useState([]);
  // เลขบิลล่าสุดแยกตามสาขา (RecordedBy) — { [สาขา]: เลขสูงสุด } เพื่อให้แต่ละสาขานับต่อของตัวเอง
  const [branchMaxMap, setBranchMaxMap] = useState({});
  const [liveMenu, setLiveMenu] = useState([...MENU_ITEMS]);
  const [categories, setCategories] = useState([
    { slug: 'food', name: 'อาหาร', nameEn: 'Food', icon: '🍲' },
    { slug: 'drink', name: 'เครื่องดื่ม', nameEn: 'Drinks', icon: '🥤' }
  ]);
  const [allCategories, setAllCategories] = useState([]);
  const [allMenu, setAllMenu] = useState([...MENU_ITEMS]);

  // POS Settings (service charge, VAT)
  const [posSettings, setPosSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pos_settings') || '{}'); } catch { return {}; }
  });

  React.useEffect(() => {
    const handler = () => {
      try { setPosSettings(JSON.parse(localStorage.getItem('pos_settings') || '{}')); } catch {}
    };
    window.addEventListener('pos_settings_changed', handler);
    return () => window.removeEventListener('pos_settings_changed', handler);
  }, []);

  // settings ที่ใช้จริงตอนเช็คบิล = ค่ากลาง + ทับด้วย QR เฉพาะสาขาที่ล็อกอินอยู่ (ถ้ามีตั้งไว้)
  // เก็บใน posSettings.branchQR[ชื่อสาขา] — ไม่มีของสาขานั้น จะ fallback ใช้ QR กลาง
  const checkoutSettings = React.useMemo(() => {
    const map = posSettings?.branchQR;
    const bq = map && typeof map === 'object' ? map[branch] : null;
    if (!bq) return posSettings;
    const override = {};
    ['qrType', 'kshopRawPayload', 'promptPayId', 'staticQrUrl'].forEach(k => {
      if (bq[k] !== undefined && bq[k] !== '') override[k] = bq[k];
    });
    // ชื่อร้าน/บัญชีของสาขานี้ — ถ้าสาขาไม่ได้กรอกชื่อร้าน ให้โชว์ชื่อสาขาแทน
    // (กันไม่ให้ fallback ไปโชว์ชื่อร้านกลางที่เป็นของอีกสาขา)
    override.qrShopName = bq.qrShopName || branch;
    if (bq.qrAccountName) override.qrAccountName = bq.qrAccountName;
    return { ...posSettings, ...override };
  }, [posSettings, branch]);

  // POS Discounts
  const [posDiscounts, setPosDiscounts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pos_discounts') || '[]'); } catch { return []; }
  });

  React.useEffect(() => {
    const handler = () => {
      try { setPosDiscounts(JSON.parse(localStorage.getItem('pos_discounts') || '[]')); } catch {}
    };
    window.addEventListener('pos_discounts_changed', handler);
    return () => window.removeEventListener('pos_discounts_changed', handler);
  }, []);

  // TABLE ORDERS STATE
  const [tableOrders, setTableOrders] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // CHECKOUT (from table view)
  const [checkoutItems, setCheckoutItems] = useState([]);
  const [checkoutTotal, setCheckoutTotal] = useState(0);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [showSalesSummaryModal, setShowSalesSummaryModal] = useState(false);
  const [salesSummaryMode, setSalesSummaryMode] = useState('daily'); // 'daily' | 'range'

  // เก็บ JSON ของแต่ละส่วนที่ apply ไปแล้ว → อัปเดต state เฉพาะส่วนที่เปลี่ยนจริง (กัน re-render ทั้งแอปทุก 10 วิ)
  const appliedRef = React.useRef({});
  const lastRawRef = React.useRef('');
  const lastStaticRef = React.useRef('');
  // กันยิงซ้อน: GAS ตอบช้า แต่ poll เป็นรอบ — ถ้ารอบก่อนยังไม่เสร็จให้ข้ามรอบนี้ไป
  const inFlightRef = React.useRef(false);
  const staticInFlightRef = React.useRef(false);
  // ถ้า Apps Script ที่ deploy อยู่ยังเป็นเวอร์ชันเก่า (ไม่รู้จัก getLive/getStatic)
  // ให้ถอยกลับไปใช้ getAllData แบบเดิม เพื่อไม่ให้ร้านใช้งานไม่ได้ระหว่างรอ deploy
  const legacyGasRef = React.useRef(false);
  const changed = (key, value) => {
    const json = JSON.stringify(value);
    if (appliedRef.current[key] === json) return false;
    appliedRef.current[key] = json;
    return true;
  };

  const processAppGASData = (data) => {
    if (data.categories && Array.isArray(data.categories) && changed('categories', data.categories)) {
      setAllCategories(data.categories);
      setCategories(data.categories.filter(c => c.isActive !== false));
    }
    if (data.orders && Array.isArray(data.orders) && changed('orders', data.orders)) {
      const groupedOrders = {};
      data.orders.forEach(row => {
        const num = row.OrderNumber;
        if (!num) return;
        if (!groupedOrders[num]) {
          groupedOrders[num] = {
            id: num,
            orderNumber: num,
            customerDetails: { name: row.CustomerName, address: row.Address },
            items: [],
            total: parseFloat(row.TotalAmount) || 0,
            status: (row.Status || 'pending').toLowerCase(),
            timestamp: row.OrderStartTime || row.Timestamp
          };
        } else if ((row.Status || '').toLowerCase() === 'pending') {
          groupedOrders[num].status = 'pending';
        }
        const isSubItem = typeof row.ItemDetail === 'string' && row.ItemDetail.trim().startsWith('↳');
        if (isSubItem && groupedOrders[num].items.length > 0) {
          const lastItem = groupedOrders[num].items[groupedOrders[num].items.length - 1];
          if (!lastItem.subItems) lastItem.subItems = [];
          lastItem.subItems.push(row.ItemDetail);
        } else {
          groupedOrders[num].items.push({ isFlattened: true, name: row.ItemDetail, dining: row.DiningOption });
        }
      });
      const sortedOrders = Object.values(groupedOrders).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      setOrders(sortedOrders);
      // หาเลขบิลสูงสุดแยกตามสาขา (RecordedBy) — บิลเก่าที่ไม่มี RecordedBy รวมเป็นสาขาว่าง
      const branchMaxes = {};
      data.orders.forEach(row => {
        if (!row.OrderNumber) return;
        const by = String(row.RecordedBy || '').trim();
        const val = parseInt(String(row.OrderNumber).replace(/\D/g, ''), 10);
        if (!isNaN(val)) branchMaxes[by] = Math.max(branchMaxes[by] || 0, val);
      });
      setBranchMaxMap(prev => {
        const merged = { ...prev };
        Object.keys(branchMaxes).forEach(k => { merged[k] = Math.max(merged[k] || 0, branchMaxes[k]); });
        return merged;
      });
    }
    if (data.menu && Array.isArray(data.menu) && changed('menu', data.menu)) {
      // flatten per-item popupConfig JSON onto each menu item for the wizard
      const flatMenu = data.menu.map(flattenPopupConfig);
      setAllMenu(flatMenu);
      setLiveMenu(flatMenu.filter(m => m.isActive !== false));
    }
    if (data.tableOrders && Array.isArray(data.tableOrders)) {
      // โต๊ะเป็นข้อมูลที่เปลี่ยนบ่อยและต้องตรงเสมอ → อัปเดตทุกครั้งที่ payload เปลี่ยน
      setTableOrders(data.tableOrders);
    }
    if (data.users && Array.isArray(data.users) && changed('users', data.users)) {
      localStorage.setItem('cached_users', JSON.stringify(data.users));
      setUsers(data.users);
    }
    if (data.settings && typeof data.settings === 'object' && changed('settings', data.settings)) {
      localStorage.setItem('pos_settings', JSON.stringify(data.settings));
      setPosSettings(data.settings);
    }
    if (data.printers && Array.isArray(data.printers) && data.printers.length > 0 && changed('printers', data.printers)) {
      localStorage.setItem('printers_config', JSON.stringify(data.printers));
      window.dispatchEvent(new Event('printers_changed'));
    }
    if (data.discounts && Array.isArray(data.discounts) && data.discounts.length > 0 && changed('discounts', data.discounts)) {
      localStorage.setItem('pos_discounts', JSON.stringify(data.discounts));
      setPosDiscounts(data.discounts);
    }
  };

  // เขียนทับเฉพาะส่วนที่ดึงมา ลงก้อน cache รวม 'gas_all_data'
  // (หน้าหลังบ้านหลายหน้าอ่าน/แก้ก้อนนี้อยู่ จึงต้องคงเป็นก้อนเดียวเหมือนเดิม)
  const mergeIntoCache = (partial) => {
    try {
      const base = JSON.parse(localStorage.getItem('gas_all_data') || '{}') || {};
      const merged = { ...base, ...partial };
      delete merged.error; // กันข้อความ error จาก GAS ค้างอยู่ในก้อน cache
      localStorage.setItem('gas_all_data', JSON.stringify(merged));
    } catch {}
  };

  // ยิง action ใหม่ก่อน ถ้า GAS ยังเป็นเวอร์ชันเก่าจะตอบ {"error":"Unknown GET action"}
  // → จำไว้แล้วถอยไปใช้ getAllData ตลอดทั้ง session
  const fetchAction = async (action, signal) => {
    if (legacyGasRef.current) return await (await fetch(GAS_URL + '?action=getAllData', { signal })).text();
    const text = await (await fetch(GAS_URL + '?action=' + action, { signal })).text();
    if (text.indexOf('Unknown GET action') !== -1) {
      legacyGasRef.current = true;
      console.warn(`GAS ยังไม่รองรับ ?action=${action} — ใช้ getAllData แทน (ต้อง deploy สคริปต์เวอร์ชันใหม่)`);
      return await (await fetch(GAS_URL + '?action=getAllData', { signal })).text();
    }
    return text;
  };

  // ข้อมูล "เย็น" — เมนู/หมวดหมู่/โปรโมชั่น/พนักงาน/ปริ้นเตอร์/ส่วนลด/ตั้งค่า
  // เปลี่ยนเฉพาะตอนแก้หลังบ้าน → ฝั่ง GAS cache ไว้ ดึงนาทีละครั้งพอ
  const fetchStaticFromSheet = async () => {
    if (staticInFlightRef.current) return;
    staticInFlightRef.current = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const text = await fetchAction('getStatic', controller.signal);
      if (text === lastStaticRef.current) return; // เหมือนเดิมเป๊ะ → ไม่ต้องทำอะไรต่อ
      lastStaticRef.current = text;
      const data = JSON.parse(text);
      if (data) {
        mergeIntoCache(data);
        processAppGASData(data);
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.error('Error fetching static from GAS:', e);
    } finally {
      clearTimeout(timer);
      staticInFlightRef.current = false;
    }
  };

  // ข้อมูล "ร้อน" — รายการอาหารรายโต๊ะ + ออเดอร์ล่าสุด ต้องสดเสมอ (อ่านแค่ 2 ชีท)
  const fetchOrdersFromSheet = async () => {
    if (inFlightRef.current) return; // รอบก่อนยังค้างอยู่ → ข้าม กันคำขอกองซ้อนกัน
    inFlightRef.current = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000); // timeout 20 วิ
    try {
      const text = await fetchAction('getLive', controller.signal);
      clearTimeout(timer);
      // ถ้าข้อมูลเหมือนเดิมเป๊ะ → ข้ามทั้งหมด (ไม่ parse/ไม่เซ็ต state/ไม่เขียน localStorage)
      if (text === lastRawRef.current) return;
      lastRawRef.current = text;
      const data = JSON.parse(text);
      if (data) {
        // ต้อง merge ไม่ใช่เขียนทับ — ไม่งั้นเมนู/หมวดหมู่ที่ดึงมาจาก getStatic จะหายไปจาก cache
        mergeIntoCache(data);
        processAppGASData(data);
      }
    } catch (e) {
      clearTimeout(timer);
      if (e.name !== 'AbortError') console.error('Error fetching from GAS:', e);
      // ถ้า cache มีอยู่แล้ว ให้ใช้ cache แสดงแทน
      const cached = localStorage.getItem('gas_all_data');
      if (cached) {
        try { processAppGASData(JSON.parse(cached)); } catch {}
      }
    } finally {
      clearTimeout(timer);
      inFlightRef.current = false;
    }
  };

  // ปุ่มรีเฟรช = กดเอง จึงดึงทั้งของสดและเมนู/ตั้งค่าใหม่ทั้งคู่
  const refreshTableOrders = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchOrdersFromSheet(), fetchStaticFromSheet()]);
    setIsRefreshing(false);
  };

  React.useEffect(() => {
    // แสดงเมนู/หมวดหมู่จาก cache ในเครื่องทันที ไม่ต้องรอ GAS (ตอบช้า + ดึงประวัติออเดอร์ทั้งหมด)
    // ของจริงจะ sync ทับเบื้องหลัง — changed() กันไม่ให้ re-render ซ้ำถ้าข้อมูลเหมือนเดิม
    const cached = localStorage.getItem('gas_all_data');
    if (cached) {
      try { processAppGASData(JSON.parse(cached)); } catch {}
    }
    fetchStaticFromSheet();
    fetchOrdersFromSheet();
    // แยกจังหวะ: ข้อมูลโต๊ะต้องสด → ทุก 20 วิ (อ่านแค่ 2 ชีท เร็ว)
    //            เมนู/พนักงาน/ตั้งค่า เปลี่ยนนาน ๆ ที → ทุก 1 นาที และฝั่ง GAS cache ไว้อีกชั้น
    // หยุด poll เมื่อแท็บถูกซ่อน (พับจอ/สลับแอป) แล้วดึงทันทีตอนกลับมา
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchOrdersFromSheet();
    }, 20000);
    const staticInterval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchStaticFromSheet();
    }, 60000);
    const handleVisible = () => {
      if (document.visibilityState !== 'visible') return;
      fetchOrdersFromSheet();
      fetchStaticFromSheet();
    };
    document.addEventListener('visibilitychange', handleVisible);
    const handleLocalUpdate = () => {
      const cached = localStorage.getItem('gas_all_data');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed) processAppGASData(parsed);
        } catch (e) { }
      }
    };
    window.addEventListener('appDataChanged', handleLocalUpdate);
    return () => {
      clearInterval(interval);
      clearInterval(staticInterval);
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('appDataChanged', handleLocalUpdate);
    };
  }, []);

  // เมนู 1 รายการอยู่ได้หลายหมวด: เช็คทั้งหมวดหลัก (category) และหมวดเพิ่มเติม (categories[])
  const itemInCategory = (item, slug) => {
    const primary = item.category || 'food';
    const extra = Array.isArray(item.categories) ? item.categories : [];
    return primary === slug || extra.includes(slug);
  };

  React.useEffect(() => {
    const visibleCats = categories.filter(cat => liveMenu.some(i => itemInCategory(i, cat.slug)));
    if (visibleCats.length > 0 && !visibleCats.find(c => c.slug === activeCategory)) {
      setActiveCategory(visibleCats[0].slug);
    }
  }, [categories, liveMenu]);

  const [selectedFood, setSelectedFood] = useState(null);
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  React.useEffect(() => {
    setCart([]);
    setIsCartOpen(false);
  }, [tableNumber]);

  // รายการ "ประเภทลูกค้า / ช่องทาง" ทั้งหมด (ราคาขายปกติ / TAKEHOME / DELI)
  const customerTypeOptions = React.useMemo(() => {
    return ['', 'Takehome', 'Deli'];
  }, []);

  // ราคาตาม "ประเภทลูกค้า/ช่องทาง" ที่เลือก — ถ้าเมนูไม่มีประเภทนั้น ใช้ราคาปกติแทน
  const resolvePrice = (food) => {
    const opts = getPriceOptions(food);
    if (customerType) {
      const target = customerType.trim().toLowerCase();
      const match = opts.find(o => {
        const name = (o.name || '').trim().toLowerCase();
        if (name === target) return true;
        if (target === 'takehome' && ['takehome', 'ห่อกลับบ้าน', 'กลับบ้าน', 'takeaway', 'take home'].includes(name)) return true;
        if (target === 'deli' && ['deli', 'delivery', 'lineman', 'grab', 'shopee', 'เดลิเวอรี่'].includes(name)) return true;
        return false;
      });
      if (match) return match;
    }
    return opts.find(o => (o.name || '').trim() === 'ปกติ') || opts[0];
  };

  const handleOrderClick = (food) => {
    const cats = allCategories.length > 0 ? allCategories : categories;
    const cfg = resolvePopupSource(food, cats);
    const hasPopups = [1, 2, 3, 4, 5, 6].some(i => cfg[`hasPopup${i}`] === true);

    if (hasPopups) {
      setSelectedFood(food);
    } else {
      // ไม่มี popup → เพิ่มลงตะกร้าทันทีตามราคาของ "ประเภทลูกค้า/ช่องทาง" ที่เลือกไว้ที่หัวโต๊ะ (ปกติ / Takehome / Deli)
      handleConfirmOrder(food, {
        allPopups: [],
        dining: customerType === 'Takehome'
          ? { id: 'takeaway', name: 'ห่อกลับบ้าน', nameEn: 'Takeaway' }
          : (food.category === 'drink'
            ? { id: 'drink', name: 'เครื่องดื่ม', nameEn: 'Drinks' }
            : { id: 'dine_in', name: 'ทานที่ร้าน', nameEn: 'Dine-in' })
      });
    }
  };

  const handleConfirmOrder = (rawFood, orderDetails) => {
    // ราคาฐานมาจากราคาที่เลือกจาก popup (ถ้าเลือกไว้) หรือจาก "ประเภทลูกค้า" (fallback = ราคาปกติ)
    const chosen = orderDetails?.selectedPrice || resolvePrice(rawFood);
    const baseFood = chosen
      ? { ...rawFood, price: Number(chosen.price) || 0, priceName: chosen.name || '' }
      : rawFood;
    const bundledPopups = [];
    if (baseFood.bundledItems && baseFood.bundledItems.length > 0) {
      baseFood.bundledItems.forEach(bundledId => {
        const bundledFood = liveMenu.find(m => String(m.id) === String(bundledId));
        if (bundledFood) {
          bundledPopups.push({ ...bundledFood, id: `bundled_${bundledFood.id}`, price: 0, isBundled: true });
        }
      });
    }
    const orderCustomerName = customerName.trim();
    const allPopupsWithBundled = [...(orderDetails.allPopups || []), ...bundledPopups];
    const popupsIds = allPopupsWithBundled.map(p => p.id).sort().join('-') || 'no_popups';
    const cartItemId = `${baseFood.id}_${baseFood.priceName || ''}_${orderCustomerName}_${popupsIds}_${orderDetails.spice?.id}_${orderDetails.promo?.id}_${orderDetails.dining?.id}`;
    const existingItemIndex = cart.findIndex(item => item.cartItemId === cartItemId);
    let newCart;
    if (existingItemIndex >= 0) {
      newCart = [...cart];
      newCart[existingItemIndex].quantity += 1;
    } else {
      newCart = [...cart, {
        cartId: Date.now() + Math.random(),
        cartItemId,
        food: baseFood,
        quantity: 1,
        customerName: orderCustomerName,
        allPopups: allPopupsWithBundled,
        spice: orderDetails.spice,
        promo: orderDetails.promo,
        dining: orderDetails.dining
      }];
    }
    setCart(newCart);
    setSelectedFood(null);
    setIsCartOpen(true);
  };

  const handleUpdateQuantity = (cartId, delta) => {
    setCart(cart.map(item => {
      if (item.cartId === cartId) {
        const newQty = (item.quantity || 1) + delta;
        return { ...item, quantity: Math.max(1, newQty) };
      }
      return item;
    }));
  };

  const handleRemoveFromCart = (cartId) => {
    setCart(cart.filter(item => item.cartId !== cartId));
  };

  // หมายเหตุอาหารต่อรายการ
  const handleUpdateCartNote = (cartId, note) => {
    setCart(cart.map(item => item.cartId === cartId ? { ...item, note } : item));
  };

  const handleDecreaseQuantity = (food) => {
    const cartItems = cart.filter(c => c.food.id === food.id);
    if (cartItems.length > 0) {
      const lastItem = cartItems[cartItems.length - 1];
      if (lastItem.quantity > 1) handleUpdateQuantity(lastItem.cartId, -1);
      else handleRemoveFromCart(lastItem.cartId);
    }
  };

  const getThaiTimeISO = () => {
    const d = new Date();
    const thaiTzOptions = { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    const parts = new Intl.DateTimeFormat('en-GB', thaiTzOptions).formatToParts(d);
    const p = {};
    parts.forEach(part => p[part.type] = part.value);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+07:00`;
  };

  // =============================================
  // NEW: Send cart items to TableOrders sheet
  // =============================================
  const handleSendOrderToTable = async () => {
    if (cart.length === 0) return;

    const sessionId = String(Date.now());
    const timestamp = getThaiTimeISO();

    // Optimistic update: add to local tableOrders immediately
    const newLocalItems = cart.map(item => {
      const parts = [];
      if (item.food.priceName) parts.push(item.food.priceName);
      if (item.customerName) parts.push('ลูกค้า: ' + item.customerName);
      if (item.spice && item.spice.name) parts.push('ความเผ็ด: ' + item.spice.name);
      if (item.allPopups && item.allPopups.length > 0) {
        // รวมตัวเลือกที่ซ้ำกันเป็นจำนวน เช่น "Leoขวด ×12"
        const grouped = [];
        item.allPopups.forEach(p => {
          const found = grouped.find(g => g.name === p.name);
          if (found) found.count += 1;
          else grouped.push({ name: p.name, count: 1 });
        });
        grouped.forEach(g => parts.push(g.count > 1 ? `${g.name} ×${g.count}` : g.name));
      }
      if (item.promo && item.promo.id !== 'none' && item.promo.name) parts.push(item.promo.name);
      if (item.note && item.note.trim()) parts.push('📝 ' + item.note.trim());

      let unitPrice = Number(item.food.price) || 0;
      if (item.allPopups && item.allPopups.length > 0) {
        item.allPopups.forEach(p => { unitPrice += Number(p.price || 0); });
      }
      if (item.promo && item.promo.price) {
        unitPrice += Number(item.promo.price) || 0;
      }

      return {
        TableNumber: tableNumber,
        SessionId: sessionId,
        ItemName: item.food.name,
        ItemNameEn: item.food.nameEn || item.food.name,
        ItemPrice: unitPrice,
        Quantity: Number(item.quantity) || 1,
        Options: parts.join(', '),
        Timestamp: timestamp,
        Status: 'pending',
        RecordedBy: branch
      };
    });

    const cartForServer = cart.map(item => {
      let unitPrice = Number(item.food.price) || 0;
      if (item.allPopups && item.allPopups.length > 0) {
        item.allPopups.forEach(p => { unitPrice += Number(p.price || 0); });
      }
      if (item.promo && item.promo.price) {
        unitPrice += Number(item.promo.price) || 0;
      }
      return {
        ...item,
        food: {
          ...item.food,
          price: unitPrice
        }
      };
    });

    setTableOrders(prev => [...prev, ...newLocalItems]);
    setCart([]);
    setIsCartOpen(false);
    navigate('/table-orders');

    try {
      await fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'addTableOrder',
          tableNumber: String(tableNumber),
          sessionId,
          items: cartForServer,
          timestamp,
          recordedBy: branch
        })
      });
      // Refresh after saving
      setTimeout(() => fetchOrdersFromSheet(), 2000);
    } catch (error) {
      console.error('Error saving table order:', error);
    }
  };

  // =============================================
  // NEW: Open checkout from table view
  // =============================================
  const handleOpenCheckoutFromTable = (items, total) => {
    setCheckoutItems(items);
    setCheckoutTotal(total);
    setIsCheckoutOpen(true);
  };

  // =============================================
  // NEW: Complete payment - save to Orders, clear TableOrders
  // =============================================
  const handleCheckoutComplete = async (grandTotal, paymentMethod, paymentDetails) => {
    const finalTotal = grandTotal || checkoutTotal;

    // Update shift sales accumulator
    setShiftSales(prev => {
      let addCash, addTransfer, addCard;
      if (paymentDetails) {
        // แยกจ่าย — กระจายตามจำนวนเงินที่ระบุแต่ละประเภท
        addCash     = Number(paymentDetails.cash)     || 0;
        addTransfer = Number(paymentDetails.transfer) || 0;
        addCard     = Number(paymentDetails.card)     || 0;
      } else {
        const m = (paymentMethod || '').toLowerCase();
        addCash     = (m.includes('สด') || m === 'cash') ? finalTotal : 0;
        addTransfer = (m.includes('โอน') || m.includes('qr')) ? finalTotal : 0;
        addCard     = (m.includes('บัตร') || m === 'card') ? finalTotal : 0;
      }
      const updated = {
        totalSales:    (prev.totalSales    || 0) + finalTotal,
        totalOrders:   (prev.totalOrders   || 0) + 1,
        totalCash:     (prev.totalCash     || 0) + addCash,
        totalTransfer: (prev.totalTransfer || 0) + addTransfer,
        totalCard:     (prev.totalCard     || 0) + addCard,
      };
      localStorage.setItem('shift_sales', JSON.stringify(updated));
      return updated;
    });
    const nextNum = (branchMaxMap[branch] || 0) + 1;
    setBranchMaxMap(prev => ({ ...prev, [branch]: nextNum }));
    const newOrderNumber = `${branchPrefix(branch)}-#${String(nextNum).padStart(3, '0')}`;
    const timestamp = getThaiTimeISO();

    const count = localStorage.getItem('customer_count_' + tableNumber) || '';
    const countText = count ? ` (${count} ท่าน)` : '';
    const customerName = tableNumber ? `โต๊ะ ${tableNumber}${countText}` : 'ไม่ระบุ';
    const address = tableNumber ? `โต๊ะ ${tableNumber}` : 'ไม่ได้กรอกพิกัด';

    const rowsToSend = [];
    checkoutItems.forEach(item => {
      const qty = Number(item.Quantity) || 1;
      const price = (Number(item.ItemPrice) || 0) * qty;
      rowsToSend.push([
        timestamp, newOrderNumber, customerName, address,
        item.ItemName, 'ทานที่ร้าน', price,
        finalTotal, 'Completed', timestamp, timestamp, branch,
        qty
      ]);
      if (item.Options) {
        rowsToSend.push([
          timestamp, newOrderNumber, customerName, address,
          `↳ ${item.Options}`, 'ทานที่ร้าน', 0,
          finalTotal, 'Completed', timestamp, timestamp, branch,
          ""
        ]);
      }
    });

    const newOrder = {
      id: newOrderNumber,
      orderNumber: newOrderNumber,
      customerDetails: { name: customerName, address },
      items: checkoutItems.map(i => ({ isFlattened: true, name: i.ItemName, dining: 'ทานที่ร้าน' })),
      total: finalTotal,
      status: 'completed',
      timestamp
    };

    // Optimistic clear table orders
    setTableOrders(prev => prev.filter(o => String(o.TableNumber) !== String(tableNumber)));
    setOrders(prev => [...prev, newOrder]);
    setCheckoutItems([]);
    setIsCheckoutOpen(false);
    localStorage.removeItem('customer_count_' + tableNumber);
    setTableNumber('');
    navigate('/index');

    // Save to Orders sheet + payment record ในคำขอเดียว (atomic) — กันบิลขึ้นแต่ payment หาย
    // ใช้ fetch แบบอ่าน response ได้ (ไม่ใช้ no-cors) เพื่อ "ตรวจจับ" ว่าบันทึกสำเร็จจริงหรือไม่
    // GAS /exec ตอบ 302 → 200 พร้อม Access-Control-Allow-Origin:* จึงอ่านผลข้าม origin ได้ปลอดภัย
    const orderPayload = {
      action: 'insertOrder',
      rows: rowsToSend,
      payment: {
        orderNumber: newOrderNumber,
        tableNo: String(tableNumber),
        paymentMethod,
        grandTotal: finalTotal,
        staff: currentUser?.username || '',
        shiftId: currentShift?.id || '',
        splitDetail: paymentDetails ? JSON.stringify(paymentDetails) : ''
      }
    };
    try {
      const res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(orderPayload)
      });
      const json = await res.json().catch(() => null);
      if (!json || json.success !== true) {
        throw new Error(json && json.error ? json.error : 'backend ไม่ตอบ success');
      }
    } catch (error) {
      console.error('Error saving order:', error);
      // เก็บบิลที่บันทึกไม่สำเร็จไว้ในเครื่อง เพื่อไม่ให้ข้อมูลหาย + ให้ retry/ตรวจสอบภายหลังได้
      try {
        const pending = JSON.parse(localStorage.getItem('pending_orders') || '[]');
        pending.push({ payload: orderPayload, at: new Date().toISOString(), error: String(error.message || error) });
        localStorage.setItem('pending_orders', JSON.stringify(pending));
      } catch {}
      setSaveAlert({ type: 'error', msg: `⚠️ บันทึกบิล ${newOrderNumber} (${paymentMethod}) ขึ้นระบบไม่สำเร็จ! ข้อมูลถูกสำรองไว้ในเครื่องแล้ว — จะลองส่งซ้ำอัตโนมัติเมื่อเน็ตกลับมา` });
    }

    try {
      // Clear TableOrders for this table
      await fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'clearTableOrders', tableNumber: String(tableNumber) })
      });
    } catch (error) {
      console.error('Error clearing table orders:', error);
    }

    try {
      // Deduct stock based on BOM
      const deductItems = checkoutItems
        .map(item => {
          const menuItem = allMenu.find(m => m.name === item.ItemName || m.nameEn === item.ItemNameEn);
          return menuItem ? { menuId: String(menuItem.id), menuName: item.ItemName, qty: Number(item.Quantity) || 1 } : null;
        })
        .filter(Boolean);
      if (deductItems.length > 0) {
        await fetch(GAS_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ action: 'deductStock', orderNumber: newOrderNumber, tableNo: String(tableNumber), items: deductItems })
        });
      }
    } catch (error) {
      console.error('Error deducting stock:', error);
    }

    try {
      // Print receipt
      const receiptIP = localStorage.getItem('printer_receipt_ip');
      if (receiptIP) {
        fetch(`http://${window.location.hostname}:3001/print`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip: receiptIP, printerType: 'receipt', orderData: newOrder })
        }).catch(err => console.error('Silent print failed:', err));
      }
    } catch (e) { }
  };

  // =============================================
  // NEW: Move or Merge Table
  // =============================================
  // ลายเซ็นของแต่ละบรรทัดในตาราง ใช้จับคู่ตอนย้าย/แยกบางรายการ
  const tableRowSig = (o) => `${o.SessionId}|${o.ItemName}|${o.Options || ''}|${o.ItemPrice}`;

  // items = บรรทัดที่เลือก (ถ้า isAll = true จะย้ายทั้งโต๊ะ)
  const handleMoveMergeTable = async (fromTable, toTable, isMerge, items = null, isAll = true) => {
    const moveAll = isAll || !items || items.length === 0;

    // นับจำนวนต่อ signature สำหรับการย้ายบางรายการ
    const need = {};
    if (!moveAll) items.forEach(it => { const s = tableRowSig(it); need[s] = (need[s] || 0) + 1; });

    // Optimistic update
    setTableOrders(prev => prev.map(o => {
      if (String(o.TableNumber) !== String(fromTable) || o.Status === 'paid') return o;
      if (moveAll) return { ...o, TableNumber: toTable };
      const s = tableRowSig(o);
      if (need[s] > 0) { need[s] -= 1; return { ...o, TableNumber: toTable }; }
      return o;
    }));

    // ย้ายจำนวนลูกค้าเฉพาะเมื่อย้ายทั้งโต๊ะ
    if (moveAll) {
      const count = localStorage.getItem('customer_count_' + fromTable);
      if (count) {
        if (isMerge) {
          const toCount = localStorage.getItem('customer_count_' + toTable);
          if (!toCount) localStorage.setItem('customer_count_' + toTable, count);
        } else {
          localStorage.setItem('customer_count_' + toTable, count);
        }
        localStorage.removeItem('customer_count_' + fromTable);
      }
    }

    setTableNumber(toTable);
    navigate('/table-orders');

    try {
      const body = moveAll
        ? { action: 'moveTable', fromTable: String(fromTable), toTable: String(toTable) }
        : {
            action: 'moveTableItems',
            fromTable: String(fromTable),
            toTable: String(toTable),
            keys: items.map(it => ({
              sessionId: String(it.SessionId ?? ''),
              itemName: String(it.ItemName ?? ''),
              options: String(it.Options ?? ''),
              price: Number(it.ItemPrice) || 0
            }))
          };
      await fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(body)
      });
      setTimeout(() => fetchOrdersFromSheet(), 2000);
    } catch (e) {
      console.error('Error moving table:', e);
    }
  };

  // =============================================
  // Delete a single item from table orders
  // =============================================
  const handleDeleteTableItem = async (item) => {
    // Optimistic remove
    setTableOrders(prev => {
      const idx = prev.findIndex(o =>
        String(o.TableNumber) === String(item.TableNumber) &&
        String(o.SessionId) === String(item.SessionId) &&
        String(o.ItemName) === String(item.ItemName)
      );
      if (idx === -1) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });

    try {
      await fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'deleteTableOrderItem',
          tableNumber: String(item.TableNumber),
          sessionId: String(item.SessionId),
          itemName: String(item.ItemName)
        })
      });
    } catch (e) {
      console.error('Error deleting table item:', e);
    }
  };

  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    try {
      await fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'updateStatus',
          orderId,
          status: newStatus,
          completionTime: newStatus.toLowerCase() === 'completed' ? getThaiTimeISO() : ''
        })
      });
    } catch (e) {
      console.error('Failed to update status in GAS:', e);
    }
  };

  const getCartTotal = () => {
    return cart.reduce((sum, item) => {
      let itemTotal = Number(item.food.price);
      if (item.allPopups && item.allPopups.length > 0) item.allPopups.forEach(p => { itemTotal += Number(p.price || 0); });
      if (item.promo && item.promo.price) itemTotal += Number(item.promo.price);
      return sum + (itemTotal * item.quantity);
    }, 0);
  };

  const handleKioskSendOrder = async (targetTableNo, cartItems, total, paymentMethod) => {
    const sessionId = String(Date.now());
    const timestamp = getThaiTimeISO();

    const cartForServer = cartItems.map(item => {
      let unitPrice = Number(item.food.price) || 0;
      if (item.allPopups && item.allPopups.length > 0) {
        item.allPopups.forEach(p => { unitPrice += Number(p.price || 0); });
      }
      return {
        ...item,
        food: { ...item.food, price: unitPrice }
      };
    });

    try {
      await fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'addTableOrder',
          tableNumber: String(targetTableNo),
          sessionId,
          items: cartForServer,
          timestamp,
          recordedBy: 'Self-Order'
        })
      });
      setTimeout(() => fetchOrdersFromSheet(), 1500);
    } catch (e) {
      console.error('Error saving kiosk order:', e);
    }
  };

  const isKioskPath = window.location.pathname.includes('/kiosk') || window.location.pathname.includes('/self-order');

  if (!currentUser && !isKioskPath) {
    return (
      <LoginScreen
        users={users}
        onLogin={handleLogin}
        lang={lang}
        isOfflineMode={users.length === 0}
        onRetry={fetchStaticFromSheet}
      />
    );
  }

  return (
    <div className="app-container">
      {saveAlert && (
        <div
          onClick={() => setSaveAlert(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 5000,
            background: saveAlert.type === 'success' ? '#16a34a' : '#dc2626',
            color: 'white', padding: '0.85rem 1.25rem',
            fontSize: '0.9rem', fontWeight: 700, textAlign: 'center', cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)', lineHeight: 1.4
          }}
        >
          {saveAlert.msg}
          <div style={{ fontSize: '0.72rem', fontWeight: 500, opacity: 0.85, marginTop: '2px' }}>
            (แตะเพื่อปิด)
          </div>
        </div>
      )}
      <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>{lang === 'th' ? 'กำลังโหลด...' : 'Loading...'}</div>}>
      <Routes>
        <Route path="/" element={<Navigate to="/index" replace />} />
        <Route path="/kiosk" element={<CustomerKiosk liveMenu={liveMenu} categories={categories} settings={checkoutSettings} onSendOrder={handleKioskSendOrder} lang={lang} />} />
        <Route path="/self-order" element={<CustomerKiosk liveMenu={liveMenu} categories={categories} settings={checkoutSettings} onSendOrder={handleKioskSendOrder} lang={lang} />} />

        <Route path="/table-orders" element={
          !tableNumber ? <Navigate to="/index" replace /> :
            <TableOrderView
              tableNumber={tableNumber}
              tableOrders={tableOrders}
              lang={lang}
              currentUser={currentUser}
              settings={posSettings}
              onAddMore={() => navigate('/index')}
              onCheckout={handleOpenCheckoutFromTable}
              onDeleteItem={handleDeleteTableItem}
              onBack={() => {
                navigate('/index');
              }}
              onRefresh={refreshTableOrders}
              isRefreshing={isRefreshing}
              onMoveMerge={handleMoveMergeTable}
              customerType={customerType}
              setCustomerType={setCustomerType}
              customerName={customerName}
              setCustomerName={setCustomerName}
              onSelectTable={() => setTableNumber('')}
              customerTypeOptions={customerTypeOptions}
            />
        } />

        <Route path="/index" element={
          !tableNumber ? (
            <TableSelection
              setGlobalTableNumber={setTableNumber}
              setCustomerType={setCustomerType}
              lang={lang}
              tableOrders={tableOrders}
              shiftOpen={!!currentShift}
              isAdmin={isAdmin}
              onOpenShift={() => setShiftModalMode('open')}
              onCloseShift={() => setShiftModalMode('close')}
            />
          ) : (
            <div className="pos-layout">
              {/* ─── POS Header ─── */}
              <header className="pos-header">
                <div className="pos-header-left">
                  <button
                    className="pos-header-btn"
                    onClick={() => {
                      if (cart.length > 0) {
                        if (window.confirm(lang === 'th' ? 'มีรายการอาหารในตะกร้าที่ยังไม่ได้ส่ง ต้องการกลับไปหน้าเลือกโต๊ะหรือไม่?' : 'Cart is not empty. Go back to table selection?')) {
                          setTableNumber('');
                        }
                      } else {
                        setTableNumber('');
                      }
                    }}
                    style={{
                      background: '#fef08a',
                      border: '1.5px solid #eab308',
                      color: '#000000',
                      fontWeight: '800',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                    title={lang === 'th' ? 'กลับไปหน้าเลือกโต๊ะ' : 'Back to Table Selection'}
                  >
                    <LayoutGrid size={16} color="#854d0e" />
                    <span>{lang === 'th' ? '🪑 เลือกโต๊ะ' : 'Tables'}</span>
                  </button>
                  <img
                    src="/logo.png"
                    alt="Logo"
                    className="pos-logo"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      if (window.confirm(lang === 'th' ? 'ต้องการสลับโต๊ะ/กลับหน้าเลือกคิว?' : 'Switch table/go back to selection?')) {
                        setTableNumber('');
                      }
                    }}
                  />
                  <div className="pos-header-info">
                    <span className="pos-restaurant-name">ข้าวมันไก่หำไหล</span>
                    <span className="pos-table-label">{lang === 'th' ? `โต๊ะ ${tableNumber}` : `Table ${tableNumber}`}</span>
                  </div>
                </div>
                <div className="pos-header-right">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>
                      👤 {lang === 'th' ? 'ประเภทลูกค้า' : 'Customer'}
                    </span>
                    <select
                      value={customerType}
                      onChange={(e) => setCustomerType(e.target.value)}
                      style={{
                        padding: '0.5rem 0.75rem', borderRadius: '8px',
                        background: '#ffffff', color: '#0f172a',
                        border: '2px solid #cbd5e1', fontSize: '0.9rem',
                        fontWeight: 700, cursor: 'pointer', maxWidth: '240px'
                      }}
                    >
                      <option value="" style={{ color: '#000000', fontWeight: 'bold' }}>🪑 ราคาขายปกติ</option>
                      <option value="Takehome" style={{ color: '#000000', fontWeight: 'bold' }}>🛍️ TAKEHOME</option>
                      <option value="Deli" style={{ color: '#000000', fontWeight: 'bold' }}>🛵 DELI</option>
                    </select>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder={lang === 'th' ? 'ชื่อลูกค้า (ถ้ามี)' : 'Customer name (optional)'}
                      style={{
                        padding: '0.5rem 0.75rem', borderRadius: '8px',
                        background: '#ffffff', color: '#0f172a',
                        border: '2px solid #cbd5e1', fontSize: '0.9rem',
                        fontWeight: 600, width: '150px'
                      }}
                    />
                  </div>
                  <button className="pos-header-btn" onClick={() => navigate('/table-orders')} style={{ background: '#1e293b', color: '#ffffff', border: '1px solid #0f172a', fontWeight: '700' }}>
                    🧾 {lang === 'th' ? 'สรุปบิล' : 'Bill Summary'}
                  </button>
                  <button
                    className="pos-header-btn"
                    onClick={() => window.open(`/kiosk?table=${tableNumber}`, '_blank')}
                    style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#ffffff', border: '1px solid #d97706', fontWeight: '800' }}
                    title={lang === 'th' ? 'เปิดหน้าสั่งเองสำหรับลูกค้า' : 'Open Customer Kiosk View'}
                  >
                    📱 {lang === 'th' ? 'หน้าลูกค้าสั่งเอง (Kiosk)' : 'Customer Kiosk'}
                  </button>
                  <button className="pos-header-btn" onClick={() => navigate('/waste')} style={{ background: '#dc2626', border: '1px solid #991b1b', color: '#ffffff', fontWeight: '700' }}>
                    🗑️ {lang === 'th' ? 'ทิ้ง (Waste)' : 'Waste'}
                  </button>
                  <button className="pos-header-btn" onClick={() => { setSalesSummaryMode('daily'); setShowSalesSummaryModal(true); }} style={{ background: '#7c3aed', border: '1px solid #6d28d9', color: '#ffffff', fontWeight: '700' }}>
                    📊 {lang === 'th' ? 'สรุปยอดขายวันนี้' : 'Today Sales'}
                  </button>
                  <button className="pos-header-btn" onClick={() => { setSalesSummaryMode('range'); setShowSalesSummaryModal(true); }} style={{ background: '#0284c7', border: '1px solid #0369a1', color: '#ffffff', fontWeight: '700' }}>
                    📅 {lang === 'th' ? 'สรุปยอดขายระหว่างวัน' : 'Sales Range'}
                  </button>
                  <button
                    onClick={refreshTableOrders}
                    disabled={isRefreshing}
                    className="pos-header-btn"
                    style={{ background: '#0f172a', border: '1px solid #020617', color: '#ffffff', fontWeight: '700' }}
                  >
                    <RefreshCw size={14} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
                    {isRefreshing ? (lang === 'th' ? 'กำลังโหลด...' : 'Loading...') : (lang === 'th' ? 'รีเฟรช' : 'Refresh')}
                  </button>

                  {/* ปุ่มเข้าหลังบ้าน — เห็นเฉพาะแอดมินเท่านั้น */}
                  {isAdmin && (
                    <button
                      className="pos-header-btn"
                      onClick={() => navigate('/admin')}
                      style={{ background: '#ea580c', border: '1px solid #c2410c', color: '#ffffff', fontWeight: '700' }}
                    >
                      ⚙️ {lang === 'th' ? 'จัดการหลังบ้าน' : 'Admin Panel'}
                    </button>
                  )}
                  <button className="pos-header-btn" onClick={() => setLang(lang === 'th' ? 'en' : 'th')} style={{ background: '#f1f5f9', border: '1.5px solid #94a3b8', color: '#0f172a', fontWeight: '700' }}>
                    <Globe size={14} /> {lang === 'th' ? 'TH' : 'EN'}
                  </button>
                  <button
                    className="pos-header-btn"
                    onClick={() => { if (window.confirm(lang === 'th' ? `ออกจากระบบสาขา "${branch}"?` : 'Log out?')) handleLogout(); }}
                    style={{ background: '#b91c1c', border: '1px solid #7f1d1d', color: '#ffffff', fontWeight: '700' }}
                  >
                    <LogOut size={14} /> {lang === 'th' ? `ออกจากระบบ (${branch})` : 'Logout'}
                  </button>
                  <button className="pos-cart-btn" onClick={() => setIsCartOpen(true)}>
                    <ShoppingBag size={20} />
                    <div className="pos-cart-info">
                      <span className="pos-cart-count">{cart.reduce((s, i) => s + (i.quantity || 1), 0)} {lang === 'th' ? 'รายการ' : 'items'}</span>
                      <span className="pos-cart-total">฿{getCartTotal().toLocaleString()}</span>
                    </div>
                    {cart.length > 0 && (
                      <span className="pos-cart-badge">{cart.reduce((s, i) => s + (i.quantity || 1), 0)}</span>
                    )}
                  </button>
                </div>
              </header>

              <div className="pos-body">
                {/* ─── Category Sidebar ─── */}
                <aside className="pos-sidebar">
                  <div className="pos-sidebar-header">{lang === 'th' ? 'หมวดหมู่' : 'Categories'}</div>
                  {categories
                    .filter(cat => liveMenu.some(i => itemInCategory(i, cat.slug)))
                    .map(cat => {
                      const count = liveMenu.filter(i => itemInCategory(i, cat.slug)).length;
                      return (
                        <button
                          key={cat.slug}
                          className={`pos-cat-btn ${activeCategory === cat.slug ? 'active' : ''}`}
                          onClick={() => setActiveCategory(cat.slug)}
                        >
                          <span className="pos-cat-icon">{cat.icon}</span>
                          <div className="pos-cat-text">
                            <span className="pos-cat-name">{lang === 'th' ? cat.name : cat.nameEn}</span>
                            <span className="pos-cat-count">{count} {lang === 'th' ? 'รายการ' : 'items'}</span>
                          </div>
                        </button>
                      );
                    })}
                </aside>

                {/* ─── Food Grid ─── */}
                <main className="pos-main">
                  {(() => {
                    const activeCat = categories.find(c => c.slug === activeCategory);
                    const filteredItems = liveMenu.filter(i => itemInCategory(i, activeCategory));
                    return (
                      <>
                        <div className="pos-section-header">
                          <div className="pos-section-title">
                            <span className="pos-section-icon">{activeCat?.icon}</span>
                            <h2>{lang === 'th' ? activeCat?.name : activeCat?.nameEn}</h2>
                          </div>
                          <span className="pos-item-count">{filteredItems.length} {lang === 'th' ? 'รายการ' : 'items'}</span>
                        </div>
                        <div className="pos-food-grid">
                          {filteredItems.map(item => (
                            <FoodCard
                              key={item.id}
                              food={item}
                              lang={lang}
                              displayPrice={Number(resolvePrice(item)?.price) || 0}
                              onOrderClick={handleOrderClick}
                              onDecreaseClick={handleDecreaseQuantity}
                              cartQuantity={cart.filter(c => c.food.id === item.id).reduce((sum, c) => sum + (c.quantity || 1), 0)}
                            />
                          ))}
                          {filteredItems.length === 0 && (
                            <div className="pos-empty-category">
                              <span>{lang === 'th' ? 'ไม่มีรายการในหมวดหมู่นี้' : 'No items in this category'}</span>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </main>
              </div>
            </div>
          )
        } />

        <Route path="/kitchen" element={
          <KitchenMonitor
            orders={orders.filter(o => o.status && o.status.toLowerCase() === 'pending')}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onNewOrder={() => navigate('/index')}
          />
        } />

        <Route path="/outstanding" element={
          <OutstandingBills lang={lang} onBack={() => navigate('/table-select')} />
        } />

        <Route path="/liquor" element={
          <LiquorStorage
            currentUser={currentUser}
            lang={lang}
            onBack={() => navigate('/table-select')}
            menu={allMenu.length > 0 ? allMenu : liveMenu}
            categories={allCategories.length > 0 ? allCategories : categories}
          />
        } />

        <Route path="/waste" element={
          <WasteRecord
            currentUser={currentUser}
            lang={lang}
            branch={branch}
            onBack={() => navigate('/index')}
            menu={allMenu.length > 0 ? allMenu : liveMenu}
            categories={allCategories.length > 0 ? allCategories : categories}
          />
        } />

        <Route path="/admin" element={(isAdmin || isCashier) ? <AdminLayout lang={lang} setLang={setLang} onLogout={handleLogout} isCashier={isCashier} /> : <Navigate to="/table-select" replace />}>
          <Route index element={<Dashboard />} />
          <Route path="menu" element={<ManageMenu />} />
          <Route path="categories" element={<ManageCategories />} />
          <Route path="tables" element={<ManageTables />} />
          <Route path="users" element={isAdmin ? <ManageUsers /> : <Navigate to="/admin" replace />} />
          <Route path="promotions" element={<ManagePromotions />} />
          <Route path="printers" element={isAdmin ? <ManagePrinters /> : <Navigate to="/admin" replace />} />
          <Route path="settings" element={isAdmin ? <ManageSettings users={users} /> : <Navigate to="/admin" replace />} />
          <Route path="bom" element={isAdmin ? <ManageBOM /> : <Navigate to="/admin" replace />} />
          <Route path="stock" element={<ManageStock />} />
          <Route path="reports" element={(isAdmin || isCashier) ? <Reports allMenu={allMenu} isAdmin={isAdmin} branch={branch} users={users} /> : <Navigate to="/admin" replace />} />
        </Route>
      </Routes>
      </Suspense>

      {selectedFood && (
        <OrderWizardModal
          food={selectedFood}
          lang={lang}
          liveMenu={allMenu.length > 0 ? allMenu : liveMenu}
          categories={allCategories.length > 0 ? allCategories : categories}
          basePrice={Number(resolvePrice(selectedFood)?.price) || 0}
          onClose={() => setSelectedFood(null)}
          onConfirm={handleConfirmOrder}
        />
      )}

      {isCartOpen && (
        <CartModal
          cart={cart}
          lang={lang}
          onClose={() => setIsCartOpen(false)}
          onRemove={handleRemoveFromCart}
          onUpdateQuantity={handleUpdateQuantity}
          onUpdateNote={handleUpdateCartNote}
          onCheckout={handleSendOrderToTable}
          settings={posSettings}
        />
      )}

      {shiftModalMode && (
        <ShiftModal
          mode={shiftModalMode}
          currentShift={currentShift}
          shiftSales={shiftSales}
          currentUser={currentUser}
          pendingTables={shiftModalMode === 'close' ? getPendingTables() : []}
          onConfirmOpen={handleOpenShift}
          onConfirmClose={handleCloseShift}
          onClose={() => setShiftModalMode(null)}
        />
      )}

      {showSalesSummaryModal && (
        <Suspense fallback={null}>
          <SalesSummaryModal
            lang={lang}
            initialMode={salesSummaryMode}
            allMenu={allMenu}
            categories={allCategories.length > 0 ? allCategories : categories}
            isAdmin={isAdmin}
            branch={branch}
            users={users}
            onClose={() => setShowSalesSummaryModal(false)}
          />
        </Suspense>
      )}

      {isCheckoutOpen && (
        <Suspense fallback={null}>
          <CheckoutModal
            tableOrderItems={checkoutItems}
            total={checkoutTotal}
            lang={lang}
            orderNumber={`${branchPrefix(branch)}-#${String((branchMaxMap[branch] || 0) + 1).padStart(3, '0')}`}
            onClose={() => setIsCheckoutOpen(false)}
            onComplete={handleCheckoutComplete}
            settings={checkoutSettings}
            discounts={posDiscounts}
            users={users}
            currentUser={currentUser}
            tableNo={tableNumber}
          />
        </Suspense>
      )}

      {/* แจ้งเตือนคำขออนุมัติ QR — เฉพาะแอดมิน/แคชเชียร์ */}
      {(isAdmin || isCashier) && (
        <PaymentApprovalListener currentUser={currentUser} lang={lang} />
      )}
    </div>
  );
}

export default App;
