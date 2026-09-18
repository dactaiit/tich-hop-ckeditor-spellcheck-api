// Helper thuần (không React) cho IdaVibeEditor.
// Nguyên tắc xuyên suốt: mọi thao tác chỉ đổi đúng phần cần đổi, giữ nguyên
// cấu trúc & style HTML còn lại.

let seq = 0
export const nextSectionId = () => `ida-${(seq += 1)}`

// Tách HTML thành các section, unwrap đệ quy <div> bọc "rỗng" (không style/class)
// để lấy đúng từng <p>/<table>... làm một section (không chui vào bảng).
const flattenBlocks = (parent, out) => {
  parent.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const isWrapperDiv =
        node.tagName === 'DIV' &&
        !node.getAttribute('style') &&
        !node.getAttribute('class')
      if (isWrapperDiv) flattenBlocks(node, out)
      else out.push({ id: nextSectionId(), html: node.outerHTML })
    } else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      out.push({ id: nextSectionId(), html: `<p>${node.textContent.trim()}</p>` })
    }
  })
}

export const splitIntoSections = (html) => {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  const out = []
  flattenBlocks(doc.body, out)
  return out
}

// Đối tượng có thể sửa. outer=true: thay cả node (tránh lồng thẻ sai, giữ style
// cấp đối tượng). outer=false: chỉ ghi innerHTML (thẻ chứa được <p>: td/li/caption).
export const OBJECT_TAGS = {
  P: { label: 'Đoạn văn', outer: true },
  H1: { label: 'Tiêu đề H1', outer: true },
  H2: { label: 'Tiêu đề H2', outer: true },
  H3: { label: 'Tiêu đề H3', outer: true },
  H4: { label: 'Tiêu đề H4', outer: true },
  H5: { label: 'Tiêu đề H5', outer: true },
  H6: { label: 'Tiêu đề H6', outer: true },
  BLOCKQUOTE: { label: 'Trích dẫn', outer: true },
  UL: { label: 'Danh sách (ul)', outer: true },
  OL: { label: 'Danh sách (ol)', outer: true },
  TABLE: { label: 'Bảng', outer: true },
  LI: { label: 'Mục danh sách (li)', outer: false },
  TD: { label: 'Ô bảng (td)', outer: false },
  TH: { label: 'Ô tiêu đề (th)', outer: false },
  CAPTION: { label: 'Chú thích bảng', outer: false },
}

const isHlMark = (el) => el.tagName === 'MARK' && el.classList.contains('sp-hl')

// Đường dẫn chỉ số phần tử tới gốc section, BỎ QUA <mark> tô lỗi (chỉ có ở bản
// hiển thị) để index khớp HTML gốc.
export const getLeafPath = (leaf, contentRoot) => {
  const path = []
  let el = leaf
  while (el && el !== contentRoot) {
    let i = 0
    let sib = el
    while ((sib = sib.previousElementSibling)) {
      if (!isHlMark(sib)) i += 1
    }
    path.unshift(i)
    if (el.parentElement === contentRoot) break
    el = el.parentElement
  }
  return path
}

const navigate = (sectionHtml, path) => {
  const doc = new DOMParser().parseFromString(sectionHtml, 'text/html')
  let el = doc.body
  for (const idx of path) {
    el = el?.children?.[idx]
    if (!el) return { doc: null, el: null }
  }
  return { doc, el }
}

export const getNodeHtmlFromClean = (sectionHtml, path, useOuter) => {
  const { el } = navigate(sectionHtml, path)
  if (!el) return ''
  return useOuter ? el.outerHTML : el.innerHTML
}

export const applyLeafEdit = (sectionHtml, path, html, useOuter) => {
  const { doc, el } = navigate(sectionHtml, path)
  if (!el) return null
  if (useOuter) el.outerHTML = html
  else el.innerHTML = html
  return doc.body.innerHTML
}

export const parseTableValues = (tableHtml) => {
  const v = {
    widthValue: 100,
    widthUnit: '%',
    align: 'left',
    applyBorder: false,
    borderWidth: 1,
    borderColor: '#000000',
    borderCollapse: true,
    applyPadding: false,
    cellPadding: 5,
  }
  const t = new DOMParser().parseFromString(tableHtml, 'text/html').body
    .firstElementChild
  if (!t) return v
  const w = (t.style.width || '').trim()
  if (w.endsWith('px')) {
    v.widthUnit = 'px'
    v.widthValue = parseFloat(w) || null
  } else if (w.endsWith('%')) {
    v.widthUnit = '%'
    v.widthValue = parseFloat(w) || null
  } else if (w === 'auto') {
    v.widthValue = null
  }
  const ml = t.style.marginLeft
  const mr = t.style.marginRight
  const al = t.getAttribute('align')
  if (al === 'center' || (ml === 'auto' && mr === 'auto')) v.align = 'center'
  else if (al === 'right' || (ml === 'auto' && mr && mr !== 'auto')) v.align = 'right'
  else v.align = 'left'
  v.borderCollapse = (t.style.borderCollapse || 'collapse') !== 'separate'
  const cell = t.querySelector('td, th')
  const pad = parseFloat(cell?.style.padding || cell?.style.paddingTop || '')
  if (!Number.isNaN(pad)) v.cellPadding = pad
  return v
}

export const applyTableProps = (sectionHtml, path, v) => {
  const { doc, el: t } = navigate(sectionHtml, path)
  if (!t) return null
  t.style.width = v.widthValue == null ? 'auto' : `${v.widthValue}${v.widthUnit}`
  t.removeAttribute('align')
  if (v.align === 'center') {
    t.style.marginLeft = 'auto'
    t.style.marginRight = 'auto'
  } else if (v.align === 'right') {
    t.style.marginLeft = 'auto'
    t.style.marginRight = '0'
  } else {
    t.style.marginLeft = '0'
    t.style.marginRight = 'auto'
  }
  t.style.borderCollapse = v.borderCollapse ? 'collapse' : 'separate'
  if (v.applyBorder) {
    const cells = t.querySelectorAll('td, th')
    if (v.borderWidth > 0) {
      const b = `${v.borderWidth}px solid ${v.borderColor}`
      t.style.border = b
      t.setAttribute('border', String(v.borderWidth))
      cells.forEach((c) => (c.style.border = b))
    } else {
      t.style.border = 'none'
      t.removeAttribute('border')
      cells.forEach((c) => (c.style.border = 'none'))
    }
  }
  if (v.applyPadding) {
    t.querySelectorAll('td, th').forEach(
      (c) => (c.style.padding = `${v.cellPadding}px`)
    )
  }
  return doc.body.innerHTML
}
