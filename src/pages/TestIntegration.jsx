import { useRef, useState } from 'react'
import {
  Card, Button, Space, Typography, Upload, Switch, Tooltip, message, Alert, Divider,
} from 'antd'
import {
  UploadOutlined,
  ClearOutlined,
  FileWordOutlined,
  InfoCircleOutlined,
  DownloadOutlined,
  LayoutOutlined,
} from '@ant-design/icons'
import mammoth from 'mammoth'
import CkDocumentEditor from '../../CkDocumentEditor'

const { Title, Text } = Typography

// Định dạng văn bản/HTML thuần: đọc thẳng bằng FileReader.
const TEXT_EXT = ['.html', '.htm', '.txt', '.xml']

// Định dạng chấp nhận trên input file.
const ACCEPT = '.doc,.docx,.html,.htm,.txt,.xml'

// Endpoint convert .doc (Node server chạy antiword). Có thể override qua .env.
const CONVERT_API = import.meta.env.VITE_CONVERT_API || '/api/convert-doc'

// Endpoint high-fidelity (.doc/.docx -> <section> qua LibreOffice). Giữ layout.
const SECTION_API = import.meta.env.VITE_SECTION_API || '/api/word-to-section'

// Bọc section thành 1 trang HTML hoàn chỉnh (cho iframe preview và tải file).
const wrapFullHtml = (section, title = 'Word import') =>
  `<!DOCTYPE html>\n<html lang="vi">\n<head>\n<meta charset="utf-8">\n` +
  `<title>${title}</title>\n</head>\n<body>\n${section}</body>\n</html>\n`

// styleMap: ánh xạ style có tên của Word -> HTML để bám định dạng sát hơn.
// Bao gồm heading (tên tiếng Anh & tiếng Việt), tiêu đề, trích dẫn, và
// giữ lại gạch chân / gạch ngang / chữ hoa nhỏ mà mặc định mammoth bỏ qua.
const WORD_STYLE_MAP = [
  // Tiêu đề tài liệu
  "p[style-name='Title'] => h1.doc-title:fresh",
  "p[style-name='Subtitle'] => p.doc-subtitle:fresh",
  // Heading (tên tiếng Anh)
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='Heading 5'] => h5:fresh",
  "p[style-name='Heading 6'] => h6:fresh",
  // Heading (tên tiếng Việt thường gặp)
  "p[style-name='Tiêu đề 1'] => h1:fresh",
  "p[style-name='Tiêu đề 2'] => h2:fresh",
  "p[style-name='Tiêu đề 3'] => h3:fresh",
  // Trích dẫn
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote.intense:fresh",
  // Style ký tự
  "r[style-name='Strong'] => strong",
  "r[style-name='Emphasis'] => em",
  // Giữ định dạng mà mammoth bỏ qua theo mặc định
  'u => u',
  'strike => s',
  'small-caps => span.small-caps',
  'all-caps => span.all-caps',
]

const hasExt = (name, list) => {
  const lower = name.toLowerCase()
  return list.some((ext) => lower.endsWith(ext))
}

