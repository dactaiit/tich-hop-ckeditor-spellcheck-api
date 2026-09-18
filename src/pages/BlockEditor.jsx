import { useMemo, useRef, useState } from 'react'
import {
  Card,
  Button,
  Space,
  Typography,
  Input,
  Modal,
  Empty,
  Tooltip,
  message,
} from 'antd'
import {
  EditOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ScissorOutlined,
  CopyOutlined,
  DownloadOutlined,
} from '@ant-design/icons'
import { Editor } from '@tinymce/tinymce-react'
import { TINY_INIT } from '../tinymce-setup'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

// HTML mẫu: nhiều block với inline style để minh hoạ việc giữ nguyên định dạng.
const SAMPLE_HTML = `<h1 style="color:#1a3c6e;font-family:Georgia,serif;margin:0 0 12px;">Báo cáo kỹ thuật quý III</h1>
<p style="font-size:15px;line-height:1.7;color:#333;">Đây là đoạn mở đầu có <strong style="color:#c0392b;">phần nhấn mạnh</strong> và <em style="background:#fff3cd;">phần bôi nền vàng</em> để kiểm tra việc giữ style.</p>
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

let blockSeq = 0
const nextId = () => `blk-${(blockSeq += 1)}`

// Tách HTML thành các block theo phần tử cấp cao nhất trong <body>.
// Giữ outerHTML để bảo toàn thẻ bọc + toàn bộ style/thuộc tính.
const splitIntoBlocks = (html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks = []
  doc.body.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      blocks.push({ id: nextId(), html: node.outerHTML })
    } else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      // Text node lạc loài -> bọc trong <p> để trở thành một block.
      blocks.push({ id: nextId(), html: `<p>${node.textContent.trim()}</p>` })
    }
  })
  return blocks
}

export default function BlockEditor() {
  const [source, setSource] = useState(SAMPLE_HTML)
  const [blocks, setBlocks] = useState(() => splitIntoBlocks(SAMPLE_HTML))
  const [editing, setEditing] = useState(null) // { index, html } | null
  const editorRef = useRef(null)

  // Ráp toàn bộ block lại thành một khối HTML như ban đầu.
  const assembled = useMemo(() => blocks.map((b) => b.html).join('\n'), [blocks])

  const handleSplit = () => {
    const next = splitIntoBlocks(source)
    if (next.length === 0) {
      message.warning('Không tìm thấy block nào trong HTML nguồn')
      return
    }
    setBlocks(next)
    message.success(`Đã tách thành ${next.length} block`)
  }

  const openEditor = (index) => setEditing({ index, html: blocks[index].html })

  const saveBlock = () => {
    const html = editorRef.current?.getContent() ?? editing.html
    setBlocks((prev) =>
      prev.map((b, i) => (i === editing.index ? { ...b, html } : b))
    )
    setEditing(null)
    message.success(`Đã lưu block #${editing.index + 1}`)
  }

  const moveBlock = (index, dir) => {
    const target = index + dir
    if (target < 0 || target >= blocks.length) return
    setBlocks((prev) => {
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const deleteBlock = (index) => {
    setBlocks((prev) => prev.filter((_, i) => i !== index))
    message.info('Đã xóa block')
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

  return (
    <div>
      <Title level={3}>Sửa nội dung theo block</Title>
      <Text type="secondary">
        Tách HTML thành từng block, chọn block để sửa bằng TinyMCE (giữ nguyên
        style), lưu lại rồi ráp thành một khối như ban đầu.
      </Text>

      {/* Nguồn HTML */}
      <Card
        size="small"
        title="1. HTML nguồn"
        style={{ marginTop: 16 }}
        extra={
          <Button
            type="primary"
            icon={<ScissorOutlined />}
            onClick={handleSplit}
          >
            Tách block
          </Button>
        }
      >
        <TextArea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          autoSize={{ minRows: 4, maxRows: 10 }}
          spellCheck={false}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
      </Card>

      {/* Danh sách block */}
      <Card
        size="small"
        title={`2. Các block (${blocks.length}) — bấm "Sửa" để hiệu chỉnh`}
        style={{ marginTop: 16 }}
      >
        {blocks.length === 0 ? (
          <Empty description="Chưa có block" />
        ) : (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {blocks.map((block, index) => (
              <div
                key={block.id}
                style={{
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 12px',
                    background: '#fafafa',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <Text strong style={{ fontSize: 13 }}>
                    Block #{index + 1}
                  </Text>
                  <Space size={4}>
                    <Tooltip title="Lên">
                      <Button
                        size="small"
                        type="text"
                        icon={<ArrowUpOutlined />}
                        disabled={index === 0}
                        onClick={() => moveBlock(index, -1)}
                      />
                    </Tooltip>
                    <Tooltip title="Xuống">
                      <Button
                        size="small"
                        type="text"
                        icon={<ArrowDownOutlined />}
                        disabled={index === blocks.length - 1}
                        onClick={() => moveBlock(index, 1)}
                      />
                    </Tooltip>
                    <Button
                      size="small"
                      type="primary"
                      ghost
                      icon={<EditOutlined />}
                      onClick={() => openEditor(index)}
                    >
                      Sửa
                    </Button>
                    <Tooltip title="Xóa">
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => deleteBlock(index)}
                      />
                    </Tooltip>
                  </Space>
                </div>
                {/* Preview giữ nguyên style nhờ inline style trong HTML nguồn */}
                <div
                  style={{ padding: 12 }}
                  dangerouslySetInnerHTML={{ __html: block.html }}
                />
              </div>
            ))}
          </Space>
        )}
      </Card>

      {/* Kết quả ráp lại */}
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
          Xem trước toàn bộ:
        </Paragraph>
        <div
          style={{
            border: '1px dashed #d9d9d9',
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
          }}
          dangerouslySetInnerHTML={{ __html: assembled }}
        />
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
        title={editing ? `Sửa Block #${editing.index + 1}` : ''}
        open={editing !== null}
        onOk={saveBlock}
        onCancel={() => setEditing(null)}
        okText="Lưu"
        cancelText="Hủy"
        width={920}
        destroyOnClose
        maskClosable={false}
      >
        {editing && (
          <Editor
            key={editing.index}
            onInit={(_evt, editor) => (editorRef.current = editor)}
            initialValue={editing.html}
            init={TINY_INIT}
          />
        )}
      </Modal>
    </div>
  )
}
