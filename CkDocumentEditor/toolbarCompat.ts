import {
  ButtonView,
  Collection,
  IconBoxWithCross,
  IconEraser,
  IconEye,
  IconHistory,
  IconInfo,
  IconParagraph,
  IconPrint,
  IconRemove,
  IconTableColumn,
  IconTableMergeCell,
  IconTableRow,
  IconUnlink,
  Plugin,
  ViewModel,
  addListToDropdown,
  createDropdown,
  type Editor,
} from 'ckeditor5'

const HELP_SHORTCUTS: Array<[string, string]> = [
  ['In đậm', 'Ctrl+B'],
  ['In nghiêng', 'Ctrl+I'],
  ['Gạch chân', 'Ctrl+U'],
  ['Chọn tất cả', 'Ctrl+A'],
  ['Làm lại', 'Ctrl+Y hoặc Ctrl+Shift+Z'],
  ['Hoàn tác', 'Ctrl+Z'],
  ['Phần', 'Ctrl+Alt+1'],
  ['Chương', 'Ctrl+Alt+2'],
  ['Mục', 'Ctrl+Alt+3'],
  ['Tiểu mục', 'Ctrl+Alt+4'],
  ['Điều', 'Ctrl+Alt+5'],
  ['Khoản', 'Ctrl+Alt+6'],
  ['Điểm', 'Ctrl+Alt+7'],
  ['Nội dung', 'Ctrl+Alt+8'],
  ['Gộp thẻ', 'Ctrl+Alt+9'],
  ['Không xác định', 'Ctrl+Alt+0'],
  ['Mở hộp thoại trợ giúp', 'Alt+0'],
]

