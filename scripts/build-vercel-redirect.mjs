// Vercel ไม่ได้เปิดหน้าเว็บ POS แล้ว (ย้ายไปเซิร์ฟเวอร์ร้าน — docs/SELF-HOST-WEB.md)
// build บน Vercel เหลือแค่หน้าเดียวที่ส่งต่อไปที่อยู่ใหม่ ทุกลิงก์เดิม (QR โต๊ะ, บุ๊กมาร์กเครื่องพนักงาน) ใช้ต่อได้
//   • ที่อยู่เดิม /kiosk?table=5&b=XUM → ที่อยู่ใหม่ /kiosk?table=5&b=XUM (path + query เดิมทั้งหมด)
//   • พาค่าตั้งของเครื่อง (สาขา เครื่องพิมพ์) และบิลค้างส่งไปด้วยใน #migrate=… → src/utils/originMigrate.js
//   • ไฟล์เดียว ไม่มีรูป/สคริปต์แยก = ใช้โควตา Vercel 1 คำขอต่อการเปิด
// เปลี่ยนที่อยู่ใหม่: ตั้ง REDIRECT_TO ใน Vercel (Settings → Environment Variables) แล้ว Redeploy
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const target = String(process.env.REDIRECT_TO || 'https://humlai.naraipizzeria.com').replace(/\/+$/, '');
if (!/^https:\/\/[a-z0-9.-]+$/i.test(target)) throw new Error('REDIRECT_TO ต้องเป็น https://ชื่อโดเมน เท่านั้น: ' + target);
const OUT = 'dist-redirect';
const KEYS = ['device_branch', 'printers_config', 'printer_receipt_ip', 'printer_kitchen_ip', 'waste_branch', 'kiosk_member_login'];

const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>ข้าวมันไก่หำไหล</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,"Segoe UI",Tahoma,sans-serif;background:#fffbf5;color:#0f172a;text-align:center;padding:24px;box-sizing:border-box}a{color:#ea580c;font-weight:700}</style>
</head>
<body>
<div><p id="m">กำลังไปที่หน้าร้านใหม่…</p><p><a id="go" href="${target}/">${target.replace('https://', '')}</a></p></div>
<script>
(function () {
  var NEW = ${JSON.stringify(target)};
  var KEYS = ${JSON.stringify(KEYS)};
  var url = NEW + location.pathname + location.search;
  var data = {};
  try {
    for (var i = 0; i < KEYS.length; i++) { var v = localStorage.getItem(KEYS[i]); if (v) data[KEYS[i]] = v; }
    var p = localStorage.getItem('pending_orders');
    if (p && p !== '[]') data.pending_orders = p;
  } catch (e) { /* เปิดแบบไม่ให้เก็บข้อมูล */ }
  var enc = function (o) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''); };
  var hash = '';
  if (Object.keys(data).length) {
    hash = '#migrate=' + enc(data);
    // ลิงก์ยาวเกินที่บางเบราว์เซอร์รับไหว → ไม่พาบิลค้างไป (เตือนให้ส่งบิลค้างจากเครื่องนี้ก่อน)
    if (hash.length > 300000 && data.pending_orders) {
      delete data.pending_orders;
      hash = Object.keys(data).length ? '#migrate=' + enc(data) : '';
      alert('เครื่องนี้มีบิลค้างส่งจำนวนมาก ย้ายไปที่อยู่ใหม่อัตโนมัติไม่ได้ — แจ้งผู้ดูแลระบบก่อนลบข้อมูลเบราว์เซอร์ของเครื่องนี้');
    }
  }
  document.getElementById('go').href = url + hash;
  location.replace(url + hash);
})();
</script>
<noscript><p>เปิดหน้าร้านใหม่ที่ <a href="${target}/">${target}</a></p></noscript>
</body>
</html>
`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/index.html`, html);
console.log('Vercel: หน้าส่งต่อไปที่ ' + target);
