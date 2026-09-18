// Core dùng chung cho CLI (word-to-section.mjs) và server (server/index.mjs).
// Chuyển .doc/.docx -> MỘT <section> HTML tự chứa (CSS scoped, ảnh base64/assets)
// bằng LibreOffice headless. Xem README mục "Tool: append Word ... vào cuối HTML".

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  readFile, writeFile, mkdtemp, rm, mkdir, access,
} from 'node:fs/promises'
import { constants as FS } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename, extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const execFileP = promisify(execFile)

// ---- Dò soffice ----------------------------------------------------------
const SOFFICE_CANDIDATES = [
  process.env.SOFFICE_BIN,
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  '/usr/bin/soffice',
  '/usr/local/bin/soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  'soffice',
].filter(Boolean)

let cachedSoffice = null
export async function resolveSoffice(override) {
  if (!override && cachedSoffice) return cachedSoffice
  const list = override ? [override, ...SOFFICE_CANDIDATES] : SOFFICE_CANDIDATES
  for (const bin of list) {
    try {
      if (bin === 'soffice') { cachedSoffice = bin; return bin } // giả định trên PATH
      await access(bin, FS.X_OK)
      cachedSoffice = bin
      return bin
    } catch { /* thử ứng viên kế tiếp */ }
  }
  throw new Error('Không tìm thấy LibreOffice (soffice). Cài LibreOffice hoặc đặt biến SOFFICE_BIN.')
}

// ---- Tiện ích ------------------------------------------------------------
const MIME = {
  '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

export const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'doc'

// Scope CSS phẳng của LibreOffice vào 1 wrapper; drop @page (web layout liên tục).
export function scopeCss(css, scope) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '')
  let out = ''
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open === -1) break
    const close = css.indexOf('}', open)
    if (close === -1) break
    const selector = css.slice(i, open).trim()
    const body = css.slice(open + 1, close).trim()
    i = close + 1
    if (!selector) continue
    if (selector.startsWith('@page')) continue
    if (selector.startsWith('@')) { out += `${selector} { ${body} }\n`; continue }
    const scoped = selector.split(',').map((s) => `${scope} ${s.trim()}`).join(',\n')
    out += `${scoped} { ${body} }\n`
  }
  return out
}

// Bỏ khai báo width/min-width/max-width khỏi 1 chuỗi style inline.
const stripWidthDecls = (style) =>
  style
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !/^(width|min-width|max-width)\s*:/i.test(s))
    .join('; ')

// Bỏ width="..." và width trong style của 1 thẻ mở.
const dropTagWidth = (tag) =>
  tag
    .replace(/\swidth\s*=\s*"[^"]*"/gi, '')
    .replace(/\sstyle\s*=\s*"([^"]*)"/gi, (_m, v) => {
      const s = stripWidthDecls(v)
      return s ? ` style="${s}"` : ''
    })

// Chuẩn hoá mọi <table> sang "auto fit contents + full 100%": bảng rộng 100%,
// table-layout:auto (cột tự dàn theo nội dung), bỏ width cố định ở table/col/td/th.
export function autoFitTables(html) {
  if (!html) return html
  html = html.replace(/<table\b[^>]*>/gi, (tag) => {
    let t = dropTagWidth(tag)
    const add = 'width: 100%; table-layout: auto'
    if (/\sstyle\s*=\s*"/i.test(t)) t = t.replace(/\sstyle\s*=\s*"/i, ` style="${add}; `)
    else t = t.replace(/<table\b/i, `<table style="${add}"`)
    return t
  })
  html = html.replace(/<col\b[^>]*>/gi, dropTagWidth)
  html = html.replace(/<t[dh]\b[^>]*>/gi, dropTagWidth)
  return html
}

// Nhúng <img src="file"> thành data URI, hoặc trỏ sang thư mục assets.
async function rewriteImages(html, workDir, { assetsDir, assetsPrefix }) {
  const srcs = new Set()
  for (const m of html.matchAll(/<img\b[^>]*?\bsrc\s*=\s*"([^"]+)"/gi)) srcs.add(m[1])
  const replacements = new Map()
  for (const src of srcs) {
    if (/^(data:|https?:|\/\/)/i.test(src)) continue
    const ext = extname(src).toLowerCase()
    const mime = MIME[ext] || 'application/octet-stream'
    const filePath = join(workDir, src)
    try {
      if (assetsDir) {
        const outName = basename(src)
        await writeFile(join(assetsDir, outName), await readFile(filePath))
        replacements.set(src, `${assetsPrefix}${outName}`)
      } else {
        const b64 = (await readFile(filePath)).toString('base64')
        replacements.set(src, `data:${mime};base64,${b64}`)
      }
    } catch { /* thiếu ảnh: giữ nguyên src */ }
  }
  return html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*")([^"]+)(")/gi,
    (full, pre, src, post) =>
      replacements.has(src) ? `${pre}${replacements.get(src)}${post}` : full,
  )
}

