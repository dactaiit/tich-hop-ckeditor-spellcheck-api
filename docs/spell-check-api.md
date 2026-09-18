# Vietnamese Hybrid Spell Checker API

API kiểm tra chính tả tiếng Việt (mô hình hybrid n-gram, chuyên ngành pháp lý).

- **Base URL:** `http://124.197.20.172:8760`
- **OpenAPI:** `GET /openapi.json` · **Swagger UI:** `GET /docs`
- **Phiên bản OpenAPI:** 3.1.0 · **App version:** 0.1.0
- **Model version (hiện tại):** `vi-hybrid-ngram-legal-1.0.0`
- **Content-Type:** `application/json` (khuyến nghị kèm `charset=utf-8`)
- **Xác thực:** không yêu cầu (theo spec hiện tại)

> ⚠️ Đây là IP nội bộ (`124.197.20.172:8760`). Client phải cùng mạng/VPN mới truy cập được.

---

## Tổng quan endpoint

| Method | Path | Mục đích |
|--------|------|----------|
| `POST` | `/v1/spell-check` | Kiểm tra chính tả một đoạn văn bản |
| `GET`  | `/health/live` | Liveness probe (tiến trình còn sống) |
| `GET`  | `/health/ready` | Readiness probe (model đã nạp xong) |

---

## `POST /v1/spell-check`

Kiểm tra chính tả và trả về danh sách lỗi kèm gợi ý sửa.

### Request body — `SpellCheckRequest`

| Trường | Kiểu | Bắt buộc | Mặc định | Ràng buộc | Mô tả |
|--------|------|:--------:|----------|-----------|-------|
| `text` | string | không | `""` | tối đa **20000** ký tự | Văn bản cần kiểm tra |
| `top_k` | integer | không | `3` | **1 – 5** | Số gợi ý tối đa cho mỗi lỗi |

> `additionalProperties: false` — gửi thêm field lạ sẽ bị lỗi validation (422).

```json
{
  "text": "Tôi đi hoc ở truong đại hoc",
  "top_k": 3
}
```

### Response `200` — `SpellCheckResponse`

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `model_version` | string | Phiên bản model đã dùng |
| `offset_unit` | string | Luôn là `"unicode_codepoint"` — đơn vị của `start`/`end` |
| `processing_ms` | number | Thời gian xử lý (mili giây) |
| `issues` | `IssueResponse[]` | Danh sách lỗi phát hiện được |

#### `IssueResponse`

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|:--------:|-------|
| `start` | integer | ✅ | Vị trí bắt đầu (theo code point, **bao gồm**) |
| `end` | integer | ✅ | Vị trí kết thúc (theo code point, **loại trừ**) |
| `original` | string | ✅ | Chuỗi gốc bị nghi lỗi |
| `kind` | enum | ✅ | `non_word` \| `real_word` |
| `confidence` | number | ✅ | Độ tin cậy đây là lỗi (0–1) |
| `suggestions` | `SuggestionResponse[]` | ✅ | Gợi ý thay thế (nhiều nhất `top_k`) |
| `severity` | enum | — (mặc định `confident`) | `confident` \| `suspect` |

#### `SuggestionResponse`

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|:--------:|-------|
| `replacement` | string | ✅ | Chuỗi thay thế đề xuất |
| `confidence` | number | ✅ | Độ tin cậy của gợi ý (0–1) |
| `score_delta` | number | ✅ | Chênh lệch điểm so với chuỗi gốc (dương = tốt hơn) |

#### Bảng giá trị enum

| Enum | Giá trị | Ý nghĩa |
|------|---------|---------|
| `kind` | `non_word` | Từ không tồn tại trong từ điển (sai rõ ràng) |
| `kind` | `real_word` | Từ có thật nhưng nghi sai ngữ cảnh |
| `severity` | `confident` | Chắc chắn là lỗi → nên tô/đề xuất mạnh |
| `severity` | `suspect` | Nghi ngờ → nên tô nhạt/cảnh báo mềm |

### Ví dụ response thật

Request: `{"text":"Tôi đi hoc ở truong đại hoc","top_k":3}`

