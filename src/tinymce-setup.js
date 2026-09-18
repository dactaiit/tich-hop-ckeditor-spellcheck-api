// Self-host TinyMCE 8 (offline, không cần API key / CDN).
// Import side-effect: nạp core, model, theme, icons, skin và plugin vào bundle.
import 'tinymce/tinymce'
import 'tinymce/models/dom'
import 'tinymce/themes/silver'
import 'tinymce/icons/default'
import 'tinymce/skins/ui/oxide/skin.min.css'

// Plugin dùng cho trình soạn thảo block.
import 'tinymce/plugins/code'
import 'tinymce/plugins/lists'
import 'tinymce/plugins/advlist'
import 'tinymce/plugins/link'
import 'tinymce/plugins/image'
import 'tinymce/plugins/table'
import 'tinymce/plugins/searchreplace'
import 'tinymce/plugins/visualblocks'
import 'tinymce/plugins/wordcount'
import 'tinymce/plugins/fullscreen'
import 'tinymce/plugins/pagebreak'
import 'tinymce/plugins/charmap'

// CSS nội dung (bên trong iframe editor) — nạp dạng chuỗi để truyền qua content_style.
import contentUiCss from 'tinymce/skins/ui/oxide/content.min.css?inline'
import contentCss from 'tinymce/skins/content/default/content.min.css?inline'

export const TINY_CONTENT_STYLE = [contentUiCss, contentCss].join('\n')

// Map style heading của Word (bản web layout) -> thẻ heading của TinyMCE.
const WORD_HEADING_CLASS = {
  MsoTitle: 'h1',
  MsoHeading1: 'h1',
  MsoHeading2: 'h2',
  MsoHeading3: 'h3',
  MsoHeading4: 'h4',
  MsoHeading5: 'h5',
  MsoHeading6: 'h6',
}

const renameElement = (el, tag) => {
  const n = el.ownerDocument.createElement(tag)
  const style = el.getAttribute('style')
  if (style) n.setAttribute('style', style)
  n.innerHTML = el.innerHTML
  el.replaceWith(n)
  return n
}

// Dọn nội dung dán từ Word: bỏ thẻ office (o:p...), map heading, xóa mso-* &
// class Mso, gỡ span rỗng — GIỮ nguyên font/size/color/bold/căn lề/ảnh.
export const cleanWordPaste = (root) => {
  // 1) Bỏ thẻ namespace của Office (o:p, w:*, v:*...)
  Array.from(root.querySelectorAll('*')).forEach((el) => {
    if (el.nodeName.toLowerCase().includes(':')) el.remove()
  })
  // 2) Map <p class="MsoHeadingN/MsoTitle"> -> <hN>
  Array.from(root.querySelectorAll('p[class]')).forEach((p) => {
    const cls = p.getAttribute('class') || ''
    for (const key in WORD_HEADING_CLASS) {
      if (cls.indexOf(key) !== -1) {
        renameElement(p, WORD_HEADING_CLASS[key])
        break
      }
    }
  })
  // 3) Xóa style mso-*, bỏ class Mso/Xl, gỡ span rỗng
  Array.from(root.querySelectorAll('*')).forEach((el) => {
    const style = el.getAttribute('style')
    if (style) {
      const cleaned = style
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s && !/^mso-/i.test(s))
        .join('; ')
      if (cleaned) el.setAttribute('style', cleaned)
      else el.removeAttribute('style')
    }
    const cls = el.getAttribute('class')
    if (cls && /^(Mso|Xl)/i.test(cls)) el.removeAttribute('class')
    if (el.tagName === 'SPAN' && !el.attributes.length) {
      el.replaceWith(...el.childNodes)
    }
  })
  return root
}

// Bắt sự kiện paste: nếu là nội dung Word (có marker mso/office) thì tự dọn và
// chèn bằng insertContent (đi qua schema chính -> GIỮ font/size/color/bold).
// Đường paste mặc định của TinyMCE strip inline style khi phát hiện Word nên
// phải tự xử lý. Nội dung không phải Word để TinyMCE xử lý bình thường.
export const attachWordPaste = (editor) => {
  editor.on('paste', (e) => {
    const html = e.clipboardData && e.clipboardData.getData('text/html')
    if (!html || !/mso-|Mso[A-Z]|schemas-microsoft|urn:schemas/i.test(html)) return
    e.preventDefault()
    e.stopImmediatePropagation()
    const box = document.createElement('div')
    box.innerHTML = html
    cleanWordPaste(box)
    editor.insertContent(box.innerHTML)
  })
}

// Cấu hình ưu tiên GIỮ NGUYÊN style/thuộc tính của HTML nguồn.
export const TINY_INIT = {
  skin: false,
  content_css: false,
  content_style: TINY_CONTENT_STYLE,
  license_key: 'gpl',
  menubar: false,
  branding: false,
  height: 460,
  plugins:
    'code lists advlist link image table searchreplace visualblocks wordcount fullscreen pagebreak charmap',
  toolbar:
    'undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | link image table | removeformat code visualblocks fullscreen',
  // Không lọc bỏ element/thuộc tính -> giữ inline style, class, attribute gốc.
  valid_elements: '*[*]',
  extended_valid_elements: '*[*]',
  verify_html: false,
  entity_encoding: 'raw',
  convert_urls: false,
  // ===== Dán từ Word (web layout): giữ format, map heading/paragraph, giữ ảnh =====
  // Word được xử lý riêng qua attachWordPaste (bind trong onInit) để giữ style.
  paste_data_images: true, // giữ ảnh nhúng (embed) dưới dạng base64
  paste_merge_formats: true,
  smart_paste: true,
}