/**
 * Chuyển 1 file Word thành chuỗi <section> HTML tự chứa.
 * @param {string} inputPath  đường dẫn .doc/.docx
 * @param {object} [opts]
 * @param {string} [opts.className='word-import']  class wrapper
 * @param {string} [opts.soffice]  đường dẫn soffice
 * @param {string} [opts.assetsDir]  nếu có: xuất ảnh ra thư mục này thay vì base64
 * @param {string} [opts.assetsPrefix='']  tiền tố URL ảnh khi dùng assetsDir
 * @returns {Promise<{section:string, id:string, engine:string}>}
 */
export async function convertWordToSection(inputPath, opts = {}) {
  const className = opts.className || 'word-import'
  const soffice = await resolveSoffice(opts.soffice)
  const abs = resolve(inputPath)
  await access(abs, FS.R_OK).catch(() => {
    throw new Error(`Không đọc được file đầu vào: ${abs}`)
  })

  const workDir = await mkdtemp(join(tmpdir(), 'word2section-'))
  try {
    // Profile LibreOffice riêng cho mỗi lần gọi: tránh lỗi "source file could not be
    // loaded" khi đã có instance soffice khác đang chạy (single-instance mặc định),
    // và cho phép convert hàng loạt tuần tự/song song đáng tin cậy.
    const profileDir = join(workDir, 'lo-profile')
    await mkdir(profileDir, { recursive: true })
    const userInstall = `-env:UserInstallation=${pathToFileURL(profileDir).href}`
    await execFileP(
      soffice,
      [userInstall, '--headless', '--convert-to', 'html:HTML', '--outdir', workDir, abs],
      { timeout: 180000, maxBuffer: 256 * 1024 * 1024 },
    )
    const htmlName = basename(abs, extname(abs)) + '.html'
    const rawHtml = await readFile(join(workDir, htmlName), 'utf8')

    const styleInner = [...rawHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
      .map((m) => m[1]).join('\n')
    const bodyMatch = rawHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)
    let bodyHtml = bodyMatch ? bodyMatch[1] : rawHtml

    const id = slugify(basename(abs))
    const scope = `.${className}[data-id="${id}"]`

    let assetsDir = null
    let assetsPrefix = ''
    if (opts.assetsDir) {
      assetsDir = resolve(opts.assetsDir)
      await mkdir(assetsDir, { recursive: true })
      assetsPrefix = (opts.assetsPrefix || '').replace(/\\/g, '/')
    }
    bodyHtml = await rewriteImages(bodyHtml, workDir, { assetsDir, assetsPrefix })
    if (opts.autoFitTables) bodyHtml = autoFitTables(bodyHtml)

    const scopedCss = scopeCss(styleInner, scope)
    const section =
      `<section class="${className}" data-id="${id}" data-source="${basename(abs)}">\n` +
      `<style>\n${scopedCss}</style>\n` +
      `${bodyHtml.trim()}\n` +
      `</section>\n`

    return { section, id, engine: `libreoffice (${soffice})` }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Như convertWordToSection nhưng nhận Buffer + tên file (không cần path sẵn).
 * Ghi buffer ra file tạm rồi convert. Dùng cho luồng upload (BFF).
 * @param {Buffer} buffer  nội dung file .doc/.docx
 * @param {string} filename  tên gốc (để suy ra đuôi + id/data-source)
 * @param {object} [opts]  như convertWordToSection
 */
export async function convertBufferToSection(buffer, filename, opts = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'w2s-buf-'))
  try {
    const safe = (filename || 'upload.docx').replace(/[^\w.\-]+/g, '_')
    const p = join(dir, safe)
    await writeFile(p, buffer)
    // PHẢI await: nếu không, finally { rm(dir) } chạy trước khi soffice đọc file
    // input -> lỗi "source file could not be loaded".
    return await convertWordToSection(p, opts)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
