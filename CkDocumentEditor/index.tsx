import { CKEditor } from '@ckeditor/ckeditor5-react'
import {
  Alignment,
  AutoLink,
  Base64UploadAdapter,
  Bold,
  ClassicEditor,
  Essentials,
  FindAndReplace,
  Font,
  Fullscreen,
  GeneralHtmlSupport,
  HorizontalLine,
  Image,
  ImageInsert,
  ImageResize,
  ImageStyle,
  ImageToolbar,
  ImageUpload,
  Indent,
  IndentBlock,
  Italic,
  Link,
  List,
  PageBreak,
  Paragraph,
  PasteFromOffice,
  PlainTableOutput,
  RemoveFormat,
  SourceEditing,
  SpecialCharacters,
  SpecialCharactersText,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  TableCellProperties,
  TableProperties,
  TableToolbar,
  Underline,
} from 'ckeditor5'
import 'ckeditor5/ckeditor5.css'
import translations from 'ckeditor5/translations/vi.js'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import {
  normalizeHeadingHtmlLikeTinyMce,
  ProvisionHeadingPlugin,
  WordPasteCleanupPlugin,
} from './headingPlugins'
import {
  DOCUMENT_TOOLBAR_ITEMS,
  TinyToolbarCompatPlugin,
} from './toolbarCompat'
import './index.less'

export interface CkDocumentEditorHandle {
  getData: () => string
  setData: (html: string) => void
}

export interface CkDocumentEditorProps {
  value?: string
  onChange?: (html: string) => void
  disabled?: boolean
  height?: number
  placeholder?: string
}

const MIN_EDITOR_HEIGHT = 240
const EDITOR_HEIGHT_KEY = 'ck-document-editor-height'
const UNDO_STACK_LIMIT = 20
const WORD_COUNT_DELAY = 700

// Giữ đúng font_family_formats của TinyMCE cũ.
const FONT_FAMILY_OPTIONS = [
  'Arial, Helvetica, sans-serif',
  'Times New Roman, Times, serif',
  'Calibri, sans-serif',
  'Tahoma, Arial, Helvetica, sans-serif',
  'Verdana, Geneva, sans-serif',
  'Georgia, Palatino, serif',
  'Courier New, Courier, monospace',
  'Inter, Arial, sans-serif',
]

// Giữ đúng font_size_formats của TinyMCE cũ (px rồi pt).
const FONT_SIZE_OPTIONS = [
  '8px',
  '9px',
  '10px',
  '11px',
  '12px',
  '14px',
  '16px',
  '18px',
  '20px',
  '22px',
  '24px',
  '26px',
  '28px',
  '32px',
  '36px',
  '48px',
  '72px',
  '8pt',
  '9pt',
  '10pt',
  '10.5pt',
  '11pt',
  '12pt',
  '13pt',
  '14pt',
  '16pt',
  '18pt',
  '20pt',
  '24pt',
  '28pt',
  '36pt',
  '48pt',
  '72pt',
].map((size) => ({
  title: size,
  model: size,
  view: { name: 'span', styles: { 'font-size': size } },
}))

// Giữ đúng color_map của TinyMCE cũ.
const COLOR_OPTIONS = [
  ['#000000', 'Black'],
  ['#993300', 'Burnt orange'],
  ['#333300', 'Dark olive'],
  ['#003300', 'Dark green'],
  ['#003366', 'Dark azure'],
  ['#000080', 'Navy Blue'],
  ['#333399', 'Indigo'],
  ['#333333', 'Very dark gray'],
  ['#800000', 'Maroon'],
  ['#FF6600', 'Orange'],
  ['#808000', 'Olive'],
  ['#008000', 'Green'],
  ['#008080', 'Teal'],
  ['#0000FF', 'Blue'],
  ['#666699', 'Grayish blue'],
  ['#808080', 'Gray'],
  ['#FF0000', 'Red'],
  ['#FF9900', 'Amber'],
  ['#99CC00', 'Yellow green'],
  ['#339966', 'Sea green'],
  ['#33CCCC', 'Turquoise'],
  ['#3366FF', 'Royal blue'],
  ['#800080', 'Purple'],
  ['#999999', 'Medium gray'],
  ['#FF00FF', 'Magenta'],
  ['#FFCC00', 'Gold'],
  ['#FFFF00', 'Yellow'],
  ['#00FF00', 'Lime'],
  ['#00FFFF', 'Aqua'],
  ['#00CCFF', 'Sky blue'],
  ['#993366', 'Red violet'],
  ['#FFFFFF', 'White'],
  ['#FF99CC', 'Pink'],
  ['#FFCC99', 'Peach'],
  ['#FFFF99', 'Light yellow'],
  ['#CCFFCC', 'Pale green'],
  ['#CCFFFF', 'Pale cyan'],
  ['#99CCFF', 'Light sky blue'],
  ['#CC99FF', 'Plum'],
].map(([color, label]) => ({ color, label }))

