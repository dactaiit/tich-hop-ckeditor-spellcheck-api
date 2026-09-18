import { useMemo, useRef, useState } from 'react'
import {
  Card,
  Button,
  Space,
  Typography,
  Input,
  Modal,
  Empty,
  message,
} from 'antd'
import {
  EditOutlined,
  PlusOutlined,
  CopyOutlined,
  DownloadOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { Editor } from '@tinymce/tinymce-react'
import { TINY_INIT } from '../tinymce-setup'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

const SAMPLE_HTML = `<h1 style="color:#1a3c6e;font-family:Georgia,serif;margin:0 0 12px;">Báo cáo kỹ thuật quý III</h1>
<p style="font-size:15px;line-height:1.7;color:#333;">Đây là đoạn mở đầu có <strong style="color:#c0392b;">phần nhấn mạnh</strong> và <em style="background:#fff3cd;">phần bôi nền vàng</em>. Bôi đen bất kỳ đoạn nào để hiện nút sửa.</p>
<table style="border-collapse:collapse;width:100%;font-size:14px;" border="1">
<thead><tr style="background:#1677ff;color:#fff;"><th style="padding:8px;">Hạng mục</th><th style="padding:8px;">Giá trị</th></tr></thead>
<tbody>
<tr><td style="padding:8px;border:1px solid #ccc;">Doanh thu</td><td style="padding:8px;border:1px solid #ccc;color:#2e7d32;font-weight:600;">11.28 tỷ</td></tr>
<tr><td style="padding:8px;border:1px solid #ccc;">Chi phí</td><td style="padding:8px;border:1px solid #ccc;color:#c62828;">6.40 tỷ</td></tr>
</tbody>
</table>
<blockquote style="border-left:4px solid #1677ff;margin:16px 0;padding:4px 16px;color:#555;font-style:italic;">"Chất lượng dữ liệu quyết định giá trị của báo cáo."</blockquote>
<ul style="color:#2c3e50;line-height:1.8;">
<li>Mục tiêu 1: hoàn thiện chuẩn dữ liệu</li>
<li>Mục tiêu 2: <span style="color:#8e44ad;font-weight:600;">tích hợp trình soạn thảo</span></li>
</ul>`

let seq = 0
const nextId = () => `sec-${(seq += 1)}`

// Tách HTML thành các block cấp cao nhất, giữ outerHTML để bảo toàn style.
const splitIntoBlocks = (html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks = []
  doc.body.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      blocks.push({ id: nextId(), html: node.outerHTML })
    } else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      blocks.push({ id: nextId(), html: `<p>${node.textContent.trim()}</p>` })
    }
  })
  return blocks
}

