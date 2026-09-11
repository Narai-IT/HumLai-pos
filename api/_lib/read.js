// ── คำสั่งอ่านข้อมูล (เดิมคือ doGet ใน Apps Script) ──
// รูปแบบคำตอบของทุก action เหมือนของเดิมทุกตัวอักษร หน้าบ้านจึงใช้ต่อได้ทันที
import { query } from './db.js';
import { dayStart, dayEnd } from './time.js';
import {
  mapOrder, mapTableOrder, mapMenu, mapCategory, mapPromotion, mapUser, mapPrinter,
  mapDiscount, mapLiquor, mapWaste, mapApproval, mapOutstanding, mapShift, mapPayment,
  CATEGORY_SPEC
} from './rows.js';

const cols = (list) => list.map(c => `[${c}]`).join(', ');

const ORDER_COLS   = cols(['Timestamp','OrderNumber','CustomerName','Address','ItemDetail','DiningOption','Price','TotalAmount','Status','OrderStartTime','CompletionTime','RecordedBy','Quantity']);
const TABLE_COLS   = cols(['TableNumber','SessionId','ItemName','ItemNameEn','ItemPrice','Quantity','Options','Timestamp','Status','RecordedBy']);
const MENU_COLS    = cols(['id','category','name','nameEn','description','descriptionEn','price','image','isActive','bundledItems','popupConfig','prices','categories','printerId']);
const CATEGORY_COLS= cols(Object.keys(CATEGORY_SPEC));
const PROMO_COLS   = cols(['id','name','nameEn','price','origPrice']);
const USER_COLS    = cols(['id','username','pin','canCheckout','isAdmin','isCashier','branch']);
const PRINTER_COLS = cols(['id','name','ip','type','printMode']);
const DISCOUNT_COLS= cols(['id','name','type','value','categories']);
const LIQUOR_COLS  = cols(['timestamp','type','customerName','phone','productName','qty','note','staff','category','unit']);
const WASTE_COLS   = cols(['timestamp','branch','itemName','category','qty','unit','note','staff']);
const APPROVAL_COLS= cols(['id','timestamp','tableNo','orderNumber','amount','requestedBy','status','approver','respondedAt']);
const OUTSTAND_COLS= cols(['id','shiftId','tableNo','customerName','phone','total','items','createdAt','status']);
const SHIFT_COLS   = cols(['id','openTime','closeTime','openStaff','closeStaff','openCash','closeCash','totalSales','totalCash','totalCard','totalTransfer','totalOrders','status','note']);
const PAYMENT_COLS = cols(['timestamp','orderNumber','tableNo','paymentMethod','grandTotal','staff','shiftId','splitDetail']);

// N แถวล่าสุดของตารางที่โตเรื่อย ๆ แต่ยังส่งกลับเรียงเก่า→ใหม่เหมือนลำดับแถวในชีท
async function lastRows(table, colList, mapper, limit) {
  const sqlText = limit
    ? `SELECT ${colList} FROM (SELECT TOP (@limit) RowId, ${colList} FROM dbo.${table} ORDER BY RowId DESC) t ORDER BY RowId ASC`
    : `SELECT ${colList} FROM dbo.${table} ORDER BY RowId ASC`;
  const res = await query(sqlText, limit ? { limit } : {});
  return res.recordset.map(mapper);
}

async function allRows(table, colList, mapper, orderBy = 'Seq') {
  const res = await query(`SELECT ${colList} FROM dbo.${table} ORDER BY ${orderBy} ASC`);
  return res.recordset.map(mapper);
}

export const getSettings = async () => {
  const res = await query(`SELECT [value] FROM dbo.Settings WHERE [key] = 'pos_settings'`);
  if (!res.recordset.length) return null;
  try { return JSON.parse(res.recordset[0].value); } catch { return null; }
};

// ข้อมูล "เย็น" — เปลี่ยนเฉพาะตอนแก้หลังบ้าน
export async function buildStaticData() {
  const [categories, menu, promotions, users, printers, discounts, settings] = await Promise.all([
    allRows('Categories', CATEGORY_COLS, mapCategory),
    allRows('Menu', MENU_COLS, mapMenu),
    allRows('Promotions', PROMO_COLS, mapPromotion),
    allRows('Users', USER_COLS, mapUser),
    allRows('Printers', PRINTER_COLS, mapPrinter),
    allRows('Discounts', DISCOUNT_COLS, mapDiscount),
    getSettings()
  ]);
  return { categories, menu, promotions, users, printers, discounts, settings };
}

const getTableOrders = () => lastRows('TableOrders', TABLE_COLS, mapTableOrder);

