import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Card, Button, Space, Typography, Select, Tag, List, Empty, message,
} from 'antd'
import { AimOutlined } from '@ant-design/icons'
import { Editor } from '@tinymce/tinymce-react'
import { TINY_INIT, attachWordPaste } from '../tinymce-setup'
import { runSectionSpellCheck, annotateSectionHtml } from '../lib/sectionSpell'

const { Title, Text } = Typography

// Nội dung mẫu có sẵn vài lỗi để thử ngay.
const SAMPLE_HTML = `<h1 style="color:#1a3c6e;font-family:Georgia,serif;">Báo cáo kỹ thuật quý III</h1>
<p style="font-size:15px;line-height:1.7;">Tôi đi hoc ở truong đại hoc. Hôm nay trời rất đẹp và tôi cảm thấy vui vẽ.</p>
<p>Căn cứ <strong>Luật Đo đạc và bản đồ</strong>, cơ quan quản lý phải tuân thũ quy định.</p>
<ul><li>Mục tiêu 1: hoàn thiện chuẩn dữ liệu</li><li>Mục tiêu 2: tích hợp trình soạn thảo</li></ul>`

// CSS tô lỗi, nhúng vào iframe nội dung của TinyMCE (content_style).
const SPELL_CONTENT_CSS = `
mark.sp-hl{cursor:pointer;border-radius:2px;padding:0 1px;color:inherit;background:#fff1f0;border-bottom:2px solid #ff4d4f;}
mark.sp-hl.sp-suspect{background:#fffbe6;border-bottom:2px dashed #faad14;}
mark.sp-hl:hover{filter:brightness(0.92);}
.sp-hl--active{box-shadow:0 0 0 2px rgba(22,119,255,.5);}
.sp-hl--flash{animation:spHlFlash 1.2s ease;}
@keyframes spHlFlash{0%,100%{box-shadow:0 0 0 0 rgba(255,77,79,0);}30%{box-shadow:0 0 0 6px rgba(255,77,79,.35);}}
`

// Gỡ CHỈ các thẻ <mark class="sp-hl"> do kiểm tra chèn vào (unwrap, giữ nguyên text
// con và mọi thẻ/thuộc tính khác) -> nội dung dữ liệu KHÔNG đổi, chỉ mất lớp tô lỗi.
const stripMarksFromHtml = (html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('mark.sp-hl').forEach((m) => m.replaceWith(...m.childNodes))
  return doc.body.innerHTML
}

