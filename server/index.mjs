// Convert server: nhận file .doc (Word nhị phân cũ) và trả HTML.
// Dùng antiword (không có thư viện thuần-browser nào đọc .doc đủ tốt).
import express from 'express'
import multer from 'multer'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile, mkdtemp, rm, access } from 'node:fs/promises'
import { constants as FS } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, extname } from 'node:path'
import { convertWordToSection } from '../tools/word-to-section-core.mjs'
import { processUploaded } from '../tools/folder-batch-core.mjs'

const execFileP = promisify(execFile)

const PORT = process.env.CONVERT_PORT || 5175
const MAX_SIZE = 50 * 1024 * 1024 // 50MB

// Vị trí antiword: ưu tiên biến môi trường, rồi PATH, rồi bản kèm Git for Windows.
const ANTIWORD_CANDIDATES = [
  process.env.ANTIWORD_BIN,
  'antiword',
  'C:\\Program Files\\Git\\mingw64\\bin\\antiword.exe',
  'C:\\Program Files (x86)\\Git\\mingw64\\bin\\antiword.exe',
].filter(Boolean)

let antiwordBin = null
const resolveAntiword = async () => {
  if (antiwordBin) return antiwordBin
  for (const bin of ANTIWORD_CANDIDATES) {
    try {
      // 'antiword' trần: giả định có trên PATH (không kiểm tra bằng access).
      if (bin === 'antiword') {
        await execFileP(bin, ['-h'], { timeout: 5000 }).catch(() => {})
        antiwordBin = bin
        return bin
      }
      await access(bin, FS.X_OK)
      antiwordBin = bin
      return bin
    } catch {
      // thử ứng viên tiếp theo
    }
  }
  antiwordBin = 'antiword' // fallback: cứ thử, để lỗi runtime báo rõ
  return antiwordBin
}

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Text (antiword -w 0) -> HTML: mỗi khối cách nhau dòng trống thành <p>,
// xuống dòng bên trong khối thành <br>. Bỏ marker ảnh [pic] của antiword.
const textToHtml = (text) =>
  text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.replace(/\[pic\]/g, '').replace(/[ \t]+$/gm, ''))
    .filter((block) => block.trim() !== '')
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
})

const app = express()

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, engine: await resolveAntiword() })
})

app.post('/api/convert-doc', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Thiếu file upload (field "file")' })
  const name = req.file.originalname || 'upload.doc'
  if (!name.toLowerCase().endsWith('.doc')) {
    return res.status(400).json({ error: 'Endpoint này chỉ nhận file .doc' })
  }

  let dir
  try {
    const bin = await resolveAntiword()
    dir = await mkdtemp(join(tmpdir(), 'doc-convert-'))
    const inputPath = join(dir, 'input.doc')
    await writeFile(inputPath, req.file.buffer)

    // -t text, -w 0 không ngắt dòng (mỗi đoạn 1 dòng).
    const { stdout } = await execFileP(bin, ['-t', '-w', '0', inputPath], {
      maxBuffer: 128 * 1024 * 1024,
      encoding: 'utf8',
      timeout: 60000,
    })

    const html = textToHtml(stdout)
    res.json({ html, engine: 'antiword', chars: stdout.length })
  } catch (err) {
    console.error('[convert-doc] lỗi:', err.message)
    const hint = /ENOENT/.test(err.message)
      ? ' — không tìm thấy antiword. Cài đặt hoặc đặt biến ANTIWORD_BIN.'
      : ''
    res.status(500).json({ error: `Chuyển đổi .doc thất bại: ${err.message}${hint}` })
  } finally {
    if (dir) rm(dir, { recursive: true, force: true }).catch(() => {})
  }
})

// High-fidelity: .doc HOẶC .docx -> <section> HTML tự chứa (LibreOffice headless).
// Giữ layout/bảng/màu/font, ảnh nhúng base64. Cần LibreOffice (soffice) trên máy.
app.post('/api/word-to-section', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Thiếu file upload (field "file")' })
  const name = req.file.originalname || 'upload.docx'
  const ext = extname(name).toLowerCase()
  if (ext !== '.doc' && ext !== '.docx') {
    return res.status(400).json({ error: 'Chỉ nhận file .doc hoặc .docx' })
  }

  let dir
  try {
    dir = await mkdtemp(join(tmpdir(), 'word2section-in-'))
    // Giữ tên gốc (đã làm sạch) để id/data-source của section phản ánh đúng file.
    const safeName = name.replace(/[^\w.\-]+/g, '_')
    const inputPath = join(dir, safeName)
    await writeFile(inputPath, req.file.buffer)

    const { section, id, engine } = await convertWordToSection(inputPath, {
      className: req.query.class || 'word-import',
    })
    res.json({ html: section, id, engine, bytes: section.length })
  } catch (err) {
    console.error('[word-to-section] lỗi:', err.message)
    const hint = /soffice|LibreOffice/i.test(err.message)
      ? ' — cài LibreOffice hoặc đặt biến SOFFICE_BIN.'
      : ''
    res.status(500).json({ error: `Chuyển đổi thất bại: ${err.message}${hint}` })
  } finally {
    if (dir) rm(dir, { recursive: true, force: true }).catch(() => {})
  }
})

// BFF: frontend chọn thư mục -> upload file (giữ đường dẫn tương đối ở field filename)
// -> backend convert phụ lục & append vào từng HTML, TRẢ kết quả (merged HTML) về.
// Không đọc/ghi đĩa người dùng. Đường dẫn tương đối nằm ở file.originalname.
const uploadFolder = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE, files: 2000 },
})

app.post('/api/process-folder', uploadFolder.array('files'), async (req, res) => {
  const uploaded = req.files || []
  if (!uploaded.length) return res.status(400).json({ error: 'Không có file nào được upload (field "files")' })
  const force = req.query.force === '1' || req.query.force === 'true'

  // rel-path lấy từ "manifest" (mảng JSON cùng thứ tự file) — busboy cắt phần thư
  // mục trong filename nên không dùng originalname được cho đường dẫn tương đối.
  let manifest = []
  try { manifest = JSON.parse(req.body?.manifest || '[]') } catch { /* để trống */ }
  const files = uploaded.map((f, i) => ({ rel: manifest[i] || f.originalname, buffer: f.buffer }))
  try {
    const report = await processUploaded(files, {
      force,
      onProgress: (p) => console.log(`[process-folder] ${p.index}/${p.total} ${p.doc} <- ${p.file}`),
    })
    res.json({ force, docs: report.length, report })
  } catch (err) {
    const hint = /soffice|LibreOffice/i.test(err.message) ? ' — cài LibreOffice hoặc đặt SOFFICE_BIN.' : ''
    res.status(500).json({ error: `Xử lý thất bại: ${err.message}${hint}` })
  }
})

app.listen(PORT, async () => {
  const bin = await resolveAntiword()
  console.log(`[convert] http://localhost:${PORT}  (antiword: ${bin})`)
})