export async function handleGet(action, params) {
  switch (action) {
    // ── ข้อมูลร้อน: หน้าบ้าน poll ทุก 20 วิ ──
    case 'getLive': {
      const [tableOrders, orders, payments] = await Promise.all([
        getTableOrders(),
        lastRows('Orders', ORDER_COLS, mapOrder, 300),
        lastRows('PaymentSummary', PAYMENT_COLS, mapPayment, 300)
      ]);
      return { tableOrders, orders, payments };
    }

    // ── คิวใบครัวสำหรับ Print Server: เฉพาะบิลที่ยังไม่เสร็จ ──
    case 'getKitchenQueue': {
      const res = await query(
        `SELECT ${ORDER_COLS} FROM (
           SELECT TOP (200) RowId, ${ORDER_COLS} FROM dbo.Orders ORDER BY RowId DESC
         ) t
         WHERE OrderNumber IN (SELECT OrderNumber FROM (SELECT TOP (200) OrderNumber, [Status] FROM dbo.Orders ORDER BY RowId DESC) p WHERE LOWER(p.[Status]) = 'pending' AND p.OrderNumber IS NOT NULL)
         ORDER BY RowId ASC`
      );
      return { orders: res.recordset.map(mapOrder) };
    }

    case 'getStatic':
      return await buildStaticData();

    case 'getAllData': {
      const [data, tableOrders, orders] = await Promise.all([
        buildStaticData(),
        getTableOrders(),
        lastRows('Orders', ORDER_COLS, mapOrder, 2000)
      ]);
      return { ...data, tableOrders, orders };
    }

    case 'getTableOrders': {
      const res = await query(
        `SELECT ${TABLE_COLS} FROM dbo.TableOrders
          WHERE TableNumber = @tableNumber AND ISNULL([Status], '') <> 'paid'
          ORDER BY RowId ASC`,
        { tableNumber: String(params.tableNumber || '') }
      );
      return { success: true, orders: res.recordset.map(mapTableOrder) };
    }

    case 'getLiquorRecords':
      return { success: true, records: await lastRows('LiquorStorage', LIQUOR_COLS, mapLiquor) };

    case 'getWasteRecords':
      return { success: true, records: await lastRows('Waste', WASTE_COLS, mapWaste) };

    // คำขออนุมัติ QR — เฉพาะที่ยัง pending หรือเพิ่งตอบใน 10 นาทีล่าสุด (เหมือนของเดิม)
    case 'getPaymentApprovals': {
      const cutoffIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const res = await query(
        `SELECT ${APPROVAL_COLS} FROM dbo.PaymentApprovals
          WHERE [status] = 'pending'
             OR (respondedAt IS NOT NULL AND respondedAt <> '' AND TRY_CONVERT(datetimeoffset(3), respondedAt) >= TRY_CONVERT(datetimeoffset(3), @cutoff))
          ORDER BY RowId ASC`,
        { cutoff: cutoffIso }
      );
      return { success: true, approvals: res.recordset.map(mapApproval) };
    }

    case 'getOutstandingBills':
      return { success: true, bills: await lastRows('OutstandingBills', OUTSTAND_COLS, mapOutstanding) };

    case 'getShifts':
      return { success: true, shifts: await allRows('Shifts', SHIFT_COLS, mapShift) };

    case 'getStock':       return await getStockLevels();
    case 'getIngredients': return await getIngredientsList();

    case 'getReportData': {
      const from = dayStart(params.from);
      const to   = dayEnd(params.to);
      const range = (col) => (from || to)
        ? `WHERE ${col} IS NULL OR (${from ? `${col} >= @from` : '1=1'} AND ${to ? `${col} <= @to` : '1=1'})`
        : '';
      const bounds = {};
      if (from) bounds.from = from;
      if (to)   bounds.to   = to;

      const [orders, payments, shifts, waste] = await Promise.all([
        query(`SELECT ${ORDER_COLS} FROM dbo.Orders ${range('TsLocal')} ORDER BY RowId ASC`, bounds)
          .then(r => r.recordset.map(mapOrder)),
        // payments ส่งทั้งหมดไม่กรองวัน — หน้าบ้านจับคู่ด้วยเลขบิล (เหมือนของเดิม)
        lastRows('PaymentSummary', PAYMENT_COLS, mapPayment),
        allRows('Shifts', SHIFT_COLS, mapShift),
        query(`SELECT ${WASTE_COLS} FROM dbo.Waste ${range('TsLocal')} ORDER BY RowId ASC`, bounds)
          .then(r => r.recordset.map(mapWaste))
      ]);
      return { success: true, orders, payments, shifts, waste };
    }

    case 'getSalesReport': return await generateSalesReport();

    default:
      return null;   // ให้ router ตอบ Unknown action
  }
}

