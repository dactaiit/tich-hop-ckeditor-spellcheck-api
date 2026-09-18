# React 18 + Ant Design

Dự án khởi tạo với **React 18**, **Vite**, và thư viện giao diện **Ant Design 5**.

## Công nghệ

- React 18.3
- Vite 5
- Ant Design 5 + @ant-design/icons
- React Router 6

## Cài đặt

```bash
npm install
```

## Chạy môi trường phát triển

```bash
npm run dev        # chỉ frontend (http://localhost:3000)
npm run server     # chỉ convert server .doc (http://localhost:5175)
npm run dev:all    # chạy cả hai cùng lúc
```

Mặc định mở tại http://localhost:3000

## Kiểm tra chính tả — lưu ý về proxy (tránh lỗi "Failed to fetch")

API chính tả (`124.197.20.172:8760`) **không có CORS** nên frontend gọi qua đường dẫn
tương đối `/spell`, và **cần một proxy** chuyển tiếp. Proxy đã cấu hình trong
`vite.config.js` cho **cả `dev` và `preview`**. Do đó:

- `npm run dev` hoặc `npm run preview`: hoạt động (đã có proxy `/spell`, `/api`).
- Serve thư mục `dist` bằng host tĩnh khác (nginx, `serve`, mở file trực tiếp…):
  **KHÔNG có proxy** → gọi chính tả sẽ báo *"Không gọi được API kiểm tra chính tả…"*.
  Khi đó phải: (a) cấu hình reverse proxy `/spell → http://124.197.20.172:8760`
  (kèm rewrite bỏ tiền tố `/spell`), **hoặc** (b) build với biến `VITE_SPELL_API`
  trỏ thẳng tới endpoint có CORS, ví dụ:

  ```bash
  VITE_SPELL_API=https://spell.example.com npm run build
  ```

> `spellCheck()` nay báo lỗi rõ ràng khi không gọi được API hoặc endpoint trả về
> không phải JSON (thường do thiếu proxy) thay vì "Failed to fetch" khó hiểu.

## Import file trong trang "Test tích hợp"

| Định dạng | Cách xử lý | Độ trung thực |
|-----------|-----------|----------------|
| `.html` / `.htm` / `.xml` | Đọc nguyên vẹn (FileReader) | Cao |
| `.txt` | Bọc mỗi dòng thành `<p>` | — |
| `.docx` | Chuyển qua **mammoth** (client), có styleMap giữ định dạng | Trung bình–cao |
| `.doc` | POST lên convert server dùng **antiword** | Văn bản (không giữ layout) |

> Import `.doc` yêu cầu convert server đang chạy (`npm run server` hoặc `npm run dev:all`).
> Cần có `antiword` trên PATH; nếu ở nơi khác, đặt biến môi trường `ANTIWORD_BIN`.

## Tool: append Word (.doc/.docx) vào cuối HTML — giữ định dạng cao nhất

`tools/word-to-section.mjs` chuyển Word thành **một khối `<section>` HTML tự chứa**
(CSS đã scope, ảnh nhúng base64) để nối vào cuối một file HTML mà không làm hỏng
style trang đích. Dùng **LibreOffice headless** nên hỗ trợ cả `.doc` lẫn `.docx`
với độ trung thực cao nhất thực tế (bảng, canh lề, màu, font, ảnh).

> Yêu cầu: đã cài **LibreOffice**. Nếu `soffice` không nằm ở vị trí mặc định,
> đặt biến `SOFFICE_BIN` hoặc truyền `--soffice <path>`.

```bash
# In ra stdout
node tools/word-to-section.mjs 143976.doc

# Ghi section ra file riêng
node tools/word-to-section.mjs report.docx --out section.html

# Chèn thẳng vào trước </body> của file HTML đích
node tools/word-to-section.mjs 143976.doc --append dist/index.html

# Xuất ảnh ra thư mục thay vì nhúng base64 (section nhẹ hơn)
node tools/word-to-section.mjs 143976.doc --out out.html --assets ./assets
```

