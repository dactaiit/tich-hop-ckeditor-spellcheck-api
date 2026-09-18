import { useRef, useState } from 'react'
import {
  Card, Button, Space, Table, Tag, Alert, Checkbox, Typography, message, Tooltip,
} from 'antd'
import {
  FolderOpenOutlined,
  SyncOutlined,
  InfoCircleOutlined,
  FileWordOutlined,
  DownloadOutlined,
  EyeOutlined,
} from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography

const PROCESS_API = '/api/process-folder'

// Gom danh sách rel-path thành các "văn bản" (mirror tools/folder-batch-core.mjs).
const groupDocsClient = (rels) => {
  const htmls = new Map()
  const apps = new Map()
  for (const rel of rels) {
    if (/^[^/]+\.html?$/i.test(rel)) {
      htmls.set(rel.replace(/\.html?$/i, ''), rel)
    } else {
      const m = rel.match(/^([^/]+)\/(.+)$/)
      if (m && /\.(docx?)$/i.test(m[2])) {
        const folder = m[1]
        if (!apps.has(folder)) apps.set(folder, [])
        apps.get(folder).push(m[2].split('/').pop())
      }
    }
  }
  const docs = []
  for (const [base, rel] of htmls) {
    docs.push({
      name: base,
      html: rel,
      appendices: (apps.get(base) || []).slice().sort((a, b) => a.localeCompare(b)),
    })
  }
  return docs.sort((a, b) => a.name.localeCompare(b.name))
}