// ── สต็อก: คงเหลือ = รับเข้า − ตัดออก (เดิมคำนวณจาก 3 ชีท) ──
export async function getStockLevels() {
  const res = await query(`
    SELECT i.id, i.name, i.nameEn, i.unit, i.minStock, i.costPerUnit, i.purchaseUnit, i.unitsPerPurchase,
           ISNULL(si.totalIn, 0)  AS totalIn,
           ISNULL(so.totalOut, 0) AS totalOut
      FROM dbo.Ingredients i
      LEFT JOIN (SELECT ingId, SUM(ISNULL(usageQty, 0))  AS totalIn  FROM dbo.StockIn  GROUP BY ingId) si ON si.ingId = i.id
      LEFT JOIN (SELECT ingId, SUM(ISNULL(deductQty, 0)) AS totalOut FROM dbo.StockOut GROUP BY ingId) so ON so.ingId = i.id
     ORDER BY i.Seq ASC`);

  const stock = res.recordset.map(r => {
    const current = Number(r.totalIn) - Number(r.totalOut);
    const minimum = Number(r.minStock) || 0;
    return {
      id: String(r.id), name: r.name || '', nameEn: r.nameEn || '', unit: r.unit || '',
      current: Math.round(current * 100) / 100,
      minimum, price: Number(r.costPerUnit) || 0,
      purchaseUnit: r.purchaseUnit || '', unitsPerPurchase: Number(r.unitsPerPurchase) || 1,
      status: current <= 0 ? 'OUT' : current <= minimum ? 'LOW' : 'OK'
    };
  });
  return { success: true, stock, lowItems: stock.filter(s => s.status !== 'OK') };
}

export async function getIngredientsList() {
  const res = await query(`SELECT id, name, nameEn, unit, minStock, costPerUnit, category, note, purchaseUnit, unitsPerPurchase FROM dbo.Ingredients ORDER BY Seq ASC`);
  const ingredients = res.recordset.map(r => ({
    id: String(r.id), name: r.name || '', nameEn: r.nameEn || '', unit: r.unit || '',
    minStock: Number(r.minStock) || 0, costPerUnit: Number(r.costPerUnit) || 0,
    category: r.category || '', note: r.note || '',
    purchaseUnit: r.purchaseUnit || '', unitsPerPurchase: Number(r.unitsPerPurchase) || 1
  }));
  return { success: true, ingredients };
}

export async function getBomRows() {
  const res = await query(`SELECT menuId, menuName, menuNameEn, ingId, ingName, qty, unit, costPerUnit, note FROM dbo.Bom ORDER BY RowId ASC`);
  return { success: true, rows: res.recordset };
}

// ── สรุปยอดขายรวม (เหมือน generateSalesReport เดิม) ──
export async function generateSalesReport() {
  const [payRes, orderRes] = await Promise.all([
    query(`SELECT orderNumber, paymentMethod, grandTotal, splitDetail FROM dbo.PaymentSummary ORDER BY RowId ASC`),
    query(`SELECT ItemDetail, Price, [Status] FROM dbo.Orders ORDER BY RowId ASC`)
  ]);

  let totalSales = 0;
  let totalBills = 0;
  const paymentBreakdown = { 'เงินสด': 0, 'เงินโอน / QR': 0, 'บัตรเครดิต': 0 };
  const uniqueBills = new Set();

  for (const p of payRes.recordset) {
    const billNo = p.orderNumber;
    if (!billNo) continue;
    if (!uniqueBills.has(billNo)) { uniqueBills.add(billNo); totalBills++; }

    const grandTotal = Number(p.grandTotal) || 0;
    totalSales += grandTotal;

    const method = String(p.paymentMethod || '');
    if (method.includes('แยกจ่าย') || p.splitDetail) {
      let split = null;
      try { split = typeof p.splitDetail === 'string' ? JSON.parse(p.splitDetail) : p.splitDetail; } catch { /* ไม่ใช่ JSON → ข้าม */ }
      if (split) {
        paymentBreakdown['เงินสด']        += Number(split.cash || 0);
        paymentBreakdown['เงินโอน / QR']  += Number(split.transfer || 0);
        paymentBreakdown['บัตรเครดิต']    += Number(split.card || 0);
      }
    } else if (method.includes('สด') || method.toLowerCase() === 'cash') {
      paymentBreakdown['เงินสด'] += grandTotal;
    } else if (method.includes('โอน') || method.includes('QR') || method.toLowerCase() === 'transfer') {
      paymentBreakdown['เงินโอน / QR'] += grandTotal;
    } else if (method.includes('บัตร') || method.toLowerCase() === 'card') {
      paymentBreakdown['บัตรเครดิต'] += grandTotal;
    } else {
      paymentBreakdown['เงินสด'] += grandTotal;
    }
  }

  // จำนวนที่ขายได้รายเมนู ไม่นับแถวแอดออน/ป๊อปอัพ
  const menuSales = {};
  for (const o of orderRes.recordset) {
    if (String(o.Status || '').toLowerCase() === 'cancelled') continue;
    const detail = String(o.ItemDetail || '').trim();
    if (!detail) continue;
    if (detail.startsWith('↳') || detail.startsWith('ความเผ็ด') || detail.startsWith('ลูกค้า:')) continue;

    let qty = 1;
    let name = detail;
    const match = detail.match(/(.*?)\s*\(x(\d+)\)$/);
    if (match) { name = match[1].trim(); qty = parseInt(match[2], 10) || 1; }

    if (!menuSales[name]) menuSales[name] = { qty: 0, revenue: 0 };
    menuSales[name].qty += qty;
    menuSales[name].revenue += Number(o.Price) || 0;
  }

  return { success: true, totalSales, totalBills, paymentBreakdown, menuSales };
}
