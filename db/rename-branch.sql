/* ─────────────────────────────────────────────────────────────────────────────
   เปลี่ยนรหัสสาขา (Branches.id) ทั้งระบบ — รันใน SQL Server Management Studio (SSMS)

   รหัสสาขาถูกใช้ผูกข้อมูลทุกอย่าง (บิล ยอดชำระ โต๊ะ สต็อก เครื่องพิมพ์ พนักงาน ฯลฯ)
   แก้ที่ตาราง Branches อย่างเดียว ข้อมูลเก่าจะหลุดจากสาขา — สคริปต์นี้แก้ให้ครบทุกที่ในทรานแซกชันเดียว

   วิธีใช้
     1. แก้ @old / @new ด้านล่าง  (ตัวพิมพ์เล็ก/ใหญ่ของ @old ไม่ต้องตรงเป๊ะ)
     2. รันครั้งแรกด้วย @apply = 0  → ดูตัวอย่างว่าแต่ละตารางจะถูกแก้กี่แถว (ยังไม่แก้อะไร)
     3. ตรวจตัวเลขแล้ว เปลี่ยนเป็น @apply = 1 รันอีกครั้ง → แก้จริง (พังกลางทาง = ย้อนกลับทั้งหมด)
     4. ทำตามขั้นตอน "หลังรันเสร็จ" ท้ายไฟล์

   ⚠ รันตอนร้านปิด ไม่มีใครขาย/สั่งอาหารอยู่  ·  สำรองฐานข้อมูลก่อน (SSMS: คลิกขวาที่ฐานข้อมูล > Tasks > Back Up…)
   ───────────────────────────────────────────────────────────────────────────── */

DECLARE @old   NVARCHAR(60) = N'รหัสเดิม';   -- ← รหัสสาขาเดิม
DECLARE @new   NVARCHAR(60) = N'รหัสใหม่';   -- ← รหัสสาขาใหม่ (ตัวอักษร ตัวเลข ขีด หรือขีดล่าง ไม่มีช่องว่าง)
DECLARE @apply BIT          = 0;            -- 0 = ดูตัวอย่าง · 1 = แก้จริง

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- ── ตรวจก่อนเริ่ม ──
IF @new IS NULL OR LTRIM(RTRIM(@new)) = N'' OR @new LIKE N'% %'
  BEGIN RAISERROR(N'รหัสใหม่ว่างหรือมีช่องว่าง', 16, 1); RETURN; END
IF @old = @new COLLATE Latin1_General_BIN
  BEGIN RAISERROR(N'รหัสเดิมกับรหัสใหม่เหมือนกัน', 16, 1); RETURN; END
IF NOT EXISTS (SELECT 1 FROM dbo.Branches WHERE id = @old)
  BEGIN RAISERROR(N'ไม่พบสาขารหัสเดิมในตาราง Branches', 16, 1); RETURN; END
-- เปลี่ยนแค่ตัวพิมพ์เล็ก/ใหญ่ (เช่น xum → XUM) ไม่นับว่าซ้ำ
IF EXISTS (SELECT 1 FROM dbo.Branches WHERE id = @new) AND LOWER(@old) <> LOWER(@new)
  BEGIN RAISERROR(N'รหัสใหม่มีอยู่แล้วในตาราง Branches — เลือกรหัสอื่น', 16, 1); RETURN; END

