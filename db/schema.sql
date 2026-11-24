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
) s
WHERE b NOT IN ('Self-Order', '*');  -- ช่องทางลูกค้าสั่งเอง / พนักงานทุกสาขา ไม่ใช่สาขา
GO

-- รหัสอ้างอิงจากหน้าเว็บ (หนึ่งค่าต่อการชำระเงิน) — เซิร์ฟเวอร์ใช้กันบิลซ้ำเมื่อหน้าเว็บส่งบิลเดิมซ้ำ
IF COL_LENGTH('dbo.PaymentSummary', 'ClientRef') IS NULL
  ALTER TABLE dbo.PaymentSummary ADD ClientRef NVARCHAR(60) NULL;
GO
IF COL_LENGTH('dbo.PaymentSummary', 'ClientRef') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PaymentSummary_ClientRef' AND object_id = OBJECT_ID('dbo.PaymentSummary'))
  EXEC('CREATE INDEX IX_PaymentSummary_ClientRef ON dbo.PaymentSummary (ClientRef)');
GO

-- เลขรหัสประจำเครื่อง POS ที่สรรพากรกำหนด (พิมพ์บนใบกำกับภาษีอย่างย่อ)
IF COL_LENGTH('dbo.Branches', 'posId') IS NULL
  ALTER TABLE dbo.Branches ADD posId NVARCHAR(40) NULL;
GO

-- ─────────────────────────────────────────
-- แยกข้อมูลขายตามสาขา (เฟส 2)
-- BranchId = Branches.id ของร้านที่เกิดรายการ — แยกจาก RecordedBy ที่ยังเป็น "ใครบันทึก" แบบเดิม
-- (ออเดอร์ลูกค้าสั่งเองมี RecordedBy = 'Self-Order' แต่ BranchId = สาขาของโต๊ะนั้น)
-- ─────────────────────────────────────────
IF COL_LENGTH('dbo.TableOrders', 'BranchId') IS NULL
  ALTER TABLE dbo.TableOrders ADD BranchId NVARCHAR(60) NULL;
GO
IF COL_LENGTH('dbo.Orders', 'BranchId') IS NULL
  ALTER TABLE dbo.Orders ADD BranchId NVARCHAR(60) NULL;
GO
IF COL_LENGTH('dbo.PaymentSummary', 'BranchId') IS NULL
  ALTER TABLE dbo.PaymentSummary ADD BranchId NVARCHAR(60) NULL;
GO
-- ส่วนลดของบิล (หลังบ้าน > รายงาน > ส่วนลด): ชื่อส่วนลด / ยอดที่ลด / ประเภท (store = ส่วนลดร้าน, coupon = คูปองสมาชิก)
IF COL_LENGTH('dbo.PaymentSummary', 'DiscountName') IS NULL
  ALTER TABLE dbo.PaymentSummary ADD DiscountName NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.PaymentSummary', 'DiscountAmount') IS NULL
  ALTER TABLE dbo.PaymentSummary ADD DiscountAmount DECIMAL(12, 2) NULL;
GO
IF COL_LENGTH('dbo.PaymentSummary', 'DiscountKind') IS NULL
  ALTER TABLE dbo.PaymentSummary ADD DiscountKind NVARCHAR(10) NULL;
GO
-- ยอดแยกทีละคูปอง (บิลหนึ่งใช้คูปองได้หลายใบ): JSON [{ "id", "code", "title", "amount" }] — ผลรวม = DiscountAmount
IF COL_LENGTH('dbo.PaymentSummary', 'DiscountDetail') IS NULL
  ALTER TABLE dbo.PaymentSummary ADD DiscountDetail NVARCHAR(MAX) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TableOrders_Branch' AND object_id = OBJECT_ID('dbo.TableOrders'))
  CREATE INDEX IX_TableOrders_Branch ON dbo.TableOrders (BranchId, TableNumber);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Orders_Branch' AND object_id = OBJECT_ID('dbo.Orders'))
  CREATE INDEX IX_Orders_Branch ON dbo.Orders (BranchId, RowId);
GO

