import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Button,
  Space,
  Typography,
  Modal,
  Empty,
  InputNumber,
  Select,
  Radio,
  Switch,
  Divider,
  Tag,
  List,
  message,
} from 'antd'
import {
  PlusOutlined,
  CopyOutlined,
  DownloadOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  SaveOutlined,
  AimOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { Editor } from '@tinymce/tinymce-react'
import { TINY_INIT, attachWordPaste } from '../tinymce-setup'
import {
  runSectionSpellCheck,
  applySpellFix,
  annotateSectionHtml,
} from '../lib/sectionSpell'
import {
  nextSectionId,
  splitIntoSections,
  OBJECT_TAGS,
  getLeafPath,
  getNodeHtmlFromClean,
  applyLeafEdit,
  parseTableValues,
  applyTableProps,
} from './idaEditorHelpers'
import './ida-vibe-editor.css'

const { Text, Paragraph } = Typography

/**
 * IdaVibeEditor — trình soạn thảo nội dung theo section (giữ nguyên HTML/style),
 * sửa theo đối tượng (đoạn/ô/bảng/danh sách), dán từ Word, kiểm tra chính tả.
 *
 * Props (input/output chuẩn):
 *  - value?: string        HTML ban đầu (không controlled; dùng ref.setData để đổi).
 *  - onChange?: (html)=>{} gọi mỗi khi nội dung đổi, trả HTML sạch (không mark lỗi).
 *  - onSave?: (html)=>{}   gọi khi bấm nút Lưu (ở header và footer).
 *  - maxHeight?: number     chiều cao tối đa vùng cuộn nội dung (mặc định 900).
 *  - spellApi?: string      endpoint API kiểm tra chính tả (mặc định env VITE_SPELL_API
 *                           hoặc '/spell'). Gọi POST `${spellApi}/v1/spell-check`.
 *  - spellCheckEnabled?: bool  ẩn/hiện nút kiểm tra chính tả (mặc định true).
 *  - spellTopK?: number     số gợi ý mỗi lỗi khi kiểm tra chính tả (mặc định 3).
 *  - title?: string
 * Ref: { getData(): string, setData(html: string): void }
 */
const IdaVibeEditor = forwardRef(function IdaVibeEditor(
  {
    value = '',
    onChange,
    onSave,
    maxHeight = 900,
    spellApi,
    spellCheckEnabled = true,
    spellTopK = 3,
    title,
  },
  ref
) {
  const [sections, setSections] = useState(() => splitIntoSections(value))
  const [editing, setEditing] = useState(null)
  const [picker, setPicker] = useState(null)
  const [tableProps, setTableProps] = useState(null)
  const [tpValues, setTpValues] = useState(null)
  const [spellResult, setSpellResult] = useState(null)
  const [spellLoading, setSpellLoading] = useState(false)
  const [spellProgress, setSpellProgress] = useState(null)
  const [spellPopover, setSpellPopover] = useState(null)
  const [spellNavIndex, setSpellNavIndex] = useState(0)
  const editorRef = useRef(null)
  const surfaceRef = useRef(null)
  const firstRender = useRef(true)

  const assembled = useMemo(
    () => sections.map((s) => s.html).join('\n'),
    [sections]
  )

  useImperativeHandle(ref, () => ({
    getData: () => assembled,
    setData: (html) => {
      setSections(splitIntoSections(html || ''))
      setSpellResult(null)
    },
  }))

  // Output: báo nội dung mới cho parent (bỏ qua lần render đầu).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    onChange?.(assembled)
  }, [assembled]) // eslint-disable-line react-hooks/exhaustive-deps

  const issuesBySection = useMemo(() => {
    const m = new Map()
    if (spellResult) {
      spellResult.issues.forEach((iss) => {
        const a = m.get(iss.sectionIndex) || []
        a.push(iss)
        m.set(iss.sectionIndex, a)
      })
    }
    return m
  }, [spellResult])

  const orderedIssues = useMemo(() => {
    if (!spellResult) return []
    return [...spellResult.issues].sort(
      (a, b) =>
        a.sectionIndex - b.sectionIndex ||
        a.nodeIndex - b.nodeIndex ||
        a.localStart - b.localStart
    )
  }, [spellResult])

  const setTp = (patch) => setTpValues((v) => ({ ...v, ...patch }))

  // ===== Thêm / sửa =====
  const openInsert = (index) => setEditing({ mode: 'insert', index })
  const openEdit = (index) => setEditing({ mode: 'edit', index })

  const deleteSection = (index) => {
    setSections((prev) => prev.filter((_, i) => i !== index))
    setSpellResult(null)
    message.info('Đã xóa section')
  }

  const openObjectEdit = (sectionIndex, item) => {
    setPicker(null)
    setEditing({
      mode: 'leaf',
      sectionIndex,
      path: item.path,
      useOuter: item.useOuter,
      html: getNodeHtmlFromClean(sections[sectionIndex].html, item.path, item.useOuter),
      label: item.label,
    })
  }

  const openTableProps = (sectionIndex, item) => {
    setPicker(null)
    const tableHtml = getNodeHtmlFromClean(sections[sectionIndex].html, item.path, true)
    setTpValues(parseTableValues(tableHtml))
    setTableProps({ sectionIndex, path: item.path })
  }

  const saveTableProps = () => {
    const nextHtml = applyTableProps(
      sections[tableProps.sectionIndex].html,
      tableProps.path,
      tpValues
    )
    if (nextHtml == null) message.error('Không định vị được bảng')
    else {
      setSections((prev) =>
        prev.map((s, i) =>
          i === tableProps.sectionIndex ? { ...s, html: nextHtml } : s
        )
      )
      setSpellResult(null)
      message.success('Đã cập nhật thuộc tính bảng')
    }
    setTableProps(null)
  }

  const handlePick = (sectionIndex, item) => {
    if (item.action === 'tableProps') openTableProps(sectionIndex, item)
    else openObjectEdit(sectionIndex, item)
  }

  const handleSaveSection = () => {
    const html = editorRef.current?.getContent() ?? ''
    if (editing.mode === 'edit') {
      setSections((prev) =>
        prev.map((s, i) => (i === editing.index ? { ...s, html } : s))
      )
      message.success(`Đã lưu cả section #${editing.index + 1}`)
    } else if (editing.mode === 'leaf') {
      const nextHtml = applyLeafEdit(
        sections[editing.sectionIndex].html,
        editing.path,
        html,
        editing.useOuter
      )
      if (nextHtml == null) message.error('Không định vị được đoạn con để lưu')
      else {
        setSections((prev) =>
          prev.map((s, i) =>
            i === editing.sectionIndex ? { ...s, html: nextHtml } : s
          )
        )
        message.success('Đã lưu đoạn con — giữ nguyên cấu trúc & style')
      }
    } else if (html.trim()) {
      const section = { id: nextSectionId(), html }
      setSections((prev) => {
        const next = [...prev]
        next.splice(editing.index, 0, section)
        return next
      })
      message.success('Đã thêm section')
    }
    setSpellResult(null)
    setEditing(null)
  }

  const editorInitialValue =
    editing?.mode === 'edit'
      ? sections[editing.index]?.html ?? ''
      : editing?.mode === 'leaf'
        ? editing.html ?? ''
        : ''

  // ===== Kiểm tra chính tả =====
  const handleSpellCheck = async () => {
    if (!sections.length) {
      message.warning('Chưa có nội dung để kiểm tra')
      return
    }
    setSpellLoading(true)
    setSpellResult(null)
    try {
      const r = await runSectionSpellCheck(
        sections,
        spellTopK,
        (done, total) => setSpellProgress({ done, total }),
        spellApi
      )
      setSpellResult(r)
      setSpellNavIndex(0)
      message.success(
        r.issues.length ? `Tìm thấy ${r.issues.length} lỗi` : 'Không phát hiện lỗi'
      )
    } catch (err) {
      message.error(`Kiểm tra thất bại: ${err.message || err}`)
    } finally {
      setSpellLoading(false)
      setSpellProgress(null)
    }
  }

  const applySpellSuggestion = (issue, replacement) => {
    const nextHtml = applySpellFix(
      sections[issue.sectionIndex].html,
      issue.nodeIndex,
      issue.localStart,
      issue.localEnd,
      replacement
    )
    if (nextHtml == null) {
      message.error('Không định vị được vị trí lỗi (nội dung đã đổi?)')
      return
    }
    setSections((prev) =>
      prev.map((s, i) => (i === issue.sectionIndex ? { ...s, html: nextHtml } : s))
    )
    const delta = Array.from(replacement).length - (issue.localEnd - issue.localStart)
    setSpellResult((prev) => ({
      ...prev,
      issues: prev.issues
        .filter((i) => i.id !== issue.id)
        .map((i) =>
          i.sectionIndex === issue.sectionIndex &&
          i.nodeIndex === issue.nodeIndex &&
          i.localStart >= issue.localEnd
            ? { ...i, localStart: i.localStart + delta, localEnd: i.localEnd + delta }
            : i
        ),
    }))
    message.success(`Đã sửa "${issue.original}" → "${replacement}"`)
    setSpellPopover(null)
  }

  const ignoreSpellIssue = (issue) => {
    setSpellResult((prev) => ({
      ...prev,
      issues: prev.issues.filter((i) => i.id !== issue.id),
    }))
    setSpellPopover(null)
  }

  const scrollToIssue = (issue) => {
    const mark = document.querySelector(`mark.sp-hl[data-iid="${CSS.escape(issue.id)}"]`)
    const target = mark || document.getElementById(`ida-sec-${issue.sectionIndex}`)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const flashEl = mark || target
    flashEl.classList.add('sp-hl--flash')
    setTimeout(() => flashEl.classList.remove('sp-hl--flash'), 1200)
  }

  const gotoError = (i) => {
    if (!orderedIssues.length) return
    const idx = ((i % orderedIssues.length) + orderedIssues.length) % orderedIssues.length
    setSpellNavIndex(idx)
    scrollToIssue(orderedIssues[idx])
  }

  const handleContentClick = (e, sectionIndex) => {
    const contentRoot = e.currentTarget
    const mark = e.target.closest('mark.sp-hl')
    if (mark) {
      const iid = mark.getAttribute('data-iid')
      const issue = spellResult?.issues.find((i) => i.id === iid)
      if (issue) {
        const rect = surfaceRef.current?.getBoundingClientRect()
        setPicker(null)
        setSpellPopover({
          top: e.clientY - (rect?.top ?? 0) + 8,
          left: Math.max(0, e.clientX - (rect?.left ?? 0)),
          issue,
        })
        return
      }
    }
    const items = []
    let el = e.target
    while (el && el !== contentRoot) {
      const meta = OBJECT_TAGS[el.tagName]
      if (meta) {
        const path = getLeafPath(el, contentRoot)
        items.push({
          label: meta.label,
          tag: el.tagName.toLowerCase(),
          useOuter: meta.outer,
          action: 'edit',
          path,
        })
        if (el.tagName === 'TABLE') {
          items.push({
            label: 'Thuộc tính bảng (rộng, canh, viền…)',
            tag: 'table',
            action: 'tableProps',
            path,
          })
        }
      }
      el = el.parentElement
    }
    if (items.length === 0) return
    if (items.length === 1) {
      openObjectEdit(sectionIndex, items[0])
      return
    }
    const rect = surfaceRef.current?.getBoundingClientRect()
    setPicker({
      top: e.clientY - (rect?.top ?? 0) + 8,
      left: e.clientX - (rect?.left ?? 0),
      sectionIndex,
      items,
    })
  }

  // ===== Xuất =====
  const copyAssembled = async () => {
    try {
      await navigator.clipboard.writeText(assembled)
      message.success('Đã copy HTML')
    } catch {
      message.error('Trình duyệt chặn clipboard')
    }
  }

  const downloadAssembled = () => {
    const blob = new Blob([`<!doctype html><meta charset="utf-8">\n${assembled}`], {
      type: 'text/html;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'noi-dung.html'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSave = () => onSave?.(assembled)

  const InsertBar = ({ index }) => (
    <div
      className="section-insert-bar"
      onClick={() => openInsert(index)}
      title="Thêm section tại đây"
    >
      <span className="section-insert-bar__line" />
      <span className="section-insert-bar__btn">
        <PlusOutlined /> Thêm section
      </span>
      <span className="section-insert-bar__line" />
    </div>
  )

  const spellNav = spellResult && orderedIssues.length > 0 && (
    <Space size={4} className="doc-toolbar__nav">
      <Tag
        color="error"
        style={{ cursor: 'pointer', margin: 0 }}
        onClick={() => gotoError(0)}
        title="Tới lỗi đầu tiên"
      >
        {orderedIssues.length} lỗi chính tả
      </Tag>
      <Button
        size="small"
        icon={<LeftOutlined />}
        onClick={() => gotoError(spellNavIndex - 1)}
        title="Lỗi trước"
      />
      <Text type="secondary" style={{ fontSize: 12 }}>
        {Math.min(spellNavIndex, orderedIssues.length - 1) + 1}/{orderedIssues.length}
      </Text>
      <Button
        size="small"
        icon={<RightOutlined />}
        onClick={() => gotoError(spellNavIndex + 1)}
        title="Lỗi tiếp theo"
      />
    </Space>
  )

  return (
    <div className="ida-editor">
      {/* Header: điều hướng lỗi + hành động + Lưu (dính khi cuộn) */}
      <div className="ida-editor__header">
        {title && <span className="ida-editor__title">{title}</span>}
        {spellCheckEnabled && spellNav}
        <span style={{ flex: 1 }} />
        <Space wrap>
          {spellCheckEnabled && (
            <Button
              icon={<CheckCircleOutlined />}
              onClick={handleSpellCheck}
              loading={spellLoading}
              disabled={!sections.length}
            >
              {spellLoading && spellProgress
                ? `Đang kiểm tra ${spellProgress.done}/${spellProgress.total}`
                : 'Kiểm tra chính tả'}
            </Button>
          )}
          <Button icon={<PlusOutlined />} onClick={() => openInsert(sections.length)}>
            Thêm section
          </Button>
          <Button icon={<CopyOutlined />} onClick={copyAssembled} disabled={!sections.length}>
            Copy
          </Button>
          <Button icon={<DownloadOutlined />} onClick={downloadAssembled} disabled={!sections.length}>
            Tải .html
          </Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
            Lưu
          </Button>
        </Space>
      </div>

      {/* Body: vùng cuộn tối đa maxHeight */}
      <div className="ida-editor__body" style={{ maxHeight }}>
        {sections.length === 0 ? (
          <Empty description="Chưa có nội dung">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openInsert(0)}>
              Thêm section
            </Button>
          </Empty>
        ) : (
          <div className="section-surface" ref={surfaceRef}>
            <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
              <InfoCircleOutlined /> Bấm vào nội dung để chọn <b>đối tượng</b> muốn
              sửa (đoạn, ô, danh sách, bảng…). Từ tô đỏ/vàng là lỗi chính tả — bấm để
              sửa.
            </Paragraph>
            <InsertBar index={0} />
            {sections.map((section, index) => (
              <div key={section.id}>
                <div id={`ida-sec-${index}`} className="section-block section-block--editable">
                  <div className="section-block__bar">
                    <button
                      type="button"
                      className="sec-btn sec-btn--edit"
                      onClick={() => openEdit(index)}
                      title="Sửa toàn bộ section (cả cấu trúc)"
                    >
                      ✎ Cả section
                    </button>
                    <button
                      type="button"
                      className="sec-btn sec-btn--del"
                      onClick={() => deleteSection(index)}
                      title="Xóa section"
                    >
                      ✕
                    </button>
                  </div>
                  <div
                    className="section-block__content leaf-editable"
                    onClick={(e) => handleContentClick(e, index)}
                    dangerouslySetInnerHTML={{
                      __html: issuesBySection.has(index)
                        ? annotateSectionHtml(section.html, issuesBySection.get(index))
                        : section.html,
                    }}
                  />
                </div>
                <InsertBar index={index + 1} />
              </div>
            ))}

            {picker && (
              <>
                <div className="obj-picker__backdrop" onClick={() => setPicker(null)} />
                <div className="obj-picker" style={{ top: picker.top, left: picker.left }}>
                  <div className="obj-picker__title">Chọn đối tượng để sửa</div>
                  {picker.items.map((it, i) => (
                    <button
                      key={i}
                      type="button"
                      className="obj-picker__item"
                      onClick={() => handlePick(picker.sectionIndex, it)}
                    >
                      {it.label}
                      <span className="obj-picker__tag">&lt;{it.tag}&gt;</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {spellPopover && (
              <>
                <div className="obj-picker__backdrop" onClick={() => setSpellPopover(null)} />
                <div className="obj-picker" style={{ top: spellPopover.top, left: spellPopover.left }}>
                  <div className="obj-picker__title">
                    {spellPopover.issue.kind === 'non_word' ? 'Sai từ' : 'Nghi sai ngữ cảnh'}:{' '}
                    <b>{spellPopover.issue.original}</b>
                  </div>
                  {spellPopover.issue.suggestions.length === 0 ? (
                    <div className="obj-picker__item">Không có gợi ý</div>
                  ) : (
                    spellPopover.issue.suggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        className="obj-picker__item"
                        onClick={() => applySpellSuggestion(spellPopover.issue, s.replacement)}
                      >
                        {s.replacement}
                        <span className="obj-picker__tag">
                          {(s.confidence * 100).toFixed(0)}%
                        </span>
                      </button>
                    ))
                  )}
                  <button
                    type="button"
                    className="obj-picker__item"
                    style={{ color: '#999' }}
                    onClick={() => ignoreSpellIssue(spellPopover.issue)}
                  >
                    Bỏ qua
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Danh sách lỗi (gọn) */}
      {spellResult && spellResult.issues.length > 0 && (
        <div className="ida-editor__issues">
          <List
            size="small"
            header={
              <Text strong>
                {spellResult.issues.length} lỗi · {spellResult.model} ·{' '}
                {spellResult.totalMs?.toFixed(0)} ms
              </Text>
            }
            dataSource={spellResult.issues}
            pagination={
              spellResult.issues.length > 10 ? { pageSize: 10, size: 'small' } : false
            }
            renderItem={(issue) => (
              <List.Item>
                <Space wrap size={6}>
                  <Tag color={issue.severity === 'confident' ? 'red' : 'gold'}>
                    {issue.kind === 'non_word' ? 'Sai từ' : 'Nghi ngữ cảnh'}
                  </Tag>
                  <Text delete>{issue.original}</Text>
                  <Button
                    type="text"
                    size="small"
                    icon={<AimOutlined />}
                    onClick={() => scrollToIssue(issue)}
                  >
                    Tới lỗi
                  </Button>
                  {issue.suggestions.map((s, si) => (
                    <Button
                      key={si}
                      size="small"
                      type="primary"
                      ghost
                      onClick={() => applySpellSuggestion(issue, s.replacement)}
                    >
                      {s.replacement}
                    </Button>
                  ))}
                  <Button size="small" type="text" onClick={() => ignoreSpellIssue(issue)}>
                    Bỏ qua
                  </Button>
                </Space>
              </List.Item>
            )}
          />
        </div>
      )}

      {/* Footer: trạng thái + Lưu */}
      <div className="ida-editor__footer">
        <Text type="secondary" style={{ fontSize: 12 }}>
          {sections.length} section
          {spellResult ? ` · ${spellResult.issues.length} lỗi` : ''}
        </Text>
        <span style={{ flex: 1 }} />
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
          Lưu
        </Button>
      </div>

      {/* Modal soạn thảo (TinyMCE) */}
      <Modal
        title={
          editing?.mode === 'edit'
            ? `Sửa cả section #${(editing?.index ?? 0) + 1}`
            : editing?.mode === 'leaf'
              ? `Sửa ${editing?.label ?? 'đối tượng'}`
              : 'Thêm section mới'
        }
        open={editing !== null}
        onOk={handleSaveSection}
        onCancel={() => setEditing(null)}
        okText={editing?.mode === 'insert' ? 'Thêm' : 'Lưu'}
        cancelText="Hủy"
        width={920}
        destroyOnClose
        maskClosable={false}
      >
        {editing && (
          <Editor
            onInit={(_evt, editor) => {
              editorRef.current = editor
              attachWordPaste(editor)
            }}
            initialValue={editorInitialValue}
            init={TINY_INIT}
          />
        )}
      </Modal>

      {/* Modal thuộc tính bảng */}
      <Modal
        title="Thuộc tính bảng"
        open={tableProps !== null}
        onOk={saveTableProps}
        onCancel={() => setTableProps(null)}
        okText="Áp dụng"
        cancelText="Hủy"
        width={520}
        destroyOnClose
      >
        {tpValues && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <div style={{ marginBottom: 6, fontWeight: 500 }}>Chiều rộng bảng</div>
              <Space>
                <InputNumber
                  min={1}
                  value={tpValues.widthValue}
                  onChange={(val) => setTp({ widthValue: val })}
                  placeholder="auto"
                  style={{ width: 120 }}
                />
                <Select
                  value={tpValues.widthUnit}
                  onChange={(u) => setTp({ widthUnit: u })}
                  style={{ width: 80 }}
                  options={[
                    { value: '%', label: '%' },
                    { value: 'px', label: 'px' },
                  ]}
                />
                <Text type="secondary">Bỏ trống = tự động</Text>
              </Space>
            </div>
            <div>
              <div style={{ marginBottom: 6, fontWeight: 500 }}>Canh bảng trong section</div>
              <Radio.Group
                value={tpValues.align}
                onChange={(e) => setTp({ align: e.target.value })}
                optionType="button"
                buttonStyle="solid"
              >
                <Radio.Button value="left">Trái</Radio.Button>
                <Radio.Button value="center">Giữa</Radio.Button>
                <Radio.Button value="right">Phải</Radio.Button>
              </Radio.Group>
            </div>
            <Divider style={{ margin: '4px 0' }} />
            <div>
              <Space>
                <Switch
                  checked={tpValues.applyBorder}
                  onChange={(c) => setTp({ applyBorder: c })}
                />
                <span>Đặt viền cho bảng & ô</span>
              </Space>
              {tpValues.applyBorder && (
                <Space style={{ marginTop: 10 }} wrap>
                  <span>Độ dày</span>
                  <InputNumber
                    min={0}
                    value={tpValues.borderWidth}
                    onChange={(val) => setTp({ borderWidth: val ?? 0 })}
                    addonAfter="px"
                    style={{ width: 110 }}
                  />
                  <span>Màu</span>
                  <input
                    type="color"
                    value={tpValues.borderColor}
                    onChange={(e) => setTp({ borderColor: e.target.value })}
                    style={{ width: 40, height: 32, border: 'none', background: 'none' }}
                  />
                  <Text type="secondary">Độ dày 0 = bỏ viền</Text>
                </Space>
              )}
            </div>
            <div>
              <Space>
                <Switch
                  checked={tpValues.applyPadding}
                  onChange={(c) => setTp({ applyPadding: c })}
                />
                <span>Đặt padding ô</span>
              </Space>
              {tpValues.applyPadding && (
                <div style={{ marginTop: 10 }}>
                  <InputNumber
                    min={0}
                    value={tpValues.cellPadding}
                    onChange={(val) => setTp({ cellPadding: val ?? 0 })}
                    addonAfter="px"
                    style={{ width: 120 }}
                  />
                </div>
              )}
            </div>
            <Space>
              <Switch
                checked={tpValues.borderCollapse}
                onChange={(c) => setTp({ borderCollapse: c })}
              />
              <span>Gộp viền (border-collapse)</span>
            </Space>
          </Space>
        )}
      </Modal>
    </div>
  )
})

export default IdaVibeEditor