| Tùy chọn | Ý nghĩa |
|----------|---------|
| `--out <file>` | Ghi `<section>` ra file (mặc định in stdout) |
| `--append <target>` | Chèn vào trước `</body>` file đích (không có thì nối cuối file) |
| `--assets <dir>` | Xuất ảnh ra thư mục thay vì base64 |
| `--class <name>` | Đổi tên class wrapper (mặc định `word-import`) |
| `--soffice <path>` | Đường dẫn `soffice.exe` |

> **Lưu ý fidelity:** không engine nào giữ đúng 100% tuyệt đối (Word ≠ HTML: ngắt
> trang, tab-stop, font hệ thống…). Đây là mức cao nhất khả thi ở dạng "web layout"
> (dòng chảy liên tục, bỏ khổ giấy). Với ảnh base64, section có thể khá lớn — dùng
> `--assets` nếu cần nhẹ hơn.

### Dùng qua server / web app

Cùng lõi (`tools/word-to-section-core.mjs`) được nối vào convert server:

```
POST /api/word-to-section   (multipart, field "file"; nhận .doc hoặc .docx)
→ { html: "<section>…</section>", id, engine, bytes }
```

Trên web app, trang **Test tích hợp** có nút **"Import giữ layout (LibreOffice)"**:
upload `.doc/.docx` → gọi endpoint → hiển thị **Preview trung thực** trong iframe
(section được scope CSS nên không đụng style trang) và nút **Tải HTML** (xuất trang
HTML hoàn chỉnh). Section **không** nạp vào CKEditor vì editor sẽ sanitize mất
`<style>/<section>` (rớt scope) — muốn sửa trong editor thì dùng `Load file`/`Import .docx`.

> Cả CLI lẫn server đều cần LibreOffice. Nếu `soffice` không ở vị trí mặc định,
> đặt biến `SOFFICE_BIN` trước khi chạy `npm run server`.

### Batch theo thư mục (trang "Chuyển đổi thư mục")

Xử lý hàng loạt: mỗi văn bản là file `VB_XXX.html` có **thư mục cùng tên** `VB_XXX/`
chứa các phụ lục Word. Tool convert từng phụ lục và **append** vào cuối file HTML tương ứng.

```
<thư mục chọn>/
├─ VB_001.html      ← đích append
├─ VB_001/          ← thư mục cùng tên, chứa phụ lục
│   ├─ PL_01.docx
│   └─ PL_02.doc
├─ VB_002.html
└─ VB_002/ ...
```

> Lưu ý: **chọn đúng thư mục trực tiếp chứa** `X.html` + thư mục `X/`. Tên `X` bất kỳ
> (ví dụ thực tế `155207_content.html` + `155207_content/`), phụ lục có thể là `.doc` hoặc
> `.docx`, tên có dấu cách đều được.

Luồng (BFF): **frontend chọn thư mục ngay trên trình duyệt** (`webkitdirectory`) → gom file
(giữ đường dẫn tương đối) → upload lên **một endpoint** → backend convert & append rồi
**trả kết quả** (merged HTML) về để xem trước / tải. Backend không đọc/ghi đĩa người dùng.

```
POST /api/process-folder            # multipart:
  files    = <mỗi file .html / .doc / .docx>
  manifest = JSON mảng đường dẫn tương đối, CÙNG THỨ TỰ với files
             (busboy cắt phần thư mục trong filename nên phải gửi kèm manifest)
  ?force=1 = ghi đè section đã có (mặc định bỏ qua theo data-source)
→ { docs, report: [{ name, html, appended[], skipped[], errors[], bytes, merged }] }
```

Lõi thuần (không HTTP) để test/tự động hoá: `tools/folder-batch-core.mjs`
(`groupDocs(files)`, `processUploaded(files, { force })`).

## Build production

```bash
npm run build
npm run preview
```

## Cấu trúc thư mục

```
src/
├── main.jsx          # Điểm vào, cấu hình ConfigProvider (locale vi_VN, theme)
├── App.jsx           # Layout chính (Sider + Header + Content) + routing
├── index.css
└── pages/
    ├── Dashboard.jsx # Thẻ thống kê
    ├── Users.jsx     # Bảng + Modal thêm/xóa người dùng
    └── Settings.jsx  # Form cài đặt
```
