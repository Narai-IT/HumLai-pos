-- ==========================================
-- ข้าวมันไก่หำไหล POS — SQL Server schema
-- ==========================================
-- ตารางทั้งหมดแทนที่ชีทเดิมใน Google Sheet แบบหนึ่งชีท = หนึ่งตาราง
-- ชื่อคอลัมน์ตั้งให้ตรงกับหัวตารางของชีทเดิมเป๊ะ ๆ เพื่อให้ JSON ที่ API ส่งกลับ
-- มีคีย์เหมือนเดิมทุกตัว หน้าบ้านจึงไม่ต้องแก้ตรรกะการอ่านข้อมูล
--
-- รันไฟล์นี้ซ้ำได้ (idempotent) — สร้างเฉพาะตาราง/ดัชนีที่ยังไม่มี
--
-- วิธีรัน:  sqlcmd -S <server> -d <database> -U <user> -P <pass> -i db/schema.sql
--      หรือ  npm run sql:init   (ใช้ค่าจาก .env)
-- ==========================================

SET NOCOUNT ON;
GO

-- ─────────────────────────────────────────
-- ออเดอร์ (ชีท Orders)
-- หนึ่งบิลมีหลายแถว: แถวรายการอาหาร + แถวตัวเลือกที่ขึ้นต้นด้วย ↳
-- ─────────────────────────────────────────
IF OBJECT_ID('dbo.Orders', 'U') IS NULL
CREATE TABLE dbo.Orders (
  RowId          INT IDENTITY(1,1) PRIMARY KEY,
  [Timestamp]    NVARCHAR(40)   NULL,
  OrderNumber    NVARCHAR(60)   NULL,
  CustomerName   NVARCHAR(200)  NULL,
  [Address]      NVARCHAR(300)  NULL,
  ItemDetail     NVARCHAR(1000) NULL,
  DiningOption   NVARCHAR(100)  NULL,
  Price          DECIMAL(18,2)  NULL,
  TotalAmount    DECIMAL(18,2)  NULL,
  [Status]       NVARCHAR(30)   NULL,
  OrderStartTime NVARCHAR(40)   NULL,
  CompletionTime NVARCHAR(40)   NULL,
  RecordedBy     NVARCHAR(120)  NULL,
  Quantity       DECIMAL(18,3)  NULL,
  -- เวลาแบบวันที่จริงสำหรับกรองช่วงวันในรายงาน (เวลาไทยตามนาฬิกาหน้าร้าน)
  -- ยังเก็บ [Timestamp] เป็นข้อความเหมือนชีทเดิมไว้ด้วย เพื่อให้ค่าที่ส่งกลับหน้าบ้านเหมือนเป๊ะ
  TsLocal        DATETIME2(3)   NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Orders_OrderNumber' AND object_id = OBJECT_ID('dbo.Orders'))
  CREATE INDEX IX_Orders_OrderNumber ON dbo.Orders (OrderNumber);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Orders_TsLocal' AND object_id = OBJECT_ID('dbo.Orders'))
  CREATE INDEX IX_Orders_TsLocal ON dbo.Orders (TsLocal);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Orders_Status' AND object_id = OBJECT_ID('dbo.Orders'))
  CREATE INDEX IX_Orders_Status ON dbo.Orders ([Status]);
GO

-- ─────────────────────────────────────────
-- รายการอาหารรายโต๊ะที่ยังไม่ปิดบิล (ชีท TableOrders)
-- ─────────────────────────────────────────
IF OBJECT_ID('dbo.TableOrders', 'U') IS NULL
CREATE TABLE dbo.TableOrders (
  RowId       INT IDENTITY(1,1) PRIMARY KEY,
  TableNumber NVARCHAR(50)   NULL,
  SessionId   NVARCHAR(80)   NULL,
  ItemName    NVARCHAR(300)  NULL,
  ItemNameEn  NVARCHAR(300)  NULL,
  ItemPrice   DECIMAL(18,2)  NULL,
  Quantity    DECIMAL(18,3)  NULL,
  [Options]   NVARCHAR(MAX)  NULL,
  [Timestamp] NVARCHAR(40)   NULL,
  [Status]    NVARCHAR(30)   NULL,
  RecordedBy  NVARCHAR(120)  NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TableOrders_Table' AND object_id = OBJECT_ID('dbo.TableOrders'))
  CREATE INDEX IX_TableOrders_Table ON dbo.TableOrders (TableNumber);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TableOrders_Session' AND object_id = OBJECT_ID('dbo.TableOrders'))
  CREATE INDEX IX_TableOrders_Session ON dbo.TableOrders (SessionId);
GO

-- ─────────────────────────────────────────
-- เมนู (ชีท Menu)
-- Seq = ลำดับการแสดงผล แทนลำดับแถวในชีท
-- bundledItems/popupConfig/prices/categories เก็บเป็นข้อความ JSON เหมือนในชีท
-- ─────────────────────────────────────────
IF OBJECT_ID('dbo.Menu', 'U') IS NULL
CREATE TABLE dbo.Menu (
  Seq           INT IDENTITY(1,1),
  id            NVARCHAR(60)  NOT NULL PRIMARY KEY,
  category      NVARCHAR(100) NULL,
  name          NVARCHAR(300) NULL,
  nameEn        NVARCHAR(300) NULL,
  [description] NVARCHAR(MAX) NULL,
  descriptionEn NVARCHAR(MAX) NULL,
  price         DECIMAL(18,2) NULL,
  image         NVARCHAR(MAX) NULL,
  isActive      BIT           NULL,
  bundledItems  NVARCHAR(MAX) NULL,
  popupConfig   NVARCHAR(MAX) NULL,
  prices        NVARCHAR(MAX) NULL,
  categories    NVARCHAR(MAX) NULL,
  printerId     NVARCHAR(60)  NULL
);
GO

-- ─────────────────────────────────────────
-- หมวดหมู่ + ตั้งค่าป๊อปอัพ 6 ชุด (ชีท Categories)
-- ─────────────────────────────────────────
IF OBJECT_ID('dbo.Categories', 'U') IS NULL
CREATE TABLE dbo.Categories (
  Seq   INT IDENTITY(1,1),
  slug  NVARCHAR(100) NOT NULL PRIMARY KEY,
  name  NVARCHAR(200) NULL,
  nameEn NVARCHAR(200) NULL,
  icon  NVARCHAR(20)  NULL,
  isActive BIT        NULL,
  hasPopup1 BIT NULL, popup1Category NVARCHAR(100) NULL, popup1Items NVARCHAR(MAX) NULL, popup1Min INT NULL, popup1Max INT NULL, popup1ItemsMax NVARCHAR(MAX) NULL, popup1Free BIT NULL,
  hasPopup2 BIT NULL, popup2Category NVARCHAR(100) NULL, popup2Items NVARCHAR(MAX) NULL, popup2Min INT NULL, popup2Max INT NULL, popup2ItemsMax NVARCHAR(MAX) NULL, popup2Free BIT NULL,
  hasPopup3 BIT NULL, popup3Category NVARCHAR(100) NULL, popup3Items NVARCHAR(MAX) NULL, popup3Min INT NULL, popup3Max INT NULL, popup3ItemsMax NVARCHAR(MAX) NULL, popup3Free BIT NULL,
  hasPopup4 BIT NULL, popup4Category NVARCHAR(100) NULL, popup4Items NVARCHAR(MAX) NULL, popup4Min INT NULL, popup4Max INT NULL, popup4ItemsMax NVARCHAR(MAX) NULL, popup4Free BIT NULL,
  hasPopup5 BIT NULL, popup5Category NVARCHAR(100) NULL, popup5Items NVARCHAR(MAX) NULL, popup5Min INT NULL, popup5Max INT NULL, popup5ItemsMax NVARCHAR(MAX) NULL, popup5Free BIT NULL,
  hasPopup6 BIT NULL, popup6Category NVARCHAR(100) NULL, popup6Items NVARCHAR(MAX) NULL, popup6Min INT NULL, popup6Max INT NULL, popup6ItemsMax NVARCHAR(MAX) NULL, popup6Free BIT NULL,
  hasDining BIT NULL
);
GO

-- ─────────────────────────────────────────
-- โปรโมชั่น / ผู้ใช้ / ส่วนลด / ตั้งค่า / เครื่องพิมพ์
-- ─────────────────────────────────────────
IF OBJECT_ID('dbo.Promotions', 'U') IS NULL
CREATE TABLE dbo.Promotions (
  Seq       INT IDENTITY(1,1),
  id        NVARCHAR(60)  NOT NULL PRIMARY KEY,
  name      NVARCHAR(300) NULL,
  nameEn    NVARCHAR(300) NULL,
  price     DECIMAL(18,2) NULL,
  origPrice NVARCHAR(50)  NULL
);
GO

IF OBJECT_ID('dbo.Users', 'U') IS NULL
CREATE TABLE dbo.Users (
  Seq         INT IDENTITY(1,1),
  id          NVARCHAR(60)  NOT NULL PRIMARY KEY,
  username    NVARCHAR(120) NULL,
  pin         NVARCHAR(20)  NULL,
  canCheckout BIT           NULL,
  isAdmin     BIT           NULL,
  isCashier   BIT           NULL,
  branch      NVARCHAR(120) NULL
);
GO

IF OBJECT_ID('dbo.Discounts', 'U') IS NULL
CREATE TABLE dbo.Discounts (
  Seq        INT IDENTITY(1,1),
  id         NVARCHAR(60)  NOT NULL PRIMARY KEY,
  name       NVARCHAR(200) NULL,
  [type]     NVARCHAR(40)  NULL,
  [value]    DECIMAL(18,2) NULL,
  categories NVARCHAR(MAX) NULL
);
GO

IF OBJECT_ID('dbo.Settings', 'U') IS NULL
CREATE TABLE dbo.Settings (
  [key]   NVARCHAR(100) NOT NULL PRIMARY KEY,
  [value] NVARCHAR(MAX) NULL
);
GO

IF OBJECT_ID('dbo.Printers', 'U') IS NULL
CREATE TABLE dbo.Printers (
  Seq       INT IDENTITY(1,1),
  id        NVARCHAR(60)  NOT NULL PRIMARY KEY,
  name      NVARCHAR(200) NULL,
  ip        NVARCHAR(60)  NULL,
  [type]    NVARCHAR(40)  NULL,
  printMode NVARCHAR(40)  NULL
);
GO

-- ─────────────────────────────────────────
-- ฝากเหล้า / ของเสีย / อนุมัติ QR / บิลค้าง / กะ / ยอดชำระ
-- ─────────────────────────────────────────
IF OBJECT_ID('dbo.LiquorStorage', 'U') IS NULL
CREATE TABLE dbo.LiquorStorage (
  RowId        INT IDENTITY(1,1) PRIMARY KEY,
  [timestamp]  NVARCHAR(40)  NULL,
  [type]       NVARCHAR(40)  NULL,
  customerName NVARCHAR(200) NULL,
  phone        NVARCHAR(40)  NULL,
  productName  NVARCHAR(300) NULL,
  qty          DECIMAL(18,3) NULL,
  note         NVARCHAR(MAX) NULL,
  staff        NVARCHAR(120) NULL,
  category     NVARCHAR(100) NULL,
  unit         NVARCHAR(40)  NULL
);
GO

IF OBJECT_ID('dbo.Waste', 'U') IS NULL
CREATE TABLE dbo.Waste (
  RowId       INT IDENTITY(1,1) PRIMARY KEY,
  [timestamp] NVARCHAR(40)  NULL,
  branch      NVARCHAR(120) NULL,
  itemName    NVARCHAR(300) NULL,
  category    NVARCHAR(100) NULL,
  qty         DECIMAL(18,3) NULL,
  unit        NVARCHAR(40)  NULL,
  note        NVARCHAR(MAX) NULL,
  staff       NVARCHAR(120) NULL,
  TsLocal     DATETIME2(3)  NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Waste_TsLocal' AND object_id = OBJECT_ID('dbo.Waste'))
  CREATE INDEX IX_Waste_TsLocal ON dbo.Waste (TsLocal);
GO

IF OBJECT_ID('dbo.PaymentApprovals', 'U') IS NULL
CREATE TABLE dbo.PaymentApprovals (
  RowId       INT IDENTITY(1,1) PRIMARY KEY,
  id          NVARCHAR(80)  NULL,
  [timestamp] NVARCHAR(40)  NULL,
  tableNo     NVARCHAR(50)  NULL,
  orderNumber NVARCHAR(60)  NULL,
  amount      DECIMAL(18,2) NULL,
  requestedBy NVARCHAR(120) NULL,
  [status]    NVARCHAR(30)  NULL,
  approver    NVARCHAR(120) NULL,
  respondedAt NVARCHAR(40)  NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PaymentApprovals_Id' AND object_id = OBJECT_ID('dbo.PaymentApprovals'))
  CREATE INDEX IX_PaymentApprovals_Id ON dbo.PaymentApprovals (id);
GO

IF OBJECT_ID('dbo.OutstandingBills', 'U') IS NULL
CREATE TABLE dbo.OutstandingBills (
  RowId        INT IDENTITY(1,1) PRIMARY KEY,
  id           NVARCHAR(120) NULL,
  shiftId      NVARCHAR(60)  NULL,
  tableNo      NVARCHAR(50)  NULL,
  customerName NVARCHAR(200) NULL,
  phone        NVARCHAR(40)  NULL,
  total        DECIMAL(18,2) NULL,
  items        NVARCHAR(MAX) NULL,
  createdAt    NVARCHAR(40)  NULL,
  [status]     NVARCHAR(30)  NULL
);
GO

IF OBJECT_ID('dbo.Shifts', 'U') IS NULL
CREATE TABLE dbo.Shifts (
  Seq           INT IDENTITY(1,1),
  id            NVARCHAR(60) NOT NULL PRIMARY KEY,
  openTime      NVARCHAR(40) NULL,
  closeTime     NVARCHAR(40) NULL,
  openStaff     NVARCHAR(120) NULL,
  closeStaff    NVARCHAR(120) NULL,
  openCash      DECIMAL(18,2) NULL,
  closeCash     DECIMAL(18,2) NULL,
  totalSales    DECIMAL(18,2) NULL,
  totalCash     DECIMAL(18,2) NULL,
  totalCard     DECIMAL(18,2) NULL,
  totalTransfer DECIMAL(18,2) NULL,
  totalOrders   DECIMAL(18,2) NULL,
  [status]      NVARCHAR(20) NULL,
  note          NVARCHAR(MAX) NULL
);
GO

IF OBJECT_ID('dbo.PaymentSummary', 'U') IS NULL
CREATE TABLE dbo.PaymentSummary (
  RowId         INT IDENTITY(1,1) PRIMARY KEY,
  [timestamp]   NVARCHAR(40)  NULL,
  orderNumber   NVARCHAR(60)  NULL,
  tableNo       NVARCHAR(50)  NULL,
  paymentMethod NVARCHAR(100) NULL,
  grandTotal    DECIMAL(18,2) NULL,
  staff         NVARCHAR(120) NULL,
  shiftId       NVARCHAR(60)  NULL,
  splitDetail   NVARCHAR(MAX) NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PaymentSummary_OrderNumber' AND object_id = OBJECT_ID('dbo.PaymentSummary'))
  CREATE INDEX IX_PaymentSummary_OrderNumber ON dbo.PaymentSummary (orderNumber);
GO

-- ─────────────────────────────────────────
-- ระบบสต็อก/BOM (ชีท วัตถุดิบ / BOM / รับวัตถุดิบ / ตัดสต็อก)
-- ชีท "สรุปสต็อก" ไม่ต้องมีตาราง — เป็นผลรวมที่คำนวณสดจาก StockIn − StockOut
-- ─────────────────────────────────────────
IF OBJECT_ID('dbo.Ingredients', 'U') IS NULL
CREATE TABLE dbo.Ingredients (
  Seq              INT IDENTITY(1,1),
  id               NVARCHAR(60)  NOT NULL PRIMARY KEY,
  name             NVARCHAR(300) NULL,
  nameEn           NVARCHAR(300) NULL,
  unit             NVARCHAR(40)  NULL,
  minStock         DECIMAL(18,3) NULL,
  costPerUnit      DECIMAL(18,4) NULL,
  category         NVARCHAR(100) NULL,
  note             NVARCHAR(MAX) NULL,
  purchaseUnit     NVARCHAR(40)  NULL,
  unitsPerPurchase DECIMAL(18,4) NULL
);
GO

IF OBJECT_ID('dbo.Bom', 'U') IS NULL
CREATE TABLE dbo.Bom (
  RowId       INT IDENTITY(1,1) PRIMARY KEY,
  menuId      NVARCHAR(60)  NULL,
  menuName    NVARCHAR(300) NULL,
  menuNameEn  NVARCHAR(300) NULL,
  ingId       NVARCHAR(60)  NULL,
  ingName     NVARCHAR(300) NULL,
  qty         DECIMAL(18,4) NULL,
  unit        NVARCHAR(40)  NULL,
  costPerUnit DECIMAL(18,4) NULL,
  note        NVARCHAR(MAX) NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Bom_MenuId' AND object_id = OBJECT_ID('dbo.Bom'))
  CREATE INDEX IX_Bom_MenuId ON dbo.Bom (menuId);
GO

IF OBJECT_ID('dbo.StockIn', 'U') IS NULL
CREATE TABLE dbo.StockIn (
  RowId             INT IDENTITY(1,1) PRIMARY KEY,
  ts                DATETIME2(3)  NULL,
  ingId             NVARCHAR(60)  NULL,
  ingName           NVARCHAR(300) NULL,
  usageQty          DECIMAL(18,4) NULL,  -- จำนวน (หน่วยใช้)
  usageUnit         NVARCHAR(40)  NULL,
  costPerUsageUnit  DECIMAL(18,4) NULL,
  total             DECIMAL(18,2) NULL,
  staff             NVARCHAR(120) NULL,
  note              NVARCHAR(MAX) NULL,
  purchaseQty       DECIMAL(18,4) NULL,  -- จำนวนซื้อ (หน่วยซื้อ)
  purchaseUnit      NVARCHAR(40)  NULL,
  pricePerPurchase  DECIMAL(18,4) NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StockIn_IngId' AND object_id = OBJECT_ID('dbo.StockIn'))
  CREATE INDEX IX_StockIn_IngId ON dbo.StockIn (ingId);
GO

IF OBJECT_ID('dbo.StockOut', 'U') IS NULL
CREATE TABLE dbo.StockOut (
  RowId       INT IDENTITY(1,1) PRIMARY KEY,
  ts          DATETIME2(3)  NULL,
  orderNumber NVARCHAR(60)  NULL,
  tableNo     NVARCHAR(50)  NULL,
  menuId      NVARCHAR(60)  NULL,
  menuName    NVARCHAR(300) NULL,
  menuQty     DECIMAL(18,3) NULL,
  ingId       NVARCHAR(60)  NULL,
  ingName     NVARCHAR(300) NULL,
  deductQty   DECIMAL(18,4) NULL,
  unit        NVARCHAR(40)  NULL,
  cost        DECIMAL(18,4) NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StockOut_IngId' AND object_id = OBJECT_ID('dbo.StockOut'))
  CREATE INDEX IX_StockOut_IngId ON dbo.StockOut (ingId);
GO

-- ─────────────────────────────────────────
-- รูปภาพ (แทน Google Drive) — รูปเมนูและสลิปโอนเงิน
-- เสิร์ฟผ่าน /api/image?id=<id>
-- ─────────────────────────────────────────
IF OBJECT_ID('dbo.Images', 'U') IS NULL
CREATE TABLE dbo.Images (
  id        NVARCHAR(60)   NOT NULL PRIMARY KEY,
  kind      NVARCHAR(20)   NULL,   -- 'menu' | 'slip'
  filename  NVARCHAR(260)  NULL,
  mimeType  NVARCHAR(100)  NULL,
  bytes     VARBINARY(MAX) NULL,
  createdAt DATETIME2(3)   NULL
);
GO

-- ─────────────────────────────────────────
-- สาขา — id คือรหัสสาขาที่ใช้ผูกทุกอย่าง (Users.branch, Orders.RecordedBy, Waste.branch, branchQR)
-- ห้ามเปลี่ยน id หลังใช้งานแล้ว ชื่อที่แสดงแก้ได้ที่ name
-- ─────────────────────────────────────────
IF OBJECT_ID('dbo.Branches', 'U') IS NULL
CREATE TABLE dbo.Branches (
  Seq           INT IDENTITY(1,1),
  id            NVARCHAR(60)  NOT NULL PRIMARY KEY,
  name          NVARCHAR(200) NULL,
  billPrefix    NVARCHAR(20)  NULL,   -- ตัวนำหน้าเลขบิล เช่น XUM → XUM-#001
  phone         NVARCHAR(60)  NULL,
  [address]     NVARCHAR(500) NULL,
  taxId         NVARCHAR(40)  NULL,
  receiptFooter NVARCHAR(500) NULL,
  isActive      BIT           NULL
);
GO

-- ครั้งแรกที่สร้างตาราง: ดึงรหัสสาขาที่มีใช้อยู่แล้วจากผู้ใช้และบิลเก่ามาตั้งต้นให้
-- (ข้อมูลเดิมจึงผูกกับสาขาได้ทันทีโดยไม่ต้องแก้แถวไหนเลย)
IF NOT EXISTS (SELECT 1 FROM dbo.Branches)
INSERT INTO dbo.Branches (id, name, billPrefix, isActive)
SELECT b, b, UPPER(REPLACE(b, ' ', '')), 1
FROM (
  SELECT LTRIM(RTRIM(branch)) AS b FROM dbo.Users WHERE NULLIF(LTRIM(RTRIM(branch)), '') IS NOT NULL
  UNION
  SELECT LTRIM(RTRIM(RecordedBy)) FROM dbo.Orders WHERE NULLIF(LTRIM(RTRIM(RecordedBy)), '') IS NOT NULL
) s;
GO