const openHtmlWindow = (title: string, html: string, autoPrint = false) => {
  const popup = window.open(
    '',
    '_blank',
    'noopener,noreferrer,width=1024,height=768'
  )
  if (!popup) return
  popup.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: 'Times New Roman', Times, serif; font-size: 14px; line-height: 1.5; padding: 24px; }
    .prov-part, .prov-chapter, .prov-section, .prov-subsection { text-align: center; font-weight: 700; }
    .prov-article { font-weight: 700; }
    table { border-collapse: collapse; }
    td, th { border: 1px solid #ccc; padding: 4px 8px; }
    img { max-width: 100%; }
  </style>
</head>
<body>${html}</body>
</html>`)
  popup.document.close()
  if (autoPrint) {
    popup.focus()
    popup.print()
  }
}

const showHelpDialog = () => {
  const existing = document.getElementById('ck-document-editor-help')
  existing?.remove()

  const overlay = document.createElement('div')
  overlay.id = 'ck-document-editor-help'
  overlay.className = 'ck-document-editor-help'
  overlay.innerHTML = `
    <div class="ck-document-editor-help__dialog" role="dialog" aria-modal="true">
      <div class="ck-document-editor-help__header">
        <strong>Phím tắt tiện dụng</strong>
        <button type="button" class="ck-document-editor-help__close" aria-label="Đóng">×</button>
      </div>
      <table class="ck-document-editor-help__table">
        <thead><tr><th>Hành động</th><th>Phím tắt</th></tr></thead>
        <tbody>
          ${HELP_SHORTCUTS.map(
            ([action, shortcut]) =>
              `<tr><td>${action}</td><td>${shortcut}</td></tr>`
          ).join('')}
        </tbody>
      </table>
    </div>
  `
  const close = () => overlay.remove()
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close()
  })
  overlay
    .querySelector('.ck-document-editor-help__close')
    ?.addEventListener('click', close)
  document.body.appendChild(overlay)
}

const addCommandButton = (
  editor: Editor,
  name: string,
  label: string,
  icon: string,
  commandName: string
) => {
  editor.ui.componentFactory.add(name, (locale) => {
    const button = new ButtonView(locale)
    const command = editor.commands.get(commandName)
    button.set({ label, icon, tooltip: true })
    if (command) {
      button.bind('isEnabled').to(command, 'isEnabled')
    }
    button.on('execute', () => {
      if (command?.isEnabled) {
        editor.execute(commandName)
        editor.editing.view.focus()
      }
    })
    return button
  })
}

const addActionButton = (
  editor: Editor,
  name: string,
  label: string,
  icon: string,
  onExecute: () => void,
  commandName?: string
) => {
  editor.ui.componentFactory.add(name, (locale) => {
    const button = new ButtonView(locale)
    button.set({ label, icon, tooltip: true })
    if (commandName) {
      const command = editor.commands.get(commandName)
      if (command) {
        button.bind('isEnabled').to(command, 'isEnabled')
      }
    }
    button.on('execute', () => {
      onExecute()
      editor.editing.view.focus()
    })
    return button
  })
}

// insertdatetime_formats mặc định của TinyMCE: %H:%M:%S, %Y-%m-%d, %I:%M:%S %p, %D
const DATE_TIME_FORMATS: Array<(now: Date) => string> = [
  (now) =>
    [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((part) => String(part).padStart(2, '0'))
      .join(':'),
  (now) =>
    [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-'),
  (now) => {
    const hours = now.getHours() % 12 || 12
    const time = [hours, now.getMinutes(), now.getSeconds()]
      .map((part, index) => (index ? String(part).padStart(2, '0') : part))
      .join(':')
    return `${time} ${now.getHours() < 12 ? 'AM' : 'PM'}`
  },
  (now) =>
    [
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      now.getFullYear(),
    ].join('/'),
]

const addDateTimeDropdown = (editor: Editor) => {
  editor.ui.componentFactory.add('insertDateTime', (locale) => {
    const dropdown = createDropdown(locale)
    let activeIndex = 0

    dropdown.buttonView.set({
      label: 'Chèn ngày giờ',
      icon: IconHistory,
      tooltip: true,
    })

    const insert = (index: number) => {
      activeIndex = index
      const text = DATE_TIME_FORMATS[index](new Date())
      editor.model.change((writer) => {
        editor.model.insertContent(writer.createText(text))
      })
      editor.editing.view.focus()
    }

    const items = new Collection()
    DATE_TIME_FORMATS.forEach((format, index) => {
      const model = new ViewModel({
        withText: true,
        isToggleable: true,
        label: format(new Date()),
        isOn: index === activeIndex,
      })
      model.set('formatIndex', index)
      items.add({ type: 'button', model } as never)
    })

    addListToDropdown(dropdown, items as never)

    dropdown.on('change:isOpen', () => {
      if (!dropdown.isOpen) return
      const now = new Date()
      Array.from(items).forEach((item: any, index) => {
        item.model.set('label', DATE_TIME_FORMATS[index](now))
        item.model.set('isOn', index === activeIndex)
      })
    })

    dropdown.on('execute', (evt: { source?: { formatIndex?: number } }) => {
      const index = evt.source?.formatIndex
      if (typeof index === 'number') insert(index)
    })

    return dropdown
  })
}

// CK để font family/size là nút icon, TinyMCE cũ hiển thị giá trị đang dùng trong một ô chữ.
const addValueBoxDropdown = (
  editor: Editor,
  name: string,
  sourceName: string,
  commandName: string,
  tooltip: string,
  format: (value: unknown) => string
) => {
  editor.ui.componentFactory.add(name, () => {
    const dropdown = editor.ui.componentFactory.create(sourceName) as any
    const command = editor.commands.get(commandName)
    dropdown.buttonView.set({
      withText: true,
      icon: undefined,
      tooltip,
    })
    if (command) {
      dropdown.buttonView.bind('label').to(command, 'value', format)
    }
    return dropdown
  })
}

const deleteSelectedTable = (editor: Editor) => {
  editor.model.change((writer) => {
    const position = editor.model.document.selection.getFirstPosition()
    const table = position?.findAncestor('table')
    if (table) {
      writer.remove(table)
    }
  })
}

export class TinyToolbarCompatPlugin extends Plugin {
  public static get pluginName() {
    return 'TinyToolbarCompatPlugin'
  }

  public init() {
    const editor = this.editor

    addActionButton(editor, 'print', 'In', IconPrint, () => {
      openHtmlWindow('In văn bản', editor.getData(), true)
    })

    addActionButton(editor, 'preview', 'Xem trước', IconEye, () => {
      openHtmlWindow('Xem trước', editor.getData())
    })

    addActionButton(editor, 'help', 'Trợ giúp', IconInfo, showHelpDialog)

    addDateTimeDropdown(editor)

    addValueBoxDropdown(
      editor,
      'fontFamilyBox',
      'fontFamily',
      'fontFamily',
      'Phông chữ',
      (value) =>
        String(value || 'Times New Roman')
          .split(',')[0]
          .replace(/['"]/g, '')
          .trim()
    )

    addValueBoxDropdown(
      editor,
      'fontSizeBox',
      'fontSize',
      'fontSize',
      'Cỡ chữ',
      (value) => String(value || '14px')
    )

    addActionButton(
      editor,
      'nonBreakingSpace',
      'Khoảng trắng cố định',
      IconParagraph,
      () => {
        editor.model.change((writer) => {
          editor.model.insertContent(writer.createText('\u00a0'))
        })
      }
    )

    addCommandButton(editor, 'unlink', 'Bỏ liên kết', IconUnlink, 'unlink')

    addActionButton(
      editor,
      'tableDelete',
      'Xóa bảng',
      IconBoxWithCross,
      () => deleteSelectedTable(editor),
      'insertTableRowAbove'
    )

    addCommandButton(
      editor,
      'tableInsertRowBefore',
      'Chèn hàng phía trên',
      IconTableRow,
      'insertTableRowAbove'
    )
    addCommandButton(
      editor,
      'tableInsertRowAfter',
      'Chèn hàng phía dưới',
      IconTableRow,
      'insertTableRowBelow'
    )
    addCommandButton(
      editor,
      'tableDeleteRow',
      'Xóa hàng',
      IconRemove,
      'removeTableRow'
    )
    addCommandButton(
      editor,
      'tableInsertColumnBefore',
      'Chèn cột bên trái',
      IconTableColumn,
      'insertTableColumnLeft'
    )
    addCommandButton(
      editor,
      'tableInsertColumnAfter',
      'Chèn cột bên phải',
      IconTableColumn,
      'insertTableColumnRight'
    )
    addCommandButton(
      editor,
      'tableDeleteColumn',
      'Xóa cột',
      IconEraser,
      'removeTableColumn'
    )
    addActionButton(
      editor,
      'splitTableCell',
      'Tách ô',
      IconTableMergeCell,
      () => {
        const vertical = editor.commands.get('splitTableCellVertically')
        const horizontal = editor.commands.get('splitTableCellHorizontally')
        if (vertical?.isEnabled) {
          editor.execute('splitTableCellVertically')
        } else if (horizontal?.isEnabled) {
          editor.execute('splitTableCellHorizontally')
        }
      },
      'splitTableCellVertically'
    )

    editor.keystrokes.set('ALT+0', (_data, cancel) => {
      showHelpDialog()
      cancel()
    })
  }
}

export const DOCUMENT_TOOLBAR_ITEMS = [
  'sourceEditing',
  'undo',
  'redo',
  'findAndReplace',
  'print',
  'preview',
  'fullscreen',
  '|',
  'provisionHeading',
  'fontFamilyBox',
  'fontSizeBox',
  '|',
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'superscript',
  'subscript',
  '|',
  'fontColor',
  'fontBackgroundColor',
  '|',
  'removeFormat',
  '|',
  'alignment:left',
  'alignment:center',
  'alignment:right',
  'alignment:justify',
  '|',
  'bulletedList',
  'numberedList',
  'outdent',
  'indent',
  '|',
  'insertTable',
  'tableDelete',
  'tableProperties',
  'tableRow',
  'tableCellProperties',
  '|',
  'tableInsertRowBefore',
  'tableInsertRowAfter',
  'tableDeleteRow',
  '|',
  'tableInsertColumnBefore',
  'tableInsertColumnAfter',
  'tableDeleteColumn',
  '|',
  'mergeTableCells',
  'splitTableCell',
  '|',
  'link',
  'unlink',
  '|',
  'insertImage',
  '|',
  'specialCharacters',
  '|',
  'horizontalLine',
  'pageBreak',
  '|',
  'insertDateTime',
  'nonBreakingSpace',
  'help',
]