export default function SectionEditor() {
  const [source, setSource] = useState(SAMPLE_HTML)
  const [blocks, setBlocks] = useState(() => splitIntoBlocks(SAMPLE_HTML))
  const [editing, setEditing] = useState(null) // { mode:'edit'|'insert', index }
  const [selBtn, setSelBtn] = useState(null) // { index, top, left } — nút nổi khi bôi đen
  const sectionRef = useRef(null)
  const editorRef = useRef(null)

  const assembled = useMemo(() => blocks.map((b) => b.html).join('\n'), [blocks])

  const loadSource = () => {
    const next = splitIntoBlocks(source)
    setBlocks(next)
    setSelBtn(null)
    message.success(`Đã nạp ${next.length} đoạn vào section`)
  }

  // Bôi đen trong section -> tìm block chứa vùng chọn -> hiện nút "Sửa".
  const handleSelection = () => {
    const sel = window.getSelection()
    const container = sectionRef.current
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !container) {
      setSelBtn(null)
      return
    }
    const range = sel.getRangeAt(0)
    if (!container.contains(range.commonAncestorContainer)) {
      setSelBtn(null)
      return
    }
    let node = range.startContainer
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement
    const wrapper = node?.closest?.('[data-block-index]')
    if (!wrapper) {
      setSelBtn(null)
      return
    }
    const index = Number(wrapper.dataset.blockIndex)
    const rect = range.getBoundingClientRect()
    const crect = container.getBoundingClientRect()
    setSelBtn({
      index,
      top: rect.bottom - crect.top + 4,
      left: Math.max(0, rect.left - crect.left),
    })
  }

  const openEdit = (index) => {
    setEditing({ mode: 'edit', index })
    setSelBtn(null)
    window.getSelection()?.removeAllRanges()
  }

  const openInsert = (index) => {
    setEditing({ mode: 'insert', index })
    setSelBtn(null)
  }

  const handleSave = () => {
    const html = editorRef.current?.getContent() ?? ''
    if (editing.mode === 'edit') {
      setBlocks((prev) =>
        prev.map((b, i) => (i === editing.index ? { ...b, html } : b))
      )
      message.success(`Đã lưu đoạn #${editing.index + 1}`)
    } else if (html.trim()) {
      const block = { id: nextId(), html }
      setBlocks((prev) => {
        const next = [...prev]
        next.splice(editing.index, 0, block)
        return next
      })
      message.success('Đã chèn đoạn mới')
    }
    setEditing(null)
  }

  const copyAssembled = async () => {
    try {
      await navigator.clipboard.writeText(assembled)
      message.success('Đã copy HTML kết quả')
    } catch {
      message.error('Trình duyệt chặn clipboard')
    }
  }

  const downloadAssembled = () => {
    const blob = new Blob(
      [`<!doctype html><meta charset="utf-8">\n${assembled}`],
      { type: 'text/html;charset=utf-8' }
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'noi-dung.html'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Thanh chèn mảnh giữa các đoạn (hiện khi hover).
  const InsertBar = ({ index }) => (
    <div
      className="section-insert-bar"
      onClick={() => openInsert(index)}
      title="Chèn đoạn văn tại đây"
    >
      <span className="section-insert-bar__line" />
      <span className="section-insert-bar__btn">
        <PlusOutlined /> Chèn đoạn
      </span>
      <span className="section-insert-bar__line" />
    </div>
  )

  const editorInitialValue =
    editing?.mode === 'edit' ? blocks[editing.index]?.html ?? '' : ''

  return (
    <div>
      <Title level={3}>Sửa nội dung theo section</Title>
      <Text type="secondary">
        Nạp HTML vào section bên dưới. <b>Bôi đen</b> một đoạn để hiện nút sửa,
        hoặc bấm <b>Chèn đoạn</b> giữa các đoạn để soạn đoạn mới. Kết quả được ráp
        lại thành một khối HTML.
      </Text>

      {/* Nguồn HTML */}
      <Card
        size="small"
        title="1. HTML nguồn"
        style={{ marginTop: 16 }}
        extra={
          <Button icon={<ReloadOutlined />} type="primary" onClick={loadSource}>
            Nạp vào section
          </Button>
        }
      >
        <TextArea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          autoSize={{ minRows: 3, maxRows: 8 }}
          spellCheck={false}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
      </Card>

      {/* Section hiển thị + tương tác */}
      <Card
        size="small"
        title="2. Section nội dung"
        style={{ marginTop: 16 }}
        extra={
          <Button
            icon={<PlusOutlined />}
            onClick={() => openInsert(blocks.length)}
          >
            Chèn đoạn ở cuối
          </Button>
        }
      >
        {blocks.length === 0 ? (
          <Empty description="Section trống — nạp HTML hoặc chèn đoạn" />
        ) : (
          <div
            ref={sectionRef}
            className="section-surface"
            style={{ position: 'relative' }}
            onMouseUp={handleSelection}
          >
            <InsertBar index={0} />
            {blocks.map((block, index) => (
              <div key={block.id}>
                <div
                  data-block-index={index}
                  className="section-block"
                  dangerouslySetInnerHTML={{ __html: block.html }}
                />
                <InsertBar index={index + 1} />
              </div>
            ))}

            {selBtn && (
              <Button
                size="small"
                type="primary"
                icon={<EditOutlined />}
                style={{
                  position: 'absolute',
                  top: selBtn.top,
                  left: selBtn.left,
                  zIndex: 5,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => openEdit(selBtn.index)}
              >
                Sửa đoạn đã chọn
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* Kết quả */}
      <Card
        size="small"
        title="3. Kết quả ráp lại (một khối HTML)"
        style={{ marginTop: 16 }}
        extra={
          <Space>
            <Button icon={<CopyOutlined />} onClick={copyAssembled}>
              Copy HTML
            </Button>
            <Button icon={<DownloadOutlined />} onClick={downloadAssembled}>
              Tải .html
            </Button>
          </Space>
        }
      >
        <Paragraph type="secondary" style={{ marginBottom: 8 }}>
          Mã HTML:
        </Paragraph>
        <TextArea
          value={assembled}
          readOnly
          autoSize={{ minRows: 4, maxRows: 12 }}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
      </Card>

      {/* Modal TinyMCE */}
      <Modal
        title={
          editing?.mode === 'edit'
            ? `Sửa đoạn #${(editing?.index ?? 0) + 1}`
            : 'Chèn đoạn văn mới'
        }
        open={editing !== null}
        onOk={handleSave}
        onCancel={() => setEditing(null)}
        okText={editing?.mode === 'edit' ? 'Lưu' : 'Chèn'}
        cancelText="Hủy"
        width={920}
        destroyOnClose
        maskClosable={false}
      >
        {editing && (
          <Editor
            onInit={(_evt, editor) => (editorRef.current = editor)}
            initialValue={editorInitialValue}
            init={TINY_INIT}
          />
        )}
      </Modal>
    </div>
  )
}