-- รายการเก่าที่ยังไม่มีสาขา → สาขาหลัก (สาขาแรกที่เปิดใช้งานในหน้าตั้งค่าสาขา)
-- รันซ้ำได้: แตะเฉพาะแถวที่ BranchId ยังว่าง
DECLARE @def NVARCHAR(60) = (SELECT TOP (1) id FROM dbo.Branches WHERE ISNULL(isActive, 1) = 1 ORDER BY Seq ASC);
IF @def IS NOT NULL
BEGIN
  UPDATE dbo.TableOrders    SET BranchId = @def WHERE BranchId IS NULL;
  UPDATE dbo.Orders         SET BranchId = @def WHERE BranchId IS NULL;
  UPDATE dbo.PaymentSummary SET BranchId = @def WHERE BranchId IS NULL;
END
GO

-- ─────────────────────────────────────────
-- ปริ้นเตอร์แยกสาขา (เฟส 3) — แต่ละร้านมีเครื่องพิมพ์และ Print Server ของตัวเอง
-- ─────────────────────────────────────────
IF COL_LENGTH('dbo.Printers', 'BranchId') IS NULL
  ALTER TABLE dbo.Printers ADD BranchId NVARCHAR(60) NULL;
GO
DECLARE @def NVARCHAR(60) = (SELECT TOP (1) id FROM dbo.Branches WHERE ISNULL(isActive, 1) = 1 ORDER BY Seq ASC);
IF @def IS NOT NULL
  UPDATE dbo.Printers SET BranchId = @def WHERE BranchId IS NULL;
GO

-- ─────────────────────────────────────────
-- เมนูรายสาขา (เฟส 4) — เมนูกลางชุดเดียว แต่ละสาขาปรับได้เฉพาะที่ต่างจากเมนูกลาง
--   isAvailable = 0 → สาขานี้ไม่ขายเมนูนี้
--   priceMap    = {"ชื่อราคา": ราคา} ทับเฉพาะราคาที่ระบุ ("" = ราคาเดี่ยวของเมนูที่ไม่มีหลายราคา)
--   printerId   = ปริ้นเตอร์ของสาขานี้ที่เมนูนี้ต้องออก (ว่าง = หาจากชื่อปริ้นเตอร์ของเมนูกลาง)
-- ไม่มีแถว = ใช้ตามเมนูกลางทั้งหมด
-- ─────────────────────────────────────────
IF OBJECT_ID('dbo.MenuBranch', 'U') IS NULL
CREATE TABLE dbo.MenuBranch (
  menuId      NVARCHAR(60)  NOT NULL,
  branchId    NVARCHAR(60)  NOT NULL,
  isAvailable BIT           NULL,
  priceMap    NVARCHAR(MAX) NULL,
  printerId   NVARCHAR(60)  NULL,
  CONSTRAINT PK_MenuBranch PRIMARY KEY (menuId, branchId)
);
GO

-- ─────────────────────────────────────────
-- สต็อกรายสาขา (เฟส 5) — รายการวัตถุดิบและสูตร BOM ใช้ร่วมกัน
-- ส่วนรับเข้า/ตัดออกแยกตามสาขา → คงเหลือของแต่ละสาขา = รับเข้าของสาขา − ตัดออกของสาขา
-- ─────────────────────────────────────────
IF COL_LENGTH('dbo.StockIn', 'BranchId') IS NULL
  ALTER TABLE dbo.StockIn ADD BranchId NVARCHAR(60) NULL;
