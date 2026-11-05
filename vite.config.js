import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { buildPrintServerPackage } from './scripts/build-print-server-package.mjs'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// แพ็ก Print Server เป็น zip ให้ดาวน์โหลดจากหน้า "ตั้งค่าเครื่องพิมพ์" (public/downloads/)
// สร้างใหม่ทุกครั้งที่ build/dev จะได้ตรงกับโค้ดล่าสุดเสมอ — แพ็กไม่สำเร็จก็ไม่ให้ทั้งเว็บ build พัง
const printServerPackage = () => ({
  name: 'humlai-print-server-package',
  buildStart() {
    try {
      buildPrintServerPackage()
    } catch (e) {
      this.warn(`แพ็กไฟล์ดาวน์โหลด Print Server ไม่สำเร็จ: ${e.message}`)
    }
  },
})

// รายชื่อไฟล์รูปเมนูที่มีอยู่จริงใน public/images — หน้าเมนูจะลองโหลดเฉพาะไฟล์ที่มี
// (เดิมเดาชื่อไฟล์ไล่ไปทีละแบบ ไฟล์ที่ไม่มี Vercel ตอบเป็นหน้าเว็บกลับมา เสียเวลาโหลดเปล่า ๆ หลายสิบครั้งต่อหน้า)
const MENU_IMAGE_MODULE = 'virtual:menu-image-files'
const listImageFiles = (dir, prefix = '/images') => {
  let out = []
  let names = []
  try { names = readdirSync(dir) } catch { return out }
  for (const name of names) {
    const full = join(dir, name)
    const url = `${prefix}/${name}`
    if (statSync(full).isDirectory()) out = out.concat(listImageFiles(full, url))
    else out.push(url.normalize('NFC'))
  }
  return out
}
const menuImageFiles = () => ({
  name: 'humlai-menu-image-files',
  resolveId(id) { return id === MENU_IMAGE_MODULE ? '\0' + MENU_IMAGE_MODULE : null },
  load(id) {
    if (id !== '\0' + MENU_IMAGE_MODULE) return null
    return `export default ${JSON.stringify(listImageFiles(join(process.cwd(), 'public', 'images')))};`
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [printServerPackage(), menuImageFiles(), react(), tailwindcss()],
})
