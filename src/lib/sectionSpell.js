// Kiểm tra chính tả cho nội dung dạng section HTML.
// Ý tưởng: trích text theo TỪNG text node (ngăn cách bằng "\n" để từ ở các
// khối/ô khác nhau không dính vào nhau), gộp thành batch <= 18000 ký tự gửi API,
// rồi ánh xạ offset (code point) của lỗi về đúng text node để sửa mà KHÔNG đụng
// tới thẻ/style — chỉ đổi nội dung text của node đó.
import { spellCheck } from './spellCheck'

// Giới hạn mỗi lần gửi API. Đặt an toàn dưới 5000 ký tự.
const MAX_BATCH = 4000

const collectTextNodes = (root) => {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const arr = []
  let n
  while ((n = walker.nextNode())) arr.push(n)
  return arr
}

// Tách 1 text node quá dài thành nhiều mảnh <= max, ưu tiên cắt ở ranh giới
// khoảng trắng/xuống dòng để KHÔNG chẻ đôi một từ. Mỗi mảnh giữ nodeStart để
// ánh xạ offset về đúng vị trí trong node gốc.
const splitNodeText = (cp, max) => {
  const pieces = []
  let i = 0
  while (i < cp.length) {
    let end = Math.min(i + max, cp.length)
    if (end < cp.length) {
      const minEnd = i + Math.floor(max * 0.6)
      let cut = -1
      for (let k = end - 1; k >= minEnd; k -= 1) {
        if (cp[k] === '\n' || cp[k] === ' ') {
          cut = k + 1
          break
        }
      }
      if (cut > i) end = cut // không có khoảng trắng -> cắt cứng (từ quá dài, hiếm)
    }
    pieces.push({ nodeStart: i, text: cp.slice(i, end).join('') })
    i = end
  }
  return pieces
}

// Dựng các batch text + bảng ánh xạ [start,end) -> (sectionIndex, nodeIndex, nodeStart).
export function buildSpellBatches(sections) {
  const batches = []
  let cur = { text: '', ranges: [] }
  let cpLen = 0
  const flush = () => {
    if (cur.text) {
      batches.push(cur)
      cur = { text: '', ranges: [] }
      cpLen = 0
    }
  }
  sections.forEach((sec, sectionIndex) => {
    const doc = new DOMParser().parseFromString(sec.html, 'text/html')
    const nodes = collectTextNodes(doc.body)
    nodes.forEach((node, nodeIndex) => {
      const t = node.textContent
      if (!t || !t.trim()) return
      const cp = Array.from(t)
      const pieces =
        cp.length <= MAX_BATCH
          ? [{ nodeStart: 0, text: t }]
          : splitNodeText(cp, MAX_BATCH)
      pieces.forEach((piece) => {
        const len = Array.from(piece.text).length
        if (cpLen + len + 1 > MAX_BATCH) flush()
        const sep = cur.text ? '\n' : ''
        if (sep) cpLen += 1
        const start = cpLen
        cur.text += sep + piece.text
        cur.ranges.push({
          start,
          end: start + len,
          sectionIndex,
          nodeIndex,
          nodeStart: piece.nodeStart,
        })
        cpLen += len
      })
    })
  })
  flush()
  return batches
}

// Chạy kiểm tra toàn bộ sections, trả về danh sách lỗi đã gắn (sectionIndex,
// nodeIndex, offset cục bộ trong node). onProgress(done, total) để báo tiến độ.
// apiBase: override endpoint spell-check.
export async function runSectionSpellCheck(sections, topK, onProgress, apiBase) {
  const batches = buildSpellBatches(sections)
  const issues = []
  let totalMs = 0
  let model = ''
  for (let b = 0; b < batches.length; b += 1) {
    onProgress?.(b + 1, batches.length)
    const res = await spellCheck(batches[b].text, topK, apiBase)
    model = res.model_version
    totalMs += res.processing_ms || 0
    res.issues.forEach((iss) => {
      const range = batches[b].ranges.find(
        (r) => iss.start >= r.start && iss.end <= r.end
      )
      if (!range) return // lỗi vắt qua ranh giới mảnh -> bỏ (hiếm)
      const localStart = range.nodeStart + (iss.start - range.start)
      const localEnd = range.nodeStart + (iss.end - range.start)
      issues.push({
        id: `${range.sectionIndex}:${range.nodeIndex}:${localStart}:${localEnd}`,
        sectionIndex: range.sectionIndex,
        nodeIndex: range.nodeIndex,
        localStart,
        localEnd,
        original: iss.original,
        kind: iss.kind,
        severity: iss.severity,
        confidence: iss.confidence,
        suggestions: iss.suggestions,
      })
    })
  }
  return { issues, model, totalMs, batchCount: batches.length }
}

// Tạo bản HTML CHỈ ĐỂ HIỂN THỊ: chèn <mark> quanh mỗi lỗi để tô sáng.
// KHÔNG dùng để lưu/xuất — HTML gốc (sections[i].html) giữ nguyên, không có mark.
export function annotateSectionHtml(html, issues) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const textNodes = collectTextNodes(doc.body)
  const byNode = new Map()
  issues.forEach((iss) => {
    const a = byNode.get(iss.nodeIndex) || []
    a.push(iss)
    byNode.set(iss.nodeIndex, a)
  })
  byNode.forEach((arr, nodeIndex) => {
    const node = textNodes[nodeIndex]
    if (!node || !node.parentNode) return
    const cp = Array.from(node.textContent)
    arr.sort((a, b) => a.localStart - b.localStart)
    const frag = doc.createDocumentFragment()
    let cursor = 0
    arr.forEach((iss) => {
      if (iss.localStart < cursor) return // chồng lấn -> bỏ
      if (iss.localStart > cursor) {
        frag.appendChild(doc.createTextNode(cp.slice(cursor, iss.localStart).join('')))
      }
      const mark = doc.createElement('mark')
      mark.className = `sp-hl sp-${iss.severity}`
      mark.setAttribute('data-iid', iss.id)
      mark.textContent = cp.slice(iss.localStart, iss.localEnd).join('')
      frag.appendChild(mark)
      cursor = iss.localEnd
    })
    if (cursor < cp.length) {
      frag.appendChild(doc.createTextNode(cp.slice(cursor).join('')))
    }
    node.replaceWith(frag)
  })
  return doc.body.innerHTML
}

// Thay text tại đúng node (theo nodeIndex + offset code point cục bộ).
// Chỉ đổi nội dung text; thẻ/thuộc tính/style giữ nguyên.
export function applySpellFix(sectionHtml, nodeIndex, localStart, localEnd, replacement) {
  const doc = new DOMParser().parseFromString(sectionHtml, 'text/html')
  const node = collectTextNodes(doc.body)[nodeIndex]
  if (!node) return null
  const cp = Array.from(node.textContent)
  node.textContent = [
    ...cp.slice(0, localStart),
    ...Array.from(replacement),
    ...cp.slice(localEnd),
  ].join('')
  return doc.body.innerHTML
}