GO
IF COL_LENGTH('dbo.StockOut', 'BranchId') IS NULL
  ALTER TABLE dbo.StockOut ADD BranchId NVARCHAR(60) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StockIn_Branch' AND object_id = OBJECT_ID('dbo.StockIn'))
  CREATE INDEX IX_StockIn_Branch ON dbo.StockIn (BranchId, ingId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StockOut_Branch' AND object_id = OBJECT_ID('dbo.StockOut'))
  CREATE INDEX IX_StockOut_Branch ON dbo.StockOut (BranchId, ingId);
GO
DECLARE @def NVARCHAR(60) = (SELECT TOP (1) id FROM dbo.Branches WHERE ISNULL(isActive, 1) = 1 ORDER BY Seq ASC);
IF @def IS NOT NULL
BEGIN
  UPDATE dbo.StockIn  SET BranchId = @def WHERE BranchId IS NULL;
  UPDATE dbo.StockOut SET BranchId = @def WHERE BranchId IS NULL;
END
GO

-- ─────────────────────────────────────────
-- ปริ้นเตอร์ครัว/บาร์เลือกหมวดอาหารที่จะพิมพ์ได้ — JSON array ของ slug หมวด ([] / NULL = ทุกหมวด)
-- ─────────────────────────────────────────
IF COL_LENGTH('dbo.Printers', 'categories') IS NULL
  ALTER TABLE dbo.Printers ADD categories NVARCHAR(MAX) NULL;
GO

-- ─────────────────────────────────────────
-- ลำดับการแสดงเมนู (หน้าจัดการเมนู > จัดลำดับ) — น้อยขึ้นก่อน, NULL (เมนูเพิ่มใหม่) ต่อท้ายตามลำดับที่สร้าง
-- ─────────────────────────────────────────
IF COL_LENGTH('dbo.Menu', 'sortOrder') IS NULL
  ALTER TABLE dbo.Menu ADD sortOrder INT NULL;
GO

-- ─────────────────────────────────────────
-- ใบกำกับภาษีเต็มรูป (หลังบ้าน > รายงาน > รายงานยอดขาย > ออกใบกำกับภาษี)
-- เลขที่ = <billPrefix>-TX<ปีเดือน>-0001 เดินต่อเนื่องรายเดือน · ยกเลิกแล้วไม่ลบ (cancelled = 1)
-- sellerJson = ข้อมูลร้าน ณ วันที่ออก — แก้ข้อมูลสาขาทีหลัง ใบเก่าพิมพ์ซ้ำก็ยังเหมือนเดิม
-- ─────────────────────────────────────────
IF OBJECT_ID('dbo.TaxInvoices', 'U') IS NULL
CREATE TABLE dbo.TaxInvoices (
  RowId        INT IDENTITY(1,1) PRIMARY KEY,
  invoiceNo    NVARCHAR(60)   NOT NULL,
  orderNumber  NVARCHAR(60)   NOT NULL,
  branchId     NVARCHAR(60)   NULL,
  issuedAt     NVARCHAR(40)   NULL,
  buyerName    NVARCHAR(300)  NULL,
  buyerTaxId   NVARCHAR(40)   NULL,
  buyerAddress NVARCHAR(1000) NULL,
  buyerBranch  NVARCHAR(100)  NULL,
  itemsJson    NVARCHAR(MAX)  NULL,
  subtotal     DECIMAL(18,2)  NULL,
  vatRate      DECIMAL(9,2)   NULL,
  vatAmount    DECIMAL(18,2)  NULL,
  total        DECIMAL(18,2)  NULL,
  sellerJson   NVARCHAR(MAX)  NULL,
  issuedBy     NVARCHAR(120)  NULL,
  cancelled    BIT            NULL,
  cancelledAt  NVARCHAR(40)   NULL,
  cancelReason NVARCHAR(500)  NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_TaxInvoices_No' AND object_id = OBJECT_ID('dbo.TaxInvoices'))
  CREATE UNIQUE INDEX UX_TaxInvoices_No ON dbo.TaxInvoices (invoiceNo);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TaxInvoices_Order' AND object_id = OBJECT_ID('dbo.TaxInvoices'))
  CREATE INDEX IX_TaxInvoices_Order ON dbo.TaxInvoices (orderNumber);
GO

-- ลูกค้าที่เคยขอใบกำกับภาษี — ออกใบแล้วบันทึก/อัปเดตให้เอง ครั้งหน้าค้นหาจากชื่อหรือเลขผู้เสียภาษีแล้วดึงมาใช้ได้
IF OBJECT_ID('dbo.TaxCustomers', 'U') IS NULL
CREATE TABLE dbo.TaxCustomers (
  taxId        NVARCHAR(20)   NOT NULL,
  buyerBranch  NVARCHAR(100)  NOT NULL,
  name         NVARCHAR(300)  NULL,
  [address]    NVARCHAR(1000) NULL,
  phone        NVARCHAR(60)   NULL,
  useCount     INT            NULL,
  lastUsedAt   NVARCHAR(40)   NULL,
  CONSTRAINT PK_TaxCustomers PRIMARY KEY (taxId, buyerBranch)
);
GO

-- ─────────────────────────────────────────
-- เมนูขายเฉพาะบางสาขา — JSON array ของรหัสสาขา ([] / NULL = ทุกสาขา)
-- หมวดหมู่แสดงให้ใครเห็น — all (ทั้งคู่) / staff (เฉพาะหน้าพนักงาน) / customer (เฉพาะหน้าลูกค้าสั่งเอง)
-- ─────────────────────────────────────────
IF COL_LENGTH('dbo.Menu', 'branches') IS NULL
  ALTER TABLE dbo.Menu ADD branches NVARCHAR(MAX) NULL;
GO
-- เมนูเฉพาะสมาชิก — หน้าลูกค้าสั่งเองต้องล็อกอินสมาชิก (ยืนยันด้วยรหัสในบัตร LINE) · หน้าพนักงานต้องยิงบัตรสมาชิกก่อน
IF COL_LENGTH('dbo.Menu', 'memberOnly') IS NULL
  ALTER TABLE dbo.Menu ADD memberOnly BIT NULL;
GO
IF COL_LENGTH('dbo.Categories', 'visibility') IS NULL
  ALTER TABLE dbo.Categories ADD visibility NVARCHAR(20) NULL;
GO

-- ─────────────────────────────────────────
-- ตาราง Waste ใช้เก็บทั้ง "บันทึกการทิ้ง" และ "บันทึกการเตรียม"
--   kind: waste (NULL = waste แถวเดิม) / prep / count (นับสต็อก) · itemType: menu (NULL = เมนู) / ingredient
-- ─────────────────────────────────────────
IF COL_LENGTH('dbo.Waste', 'kind') IS NULL
  ALTER TABLE dbo.Waste ADD kind NVARCHAR(20) NULL;
GO
IF COL_LENGTH('dbo.Waste', 'itemType') IS NULL
  ALTER TABLE dbo.Waste ADD itemType NVARCHAR(20) NULL;
GO

-- ─────────────────────────────────────────
-- ลูกค้าสแกน QR แจ้งโอน → พนักงานหน้าขายยืนยันยอด (แทนการตรวจสลิปอัตโนมัติ)
-- status: pending (รอพนักงาน) / approving (กำลังออกบิล) / approved (ยืนยันแล้ว) / rejected (ยังไม่ได้รับเงิน)
-- payloadJson = ออเดอร์ทั้งก้อนจากหน้าลูกค้า — ออกบิลตอนพนักงานกดยืนยัน
-- ─────────────────────────────────────────
IF OBJECT_ID('dbo.KioskPayments', 'U') IS NULL
CREATE TABLE dbo.KioskPayments (
  RowId        INT IDENTITY(1,1),
  id           NVARCHAR(60)  NOT NULL PRIMARY KEY,
  branchId     NVARCHAR(60)  NULL,
  tableNo      NVARCHAR(50)  NULL,
  dining       NVARCHAR(50)  NULL,
  payloadJson  NVARCHAR(MAX) NULL,
  total        DECIMAL(18,2) NULL,
  [status]     NVARCHAR(20)  NULL,
  requestedAt  NVARCHAR(40)  NULL,
  respondedAt  NVARCHAR(40)  NULL,
  respondedBy  NVARCHAR(120) NULL,
  orderNumber  NVARCHAR(60)  NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KioskPayments_Status' AND object_id = OBJECT_ID('dbo.KioskPayments'))
  CREATE INDEX IX_KioskPayments_Status ON dbo.KioskPayments ([status], branchId, requestedAt);
GO

-- ─────────────────────────────────────────
-- เชื่อมระบบสมาชิก (CRM): คิวส่งบิลไปให้แต้ม
-- ทุกบิลที่ชำระแล้วเข้าคิวในทรานแซกชันเดียวกับบิล แล้วส่งไป CRM ทันที ถ้าส่งไม่ได้ (เน็ตหลุด/CRM ปิด) ส่งซ้ำเองภายหลัง
-- CRM กันบิลซ้ำด้วยเลขบิล จึงส่งซ้ำได้ไม่ได้แต้มซ้ำ
-- status: pending (รอส่ง) / sent (ส่งแล้ว) / failed (CRM ปฏิเสธ ต้องตรวจ)
-- ─────────────────────────────────────────
IF OBJECT_ID('dbo.CrmBills', 'U') IS NULL
CREATE TABLE dbo.CrmBills (
  RowId        INT IDENTITY(1,1) PRIMARY KEY,
  BranchId     NVARCHAR(60)  NOT NULL,
  OrderNumber  NVARCHAR(60)  NOT NULL,
  MemberId     NVARCHAR(20)  NULL,
  PayloadJson  NVARCHAR(MAX) NOT NULL,
  [Status]     NVARCHAR(20)  NOT NULL DEFAULT 'pending',
  Attempts     INT           NOT NULL DEFAULT 0,
  NextAttempt  DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME(),
  LastError    NVARCHAR(500) NULL,
  Points       INT           NULL,
  Balance      INT           NULL,
  CreatedAt    DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME(),
  SentAt       DATETIME2(0)  NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_CrmBills_Bill' AND object_id = OBJECT_ID('dbo.CrmBills'))
  CREATE UNIQUE INDEX UX_CrmBills_Bill ON dbo.CrmBills (BranchId, OrderNumber);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CrmBills_Pending' AND object_id = OBJECT_ID('dbo.CrmBills'))
  CREATE INDEX IX_CrmBills_Pending ON dbo.CrmBills ([Status], NextAttempt);
GO

-- ─────────────────────────────────────────
-- คิวงานพิมพ์: มือถือ/แท็บเล็ตสั่งพิมพ์ผ่าน API แล้ว Print Server ในร้านมาดึงไปพิมพ์ (api/_lib/printQueue.js)
-- status: pending (รอ Print Server) / printing (รับไปแล้ว) / done / failed / cancelled / expired
-- API สร้างตารางนี้เองครั้งแรกที่ใช้ ถ้าผู้ใช้ฐานข้อมูลมีสิทธิ์ — ไม่มีสิทธิ์ให้รัน npm run sql:init
-- ─────────────────────────────────────────
IF OBJECT_ID('dbo.PrintJobs', 'U') IS NULL
CREATE TABLE dbo.PrintJobs (
  RowId        INT IDENTITY(1,1) PRIMARY KEY,
  JobId        NVARCHAR(40)  NOT NULL UNIQUE,
  BranchId     NVARCHAR(60)  NOT NULL,
  PrinterIp    NVARCHAR(100) NOT NULL,
  PrinterName  NVARCHAR(120) NULL,
  PrinterType  NVARCHAR(20)  NOT NULL,
  PayloadJson  NVARCHAR(MAX) NOT NULL,
  Label        NVARCHAR(120) NULL,
  [Status]     NVARCHAR(20)  NOT NULL DEFAULT 'pending',
  Stage        NVARCHAR(20)  NULL,
  Error        NVARCHAR(500) NULL,
  Warning      NVARCHAR(500) NULL,
  Confirmed    BIT           NULL,
  StepsJson    NVARCHAR(MAX) NULL,
  CreatedAt    DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME(),
  ClaimedAt    DATETIME2(0)  NULL,
  ClaimedBy    NVARCHAR(120) NULL,
  FinishedAt   DATETIME2(0)  NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PrintJobs_Queue' AND object_id = OBJECT_ID('dbo.PrintJobs'))
  CREATE INDEX IX_PrintJobs_Queue ON dbo.PrintJobs (BranchId, [Status], RowId);
GO
-- Print Server ของแต่ละสาขามาดึงคิวล่าสุดเมื่อไหร่ (หน้าเว็บใช้บอกว่าออนไลน์ไหม)
IF OBJECT_ID('dbo.PrintAgents', 'U') IS NULL
CREATE TABLE dbo.PrintAgents (
  BranchId  NVARCHAR(60)  NOT NULL PRIMARY KEY,
  Agent     NVARCHAR(120) NULL,
  Version   NVARCHAR(20)  NULL,
  LastSeen  DATETIME2(0)  NOT NULL
);
GO

-- ─────────────────────────────────────────
-- เมนูเฉพาะสมาชิก: จำว่าสมาชิกแต่ละคนสั่งเมนูสมาชิกไปกี่ชิ้นในแต่ละวัน (จำกัดต่อวัน · หลังบ้าน > เมนูสมาชิก)
-- นับรวมทุกสาขา · Status: held (ลูกค้าแจ้งโอนแล้ว รอพนักงานยืนยัน — นับกันโควตาไว้ก่อน) / used (บิลชำระแล้ว)
--   / released (ปฏิเสธ ยกเลิกบิล คืนเงิน — คืนสิทธิ์)
-- UsageDay = วันทำการตามเวลาไทย (เริ่มวันใหม่ตามเวลาที่ตั้ง) · OrderRef = รหัสคำขอจากหน้าลูกค้า หรือเลขบิลจากหน้าขาย
-- ─────────────────────────────────────────
IF OBJECT_ID('dbo.MemberMenuUsage', 'U') IS NULL
CREATE TABLE dbo.MemberMenuUsage (
  RowId        INT IDENTITY(1,1) PRIMARY KEY,
  MemberId     NVARCHAR(20)  NOT NULL,
  MenuId       NVARCHAR(60)  NOT NULL,
  MenuName     NVARCHAR(300) NULL,
  Qty          INT           NOT NULL,
  Channel      NVARCHAR(10)  NOT NULL,
  BranchId     NVARCHAR(60)  NULL,
  OrderRef     NVARCHAR(80)  NOT NULL,
  OrderNumber  NVARCHAR(60)  NULL,
  [Status]     NVARCHAR(10)  NOT NULL,
  UsageDay     CHAR(10)      NOT NULL,
  CreatedAt    DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MemberMenuUsage_Member' AND object_id = OBJECT_ID('dbo.MemberMenuUsage'))
  CREATE INDEX IX_MemberMenuUsage_Member ON dbo.MemberMenuUsage (MemberId, UsageDay);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MemberMenuUsage_Ref' AND object_id = OBJECT_ID('dbo.MemberMenuUsage'))
  CREATE INDEX IX_MemberMenuUsage_Ref ON dbo.MemberMenuUsage (OrderRef);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MemberMenuUsage_Day' AND object_id = OBJECT_ID('dbo.MemberMenuUsage'))
  CREATE INDEX IX_MemberMenuUsage_Day ON dbo.MemberMenuUsage (UsageDay);
GO
-- ── ตัวนับเลขบิล (เลขที่ใบกำกับภาษีอย่างย่อ) — หนึ่งแถวต่อคำนำหน้าเลขบิลของสาขา ──
-- ออกบิลใหม่ = บวก 1 ที่แถวนี้ ไม่ต้องไล่อ่านบิลเก่าทั้งหมด (เร็วเท่ากันไม่ว่าบิลสะสมกี่ใบ)
-- ไม่มีแถวของคำนำหน้านั้น → ระบบอ่านเลขล่าสุดจากบิลเดิมครั้งเดียวแล้วนับต่อ
IF OBJECT_ID('dbo.BillCounters', 'U') IS NULL
CREATE TABLE dbo.BillCounters (
  Prefix     NVARCHAR(60) NOT NULL PRIMARY KEY,
  LastNo     INT          NOT NULL,
  UpdatedAt  DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- ─────────────────────────────────────────
-- ยกเลิกบิลที่ชำระแล้ว (หน้าขาย > เพิ่มเติม > ยกเลิกบิล · api/_lib/billVoid.js)
-- เฉพาะบิลของวันนี้ ต้องใส่หมายเหตุ · Orders ของบิลเป็น cancelled · แถวนี้เก็บว่าใครยกเลิก เมื่อไหร่ เพราะอะไร
-- CrmStatus: none (ไม่มีแต้มต้องหักคืน) / pending (รอส่งคืนเงินให้ CRM) / sent / failed
-- ─────────────────────────────────────────
IF OBJECT_ID('dbo.BillVoids', 'U') IS NULL
CREATE TABLE dbo.BillVoids (
  RowId          INT IDENTITY(1,1) PRIMARY KEY,
  OrderNumber    NVARCHAR(60)  NOT NULL,
  BranchId       NVARCHAR(60)  NULL,
  Total          DECIMAL(18,2) NULL,
  Reason         NVARCHAR(300) NOT NULL,
  VoidedBy       NVARCHAR(120) NULL,
  VoidedByUid    NVARCHAR(60)  NULL,
  VoidedAt       NVARCHAR(40)  NOT NULL,
  CrmStatus      NVARCHAR(20)  NOT NULL DEFAULT 'none',
  CrmAttempts    INT           NOT NULL DEFAULT 0,
  CrmNextAttempt DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME(),
  CrmError       NVARCHAR(500) NULL,
  PointsReversed INT           NULL,
  CreatedAt      DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_BillVoids_Order' AND object_id = OBJECT_ID('dbo.BillVoids'))
  CREATE UNIQUE INDEX UX_BillVoids_Order ON dbo.BillVoids (OrderNumber);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BillVoids_Crm' AND object_id = OBJECT_ID('dbo.BillVoids'))
  CREATE INDEX IX_BillVoids_Crm ON dbo.BillVoids (CrmStatus, CrmNextAttempt);
GO

-- ─────────────────────────────────────────
-- แก้ไขบิล (เลขบิลเดิม · หน้าขาย > เพิ่มเติม > ยกเลิก/แก้ไขบิล · api/_lib/billEdit.js)
-- ลบ/ลดจำนวนรายการ + ส่วนลดจากหลังบ้าน → ยอดใหม่ · แก้ได้หลายครั้ง (EditNo) · Before/AfterJson = รายการก่อน/หลังแก้
-- CrmStatus: none / pending (รอส่งคืนส่วนต่าง CrmAmount ให้ CRM) / sent / failed
-- ─────────────────────────────────────────
IF OBJECT_ID('dbo.BillEdits', 'U') IS NULL
CREATE TABLE dbo.BillEdits (
  RowId          INT IDENTITY(1,1) PRIMARY KEY,
  OrderNumber    NVARCHAR(60)  NOT NULL,
  EditNo         INT           NOT NULL,
  BranchId       NVARCHAR(60)  NULL,
  OldTotal       DECIMAL(18,2) NULL,
  NewTotal       DECIMAL(18,2) NULL,
  DiscountName   NVARCHAR(200) NULL,
  DiscountAmount DECIMAL(18,2) NULL,
  BeforeJson     NVARCHAR(MAX) NULL,
  AfterJson      NVARCHAR(MAX) NULL,
  Reason         NVARCHAR(300) NOT NULL,
  EditedBy       NVARCHAR(120) NULL,
  EditedByUid    NVARCHAR(60)  NULL,
  EditedAt       NVARCHAR(40)  NOT NULL,
  CrmStatus      NVARCHAR(20)  NOT NULL DEFAULT 'none',
  CrmAmount      DECIMAL(18,2) NULL,
  CrmAttempts    INT           NOT NULL DEFAULT 0,
  CrmNextAttempt DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME(),
  CrmError       NVARCHAR(500) NULL,
  PointsReversed INT           NULL,
  CreatedAt      DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_BillEdits_Order' AND object_id = OBJECT_ID('dbo.BillEdits'))
  CREATE UNIQUE INDEX UX_BillEdits_Order ON dbo.BillEdits (OrderNumber, EditNo);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BillEdits_Crm' AND object_id = OBJECT_ID('dbo.BillEdits'))
  CREATE INDEX IX_BillEdits_Crm ON dbo.BillEdits (CrmStatus, CrmNextAttempt);
GO