-- ── คอลัมน์ที่เก็บรหัสสาขาตรง ๆ ──
DECLARE @targets TABLE (seq INT IDENTITY(1,1), t SYSNAME, c SYSNAME, note NVARCHAR(200));
INSERT INTO @targets (t, c, note) VALUES
  (N'Branches',        N'id',         N'สาขา'),
  (N'Orders',          N'BranchId',   N'บิล'),
  (N'Orders',          N'RecordedBy', N'บิล (ช่องบันทึกโดย = รหัสสาขาของพนักงาน)'),
  (N'PaymentSummary',  N'BranchId',   N'ยอดชำระ'),
  (N'TableOrders',     N'BranchId',   N'รายการในโต๊ะ'),
  (N'Printers',        N'BranchId',   N'เครื่องพิมพ์'),
  (N'MenuBranch',      N'branchId',   N'เมนูรายสาขา (เปิด/ปิดขาย ราคา)'),
  (N'StockIn',         N'BranchId',   N'รับวัตถุดิบเข้า'),
  (N'StockOut',        N'BranchId',   N'ตัดสต็อก'),
  (N'TaxInvoices',     N'branchId',   N'ใบกำกับภาษีเต็มรูป'),
  (N'KioskPayments',   N'branchId',   N'ลูกค้าแจ้งโอน'),
  (N'CrmBills',        N'BranchId',   N'คิวส่งแต้มสมาชิก'),
  (N'PrintJobs',       N'BranchId',   N'คิวงานพิมพ์'),
  (N'PrintAgents',     N'BranchId',   N'Print Server ที่ออนไลน์'),
  (N'MemberMenuUsage', N'BranchId',   N'โควตาเมนูสมาชิก'),
  (N'Users',           N'branch',     N'พนักงาน'),
  (N'Waste',           N'branch',     N'ของเสีย / เตรียม / นับสต็อก');

DECLARE @report TABLE (seq INT, what NVARCHAR(300), rows_found INT);
DECLARE @i INT = 1, @n INT = (SELECT COUNT(*) FROM @targets), @t SYSNAME, @c SYSNAME, @note NVARCHAR(200), @sql NVARCHAR(MAX), @cnt INT;

BEGIN TRANSACTION;

-- สาขาที่ยังไม่ได้ตั้ง "ตัวนำหน้าเลขบิล" ใช้รหัสสาขาเป็นตัวนำหน้า → เปลี่ยนรหัสแล้วเลขบิลจะเริ่ม #001 ใหม่
-- ตั้งตัวนำหน้าเป็นรหัสเดิมไว้ให้ เลขบิล (= เลขที่ใบกำกับภาษีอย่างย่อ) จึงเดินต่อจากเดิม ไม่ซ้ำ ไม่ขาดช่วง
SELECT @cnt = COUNT(*) FROM dbo.Branches WHERE id = @old AND LTRIM(RTRIM(ISNULL(billPrefix, N''))) = N'';
INSERT INTO @report VALUES (0, N'Branches.billPrefix — ตั้งตัวนำหน้าเลขบิลเป็น "' + UPPER(@old) + N'" ให้เลขบิลเดินต่อ', @cnt);
IF @apply = 1 AND @cnt > 0
  UPDATE dbo.Branches SET billPrefix = UPPER(@old) WHERE id = @old AND LTRIM(RTRIM(ISNULL(billPrefix, N''))) = N'';

WHILE @i <= @n
BEGIN
  SELECT @t = t, @c = c, @note = note FROM @targets WHERE seq = @i;
  -- ตาราง/คอลัมน์ที่ฐานข้อมูลนี้ยังไม่มี (ยังไม่ได้รัน sql:init รุ่นที่เพิ่ม) → ข้าม
  IF OBJECT_ID(N'dbo.' + @t, N'U') IS NOT NULL AND COL_LENGTH(N'dbo.' + @t, @c) IS NOT NULL
  BEGIN
    SET @sql = N'SELECT @cnt = COUNT(*) FROM dbo.' + QUOTENAME(@t) + N' WHERE ' + QUOTENAME(@c) + N' = @old';
    EXEC sp_executesql @sql, N'@old NVARCHAR(60), @cnt INT OUTPUT', @old = @old, @cnt = @cnt OUTPUT;
    INSERT INTO @report VALUES (@i, @t + N'.' + @c + N' — ' + @note, @cnt);
    IF @apply = 1 AND @cnt > 0
    BEGIN
      SET @sql = N'UPDATE dbo.' + QUOTENAME(@t) + N' SET ' + QUOTENAME(@c) + N' = @new WHERE ' + QUOTENAME(@c) + N' = @old';
      EXEC sp_executesql @sql, N'@old NVARCHAR(60), @new NVARCHAR(60)', @old = @old, @new = @new;
    END
  END
  ELSE
    INSERT INTO @report VALUES (@i, @t + N'.' + @c + N' — (ไม่มีในฐานข้อมูลนี้ ข้าม)', NULL);
  SET @i += 1;
