import { useMemo, useState } from 'react'
import {
  Card,
  Button,
  Space,
  Typography,
  Input,
  Select,
  Tag,
  Popover,
  Empty,
  Alert,
  message,
} from 'antd'
import { CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { spellCheck, toCodepoints, applyReplacement } from '../lib/spellCheck'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

const SAMPLE =
  'Tôi đi hoc ở truong đại hoc. Hôm nay trời rất đẹp và tôi cảm thấy vui vẽ. ' +
  'Căn cứ Luật Đo đạc và bản đồ, cơ quan quản lý phải tuân thũ quy định.'

export default function SpellCheck() {
  const [text, setText] = useState(SAMPLE)
  const [topK, setTopK] = useState(3)
  const [result, setResult] = useState(null) // SpellCheckResponse
  const [checkedText, setCheckedText] = useState('') // text ứng với result hiện tại
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const issues = result?.issues ?? []

  const runCheck = async () => {
    if (!text.trim()) {
      message.warning('Nhập văn bản cần kiểm tra')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await spellCheck(text, topK)
      setResult(data)
      setCheckedText(text)
    } catch (err) {
      setError(err.message || String(err))
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  // Áp dụng gợi ý: sửa text, dịch offset các lỗi phía sau, bỏ lỗi vừa sửa.
  const applySuggestion = (issue, replacement) => {
    const { nextText, delta } = applyReplacement(
      checkedText,
      issue.start,
      issue.end,
      replacement
    )
    const nextIssues = issues
      .filter((i) => i !== issue)
      .map((i) =>
        i.start >= issue.end ? { ...i, start: i.start + delta, end: i.end + delta } : i
      )
    setText(nextText)
    setCheckedText(nextText)
    setResult({ ...result, issues: nextIssues })
    message.success(`Đã thay "${issue.original}" → "${replacement}"`)
  }

  const ignoreIssue = (issue) => {
    setResult({ ...result, issues: issues.filter((i) => i !== issue) })
  }

  // Dựng đoạn văn bản có tô lỗi từ offset code point.
  const highlighted = useMemo(() => {
    if (!result) return null
    const cp = toCodepoints(checkedText)
    const sorted = [...issues].sort((a, b) => a.start - b.start)
    const nodes = []
    let cursor = 0
    sorted.forEach((issue, idx) => {
      if (issue.start < cursor) return // bỏ qua lỗi chồng lấn
      if (issue.start > cursor) {
        nodes.push(<span key={`t${idx}`}>{cp.slice(cursor, issue.start).join('')}</span>)
      }
      const original = cp.slice(issue.start, issue.end).join('')
      nodes.push(
        <Popover
          key={`i${idx}`}
          trigger="click"
          placement="bottom"
          title={
            <span>
              <Tag color={issue.kind === 'non_word' ? 'red' : 'orange'}>
                {issue.kind === 'non_word' ? 'Sai từ' : 'Nghi sai ngữ cảnh'}
              </Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>
                tin cậy {(issue.confidence * 100).toFixed(0)}%
              </Text>
            </span>
          }
          content={
            <div style={{ minWidth: 180 }}>
              {issue.suggestions.length === 0 ? (
                <Text type="secondary">Không có gợi ý</Text>
              ) : (
                <Space direction="vertical" style={{ width: '100%' }} size={4}>
                  {issue.suggestions.map((s, si) => (
                    <Button
                      key={si}
                      block
                      size="small"
                      onClick={() => applySuggestion(issue, s.replacement)}
                      style={{ textAlign: 'left', justifyContent: 'space-between', display: 'flex' }}
                    >
                      <span>{s.replacement}</span>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {(s.confidence * 100).toFixed(0)}%
                      </Text>
                    </Button>
                  ))}
                </Space>
              )}
              <Button
                type="link"
                size="small"
                style={{ paddingLeft: 0, marginTop: 4 }}
                onClick={() => ignoreIssue(issue)}
              >
                Bỏ qua
              </Button>
            </div>
          }
        >
          <mark className={`sp-issue sp-${issue.severity}`}>{original}</mark>
        </Popover>
      )
      cursor = issue.end
    })
    if (cursor < cp.length) {
      nodes.push(<span key="tail">{cp.slice(cursor).join('')}</span>)
    }
    return nodes
  }, [result, checkedText]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <Title level={3}>Kiểm tra chính tả</Title>
      <Text type="secondary">
        Dùng Vietnamese Hybrid Spell Checker API (model{' '}
        {result?.model_version || 'vi-hybrid-ngram-legal'}). Bấm vào từ được tô để
        xem gợi ý và sửa.
      </Text>

      <Card size="small" title="Văn bản" style={{ marginTop: 16 }}>
        <TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoSize={{ minRows: 4, maxRows: 10 }}
          maxLength={20000}
          showCount
          placeholder="Nhập hoặc dán văn bản tiếng Việt..."
        />
        <Space style={{ marginTop: 12 }} wrap>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={loading}
            onClick={runCheck}
          >
            Kiểm tra chính tả
          </Button>
          <Space size={4}>
            <Text type="secondary">Số gợi ý (top_k):</Text>
            <Select
              value={topK}
              onChange={setTopK}
              style={{ width: 72 }}
              options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
            />
          </Space>
        </Space>
      </Card>

      {error && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 16 }}
          message="Lỗi gọi API"
          description={error}
        />
      )}

      {result && (
        <Card
          size="small"
          title="Kết quả"
          style={{ marginTop: 16 }}
          extra={
            <Button size="small" icon={<ReloadOutlined />} onClick={runCheck} loading={loading}>
              Kiểm tra lại
            </Button>
          }
        >
          <Space style={{ marginBottom: 12 }} wrap>
            <Tag color={issues.length ? 'orange' : 'green'}>
              {issues.length ? `${issues.length} lỗi` : 'Không phát hiện lỗi'}
            </Tag>
            <Text type="secondary">Model: {result.model_version}</Text>
            <Text type="secondary">Xử lý: {result.processing_ms?.toFixed(1)} ms</Text>
          </Space>

          {issues.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Văn bản không có lỗi (hoặc đã sửa hết)"
            />
          ) : (
            <div className="sp-output">{highlighted}</div>
          )}

          <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
            <span className="sp-issue sp-confident">chắc chắn</span> = gạch đỏ ·{' '}
            <span className="sp-issue sp-suspect">nghi ngờ</span> = gạch vàng
          </Paragraph>
        </Card>
      )}
    </div>
  )
}
