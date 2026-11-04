import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { buildPrintServerPackage } from './scripts/build-print-server-package.mjs'

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

// https://vite.dev/config/
export default defineConfig({
  plugins: [printServerPackage(), react(), tailwindcss()],
})