const runWhenIdle = (task: () => void, timeout = 200) => {
  const idle = (
    window as unknown as {
      requestIdleCallback?: (
        cb: () => void,
        options?: { timeout: number }
      ) => number
    }
  ).requestIdleCallback
  if (idle) return idle(task, { timeout })
  return window.setTimeout(task, 0)
}

const countWordsFromModel = (editor: ClassicEditor) => {
  const root = editor.model.document.getRoot()
  if (!root) return 0
  let words = 0
  let inWord = false
  for (const item of editor.model.createRangeIn(root).getItems()) {
    if (!item.is('$textProxy') && !item.is('$text')) continue
    const data = item.data || ''
    for (let i = 0; i < data.length; i += 1) {
      const isSpace = data.charCodeAt(i) <= 32
      if (isSpace) {
        inWord = false
      } else if (!inWord) {
        words += 1
        inWord = true
      }
    }
  }
  return words
}

const readStoredHeight = (fallback: number) => {
  try {
    const stored = Number(sessionStorage.getItem(EDITOR_HEIGHT_KEY))
    return Number.isFinite(stored) && stored >= MIN_EDITOR_HEIGHT
      ? stored
      : fallback
  } catch {
    return fallback
  }
}

const clampEditorHeight = (next: number) => {
  const maxHeight = Math.max(
    MIN_EDITOR_HEIGHT,
    Math.round(window.innerHeight * 0.85)
  )
  return Math.min(Math.max(next, MIN_EDITOR_HEIGHT), maxHeight)
}

const limitUndoStack = (editor: ClassicEditor) => {
  const undo = editor.commands.get('undo') as
    | { clearStack?: () => void; _stack?: unknown[] }
    | undefined
  const redo = editor.commands.get('redo') as
    | { clearStack?: () => void }
    | undefined
  const stack = undo?._stack
  if (stack && stack.length > UNDO_STACK_LIMIT) {
    stack.splice(0, stack.length - UNDO_STACK_LIMIT)
  }
  return { undo, redo }
}

const CkDocumentEditor = forwardRef<
  CkDocumentEditorHandle,
  CkDocumentEditorProps
