// Client cho Vietnamese Hybrid Spell Checker API.
// Xem docs/spell-check-api.md. API không có CORS nên gọi qua proxy (/spell) trong dev;
// production có thể override bằng VITE_SPELL_API hoặc tham số apiBase.
const DEFAULT_SPELL_API = import.meta.env.VITE_SPELL_API || '/spell'

// Gọi kiểm tra chính tả. apiBase: override endpoint (mặc định env / '/spell').
// Trả về SpellCheckResponse.
export async function spellCheck(text, topK = 3, apiBase) {
  const base = apiBase || DEFAULT_SPELL_API
  const res = await fetch(`${base}/v1/spell-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, top_k: topK }),
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const j = await res.json()
      if (j?.detail) msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch {
      // giữ msg mặc định
    }
    throw new Error(msg)
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
