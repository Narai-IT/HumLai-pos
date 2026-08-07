import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './TableSelection.css';

const TableSelection = ({
  setGlobalTableNumber,
  setCustomerType,
  lang,
  tableOrders = [],
  shiftOpen = true,
  isAdmin = false,
  onOpenShift,
  onCloseShift
}) => {
  const navigate = useNavigate();
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [selectedTableForCustomer, setSelectedTableForCustomer] = useState(null);
  const [customerCount, setCustomerCount] = useState(1);

  const [configuredTables, setConfiguredTables] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem('pos_tables_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setConfiguredTables(parsed.filter(t => t.active !== false));
        }
      } catch (e) {}
    }
  }, []);

  const dineInTables = configuredTables.length > 0
    ? configuredTables.filter(t => t.zone === 'DineIn' || !t.zone).map(t => t.name)
    : Array.from({ length: 16 }, (_, i) => i + 1);

  const takehomeTables = configuredTables.length > 0
    ? configuredTables.filter(t => t.zone === 'Takehome').map(t => t.name)
    : ['Takehome 1', 'Takehome 2', 'Takehome 3', 'Takehome 4', 'Takehome 5'];

  const deliveryTables = configuredTables.length > 0
    ? configuredTables.filter(t => t.zone === 'Delivery').map(t => t.name)
    : ['LineMan', 'Grab', 'Shopee'];

  const vipTables = configuredTables.length > 0
    ? configuredTables.filter(t => t.zone === 'VIP').map(t => t.name)
    : [];

  const getTableItemCount = (num) => {
    return tableOrders.filter(
      o => String(o.TableNumber).trim().toLowerCase() === String(num).trim().toLowerCase() && o.Status !== 'paid'
    ).length;
  };

  const handleSelectTable = (num) => {
    if (!shiftOpen) {
      alert(lang === 'th' ? 'กรุณาเปิดกะก่อนจึงจะเลือกโต๊ะได้' : 'Please open a shift before selecting a table.');
      return;
    }

    const tableStr = String(num).trim();
    let typeToSet = '';

    const foundConfig = configuredTables.find(t => String(t.name).trim().toLowerCase() === tableStr.toLowerCase());
    if (foundConfig) {
      if (foundConfig.priceTier === 'takehome') typeToSet = 'Takehome';
      else if (foundConfig.priceTier === 'deli') typeToSet = 'Deli';
      else if (foundConfig.priceTier === 'vip') typeToSet = 'VIP';
      else typeToSet = '';
    } else {
      if (tableStr.toLowerCase().startsWith('takehome') || tableStr.includes('กลับบ้าน')) {
        typeToSet = 'Takehome';
      } else if (['lineman', 'grab', 'shopee', 'deli', 'delivery'].some(d => tableStr.toLowerCase().includes(d))) {
        typeToSet = 'Deli';
      }
    }

    if (setCustomerType) {
      setCustomerType(typeToSet);
    }

    const count = getTableItemCount(num);
    if (count > 0) {
      setGlobalTableNumber(num);
      navigate('/table-orders');
    } else {
      if (typeToSet !== '') {
        localStorage.setItem('customer_count_' + num, 1);
        setGlobalTableNumber(num);
        navigate('/index');
      } else {
        setSelectedTableForCustomer(num);
        setCustomerCount(1);
        setShowCustomerModal(true);
      }
    }
  };

  const handleConfirmCustomerCount = () => {
    if (selectedTableForCustomer && customerCount > 0) {
      localStorage.setItem('customer_count_' + selectedTableForCustomer, customerCount);
      setGlobalTableNumber(selectedTableForCustomer);
      setShowCustomerModal(false);
      navigate('/index');
    }
  };

  const renderTableButton = (num, displayLabel, isDelivery = false) => {
    const count = getTableItemCount(num);
    const hasOrders = count > 0;
    return (
      <button
        key={num}
        className={`table-btn ${hasOrders ? 'table-btn-active' : ''}`}
        onClick={() => handleSelectTable(num)}
        style={{
          position: 'relative',
          padding: isDelivery ? '0.8rem 0.3rem' : '0.85rem 0',
          fontSize: isDelivery ? '0.92rem' : '1.05rem',
          whiteSpace: 'nowrap'
        }}
      >
        {displayLabel}
        {hasOrders && (
          <span style={{
            position: 'absolute',
            top: '-6px',
            right: '-6px',
            background: '#b91c1c',
            color: 'white',
            fontSize: '0.7rem',
            fontWeight: '800',
            minWidth: '20px',
            height: '20px',
            borderRadius: '10px',
            padding: '0 4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid var(--bg-card)',
            boxShadow: '0 2px 6px rgba(185,28,28,0.3)'
          }}>
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="table-selection-container">
      <div className="table-selection-card">
        {/* แถบปุ่ม: เปิด/ปิดกะ + เข้าจัดการหลังบ้าน */}
        {(onOpenShift || onCloseShift || isAdmin) && (
          <div className="ts-toolbar">
            {(shiftOpen ? onCloseShift : onOpenShift) && (
              <button
                className={`ts-toolbar-btn ${shiftOpen ? 'ts-btn-close-shift' : 'ts-btn-open-shift'}`}
                onClick={shiftOpen ? onCloseShift : onOpenShift}
              >
                {shiftOpen
                  ? (lang === 'th' ? '🔒 ปิดกะ' : '🔒 Close Shift')
                  : (lang === 'th' ? '🕐 เปิดกะ' : '🕐 Open Shift')}
              </button>
            )}
            {isAdmin && (
              <button className="ts-toolbar-btn ts-btn-admin" onClick={() => navigate('/admin')}>
                {lang === 'th' ? '⚙️ จัดการหลังบ้าน' : '⚙️ Admin Panel'}
              </button>
            )}
          </div>
        )}

        <h1 className="table-selection-title">
          {lang === 'th' ? 'ข้าวมันไก่หำไหล' : 'Hum Lai Chicken Rice'}
        </h1>
        <p className="table-selection-subtitle">
          {lang === 'th' ? 'เลือกโต๊ะ หรือช่องทางเพื่อดูและสั่งอาหาร' : 'Select a table or channel to start ordering'}
        </p>

        {!shiftOpen && (
          <div style={{
            margin: '0 0 1rem 0', padding: '0.75rem 1rem', borderRadius: '10px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#b91c1c', fontSize: '0.9rem', fontWeight: 600, textAlign: 'center'
          }}>
            {lang === 'th' ? '⚠️ ยังไม่ได้เปิดกะ — กรุณาเปิดกะก่อนจึงจะเลือกโต๊ะและสั่งอาหารได้' : '⚠️ Shift not open — please open a shift to select a table and order.'}
          </div>
        )}

        <div style={{ opacity: shiftOpen ? 1 : 0.45, pointerEvents: shiftOpen ? 'auto' : 'none' }}>
          {/* 🪑 โต๊ะทานที่ร้าน (1-16) */}
          <div style={{ marginBottom: '1.25rem', textAlign: 'left' }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              🪑 {lang === 'th' ? 'โต๊ะทานที่ร้าน (ราคาปกติ)' : 'Dine-in Tables'}
            </div>
            <div className="table-grid">
              {dineInTables.map(num => renderTableButton(num, `${num}`))}
            </div>
          </div>

          {/* 🛍️ ห่อกลับบ้าน (Takehome 1 - 5) */}
          <div style={{ marginBottom: '1.25rem', textAlign: 'left' }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#d97706', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              🛍️ {lang === 'th' ? 'ห่อกลับบ้าน (ราคา Takehome)' : 'Take Home'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
              {takehomeTables.map(num => renderTableButton(num, String(num).replace('Takehome ', 'ห่อ '))) }
            </div>
          </div>

          {/* 🛵 Delivery (LineMan, Grab, Shopee) */}
          <div style={{ marginBottom: '1.25rem', textAlign: 'left' }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0284c7', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              🛵 {lang === 'th' ? 'เดลิเวอรี่ (ราคา Deli)' : 'Delivery App'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {deliveryTables.map(name => {
                let icon = '🛵';
                if (name === 'LineMan') icon = '🟢';
                if (name === 'Grab') icon = '🟢';
                if (name === 'Shopee') icon = '🟠';
                return renderTableButton(name, `${icon} ${name}`, true);
              })}
            </div>
          </div>

          {/* ⭐ VIP / Special Zone */}
          {vipTables.length > 0 && (
            <div style={{ marginBottom: '1.25rem', textAlign: 'left' }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#7c3aed', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                ⭐ {lang === 'th' ? 'โซน VIP / ราคาพิเศษ' : 'VIP Zone'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {vipTables.map(num => renderTableButton(num, `⭐ ${num}`))}
              </div>
            </div>
          )}
        </div>

        <div className="table-custom-input">
          <div className="separator">
            <span>{lang === 'th' ? 'หรือระบุเบอร์โต๊ะอื่นๆ' : 'Or enter custom table'}</span>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const val = e.target.elements.tableInput.value.trim();
              if (val) handleSelectTable(val);
            }}
            style={{ display: 'flex', gap: '8px', marginTop: '16px' }}
          >
            <input
              type="text"
              name="tableInput"
              placeholder={lang === 'th' ? 'ระบุเบอร์โต๊ะ' : 'Enter table #'}
              className="table-input"
            />
            <button type="submit" className="table-submit-btn">
              {lang === 'th' ? 'ตกลง' : 'Confirm'}
            </button>
          </form>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#b91c1c', display: 'inline-block' }} />
          {lang === 'th' ? 'มีรายการอาหาร' : 'Has active orders'}
        </div>
      </div>

      {/* Customer Count Modal */}
      {showCustomerModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '320px',
            padding: '1.5rem',
            boxShadow: '0 10px 40px rgba(0,0,0,0.08)'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', color: 'var(--text-main)', textAlign: 'center' }}>
              {lang === 'th' ? `โต๊ะ ${selectedTableForCustomer}` : `Table ${selectedTableForCustomer}`}
            </h3>
            
            <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
              <label style={{ display: 'block', marginBottom: '0.8rem', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                {lang === 'th' ? 'ระบุจำนวนลูกค้า (ท่าน)' : 'Enter Customer Count'}
              </label>
              
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                <button
                  onClick={() => setCustomerCount(Math.max(1, customerCount - 1))}
                  style={{
                    width: '40px', height: '40px',
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.05)',
                    border: 'none',
                    color: 'var(--text-main)',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  -
                </button>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)', minWidth: '40px' }}>
                  {customerCount}
                </span>
                <button
                  onClick={() => setCustomerCount(customerCount + 1)}
                  style={{
                    width: '40px', height: '40px',
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.05)',
                    border: 'none',
                    color: 'var(--text-main)',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  +
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setShowCustomerModal(false)}
                style={{
                  flex: 1,
                  background: 'rgba(0,0,0,0.05)',
                  border: 'none',
                  borderRadius: '10px',
                  color: 'var(--text-main)',
                  padding: '0.8rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
              </button>
              <button
                onClick={handleConfirmCustomerCount}
                style={{
                  flex: 1,
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: '10px',
                  color: 'black',
                  padding: '0.8rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {lang === 'th' ? 'ตกลง' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TableSelection;
