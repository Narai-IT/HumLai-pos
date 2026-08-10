import React, { useState, useEffect } from 'react';
import { Printer, Save, CheckCircle, XCircle, AlertCircle, Plus, Trash2, Search, RefreshCw, Wifi } from 'lucide-react';

const GAS_URL = 'https://script.google.com/macros/s/AKfycbz_M970PiWeHT4cs94tyddCigncF-blNpgepYO-qOHPFv1mJ5OOybjPfdPF6ALTsXKu/exec';

const PRINTER_TYPES = [
  { value: 'kitchen', label: 'ครัว (Kitchen)' },
  { value: 'bar', label: 'บาร์ (Bar)' },
  { value: 'receipt', label: 'ใบเสร็จ (Receipt)' },
  { value: 'other', label: 'อื่นๆ (Other)' },
];

const DEFAULT_PRINTER = (ip = '') => ({ id: Date.now(), name: '', ip, type: 'kitchen' });

const ManagePrinters = () => {
  const [printers, setPrinters] = useState([]);
  const [testStatus, setTestStatus] = useState({}); // { [id]: { status, msg } }
  const [saved, setSaved] = useState(false);

  // LAN Scanning states
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null); // { localIp, baseIp, printers: [{ip, port}] }
  const [scanError, setScanError] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('printers_config');
    if (stored) {
      try { setPrinters(JSON.parse(stored)); } catch (e) {}
    } else {
      // Migrate old single-printer settings
      const oldKitchen = localStorage.getItem('printer_kitchen_ip');
      const oldReceipt = localStorage.getItem('printer_receipt_ip');
      const migrated = [];
      if (oldReceipt) migrated.push({ id: 1, name: 'ใบเสร็จ', ip: oldReceipt, type: 'receipt' });
      if (oldKitchen) migrated.push({ id: 2, name: 'ครัว', ip: oldKitchen, type: 'kitchen' });
      if (migrated.length > 0) setPrinters(migrated);
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('printers_config', JSON.stringify(printers));
    window.dispatchEvent(new Event('printers_changed'));
    fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'savePrinters', printers })
    }).catch(console.error);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const addPrinter = (ip = '') => {
    setPrinters(prev => [...prev, DEFAULT_PRINTER(ip)]);
    setSaved(false);
  };

  const removePrinter = (id) => {
    setPrinters(prev => prev.filter(p => p.id !== id));
    setSaved(false);
  };

  const updatePrinter = (id, field, value) => {
    setPrinters(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    setSaved(false);
  };

  const useDiscoveredIp = (ip) => {
    // If an existing printer has an empty IP, use that first
    const emptyIndex = printers.findIndex(p => !p.ip);
    if (emptyIndex !== -1) {
      updatePrinter(printers[emptyIndex].id, 'ip', ip);
    } else {
      addPrinter(ip);
    }
  };

  const handleScanLan = async () => {
    setIsScanning(true);
    setScanError(null);
    setScanResult(null);

    try {
      const response = await fetch(`http://${window.location.hostname}:3001/scan-printers`);
      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }
      const data = await response.json();
      if (data.success) {
        setScanResult(data);
      } else {
        setScanError(data.error || 'การสแกนล้มเหลว');
      }
    } catch (e) {
      setScanError('ไม่สามารถเชื่อมต่อ Print Server ได้ (โปรดรัน node server.js ในเครื่อง)');
    } finally {
      setIsScanning(false);
    }
  };

  const handleTestPrint = async (printer) => {
    if (!printer.ip) {
      setTestStatus(prev => ({ ...prev, [printer.id]: { status: 'error', msg: 'กรุณาระบุ IP Address' } }));
      return;
    }
    setTestStatus(prev => ({ ...prev, [printer.id]: { status: 'loading', msg: 'กำลังทดสอบ...' } }));
    try {
      const response = await fetch(`http://${window.location.hostname}:3001/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: printer.ip,
          printerType: printer.type === 'receipt' ? 'receipt' : 'kitchen',
          orderData: {
            orderNumber: 'TEST-001',
            total: 0,
            items: [{ name: `ทดสอบ: ${printer.name || printer.ip}`, quantity: 1, isFlattened: true }]
          }
        })
      });
      const result = await response.json();
      setTestStatus(prev => ({
        ...prev,
        [printer.id]: result.success
          ? { status: 'success', msg: 'พิมพ์ทดสอบสำเร็จ!' }
          : { status: 'error', msg: result.error || 'Failed' }
      }));
    } catch (e) {
      setTestStatus(prev => ({
        ...prev,
        [printer.id]: { status: 'error', msg: 'ติดต่อ Print Server ไม่ได้ (ลืมเปิด node server.js?)' }
      }));
    }
  };

  return (
    <div>
      <div className="admin-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1><Printer size={28} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> ตั้งค่าเครื่องพิมพ์</h1>
          <p>จัดการเครื่องพิมพ์ทั้งหมดในระบบ — เพิ่มได้ไม่จำกัด หรือค้นหาอัตโนมัติในวงแลน (Port 9100)</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            className="admin-btn secondary"
            onClick={handleScanLan}
            disabled={isScanning}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: '#0284c7', color: 'white', border: 'none',
              padding: '0.6rem 1.25rem', borderRadius: '10px', fontWeight: '700',
              cursor: isScanning ? 'wait' : 'pointer'
            }}
          >
            {isScanning ? (
              <>
                <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
                <span>กำลังค้นหาในวงแลน...</span>
              </>
            ) : (
              <>
                <Search size={18} />
                <span>🔍 ค้นหาเครื่องพิมพ์ในวงแลน</span>
              </>
            )}
          </button>
          <button className="admin-btn" onClick={() => addPrinter()}>
            <Plus size={20} /> เพิ่มเครื่องพิมพ์
          </button>
        </div>
      </div>

      <div className="admin-card" style={{ maxWidth: '900px' }}>
        {/* Results of LAN Scan */}
        {(isScanning || scanResult || scanError) && (
          <div style={{
            background: 'rgba(2,132,199,0.06)',
            border: '1px solid rgba(2,132,199,0.3)',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
              <Wifi size={20} color="#0284c7" />
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a', fontWeight: '700' }}>
                ผลการค้นหาเครื่องพิมพ์ในวง LAN (Port 9100)
              </h3>
            </div>

            {isScanning && (
              <p style={{ color: '#0284c7', fontSize: '0.9rem', margin: '0.5rem 0 0 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                ระบบกำลังสแกนหา IP Addresses (1..254) ในวงแลนของคุณ... โปรดรอสักครู่
              </p>
            )}

            {scanError && (
              <div style={{ color: '#ef4444', fontSize: '0.9rem', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <XCircle size={16} />
                <span>{scanError}</span>
              </div>
            )}

            {scanResult && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '0.75rem' }}>
                  IP เครื่องของคุณ: <strong style={{ color: '#0f172a' }}>{scanResult.localIp}</strong> (วงแลน {scanResult.baseIp}x)
                </div>

                {scanResult.printers.length === 0 ? (
                  <div style={{
                    background: '#ffffff', border: '1px dashed #cbd5e1', borderRadius: '10px',
                    padding: '1rem', color: '#64748b', fontSize: '0.88rem'
                  }}>
                    ⚠️ <strong>ไม่พบเครื่องพิมพ์ที่เปิดพอร์ต 9100 ในวงแลน</strong>
                    <ul style={{ margin: '0.5rem 0 0 1.2rem', padding: 0 }}>
                      <li>ตรวจสอบว่าเครื่องพิมพ์เปิดใช้งาน และเสียบสาย LAN / ต่อ Wi-Fi เดียวกัน</li>
                      <li>ตรวจสอบว่า IP ของเครื่องพิมพ์อยู่ในวง subnet เดียวกัน ({scanResult.baseIp}x)</li>
                      <li>หากทราบ IP แน่นอน สามารถกรอกลงในช่อง IP Address โดยตรงได้เลยครับ</li>
                    </ul>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#059669' }}>
                      พบเครื่องพิมพ์ {scanResult.printers.length} เครื่อง:
                    </div>
                    {scanResult.printers.map((p, idx) => (
                      <div key={idx} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px',
                        padding: '0.65rem 1rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <Printer size={18} color="#059669" />
                          <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>
                            IP: {p.ip}
                          </span>
                          <span style={{ fontSize: '0.78rem', background: '#d1fae5', color: '#047857', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                            Port 9100 Active
                          </span>
                        </div>
                        <button
                          onClick={() => useDiscoveredIp(p.ip)}
                          style={{
                            background: '#059669', color: 'white', border: 'none',
                            borderRadius: '8px', padding: '0.4rem 0.85rem', fontSize: '0.85rem',
                            fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem'
                          }}
                        >
                          <Plus size={15} /> นำ IP นี้ไปใช้
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {printers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <Printer size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
            <p>ยังไม่มีเครื่องพิมพ์ กด "🔍 ค้นหาเครื่องพิมพ์ในวงแลน" หรือ "เพิ่มเครื่องพิมพ์" เพื่อเริ่มต้น</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {printers.map((printer, idx) => {
              const ts = testStatus[printer.id];
              return (
                <div key={printer.id} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.25rem', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <Printer size={18} style={{ color: '#ea580c' }} />
                    <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.95rem' }}>
                      เครื่องพิมพ์ที่ {idx + 1}
                    </span>
                    <button
                      onClick={() => removePrinter(printer.id)}
                      style={{ marginLeft: 'auto', background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444', borderRadius: '8px', padding: '0.3rem 0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 600 }}
                    >
                      <Trash2 size={14} /> ลบ
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>ชื่อเครื่องพิมพ์</label>
                      <input
                        value={printer.name}
                        onChange={e => updatePrinter(printer.id, 'name', e.target.value)}
                        placeholder="เช่น ครัวใหญ่, บาร์, ใบเสร็จ"
                        style={{ background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1' }}
                      />
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>IP Address</label>
                      <input
                        value={printer.ip}
                        onChange={e => updatePrinter(printer.id, 'ip', e.target.value)}
                        placeholder="192.168.x.x"
                        style={{ background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1' }}
                      />
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>ประเภท</label>
                      <select value={printer.type} onChange={e => updatePrinter(printer.id, 'type', e.target.value)} style={{ background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1' }}>
                        {PRINTER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                      className="admin-btn secondary"
                      onClick={() => handleTestPrint(printer)}
                      disabled={!printer.ip}
                      style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem', fontWeight: 700 }}
                    >
                      ทดสอบพิมพ์
                    </button>
                    {ts && (
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', color: ts.status === 'success' ? '#16a34a' : ts.status === 'error' ? '#dc2626' : '#d97706' }}>
                        {ts.status === 'success' && <CheckCircle size={15} />}
                        {ts.status === 'error' && <XCircle size={15} />}
                        {ts.status === 'loading' && <AlertCircle size={15} />}
                        {ts.msg}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            className="admin-btn"
            onClick={handleSave}
            style={{ padding: '0.85rem 2rem', background: saved ? '#16a34a' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', transition: 'background 0.3s', fontWeight: '800' }}
          >
            <Save size={18} /> {saved ? 'บันทึกแล้ว ✓' : 'บันทึกการตั้งค่า'}
          </button>
        </div>

        <div style={{ marginTop: '1.25rem', background: '#fff7ed', border: '1px solid #ffedd5', padding: '1rem', borderRadius: '10px', color: '#c2410c', fontSize: '0.88rem' }}>
          <strong>หมายเหตุ:</strong> การสแกนค้นหาเครื่องพิมพ์และสั่งปริ้น จะทำงานผ่าน Node Print Server (<code>node server.js</code>) ที่เปิดในวงแลนเดียวกัน
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default ManagePrinters;
