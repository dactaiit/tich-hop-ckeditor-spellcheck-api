// Client cho Vietnamese Hybrid Spell Checker API.
// Xem docs/spell-check-api.md. API không có CORS nên gọi qua proxy (/spell) trong dev;
// production có thể override bằng VITE_SPELL_API hoặc tham số apiBase.
const DEFAULT_SPELL_API = import.meta.env.VITE_SPELL_API || '/spell'

// Gọi kiểm tra chính tả. apiBase: override endpoint (mặc định env / '/spell').
// Trả về SpellCheckResponse.
export async function spellCheck(text, topK = 3, apiBase) {
  const base = apiBase || DEFAULT_SPELL_API
  const url = `${base}/v1/spell-check`

  // 1) Lỗi mạng/CORS/không tới được endpoint -> fetch reject "Failed to fetch".
  //    Đổi thành thông báo rõ nguyên nhân + cách khắc phục.
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, top_k: topK }),
    })
  } catch (e) {
    throw new Error(
      `Không gọi được API kiểm tra chính tả (${url}). ` +
        `Kiểm tra: (a) API còn sống, (b) proxy "/spell" đang chạy (npm run dev / dev:all), ` +
        `hoặc đặt biến VITE_SPELL_API trỏ tới endpoint thật. Chi tiết: ${e.message}`
    )
  }

  const contentType = res.headers.get('content-type') || ''

  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    if (contentType.includes('application/json')) {
      try {
        const j = await res.json()
        if (j?.detail) msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
      } catch {
        // giữ msg mặc định
      }
    }
    throw new Error(msg)
  }

  // 2) Response 200 nhưng KHÔNG phải JSON: thường do "/spell" chưa được proxy nên
  //    static server trả về index.html (SPA fallback). Báo rõ thay vì lỗi parse khó hiểu.
  if (!contentType.includes('application/json')) {
    throw new Error(
      `API chính tả trả về không phải JSON (content-type: ${contentType || 'không rõ'}). ` +
        `Nhiều khả năng "/spell" chưa được proxy tới API — kiểm tra cấu hình proxy hoặc VITE_SPELL_API.`
    )
  }

  return res.json()
}

// Offset của API theo Unicode code point -> tách chuỗi theo code point cho an toàn
// (tiếng Việt thuộc BMP nên thường trùng chỉ số JS, nhưng emoji/ký tự bổ sung thì khác).
export const toCodepoints = (s) => Array.from(s)

// Áp một gợi ý: thay [start,end) bằng replacement, trả về text mới + delta độ dài.
export function applyReplacement(text, start, end, replacement) {
  const cp = Array.from(text)
  const repCp = Array.from(replacement)
  const nextText = [...cp.slice(0, start), ...repCp, ...cp.slice(end)].join('')
  const delta = repCp.length - (end - start)
  return { nextText, delta }
}