END

-- ── รหัสสาขาที่อยู่ในข้อความ JSON ──
-- Menu.branches = สาขาที่ขายเมนูนี้ เช่น ["XUM","BKK"]
SELECT @cnt = COUNT(*) FROM dbo.Menu WHERE branches LIKE N'%"' + @old + N'"%';
INSERT INTO @report VALUES (100, N'Menu.branches — เมนูที่ตั้งให้ขายเฉพาะสาขา', @cnt);
IF @apply = 1 AND @cnt > 0
  UPDATE dbo.Menu SET branches = REPLACE(branches, N'"' + @old + N'"', N'"' + @new + N'"') WHERE branches LIKE N'%"' + @old + N'"%';

-- Settings 'branch_tables' = ผังโต๊ะแยกตามสาขา { "XUM": [ ...โต๊ะ... ] } — แก้เฉพาะชื่อคีย์ (ตามด้วย :[ ) ไม่แตะชื่อโต๊ะ
SELECT @cnt = COUNT(*) FROM dbo.Settings WHERE [key] = N'branch_tables' AND [value] LIKE N'%"' + @old + N'":[[]%';
INSERT INTO @report VALUES (101, N'Settings.branch_tables — ผังโต๊ะของสาขา', @cnt);
IF @apply = 1 AND @cnt > 0
  UPDATE dbo.Settings SET [value] = REPLACE([value], N'"' + @old + N'":[', N'"' + @new + N'":[') WHERE [key] = N'branch_tables';

-- สาขาหลักเดิมไม่ได้ตั้งตัวนำหน้า: ตัวนับเลขบิลอยู่ที่ชื่อเดิมอยู่แล้ว (BillCounters.Prefix) ไม่ต้องแก้ — ตัวนำหน้าที่ตั้งด้านบนชี้ไปที่ตัวนับเดิม

SELECT what AS [รายการ], rows_found AS [จำนวนแถว] FROM @report ORDER BY seq;

IF @apply = 1
BEGIN
  COMMIT TRANSACTION;
  PRINT N'✅ เปลี่ยนรหัสสาขาเรียบร้อย — ทำตามขั้นตอน "หลังรันเสร็จ" ท้ายไฟล์ต่อ';
END
ELSE
BEGIN
  ROLLBACK TRANSACTION;
  PRINT N'ดูตัวอย่างอย่างเดียว ยังไม่ได้แก้อะไร — ตรวจตัวเลขแล้วเปลี่ยน @apply = 1 แล้วรันอีกครั้ง';
END

/* ── หลังรันเสร็จ (นอกฐานข้อมูล) ──
   1. เครื่อง API: แก้ไฟล์ .env ถ้ามี CRM_KEYS ที่ใช้รหัสเดิม เช่น {"XUM":"crm_…"} → เปลี่ยนชื่อคีย์เป็นรหัสใหม่
      แล้วรีสตาร์ต API (หรือรัน update-api.bat) — API จำรหัสสาขาไว้ในหน่วยความจำ
   2. พนักงานทุกคนล็อกอินใหม่ · ทุกเครื่องในร้านเลือกสาขาใหม่ (เครื่องจำรหัสเดิมไว้)
   3. QR บนโต๊ะมีรหัสสาขาฝังอยู่ (?b=รหัสเดิม) → หลังบ้าน > โต๊ะและราคา > พิมพ์ QR ใหม่ทุกโต๊ะ
   4. Print Server: หลังบ้าน > เครื่องพิมพ์ > กด "บันทึกการตั้งค่า" (อัปเดตลิงก์พิมพ์อัตโนมัติ)
      และเปิด "รับงานพิมพ์จากมือถือ/แท็บเล็ต" ใหม่ (กุญแจของ Print Server คำนวณจากรหัสสาขา)
   5. ลองขายหนึ่งบิล แล้วเปิดหลังบ้าน > รายงาน เลือกสาขาใหม่ — ต้องเห็นบิลเก่าและบิลใหม่ครบ เลขบิลเดินต่อ
   ───────────────────────────────────────────────────────────────────────────── */
