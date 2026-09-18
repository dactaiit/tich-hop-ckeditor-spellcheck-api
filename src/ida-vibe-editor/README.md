# IdaVibeEditor

Trình soạn thảo nội dung theo **section** cho React 18 + Ant Design 5. Giữ nguyên
HTML/style gốc, sửa theo **đối tượng** (đoạn, ô bảng, bảng, danh sách…), **dán từ
Word** giữ định dạng, và **kiểm tra chính tả tiếng Việt** với tô lỗi inline.

## Tính năng

- Nạp HTML → tách thành các **section** (unwrap `<div>` bọc rỗng), giữ nguyên inline style.
- Sửa **cả section**, hoặc **đối tượng con** (bấm vào nội dung → chọn đoạn/ô/bảng/ul/li…).
  Chỉ đối tượng được chọn thay đổi, **cấu trúc & style xung quanh giữ nguyên**.
- **Thuộc tính bảng**: width, canh bảng, viền, padding, border-collapse.
- **Dán từ Word (web layout)**: giữ font/size/màu/bold, map heading, bỏ rác `mso-*`.
- **Kiểm tra chính tả**: tô lỗi **inline không phá HTML** (mark chỉ ở bản hiển thị),
  điều hướng first/next, popup gợi ý sửa. Batch ≤ 4000 ký tự.
- Header **dính khi cuộn** + **nút Lưu ở header và footer**. Vùng nội dung cuộn với
  `maxHeight` (mặc định 900px).

## Cài đặt phụ thuộc

Component dùng: `antd`, `@ant-design/icons`, `@tinymce/tinymce-react`, `tinymce`
(self-host, cấu hình ở `src/tinymce-setup.js`). CSS nội dung dùng chung từ
`src/index.css` (các class `section-*`, `obj-picker*`, `sp-hl`, `sec-btn`).

## Dùng nhanh

```jsx
import { useRef } from 'react'
import IdaVibeEditor from '@/ida-vibe-editor'

function Demo() {
  const editorRef = useRef(null)

  return (
    <IdaVibeEditor
      ref={editorRef}
      value="<p>Nội dung ban đầu</p>"
      maxHeight={900}
      spellApi="/spell"
      onChange={(html) => console.log('changed:', html)}
      onSave={(html) => fetch('/api/save', { method: 'POST', body: html })}
    />
  )
}
```

## Props

| Prop | Kiểu | Mặc định | Mô tả |
|------|------|----------|-------|
| `value` | `string` | `''` | HTML **ban đầu** (uncontrolled). Đổi nội dung sau đó dùng `ref.setData()`. |
| `onChange` | `(html: string) => void` | — | Gọi mỗi khi nội dung đổi. `html` là HTML **sạch** (không có mark lỗi). |
| `onSave` | `(html: string) => void` | — | Gọi khi bấm **Lưu** (header hoặc footer). |
| `maxHeight` | `number` | `900` | Chiều cao tối đa (px) của vùng nội dung cuộn. |
| `spellApi` | `string` | env `VITE_SPELL_API` / `'/spell'` | Endpoint base của API chính tả. Gọi `POST ${spellApi}/v1/spell-check`. |
| `spellCheckEnabled` | `boolean` | `true` | Ẩn/hiện nút kiểm tra chính tả. |
| `spellTopK` | `number` | `3` | Số gợi ý mỗi lỗi (1–5). |
| `title` | `string` | — | Tiêu đề hiển thị ở header. |

## Ref API

```js
editorRef.current.getData()        // -> HTML sạch hiện tại (string)
editorRef.current.setData(html)    // nạp HTML mới (tách lại section)
```

## Input / Output

- **Input**: `value` (khởi tạo) hoặc `ref.setData(html)` (nạp động, vd sau khi
  import .doc/.docx).
- **Output**: `onChange(html)` phát liên tục; `onSave(html)` khi bấm Lưu;
  `ref.getData()` lấy tức thời. **HTML xuất ra luôn sạch** — markup tô lỗi
  không bao giờ được ghi vào nội dung.

## Cấu hình endpoint chính tả

API `Vietnamese Hybrid Spell Checker` **không có CORS** → cần proxy cùng origin.
Trong `vite.config.js`:

```js
server: {
  proxy: {
    '/spell': {
      target: 'http://<host>:<port>',
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/spell/, ''),
    },
  },
}
```

Rồi truyền `spellApi="/spell"` (hoặc để mặc định). Production: đặt `VITE_SPELL_API`
hoặc dựng reverse-proxy. Chi tiết API: `docs/spell-check-api.md`.

## Lưu ý

- Component **uncontrolled**: `value` chỉ dùng lúc khởi tạo. Dùng `ref.setData()`
  để cập nhật từ ngoài, tránh vòng lặp controlled.
- Import `.doc`/`.docx` **không** nằm trong component (thuộc app). Xem trang ví dụ
  `src/pages/DocComposer.jsx`: import xong gọi `ref.setData(html)`.