>(function CkDocumentEditor(
  { value, onChange, disabled, height = 500, placeholder },
  ref
) {
  const editorRef = useRef<ClassicEditor | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  const initialDataRef = useRef(value || '')
  const lastExternalValueRef = useRef(value || '')
  const pendingDataRef = useRef<string | null>(null)
  const isMountedEditorRef = useRef(false)
  const skipNextValueSyncRef = useRef(false)
  const wordCountRef = useRef<HTMLSpanElement>(null)
  const wordCountTimerRef = useRef<number | null>(null)
  const heightRef = useRef(readStoredHeight(height))
  const isResizingRef = useRef(false)
  const [shouldInit, setShouldInit] = useState(false)
  onChangeRef.current = onChange

  const applyHeight = (next: number) => {
    const clamped = clampEditorHeight(next)
    heightRef.current = clamped
    rootRef.current?.style.setProperty('--ck-editable-height', `${clamped}px`)
  }

  const readNormalizedData = () => {
    const editor = editorRef.current
    if (!editor) return pendingDataRef.current ?? initialDataRef.current
    return normalizeHeadingHtmlLikeTinyMce(editor.getData())
  }

  const emitChange = (html: string) => {
    skipNextValueSyncRef.current = true
    lastExternalValueRef.current = html
    onChangeRef.current?.(html)
  }

  useImperativeHandle(ref, () => ({
    getData: readNormalizedData,
    setData: (html: string) => {
      skipNextValueSyncRef.current = true
      lastExternalValueRef.current = html || ''
      if (!editorRef.current) {
        pendingDataRef.current = html || ''
        if (!isMountedEditorRef.current) initialDataRef.current = html || ''
        return
      }
      editorRef.current.setData(html || '')
    },
  }))

  useEffect(() => {
    let cancelled = false
    runWhenIdle(() => {
      if (cancelled) return
      isMountedEditorRef.current = true
      setShouldInit(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (disabled) {
      editor.enableReadOnlyMode('content-editor')
    } else {
      editor.disableReadOnlyMode('content-editor')
    }
  }, [disabled])

  useEffect(() => {
    if (value === undefined) return
    const editor = editorRef.current
    if (!editor) {
      // Editor khởi tạo trong idle nên dữ liệu có thể về trước: giữ lại để nạp khi ready.
      pendingDataRef.current = value || ''
      if (!isMountedEditorRef.current) initialDataRef.current = value || ''
      lastExternalValueRef.current = value
      return
    }
    if (skipNextValueSyncRef.current) {
      skipNextValueSyncRef.current = false
      return
    }
    if (value === lastExternalValueRef.current) return
    lastExternalValueRef.current = value
    editor.setData(value || '')
  }, [value])

  const config = useMemo(
    () => ({
      licenseKey: 'GPL' as const,
      language: 'vi',
      translations: [translations],
      placeholder,
      plugins: [
        Essentials,
        Paragraph,
        Bold,
        Italic,
        Underline,
        Strikethrough,
        Superscript,
        Subscript,
        Font,
        Alignment,
        RemoveFormat,
        Link,
        AutoLink,
        List,
        Indent,
        IndentBlock,
        Table,
        TableToolbar,
        TableProperties,
        TableCellProperties,
        PlainTableOutput,
        Image,
        ImageStyle,
        ImageToolbar,
        ImageResize,
        ImageInsert,
        ImageUpload,
        Base64UploadAdapter,
        HorizontalLine,
        PageBreak,
        SpecialCharacters,
        SpecialCharactersText,
        FindAndReplace,
        Fullscreen,
        SourceEditing,
        GeneralHtmlSupport,
        PasteFromOffice,
        WordPasteCleanupPlugin,
        ProvisionHeadingPlugin,
        TinyToolbarCompatPlugin,
      ],
      toolbar: {
        items: DOCUMENT_TOOLBAR_ITEMS,
        shouldNotGroupWhenFull: true,
      },
      fontFamily: {
        options: FONT_FAMILY_OPTIONS,
        supportAllValues: true,
      },
      fontSize: {
        options: FONT_SIZE_OPTIONS,
        supportAllValues: true,
      },
      fontColor: {
        colors: COLOR_OPTIONS,
        columns: 8,
        documentColors: 0,
      },
      fontBackgroundColor: {
        colors: COLOR_OPTIONS,
        columns: 8,
        documentColors: 0,
      },
      alignment: {
        options: ['left', 'center', 'right', 'justify'] as const,
      },
      table: {
        contentToolbar: [
          'tableColumn',
          'tableRow',
          'mergeTableCells',
          'tableProperties',
          'tableCellProperties',
        ],
      },
      image: {
        toolbar: [
          'imageTextAlternative',
          'imageStyle:inline',
          'imageStyle:block',
          'resizeImage',
        ],
        insert: {
          integrations: ['upload', 'url'],
        },
      },
      fullscreen: {
        menuBar: {
          isVisible: false,
        },
      },
      htmlSupport: {
        allow: [
          {
            name: 'p',
            attributes: true,
            classes: true,
            styles: true,
          },
          {
            name: 'span',
            attributes: true,
            classes: true,
            styles: true,
          },
          {
            name: /^(div|table|thead|tbody|tr|td|th|col|colgroup|img|a|ul|ol|li|br|hr|strong|em|b|i|u|s|sub|sup|ins|del|blockquote)$/,
            attributes: true,
            classes: true,
            styles: true,
          },
        ],
      },
    }),
    [placeholder]
  )

  const handleResizePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    event.preventDefault()
    event.stopPropagation()
    const handle = event.currentTarget
    const startY = event.clientY
    const startHeight = heightRef.current
    let frame = 0
    let pendingHeight = startHeight

    isResizingRef.current = true
    rootRef.current?.classList.add('is-resizing')
    handle.setPointerCapture(event.pointerId)

    const onMove = (moveEvent: PointerEvent) => {
      pendingHeight = startHeight + (moveEvent.clientY - startY)
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        applyHeight(pendingHeight)
      })
    }

    const onUp = () => {
      isResizingRef.current = false
      rootRef.current?.classList.remove('is-resizing')
      if (frame) window.cancelAnimationFrame(frame)
      applyHeight(pendingHeight)
      try {
        sessionStorage.setItem(EDITOR_HEIGHT_KEY, String(heightRef.current))
      } catch {
        // ignore
      }
      try {
        handle.releasePointerCapture(event.pointerId)
      } catch {
        // ignore
      }
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      ref={rootRef}
      className="ck-document-editor"
      style={
        {
          '--ck-editable-height': `${heightRef.current}px`,
        } as CSSProperties
      }
    >
      {shouldInit ? (
        <CKEditor
          editor={ClassicEditor}
          data={initialDataRef.current}
          disabled={disabled}
          config={config}
          onReady={(editor) => {
            editorRef.current = editor
            if (disabled) {
              editor.enableReadOnlyMode('content-editor')
            }

            const pending = pendingDataRef.current
            pendingDataRef.current = null
            if (pending !== null && pending !== initialDataRef.current) {
              editor.setData(pending)
            }

            const { undo, redo } = limitUndoStack(editor)
            undo?.clearStack?.()
            redo?.clearStack?.()

            let countedVersion = -1
            const renderWords = (immediate = false) => {
              if (isResizingRef.current) return
              const run = () => {
                const version = editor.model.document.version
                if (version === countedVersion) return
                countedVersion = version
                if (wordCountRef.current) {
                  wordCountRef.current.textContent = `${countWordsFromModel(
                    editor
                  )} từ`
                }
              }
              if (wordCountTimerRef.current) {
                window.clearTimeout(wordCountTimerRef.current)
                wordCountTimerRef.current = null
              }
              if (immediate) {
                run()
                return
              }
              wordCountTimerRef.current = window.setTimeout(
                () => runWhenIdle(run, 1000),
                WORD_COUNT_DELAY
              )
            }

            runWhenIdle(() => renderWords(true))
            editor.model.document.on('change:data', () => {
              limitUndoStack(editor)
              renderWords()
            })

            editor.on('destroy', () => {
              if (wordCountTimerRef.current) {
                window.clearTimeout(wordCountTimerRef.current)
              }
              editorRef.current = null
            })
          }}
          onBlur={(_, editor) => {
            emitChange(normalizeHeadingHtmlLikeTinyMce(editor.getData()))
            if (wordCountRef.current) {
              wordCountRef.current.textContent = `${countWordsFromModel(
                editor
              )} từ`
            }
          }}
        />
      ) : (
        <div
          className="ck-document-editor__placeholder"
          style={{ height: heightRef.current }}
        />
      )}
      <div className="ck-document-editor__statusbar">
        <span>Press Alt+0 for help</span>
        <span className="ck-document-editor__status-right">
          <span ref={wordCountRef} className="ck-document-editor__wordcount">
            0 từ
          </span>
          <button
            type="button"
            className="ck-document-editor__resize"
            aria-label="Kéo để thay đổi chiều cao khung soạn thảo"
            onPointerDown={handleResizePointerDown}
          />
        </span>
      </div>
    </div>
  )
})

export default CkDocumentEditor
