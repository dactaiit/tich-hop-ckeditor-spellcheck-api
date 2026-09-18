import { useRef, useState } from 'react'
import { Card, Button, Space, Typography, Upload, Tag, message } from 'antd'
import {
  FileWordOutlined,
  DatabaseOutlined,
  InfoCircleOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import IdaVibeEditor from '../ida-vibe-editor'

const { Title, Text, Paragraph } = Typography

// Endpoint cấu hình (override qua .env). Convert .doc dùng antiword server;
// spell API kiểm tra chính tả (proxy /spell vì API không có CORS).
const CONVERT_API = import.meta.env.VITE_CONVERT_API || '/api/convert-doc'
const SPELL_API = import.meta.env.VITE_SPELL_API || '/spell'

export default function DocComposer() {
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState('')
  const [outLen, setOutLen] = useState(0) // độ dài HTML output (từ onChange)
  const editorRef = useRef(null)

  // ===== Phần 1: import .doc -> HTML qua convert server (antiword) =====
  const handleImport = async (file) => {
    if (!file.name.toLowerCase().endsWith('.doc')) {
      message.error('Phần này chỉ nhận file .doc (Word nhị phân cũ)')
      return false
    }
    setLoading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      let res
      try {
        res = await fetch(CONVERT_API, { method: 'POST', body: form })
      } catch {
        throw new Error(
          'Không kết nối được convert server. Hãy chạy "npm run server" (hoặc "npm run dev:all").'
        )
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Server trả về ${res.status}`)
      editorRef.current?.setData(data.html || '')
      setFileName(file.name)
      message.success(`Đã nạp "${file.name}" vào editor`)
    } catch (err) {
      console.error(err)
      message.error(err.message || String(err))
    } finally {
      setLoading(false)
    }
    return false // chặn Upload tự gửi
  }

  // Nạp dữ liệu mẫu lớn (public/sample-div.html).
  const loadSample = async () => {
    setLoading(true)
    try {
      const res = await fetch('/sample-div.html')
      if (!res.ok) throw new Error(`Không tải được mẫu (HTTP ${res.status})`)
      const html = await res.text()
      editorRef.current?.setData(html)
      setFileName('sample-div.html')
      message.success('Đã nạp dữ liệu mẫu')
    } catch (err) {
      console.error(err)
      message.error(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  // onSave: nơi bạn gửi HTML về server / lưu DB. Demo: báo + log.
  const handleSave = (html) => {
    console.log('[IdaVibeEditor] onSave, HTML =', html)
    message.success(`Đã lưu (${html.length} ký tự HTML)`)
  }

  // Demo ref.getData()
  const showCurrentHtml = () => {
    const html = editorRef.current?.getData() ?? ''
    console.log('[IdaVibeEditor] getData() =', html)
    message.info(`HTML hiện tại: ${html.length} ký tự (đã log ra console)`)
  }

  return (
    <div>
      <Title level={3}>Ví dụ IdaVibeEditor</Title>
      <Text type="secondary">
        Trang minh họa component <Text code>IdaVibeEditor</Text>: import nội dung →
        sửa theo section/đối tượng → kiểm tra chính tả → Lưu.
      </Text>

      {/* Phần 1: import (gọi ref.setData) */}
      <Card size="small" title="1. Nạp nội dung" style={{ marginTop: 16 }}>
        <Space wrap align="center">
          <Upload accept=".doc" showUploadList={false} beforeUpload={handleImport}>
            <Button type="primary" icon={<FileWordOutlined />} loading={loading}>
              Import .doc
            </Button>
          </Upload>
          <Button icon={<DatabaseOutlined />} loading={loading} onClick={loadSample}>
            Nạp dữ liệu mẫu
          </Button>
          <Button icon={<EyeOutlined />} onClick={showCurrentHtml}>
            Xem HTML hiện tại (getData)
          </Button>
          {fileName && (
            <Text type="secondary">
              Nguồn: <Text strong>{fileName}</Text>
            </Text>
          )}
          <Tag color="blue">onChange output: {outLen} ký tự</Tag>
        </Space>
        <Paragraph type="secondary" style={{ fontSize: 12, margin: '10px 0 0' }}>
          <InfoCircleOutlined /> Import <Text code>.doc</Text> cần convert server
          (<Text code>npm run server</Text> / <Text code>npm run dev:all</Text>).
          Kiểm tra chính tả gọi qua proxy <Text code>{SPELL_API}</Text>.
        </Paragraph>
      </Card>

      {/* Phần 2: component editor */}
      <Card size="small" title="2. Soạn thảo" style={{ marginTop: 16 }}>
        <IdaVibeEditor
          ref={editorRef}
          maxHeight={900}
          spellApi={SPELL_API}
          title="Nội dung"
          onChange={(html) => setOutLen(html.length)}
          onSave={handleSave}
        />
      </Card>
    </div>
  )
}