export default function TinySpellCheck() {
  const editorRef = useRef(null)
  const spellResultRef = useRef(null) // cho handler bind-1-lần đọc issue mới nhất

  const [topK, setTopK] = useState(3)
  const [loading, setLoading] = useState(false)
  const [spellResult, setSpellResult] = useState(null) // { issues, model, totalMs }
  const [navIndex, setNavIndex] = useState(0)
  const [markPopover, setMarkPopover] = useState(null) // { top, left, issue }
  const progressNotifRef = useRef(null)

  useEffect(() => { spellResultRef.current = spellResult }, [spellResult])

  // Thông báo hiển thị NGAY TRONG editor (dưới menubar/toolbar "Công cụ") bằng
  // notificationManager của TinyMCE — không dùng toast nổi ngoài editor.
  const notify = (type, text, timeout = 3000) => {
    const editor = editorRef.current
    if (editor?.notificationManager) editor.notificationManager.open({ text, type, timeout })
    else message[type]?.(text) // fallback hiếm khi editor chưa init
  }

  const orderedIssues = useMemo(() => {
    if (!spellResult) return []
    return [...spellResult.issues].sort(
      (a, b) => a.nodeIndex - b.nodeIndex || a.localStart - b.localStart,
    )
  }, [spellResult])

  const hasIssues = !!(spellResult && spellResult.issues.length)

  // ===== Tiện ích thao tác trực tiếp trên DOM editor =====
  const liveMarks = () => [...(editorRef.current?.getBody()?.querySelectorAll('mark.sp-hl') || [])]

  const stripMarks = () => {
    const editor = editorRef.current
    if (!editor) return
    liveMarks().forEach((m) => editor.dom.remove(m, true)) // gỡ thẻ, giữ text
  }

  const flashMark = (mark, active) => {
    if (!mark) return
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (active) {
      liveMarks().forEach((m) => m.classList.remove('sp-hl--active'))
      mark.classList.add('sp-hl--active')
    }
    mark.classList.add('sp-hl--flash')
    setTimeout(() => mark.classList.remove('sp-hl--flash'), 1200)
  }

  // ===== Kiểm tra chính tả (editor luôn ở chế độ sửa) =====
  const handleCheck = async () => {
    const editor = editorRef.current
    if (!editor) return
    stripMarks() // bỏ tô lỗi cũ trước khi kiểm tra lại
    const cleanHtml = editor.getContent()
    if (!cleanHtml.trim()) { notify('warning', 'Chưa có nội dung để kiểm tra'); return }

    setLoading(true)
    setMarkPopover(null)
    // Thông báo tiến độ NGAY TRONG editor (persistent, tự đóng khi xong).
    progressNotifRef.current = editor.notificationManager.open({
      text: 'Đang kiểm tra chính tả…', type: 'info', timeout: 0, closeButton: false,
    })
    try {
      const r = await runSectionSpellCheck(
        [{ html: cleanHtml }],
        topK,
        (done, total) => {
          if (progressNotifRef.current) progressNotifRef.current.text = `Đang kiểm tra chính tả… ${done}/${total}`
        },
      )
      // Chèn <mark> quanh lỗi rồi nạp lại — editor VẪN sửa được bình thường.
      editor.undoManager.transact(() => {
        editor.setContent(r.issues.length ? annotateSectionHtml(cleanHtml, r.issues) : cleanHtml)
      })
      setSpellResult(r)
      setNavIndex(0)
      notify(r.issues.length ? 'warning' : 'success',
        r.issues.length ? `Tìm thấy ${r.issues.length} lỗi — dùng “Lỗi trước/Lỗi sau” để duyệt` : 'Không phát hiện lỗi')
      if (r.issues.length) setTimeout(() => gotoIndex(0), 60) // nhảy tới lỗi đầu
    } catch (err) {
      notify('error', `Kiểm tra thất bại: ${err.message || err}`, 6000)
    } finally {
      setLoading(false)
      try { progressNotifRef.current?.close() } catch { /* đã đóng */ }
      progressNotifRef.current = null
    }
  }

  // Xoá 1 issue khỏi danh sách (mark đã được xử lý trên DOM).
  const removeIssue = (id) =>
    setSpellResult((prev) => (prev ? { ...prev, issues: prev.issues.filter((i) => i.id !== id) } : prev))

  const applySuggestion = (issue, replacement) => {
    const editor = editorRef.current
    const mark = editor?.getBody()?.querySelector(`mark.sp-hl[data-iid="${CSS.escape(issue.id)}"]`)
    if (!mark) { notify('error', 'Không tìm thấy vị trí lỗi trong editor (nội dung đã đổi?)'); return }
    editor.undoManager.transact(() => {
      mark.textContent = replacement
      editor.dom.remove(mark, true) // gỡ mark, giữ lại text đã sửa
    })
    removeIssue(issue.id)
    setMarkPopover(null)
    notify('success', `Đã sửa "${issue.original}" → "${replacement}"`)
  }

  const ignoreIssue = (issue) => {
    const editor = editorRef.current
    const mark = editor?.getBody()?.querySelector(`mark.sp-hl[data-iid="${CSS.escape(issue.id)}"]`)
    if (mark) editor.undoManager.transact(() => editor.dom.remove(mark, true))
    removeIssue(issue.id)
    setMarkPopover(null)
  }

  // Tắt chế độ kiểm tra: gỡ toàn bộ highlight (giữ nguyên text) + đóng danh sách lỗi.
  const clearHighlights = () => {
    editorRef.current?.undoManager.transact(() => stripMarks())
    setSpellResult(null)
    setMarkPopover(null)
    notify('info', 'Đã tắt kiểm tra chính tả (đã bỏ tô lỗi, nội dung giữ nguyên)')
  }

  // Lưu: lấy nội dung hiện tại, BỎ HẾT thẻ <mark> (chỉ gỡ lớp tô lỗi, không đổi dữ liệu),
  // nạp lại bản sạch vào editor và copy HTML sạch ra clipboard.
  const handleSave = () => {
    const editor = editorRef.current
    if (!editor) return
    const clean = stripMarksFromHtml(editor.getContent())
    editor.undoManager.transact(() => editor.setContent(clean))
    setSpellResult(null)
    setMarkPopover(null)
    navigator.clipboard?.writeText(clean).catch(() => {})
    notify('success', 'Đã lưu — đã bỏ toàn bộ thẻ mark, giữ nguyên nội dung (HTML sạch đã copy).')
  }

  // ===== Điều hướng lần lượt theo thứ tự tài liệu (mark sống) =====
  const gotoIndex = (i) => {
    const marks = liveMarks()
    if (!marks.length) return
    const idx = ((i % marks.length) + marks.length) % marks.length
    setNavIndex(idx)
    flashMark(marks[idx], true)
  }
  const gotoIssue = (issue) => {
    const marks = liveMarks()
    const idx = marks.findIndex((m) => m.getAttribute('data-iid') === issue.id)
    if (idx >= 0) gotoIndex(idx)
  }

  // ===== Refs để nút toolbar/menu (đăng ký 1 lần) gọi handler mới nhất =====
  const checkRef = useRef(null); checkRef.current = handleCheck
  const prevRef = useRef(null); prevRef.current = () => gotoIndex(navIndex - 1)
  const nextRef = useRef(null); nextRef.current = () => gotoIndex(navIndex + 1)
  const clearRef = useRef(null); clearRef.current = clearHighlights
  const saveRef = useRef(null); saveRef.current = handleSave
  const hasIssuesRef = useRef(false); hasIssuesRef.current = hasIssues

  // Cập nhật trạng thái bật/tắt nút toolbar sau mỗi thay đổi.
  useEffect(() => { editorRef.current?.dispatch?.('SpellStateChange') }, [spellResult])

  const initConfig = useMemo(() => ({
    ...TINY_INIT,
    content_style: `${TINY_INIT.content_style}\n${SPELL_CONTENT_CSS}`,
    menubar: 'tools',
    menu: { tools: { title: 'Công cụ', items: 'spellcheck | spellprev spellnext | spelloff spellsave' } },
    toolbar: `spellcheck spellprev spellnext | spelloff spellsave | ${TINY_INIT.toolbar}`,
    setup: (editor) => {
      const withState = (api) => {
        const upd = () => api.setEnabled(hasIssuesRef.current)
        upd()
        editor.on('SpellStateChange', upd)
        return () => editor.off('SpellStateChange', upd)
      }
      editor.ui.registry.addButton('spellcheck', {
        text: 'Kiểm tra lỗi', icon: 'spell-check', tooltip: 'Kiểm tra chính tả',
        onAction: () => checkRef.current?.(),
      })
      editor.ui.registry.addButton('spellprev', {
        text: 'Lỗi trước', icon: 'action-prev', tooltip: 'Tới lỗi trước',
        onAction: () => prevRef.current?.(), onSetup: withState,
      })
      editor.ui.registry.addButton('spellnext', {
        text: 'Lỗi sau', icon: 'action-next', tooltip: 'Tới lỗi tiếp theo',
        onAction: () => nextRef.current?.(), onSetup: withState,
      })
      editor.ui.registry.addButton('spelloff', {
        text: 'Tắt kiểm tra', icon: 'remove', tooltip: 'Tắt kiểm tra: bỏ tô lỗi (giữ nguyên nội dung)',
        onAction: () => clearRef.current?.(), onSetup: withState,
      })
      editor.ui.registry.addButton('spellsave', {
        text: 'Lưu', icon: 'save', tooltip: 'Lưu: bỏ hết thẻ <mark>, giữ nguyên nội dung',
        onAction: () => saveRef.current?.(),
      })
      // Menu tương ứng
      editor.ui.registry.addMenuItem('spellcheck', {
        text: 'Kiểm tra chính tả', icon: 'spell-check', onAction: () => checkRef.current?.(),
      })
      editor.ui.registry.addMenuItem('spellprev', {
        text: 'Lỗi trước', icon: 'action-prev', onAction: () => prevRef.current?.(),
      })
      editor.ui.registry.addMenuItem('spellnext', {
        text: 'Lỗi tiếp theo', icon: 'action-next', onAction: () => nextRef.current?.(),
      })
      editor.ui.registry.addMenuItem('spelloff', {
        text: 'Tắt kiểm tra (bỏ tô lỗi)', icon: 'remove', onAction: () => clearRef.current?.(),
      })
      editor.ui.registry.addMenuItem('spellsave', {
        text: 'Lưu (bỏ thẻ mark)', icon: 'save', onAction: () => saveRef.current?.(),
      })
    },
  }), [])

  // Click vào <mark> trong iframe -> popover gợi ý cạnh từ đó.
  const handleEditorInit = (_evt, editor) => {
    editorRef.current = editor
    attachWordPaste(editor)
    editor.on('click', (e) => {
      const mark = e.target.closest?.('mark.sp-hl')
      if (!mark) { setMarkPopover(null); return }
      const iid = mark.getAttribute('data-iid')
      const issue = spellResultRef.current?.issues.find((i) => i.id === iid)
      if (!issue) return
      const iframe = editor.iframeElement
      const ir = iframe.getBoundingClientRect()
      const mr = mark.getBoundingClientRect()
      setMarkPopover({ top: ir.top + mr.bottom + 4, left: ir.left + mr.left, issue })
    })
  }

  const issueTag = (issue) => (
    <Tag color={issue.severity === 'confident' ? 'red' : 'gold'}>
      {issue.kind === 'non_word' ? 'Sai từ' : 'Nghi ngữ cảnh'}
    </Tag>
  )

  return (
    <div>
      <Title level={3}>Kiểm tra chính tả trong TinyMCE</Title>
      <Text type="secondary">
        Soạn thảo trực tiếp bên dưới. Bấm <b>Kiểm tra lỗi</b> (trên thanh công cụ) để tô lỗi
        ngay trong editor — bạn vẫn <b>sửa được bình thường</b>. Dùng <b>Lỗi trước / Lỗi sau</b>
        để nhảy lần lượt tới từng lỗi, hoặc bấm vào từ tô màu để chọn gợi ý.
      </Text>

      <Card
        style={{ marginTop: 16 }}
        styles={{ body: { paddingBottom: 12 } }}
        title={
          <Space wrap>
            <Text strong>Trình soạn thảo</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Nút chức năng &amp; thông báo nằm trên thanh công cụ / menu <b>Công cụ</b> của editor.
            </Text>
          </Space>
        }
        extra={
          <Space size={4}>
            <Text type="secondary">Gợi ý (top_k):</Text>
            <Select
              size="small"
              value={topK}
              onChange={setTopK}
              style={{ width: 64 }}
              options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
            />
          </Space>
        }
      >
        <Editor onInit={handleEditorInit} initialValue={SAMPLE_HTML} init={initConfig} />
      </Card>

      {spellResult && (
        <Card
          size="small"
          title={
            <Text strong>
              Kết quả: {spellResult.issues.length} lỗi
              {spellResult.model ? ` · ${spellResult.model}` : ''}
              {spellResult.totalMs ? ` · ${spellResult.totalMs.toFixed(0)} ms` : ''}
            </Text>
          }
          style={{ marginTop: 16 }}
        >
          {spellResult.issues.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không còn lỗi" />
          ) : (
            <List
              size="small"
              dataSource={orderedIssues}
              pagination={orderedIssues.length > 10 ? { pageSize: 10, size: 'small' } : false}
              renderItem={(issue) => (
                <List.Item>
                  <Space wrap size={6}>
                    {issueTag(issue)}
                    <Text delete>{issue.original}</Text>
                    <Button type="text" size="small" icon={<AimOutlined />} onClick={() => gotoIssue(issue)}>
                      Tới lỗi
                    </Button>
                    {issue.suggestions.length === 0 ? (
                      <Text type="secondary">Không có gợi ý</Text>
                    ) : (
                      issue.suggestions.map((s, si) => (
                        <Button key={si} size="small" type="primary" ghost onClick={() => applySuggestion(issue, s.replacement)}>
                          {s.replacement}
                          <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                            {(s.confidence * 100).toFixed(0)}%
                          </Text>
                        </Button>
                      ))
                    )}
                    <Button size="small" type="text" onClick={() => ignoreIssue(issue)}>Bỏ qua</Button>
                  </Space>
                </List.Item>
              )}
            />
          )}
        </Card>
      )}

      {markPopover && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }} onClick={() => setMarkPopover(null)} />
          <div
            style={{
              position: 'fixed', top: markPopover.top, left: markPopover.left, zIndex: 1001,
              background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8,
              boxShadow: '0 6px 20px rgba(0,0,0,0.15)', padding: 8, minWidth: 200,
            }}
          >
            <div style={{ marginBottom: 6 }}>
              {issueTag(markPopover.issue)}
              <Text strong>{markPopover.issue.original}</Text>
            </div>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              {markPopover.issue.suggestions.length === 0 ? (
                <Text type="secondary">Không có gợi ý</Text>
              ) : (
                markPopover.issue.suggestions.map((s, si) => (
                  <Button key={si} block size="small" style={{ textAlign: 'left' }} onClick={() => applySuggestion(markPopover.issue, s.replacement)}>
                    {s.replacement} ({(s.confidence * 100).toFixed(0)}%)
                  </Button>
                ))
              )}
              <Button type="link" size="small" style={{ paddingLeft: 0 }} onClick={() => ignoreIssue(markPopover.issue)}>
                Bỏ qua
              </Button>
            </Space>
          </div>
        </>
      )}
    </div>
  )
}