```json
{
  "model_version": "vi-hybrid-ngram-legal-1.0.0",
  "offset_unit": "unicode_codepoint",
  "processing_ms": 25.377,
  "issues": [
    {
      "start": 0, "end": 3, "original": "Tôi",
      "kind": "real_word", "confidence": 0.620335, "severity": "suspect",
      "suggestions": [
        { "replacement": "Tội", "confidence": 0.620335, "score_delta": 1.039165 },
        { "replacement": "Tới", "confidence": 0.232178, "score_delta": -0.985268 }
      ]
    },
    {
      "start": 7, "end": 10, "original": "hoc",
      "kind": "real_word", "confidence": 1.0, "severity": "confident",
      "suggestions": [
        { "replacement": "học", "confidence": 1.0, "score_delta": 27.548138 }
      ]
    },
    {
      "start": 13, "end": 19, "original": "truong",
      "kind": "non_word", "confidence": 0.999981, "severity": "confident",
      "suggestions": [
        { "replacement": "trường", "confidence": 0.999981, "score_delta": 12.816044 },
        { "replacement": "chương", "confidence": 0.977082, "score_delta": 4.253190 },
        { "replacement": "trưởng", "confidence": 0.975531, "score_delta": 4.172710 }
      ]
    },
    {
      "start": 24, "end": 27, "original": "hoc",
      "kind": "real_word", "confidence": 1.0, "severity": "confident",
      "suggestions": [
        { "replacement": "học", "confidence": 1.0, "score_delta": 27.548138 }
      ]
    }
  ]
}
```

### Lỗi `422` — `HTTPValidationError`

Trả về khi body sai schema (vd `text` quá 20000 ký tự, `top_k` ngoài 1–5, field lạ).

```json
{
  "detail": [
    { "loc": ["body", "top_k"], "msg": "Input should be less than or equal to 5", "type": "less_than_equal" }
  ]
}
```

### Lỗi `400`
`{"detail":"There was an error parsing the body"}` — body không phải JSON hợp lệ hoặc **UTF‑8 bị hỏng**. Với văn bản tiếng Việt, hãy đảm bảo gửi đúng UTF‑8 (xem lưu ý ở cuối).

---

## `GET /health/live`

Kiểm tra tiến trình còn sống. Response `200`, object `{ [key]: string }`.

```json
{ "status": "ok" }
```

## `GET /health/ready`

Kiểm tra model đã sẵn sàng. Response `200`, object `{ [key]: string }`.

```json
{ "status": "ready", "model_version": "vi-hybrid-ngram-legal-1.0.0" }
```

---

## Ví dụ gọi API

### cURL

```bash
curl -X POST "http://124.197.20.172:8760/v1/spell-check" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"text":"Tôi đi hoc ở truong đại hoc","top_k":3}'
```

> Trên Windows/PowerShell, ký tự tiếng Việt có thể bị escape sai khi truyền trực tiếp.
> Nên ghi body ra file UTF‑8 rồi gửi: `curl ... --data-binary @body.json`.

### JavaScript (fetch)

```js
async function spellCheck(text, topK = 3) {
  const res = await fetch('http://124.197.20.172:8760/v1/spell-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, top_k: topK }),
  })
  if (!res.ok) throw new Error(`Spell-check API ${res.status}`)
  return res.json() // SpellCheckResponse
}
```

---

## Lưu ý quan trọng khi tích hợp

1. **Offset theo Unicode code point, `end` loại trừ.** `start`/`end` KHÔNG phải chỉ số byte.
   - Trong JavaScript, chỉ số chuỗi là UTF‑16 code unit. Với tiếng Việt (đều thuộc BMP,
     mỗi ký tự = 1 code unit) thì `text.slice(start, end)` **khớp**. Nếu văn bản có emoji /
     ký tự bổ sung (surrogate pair), hãy cắt theo code point:
     ```js
     const cp = Array.from(text)          // tách theo code point
     const original = cp.slice(start, end).join('')
     ```
2. **Giới hạn `text` 20000 ký tự.** Văn bản dài hơn phải chia nhỏ (theo câu/đoạn) rồi
   cộng dồn offset của từng đoạn.
3. **`top_k` trong khoảng 1–5.** Mặc định 3.
4. **Dùng `severity` để tô lỗi:** `confident` → tô đậm/gạch đỏ; `suspect` → cảnh báo nhẹ.
5. **`kind`:** `non_word` thường chắc chắn sai; `real_word` là nghi sai ngữ cảnh (cân nhắc dựa vào `confidence`).
6. **Sắp xếp gợi ý:** `suggestions` nên ưu tiên theo `confidence` / `score_delta` cao.
7. **Health checks:** dùng `/health/ready` trước khi cho phép gọi spell-check (đảm bảo model đã nạp).

---

*Tài liệu tạo từ `GET /openapi.json` + gọi thử thực tế ngày 2026-09-17.*
