// Batch (luồng BFF): frontend chọn thư mục, upload các file (giữ đường dẫn tương
// đối), backend xử lý IN-MEMORY và TRẢ KẾT QUẢ về (không đọc/ghi đĩa của người dùng).
//
// Cấu trúc kỳ vọng (đường dẫn tương đối, đã bỏ tên thư mục gốc):
//   VB_001.html            ← văn bản chính
//   VB_001/PL_01.docx      ← phụ lục nằm trong thư mục cùng tên
//   VB_001/PL_02.doc
//
// Mỗi phụ lục được convert thành <section> (LibreOffice) và append vào cuối HTML.

import { convertBufferToSection } from './word-to-section-core.mjs'

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Xóa section cũ theo data-source (khi force ghi đè).
function removeSectionBySource(html, source) {
  const re = new RegExp(
    `<section\\b[^>]*\\bdata-source="${escapeRe(source)}"[^>]*>[\\s\\S]*?<\\/section>\\s*`,
    'gi',
  )
  return html.replace(re, '')
}

const isWordName = (name) => /\.(docx?)$/i.test(name)
const baseName = (p) => p.split('/').pop()

/**
 * Gom danh sách file upload thành các "văn bản" (html + phụ lục cùng tên thư mục).
 * @param {Array<{rel:string, buffer?:Buffer, size?:number}>} files  rel = đường dẫn tương đối (đã bỏ thư mục gốc)
 * @returns {Array<{name, html, appendices:string[]}>}
 */
export function groupDocs(files) {
  const htmls = new Map()   // base -> rel
  const apps = new Map()    // folder -> [name]
  for (const f of files) {
    const rel = String(f.rel || '').replace(/\\/g, '/').replace(/^\.?\//, '')
    if (/^[^/]+\.html?$/i.test(rel)) {
      htmls.set(rel.replace(/\.html?$/i, ''), rel)
    } else {
      const m = rel.match(/^([^/]+)\/(.+)$/)
      if (m && isWordName(m[2])) {
        const folder = m[1]
        if (!apps.has(folder)) apps.set(folder, [])
        apps.get(folder).push(baseName(m[2]))
      }
    }
  }
  const docs = []
  for (const [base, rel] of htmls) {
    const appendices = (apps.get(base) || []).slice().sort((a, b) => a.localeCompare(b))
    docs.push({ name: base, html: rel, appendices })
  }
  docs.sort((a, b) => a.name.localeCompare(b.name))
  return docs
}

/**
 * Xử lý danh sách file upload: convert phụ lục & append vào HTML tương ứng, trả kết quả.
 * @param {Array<{rel:string, buffer:Buffer}>} files
 * @param {object} [opts]
 * @param {boolean} [opts.force=false]
 * @param {(p:{doc:string,file:string,index:number,total:number})=>void} [opts.onProgress]
 * @returns {Promise<Array<{name,html,appended:string[],skipped:string[],errors:Array,bytes:number,merged:string}>>}
 */
export async function processUploaded(files, opts = {}) {
  const { force = false, onProgress } = opts

  const byRel = new Map()
  for (const f of files) {
    const rel = String(f.rel || '').replace(/\\/g, '/').replace(/^\.?\//, '')
    byRel.set(rel, f.buffer)
  }
  const docs = groupDocs(files)

  let total = 0
  for (const d of docs) total += d.appendices.length
  let index = 0

  const report = []
  for (const doc of docs) {
    let html = (byRel.get(doc.html) || Buffer.alloc(0)).toString('utf8')
    const appended = []
    const skipped = []
    const errors = []
    let sections = ''

    for (const name of doc.appendices) {
      const has = html.includes(`data-source="${name}"`)
      if (has && !force) { skipped.push(name); continue }
      index += 1
      onProgress?.({ doc: doc.name, file: name, index, total })
      const buf = byRel.get(`${doc.name}/${name}`)
      if (!buf) { errors.push({ file: name, error: 'Thiếu buffer phụ lục' }); continue }
      try {
        const { section } = await convertBufferToSection(buf, name)
        if (has && force) html = removeSectionBySource(html, name)
        sections += section + '\n'
        appended.push(name)
      } catch (err) {
        errors.push({ file: name, error: err.message })
      }
    }

    const merged = sections
      ? (/<\/body>/i.test(html)
          ? html.replace(/<\/body>/i, `${sections}</body>`)
          : `${html}\n${sections}`)
      : html

    report.push({
      name: doc.name,
      html: doc.html,
      appended,
      skipped,
      errors,
      bytes: Buffer.byteLength(merged),
      merged,
    })
  }

  return report
}