export default function TestIntegration() {
  const editorRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [keepFormatting, setKeepFormatting] = useState(true)

  // High-fidelity: section HTML tự chứa + metadata để preview / tải file.
  const [sectionHtml, setSectionHtml] = useState('')
  const [sectionInfo, setSectionInfo] = useState(null) // {name, bytes, engine}
  const [hiFiLoading, setHiFiLoading] = useState(false)

  // .docx (OOXML) -> HTML bằng mammoth, đọc dưới dạng ArrayBuffer.
  const importDocx = async (file) => {
    const arrayBuffer = await file.arrayBuffer()
    const options = keepFormatting
      ? { styleMap: WORD_STYLE_MAP, includeDefaultStyleMap: true }
      : { includeDefaultStyleMap: true }
    const { value: html, messages } = await mammoth.convertToHtml(
      { arrayBuffer },
      options
    )
    if (messages?.length) {
      // Cảnh báo các style không map được — không chặn, chỉ log.
      console.warn('[mammoth] cảnh báo chuyển đổi:', messages)
    }
    return html
  }

  // .doc (Word nhị phân cũ) -> HTML qua convert server (antiword).
  const importDoc = async (file) => {
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
    return data.html || ''
  }

  // .txt: bọc từng dòng trong <p>. .html/.xml: nạp nguyên vẹn.
  const importText = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = String(e.target?.result ?? '')
        const html = file.name.toLowerCase().endsWith('.txt')
          ? content
              .split(/\r?\n/)
              .map((line) => `<p>${line || '&nbsp;'}</p>`)
              .join('')
          : content
        resolve(html)
      }
      reader.onerror = () => reject(new Error('Không đọc được file'))
      reader.readAsText(file)
    })

  const handleLoadFile = async (file) => {
    const name = file.name
    const isDoc = hasExt(name, ['.doc']) && !hasExt(name, ['.docx'])
    const isDocx = hasExt(name, ['.docx'])
    const isText = hasExt(name, TEXT_EXT)

    if (!isDoc && !isDocx && !isText) {
      message.error('Chỉ hỗ trợ: .doc, .docx, .html, .htm, .txt, .xml')
      return false
    }

    setLoading(true)
    try {
      let html
      if (isDoc) html = await importDoc(file)
      else if (isDocx) html = await importDocx(file)
      else html = await importText(file)
      editorRef.current?.setData(html)
      setFileName(name)
      message.success(`Đã nạp "${name}" vào editor`)
    } catch (err) {
      console.error(err)
      message.error(`Nạp file thất bại: ${err.message || err}`)
    } finally {
      setLoading(false)
    }

    // Ngăn Upload tự gửi request lên server.
    return false
  }

  // High-fidelity: .doc/.docx -> <section> giữ layout, hiển thị preview trung thực.
  // Không nạp vào CKEditor vì editor sẽ sanitize mất <style>/<section> -> rớt scope.
  const importHiFi = async (file) => {
    const name = file.name
    if (!hasExt(name, ['.doc']) && !hasExt(name, ['.docx'])) {
      message.error('Chỉ hỗ trợ .doc hoặc .docx cho chế độ giữ layout')
      return false
    }
    setHiFiLoading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      let res
      try {
        res = await fetch(SECTION_API, { method: 'POST', body: form })
      } catch {
        throw new Error(
          'Không kết nối được convert server. Hãy chạy "npm run server" (hoặc "npm run dev:all").'
        )
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Server trả về ${res.status}`)
      setSectionHtml(data.html || '')
      setSectionInfo({ name, bytes: data.bytes || (data.html || '').length, engine: data.engine })
      message.success(`Đã chuyển "${name}" giữ layout (${((data.bytes || 0) / 1024 / 1024).toFixed(1)} MB)`)
    } catch (err) {
      console.error(err)
      message.error(`Chuyển đổi thất bại: ${err.message || err}`)
    } finally {
      setHiFiLoading(false)
    }
    return false // ngăn Upload tự gửi
  }

  // Tải section (đã bọc thành trang HTML hoàn chỉnh) về máy.
  const handleDownloadSection = () => {
    if (!sectionHtml) return
    const base = (sectionInfo?.name || 'word').replace(/\.[^.]+$/, '')
    const blob = new Blob([wrapFullHtml(sectionHtml, base)], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${base}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClear = () => {
    editorRef.current?.setData('')
    setFileName('')
    setSectionHtml('')
    setSectionInfo(null)
    message.info('Đã xóa nội dung editor')
  }

  return (
    <div>
      <Title level={3}>Test tích hợp</Title>
      <div>
        <Text type="secondary">
          Nạp file văn bản, Word (.docx / .doc) vào CKEditor để kiểm thử tích hợp.
        </Text>
        <br />
        <Text type="secondary" style={{ fontSize: 12 }}>
          <InfoCircleOutlined /> Nút <Text strong>Import giữ layout (LibreOffice)</Text>{' '}
          chuyển <Text code>.doc/.docx</Text> giữ nguyên bố cục (bảng, màu, font, ảnh) và
          hiển thị ở khung Preview. Nút <Text code>Load file</Text>/<Text code>Import .docx</Text>{' '}
          nạp vào editor (mammoth/antiword, đơn giản hơn). Cả hai cần convert server —{' '}
          chạy <Text code>npm run server</Text> hoặc <Text code>npm run dev:all</Text>.
        </Text>
      </div>

      <Card style={{ marginTop: 16, marginBottom: 16 }}>
        <Space wrap size="middle">
          <Upload
            accept={ACCEPT}
            showUploadList={false}
            beforeUpload={handleLoadFile}
          >
            <Button type="primary" icon={<UploadOutlined />} loading={loading}>
              Load file
            </Button>
          </Upload>
          <Upload accept=".docx" showUploadList={false} beforeUpload={handleLoadFile}>
            <Button icon={<FileWordOutlined />} loading={loading}>
              Import .docx
            </Button>
          </Upload>
          <Tooltip title="Chuyển .doc/.docx bằng LibreOffice, giữ layout/bảng/màu/font, ảnh nhúng base64. Hiển thị ở khung Preview bên dưới (không nạp vào editor để tránh mất định dạng).">
            <Upload accept=".doc,.docx" showUploadList={false} beforeUpload={importHiFi}>
              <Button type="primary" ghost icon={<LayoutOutlined />} loading={hiFiLoading}>
                Import giữ layout (LibreOffice)
              </Button>
            </Upload>
          </Tooltip>
          <Button icon={<ClearOutlined />} onClick={handleClear}>
            Xóa nội dung
          </Button>

          <Space size={4}>
            <Switch
              checked={keepFormatting}
              onChange={setKeepFormatting}
              checkedChildren="Giữ định dạng"
              unCheckedChildren="HTML sạch"
            />
            <Tooltip
              title="Bật: dùng styleMap ánh xạ heading/tiêu đề/trích dẫn và giữ gạch chân, gạch ngang, chữ hoa nhỏ của Word. Tắt: xuất HTML semantic tối giản của mammoth."
            >
              <InfoCircleOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />
            </Tooltip>
          </Space>

          {fileName && (
            <Text type="secondary">
              File hiện tại: <Text strong>{fileName}</Text>
            </Text>
          )}
        </Space>
      </Card>

      <Card title="Nội dung tài liệu" styles={{ body: { padding: 0 } }}>
        <CkDocumentEditor
          ref={editorRef}
          placeholder="Nội dung file sẽ hiển thị ở đây, hoặc soạn thảo trực tiếp..."
          height={500}
        />
      </Card>

      {sectionHtml && (
        <Card
          style={{ marginTop: 16 }}
          title={
            <Space>
              <LayoutOutlined />
              <span>Preview giữ layout (self-contained &lt;section&gt;)</span>
            </Space>
          }
          extra={
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleDownloadSection}
            >
              Tải HTML
            </Button>
          }
        >
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="Khung dưới là section HTML tự chứa (CSS đã scope, ảnh base64), sẵn sàng nối vào cuối một file HTML bất kỳ."
            description={
              sectionInfo && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Nguồn: <Text strong>{sectionInfo.name}</Text> · Kích thước:{' '}
                  {(sectionInfo.bytes / 1024 / 1024).toFixed(2)} MB · Engine: {sectionInfo.engine}
                </Text>
              )
            }
          />
          <iframe
            title="Word layout preview"
            srcDoc={wrapFullHtml(sectionHtml, sectionInfo?.name)}
            style={{
              width: '100%',
              height: 600,
              border: '1px solid #f0f0f0',
              borderRadius: 8,
              background: '#fff',
            }}
          />
          <Divider style={{ margin: '12px 0' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            <InfoCircleOutlined /> CLI tương đương:{' '}
            <Text code>node tools/word-to-section.mjs &lt;file&gt; --append target.html</Text>
          </Text>
        </Card>
      )}
    </div>
  )
}