// Bọc merged HTML để preview/tải (merged đã là trang HTML đầy đủ nên dùng thẳng).
const download = (name, html) => {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.html`
  a.click()
  URL.revokeObjectURL(url)
}

export default function FolderBatch() {
  const inputRef = useRef(null)
  const [rootName, setRootName] = useState('')
  const [filesByRel, setFilesByRel] = useState(new Map())
  const [docsPreview, setDocsPreview] = useState(null)
  const [force, setForce] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [report, setReport] = useState(null)
  const [preview, setPreview] = useState(null) // { name, html }

  const handlePick = () => inputRef.current?.click()

  const handleFiles = (e) => {
    const list = [...(e.target.files || [])]
    e.target.value = '' // cho phép chọn lại cùng thư mục
    if (!list.length) return
    const root = (list[0].webkitRelativePath || list[0].name).split('/')[0]
    const map = new Map()
    for (const f of list) {
      const wp = (f.webkitRelativePath || f.name).replace(/\\/g, '/')
      const rel = wp.startsWith(`${root}/`) ? wp.slice(root.length + 1) : wp
      if (/^[^/]+\.html?$/i.test(rel) || /^[^/]+\/.+\.(docx?)$/i.test(rel)) map.set(rel, f)
    }
    setRootName(root)
    setFilesByRel(map)
    setDocsPreview(groupDocsClient([...map.keys()]))
    setReport(null)
    setPreview(null)
    const docs = groupDocsClient([...map.keys()])
    const withApp = docs.filter((d) => d.appendices.length).length
    if (!withApp) message.info('Không tìm thấy văn bản có phụ lục (VB_*.html + thư mục cùng tên chứa .doc/.docx).')
    else message.success(`Đã đọc thư mục "${root}": ${withApp} văn bản có phụ lục.`)
  }

  const handleProcess = async () => {
    const docs = (docsPreview || []).filter((d) => d.appendices.length)
    if (!docs.length) return message.warning('Không có văn bản nào để xử lý.')
    setProcessing(true)
    setReport(null)
    setPreview(null)
    try {
      const form = new FormData()
      const manifest = [] // rel-path đúng thứ tự file (busboy cắt path trong filename)
      for (const doc of docs) {
        const htmlFile = filesByRel.get(doc.html)
        if (htmlFile) { form.append('files', htmlFile, doc.html.split('/').pop()); manifest.push(doc.html) }
        for (const a of doc.appendices) {
          const wf = filesByRel.get(`${doc.name}/${a}`)
          if (wf) { form.append('files', wf, a); manifest.push(`${doc.name}/${a}`) }
        }
      }
      form.append('manifest', JSON.stringify(manifest))
      let res
      try {
        res = await fetch(`${PROCESS_API}?force=${force ? 1 : 0}`, { method: 'POST', body: form })
      } catch {
        throw new Error('Không kết nối được server. Hãy chạy "npm run server" (hoặc "npm run dev:all").')
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Server trả về ${res.status}`)
      setReport(data.report || [])
      const totalAppended = (data.report || []).reduce((n, d) => n + (d.appended?.length || 0), 0)
      message.success(`Hoàn tất: đã append ${totalAppended} phụ lục vào ${data.report?.length || 0} văn bản.`)
    } catch (err) {
      message.error(err.message)
    } finally {
      setProcessing(false)
    }
  }

  const previewColumns = [
    { title: 'Văn bản', dataIndex: 'name', key: 'name', render: (t) => <Text strong>{t}</Text> },
    { title: 'File HTML', dataIndex: 'html', key: 'html', render: (t) => <Text code>{t}</Text> },
    {
      title: 'Phụ lục',
      key: 'appendices',
      render: (_, r) =>
        r.appendices.length ? (
          <Space wrap size={4}>
            {r.appendices.map((f) => (
              <Tag key={f} icon={<FileWordOutlined />} color="blue">{f}</Tag>
            ))}
          </Space>
        ) : <Text type="secondary">— không có phụ lục —</Text>,
    },
  ]

  const reportColumns = [
    { title: 'Văn bản', dataIndex: 'name', key: 'name', render: (t) => <Text strong>{t}</Text> },
    {
      title: 'Đã append',
      key: 'appended',
      render: (_, r) =>
        r.appended?.length
          ? <Space wrap size={4}>{r.appended.map((f) => <Tag color="green" key={f}>{f}</Tag>)}</Space>
          : <Text type="secondary">—</Text>,
    },
    {
      title: 'Bỏ qua',
      key: 'skipped',
      render: (_, r) =>
        r.skipped?.length
          ? <Space wrap size={4}>{r.skipped.map((f) => <Tag key={f}>{f}</Tag>)}</Space>
          : <Text type="secondary">—</Text>,
    },
    {
      title: 'Lỗi',
      key: 'errors',
      render: (_, r) =>
        r.errors?.length
          ? <Space direction="vertical" size={2}>{r.errors.map((e, i) => <Tag color="red" key={i}>{e.file}: {e.error}</Tag>)}</Space>
          : <Text type="secondary">—</Text>,
    },
    { title: 'Kích thước', dataIndex: 'bytes', key: 'bytes', width: 110, render: (b) => `${(b / 1024 / 1024).toFixed(2)} MB` },
    {
      title: '',
      key: 'actions',
      width: 170,
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setPreview({ name: r.name, html: r.merged })}>
            Xem
          </Button>
          <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={() => download(r.name, r.merged)}>
            Tải
          </Button>
        </Space>
      ),
    },
  ]

  const docsWithApp = (docsPreview || []).filter((d) => d.appendices.length)

  return (
    <div>
      <Title level={3}>Chuyển đổi theo thư mục</Title>
      <Paragraph type="secondary" style={{ marginBottom: 4 }}>
        Chọn thư mục ngay trên trình duyệt → gửi lên server (BFF) để convert phụ lục Word và
        <b> append vào cuối</b> file HTML tương ứng → nhận kết quả để xem trước / tải về.
      </Paragraph>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Cấu trúc thư mục yêu cầu"
        description={
          <pre style={{ margin: 0, fontSize: 12, background: 'transparent' }}>
{`<thư mục chọn>/
├─ VB_001.html          ← văn bản chính (đích append)
├─ VB_001/              ← thư mục CÙNG TÊN chứa phụ lục
│   ├─ PL_01.docx
│   └─ PL_02.doc
├─ VB_002.html
└─ VB_002/ ...`}
          </pre>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          {/* webkitdirectory: chọn cả thư mục ngay trong trình duyệt */}
          <input
            ref={inputRef}
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            style={{ display: 'none' }}
            onChange={handleFiles}
          />
          <Button icon={<FolderOpenOutlined />} onClick={handlePick}>Chọn thư mục…</Button>
          <Checkbox checked={force} onChange={(e) => setForce(e.target.checked)}>
            <Tooltip title="Xóa section cũ (theo data-source) rồi thêm lại. Mặc định: bỏ qua phụ lục đã append.">
              Ghi đè section đã có
            </Tooltip>
          </Checkbox>
          <Button
            type="primary"
            icon={<SyncOutlined />}
            loading={processing}
            disabled={!docsWithApp.length}
            onClick={handleProcess}
          >
            Xử lý ({docsWithApp.length})
          </Button>
          {rootName && <Text type="secondary">Thư mục: <Text strong>{rootName}</Text></Text>}
        </Space>
      </Card>

      {docsPreview && (
        <Card title={`Xem trước (${docsWithApp.length} văn bản có phụ lục)`} style={{ marginBottom: 16 }}>
          <Table rowKey="name" size="small" pagination={false} columns={previewColumns} dataSource={docsPreview} />
        </Card>
      )}

      {report && (
        <Card title="Kết quả xử lý" style={{ marginBottom: 16 }}>
          <Table rowKey="name" size="small" pagination={false} columns={reportColumns} dataSource={report} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            <InfoCircleOutlined /> Kết quả được trả về client (không ghi vào thư mục gốc). Dùng
            <b> Tải</b> để lưu file HTML đã append.
          </Text>
        </Card>
      )}

      {preview && (
        <Card
          title={<Space><EyeOutlined /><span>Preview: {preview.name}.html</span></Space>}
          extra={<Button icon={<DownloadOutlined />} onClick={() => download(preview.name, preview.html)}>Tải HTML</Button>}
        >
          <iframe
            title="preview"
            srcDoc={preview.html}
            style={{ width: '100%', height: 600, border: '1px solid #f0f0f0', borderRadius: 8, background: '#fff' }}
          />
        </Card>
      )}
    </div>
  )
}
