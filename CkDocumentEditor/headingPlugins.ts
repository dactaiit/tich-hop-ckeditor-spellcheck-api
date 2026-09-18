import {
  ClassicEditor,
  Collection,
  Command,
  Plugin,
  ViewModel,
  addListToDropdown,
  createDropdown,
} from 'ckeditor5'

type ProvisionClass =
  | 'prov-part'
  | 'prov-chapter'
  | 'prov-section'
  | 'prov-subsection'
  | 'prov-article'
  | 'prov-clause'
  | 'prov-item'
  | 'prov-content'

type HtmlSupportValue = {
  attributes?: Record<string, string>
  classes?: string[] | Set<string> | string
  styles?: Record<string, string>
  class?: string
}

const PROVISION_HEADING_OPTIONS: Array<{
  label: string
  value: ProvisionClass
  shortcut: string
}> = [
  { label: 'Phần', value: 'prov-part', shortcut: 'Ctrl+Alt+1' },
  { label: 'Chương', value: 'prov-chapter', shortcut: 'Ctrl+Alt+2' },
  { label: 'Mục', value: 'prov-section', shortcut: 'Ctrl+Alt+3' },
  { label: 'Tiểu mục', value: 'prov-subsection', shortcut: 'Ctrl+Alt+4' },
  { label: 'Điều', value: 'prov-article', shortcut: 'Ctrl+Alt+5' },
  { label: 'Khoản', value: 'prov-clause', shortcut: 'Ctrl+Alt+6' },
  { label: 'Điểm', value: 'prov-item', shortcut: 'Ctrl+Alt+7' },
  { label: 'Nội dung', value: 'prov-content', shortcut: 'Ctrl+Alt+8' },
]

const PROVISION_CLASSES = PROVISION_HEADING_OPTIONS.map((item) => item.value)

const CENTER_FORMATS = new Set<ProvisionClass>([
  'prov-part',
  'prov-chapter',
  'prov-section',
  'prov-subsection',
])

const STRONG_FORMATS = new Set<ProvisionClass>([
  'prov-part',
  'prov-chapter',
  'prov-section',
  'prov-subsection',
  'prov-article',
])

const toClassList = (
  className?: string | string[] | Set<string> | null
): string[] => {
  if (Array.isArray(className)) return [...className]
  if (className instanceof Set) return Array.from(className)
  return String(className || '')
    .split(/\s+/)
    .filter(Boolean)
}

const pickProvisionClass = (
  className?: string | string[] | Set<string> | null
) =>
  toClassList(className).find((item) =>
    PROVISION_CLASSES.includes(item as ProvisionClass)
  ) as ProvisionClass | undefined

const uniqueProvClasses = (classes: string[]) => {
  let keptProv: string | undefined
  return classes.filter((item) => {
    if (!PROVISION_CLASSES.includes(item as ProvisionClass)) return true
    if (keptProv) return false
    keptProv = item
    return true
  })
}

const getHtmlSupportKey = (block: any) =>
  block.hasAttribute('htmlPAttributes') ? 'htmlPAttributes' : 'htmlAttributes'

const readHtmlSupport = (block: any): HtmlSupportValue => ({
  ...(block.getAttribute('htmlPAttributes') ||
    block.getAttribute('htmlAttributes') ||
    {}),
})

const writeHtmlSupport = (writer: any, block: any, next: HtmlSupportValue) => {
  const key = getHtmlSupportKey(block)
  const hasContent =
    (next.attributes && Object.keys(next.attributes).length > 0) ||
    (next.styles && Object.keys(next.styles).length > 0) ||
    toClassList(next.classes).length > 0

  if (hasContent) {
    writer.setAttribute(key, next, block)
  } else if (block.hasAttribute(key)) {
    writer.removeAttribute(key, block)
  }
}

const IMAGE_ELEMENT_NAMES = new Set([
  'imageInline',
  'imageBlock',
  'htmlImg',
  'img',
])

const getCurrentTextAlign = (block: any) => {
  const fromModel = block.getAttribute('alignment') as string | undefined
  if (fromModel) return fromModel
  const html = readHtmlSupport(block)
  const fromStyle = html.styles?.['text-align'] || html.styles?.textAlign
  if (fromStyle) return String(fromStyle).trim().toLowerCase()
  const fromAlign = html.attributes?.align
  return fromAlign ? String(fromAlign).trim().toLowerCase() : ''
}

const unwrapPlainSpans = (writer: any, block: any) => {
  Array.from(block.getChildren()).forEach((child: any) => {
    if (!child.is?.('element')) return
    if (child.name !== 'htmlSpan' && child.name !== 'span') return
    const attrs =
      child.getAttribute('htmlSpanAttributes') ||
      child.getAttribute('htmlAttributes') ||
      {}
    const styles = attrs.styles || {}
    if (styles['font-size'] || styles.fontSize) return
    writer.unwrap(child)
  })
}

const applyStrongLikeTinyMce = (
  writer: any,
  block: any,
  needsStrong: boolean
) => {
  const range = writer.createRangeIn(block)
  if (!needsStrong) {
    writer.removeAttribute('bold', range)
    return
  }

  let hasImage = false
  for (const item of range.getItems()) {
    if (item.is?.('element') && IMAGE_ELEMENT_NAMES.has(item.name)) {
      hasImage = true
      break
    }
  }

  if (!hasImage) {
    writer.setAttribute('bold', true, range)
    return
  }

  for (const item of Array.from(range.getItems()) as any[]) {
    if (
      item.is?.('$textProxy') ||
      item.is?.('textProxy') ||
      item.is?.('$text')
    ) {
      writer.setAttribute('bold', true, item)
    }
  }
}

const stripAllClassesKeepPresentation = (writer: any, block: any) => {
  writer.removeAttribute('provisionClass', block)
  const html = readHtmlSupport(block)
  writeHtmlSupport(writer, block, {
    ...html,
    classes: [],
    class: undefined,
  })
}

const toggleOffHeadingLikeTinyMce = (writer: any, block: any) => {
  writer.removeAttribute('provisionClass', block)
  if (block.getAttribute('alignment')) {
    writer.removeAttribute('alignment', block)
  }
  const html = readHtmlSupport(block)
  const styles = { ...(html.styles || {}) }
  const attributes = { ...(html.attributes || {}) }
  styles['font-size'] = '14px'
  delete styles['text-align']
  delete attributes.align
  writeHtmlSupport(writer, block, {
    ...html,
    styles,
    attributes,
    classes: toClassList(html.classes || html.class).filter(
      (item) => !item.startsWith('prov-')
    ),
  })
  applyStrongLikeTinyMce(writer, block, false)
}

const applyHeadingPresentation = (
  writer: any,
  block: any,
  format: ProvisionClass
) => {
  const currentAlign = getCurrentTextAlign(block)
  const shouldDefaultCenter = CENTER_FORMATS.has(format)
  const nextAlign = shouldDefaultCenter
    ? currentAlign || 'center'
    : currentAlign === 'center'
    ? ''
    : currentAlign

  if (nextAlign) {
    writer.setAttribute('alignment', nextAlign, block)
  } else if (block.getAttribute('alignment')) {
    writer.removeAttribute('alignment', block)
  }

  const html = readHtmlSupport(block)
  const styles = { ...(html.styles || {}) }
  styles['font-size'] = '14px'
  if (nextAlign) {
    styles['text-align'] = nextAlign
  } else {
    delete styles['text-align']
  }
  const attributes = { ...(html.attributes || {}) }
  delete attributes.align

  writeHtmlSupport(writer, block, {
    ...html,
    attributes,
    styles,
    classes: uniqueProvClasses([
      ...toClassList(html.classes || html.class).filter(
        (item) => !PROVISION_CLASSES.includes(item as ProvisionClass)
      ),
      format,
    ]),
  })

  unwrapPlainSpans(writer, block)
  applyStrongLikeTinyMce(writer, block, STRONG_FORMATS.has(format))
}

const getBlockProvisionClass = (editor: ClassicEditor, block: any) => {
  const fromModel = block.getAttribute('provisionClass') as
    | ProvisionClass
    | undefined
  if (fromModel) return fromModel

  const htmlAttributes = readHtmlSupport(block)
  const fromGhs = pickProvisionClass(
    htmlAttributes.classes || htmlAttributes.class
  )
  if (fromGhs) return fromGhs

  const viewElement = editor.editing.mapper.toViewElement(block)
  return pickProvisionClass(viewElement?.getAttribute('class'))
}

export const normalizeHeadingHtmlLikeTinyMce = (html: string) => {
  if (!html || html.indexOf('prov-') === -1) return html

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild || doc.body

  const unwrapStrong = (node: Element) => {
    node.querySelectorAll('strong').forEach((strong) => {
      strong.replaceWith(...Array.from(strong.childNodes))
    })
  }

  root.querySelectorAll<HTMLElement>('p[class*="prov-"]').forEach((node) => {
    const classes = toClassList(node.className)
    const provClasses = classes.filter((item) => item.startsWith('prov-'))
    if (provClasses.length > 1) {
      node.className = [
        ...classes.filter((item) => !item.startsWith('prov-')),
        provClasses[0],
      ]
        .join(' ')
        .trim()
    }

    const format = pickProvisionClass(node.className)
    if (!format) return

    const currentAlign = (
      node.style.textAlign ||
      node.getAttribute('align') ||
      ''
    )
      .trim()
      .toLowerCase()
    const expectedAlign = CENTER_FORMATS.has(format)
      ? currentAlign || 'center'
      : currentAlign === 'center'
      ? ''
      : currentAlign
    const needsStrong = STRONG_FORMATS.has(format)
    const hasImage = !!node.querySelector('img')
    const onlyStrongChild =
      node.childElementCount === 1 &&
      node.firstElementChild?.tagName === 'STRONG' &&
      node.firstElementChild === node.lastElementChild

    if (
      node.style.fontSize === '14px' &&
      !node.getAttribute('align') &&
      node.style.textAlign === expectedAlign &&
      provClasses.length <= 1 &&
      (hasImage ||
        (needsStrong ? onlyStrongChild : !node.querySelector('strong')))
    ) {
      return
    }

    node.style.fontSize = '14px'
    node.removeAttribute('align')

    node.querySelectorAll('span').forEach((span) => {
      if (span instanceof HTMLElement && span.style.fontSize) return
      span.replaceWith(...Array.from(span.childNodes))
    })

    if (CENTER_FORMATS.has(format)) {
      node.style.textAlign = currentAlign || 'center'
    } else if (currentAlign === 'center') {
      node.style.textAlign = ''
    }

    unwrapStrong(node)

    if (hasImage) {
      if (needsStrong) {
        Array.from(node.childNodes).forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
            const strong = doc.createElement('strong')
            strong.textContent = child.textContent
            child.parentNode?.replaceChild(strong, child)
          }
        })
      }
      return
    }

    if (needsStrong) {
      node.innerHTML = `<strong>${node.innerHTML.trim()}</strong>`
    }
  })

  return root.innerHTML
}

const isBlankText = (value?: string | null) =>
  (value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().length === 0

const OFFICE_TAG =
  /<\/?(?:o|w|m|v|st1|wx|wv):[A-Za-z_][\w.-]*(?=[\s/>])[^>]*>/gi
const OFFICE_TAG_ESCAPED =
  /&lt;\/?(?:o|w|m|v|st1|wx|wv):[A-Za-z_][\w.-]*(?:[\s\S]*?)&gt;/gi

export const stripOfficeMarkup = (html: string) => {
  if (!html) return html
  return html
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(OFFICE_TAG, '')
    .replace(OFFICE_TAG_ESCAPED, '')
}

export const cleanWordPastedHtml = (html: string) => {
  if (!html) return html

  const doc = new DOMParser().parseFromString(
    `<div>${stripOfficeMarkup(html)}</div>`,
    'text/html'
  )
  const root = doc.body.firstElementChild || doc.body

  ;['o:p', 'w:sdt', 'w:sdtPr', 'w:sdtContent'].forEach((tag) => {
    Array.from(root.getElementsByTagName(tag)).forEach((el) => {
      el.replaceWith(...Array.from(el.childNodes))
    })
  })

  root.querySelectorAll('p, div').forEach((el) => {
    if (isBlankText(el.textContent)) {
      el.remove()
    }
  })

  root.querySelectorAll('[style]').forEach((el) => {
    const style = el.getAttribute('style') || ''
    if (/tab-stops|text-autospace|mso-/i.test(style)) {
      el.removeAttribute('style')
    }
  })

  root.querySelectorAll('span').forEach((span) => {
    if (isBlankText(span.textContent)) {
      span.remove()
      return
    }
    const style = span.getAttribute('style') || ''
    if (
      /font-family\s*:\s*['"]?Times New Roman/i.test(style) &&
      /font-size\s*:\s*13/i.test(style)
    ) {
      span.replaceWith(...Array.from(span.childNodes))
    }
  })

  return root.innerHTML
}

const XML_LIKE_TAG =
  /<\/?(?:(?!o:|w:|m:|v:|st1:|wx:|wv:)[A-Za-z_][\w.-]*:[A-Za-z_][\w.-]*|xsd|xs|schema|element|complexType|simpleType|complexContent|simpleContent|sequence|annotation|appinfo|import|attributeGroup|attribute|choice|all|restriction|extension|enumeration|union|list|documentation)(?=[\s/>])[^>]*>/gi

export const looksLikeXmlSnippet = (text: string) => {
  if (!text) return false
  const normalized = stripOfficeMarkup(text).replace(/&lt;/g, '<')
  if (/<(?:xsd|xs|gml):/i.test(normalized)) return true
  if (/xmlns:(?:xsd|xs|gml)=/i.test(normalized)) return true
  if (
    /targetNamespace\s*=/i.test(normalized) &&
    /schemaLocation\s*=/i.test(normalized)
  ) {
    return true
  }
  if (
    /<(?:schema|element|complexType|sequence|annotation|appinfo|import)\b/i.test(
      normalized
    )
  ) {
    return true
  }
  return /<(?!\/?(?:o|w|m|v|st1|wx|wv):)[A-Za-z_][\w.-]*:[A-Za-z_][\w.-]*\b/i.test(
    normalized
  )
}

export const escapeXmlLikeMarkup = (html: string) => {
  if (!html) return html
  return html.replace(XML_LIKE_TAG, (tag) =>
    tag.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  )
}

const escapePlainText = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const plainXmlToHtml = (plain: string) =>
  plain
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => `<p>${escapePlainText(line) || '&nbsp;'}</p>`)
    .join('')

const readClipboardTexts = (
  dataTransfer?: {
    getData?: (type: string) => string
  } | null
) => {
  if (!dataTransfer?.getData) return { html: '', plain: '' }
  return {
    html: dataTransfer.getData('text/html') || '',
    plain:
      dataTransfer.getData('text/plain') || dataTransfer.getData('text') || '',
  }
}

const xmlSnippetToHtml = (plain: string, html: string) => {
  if (looksLikeXmlSnippet(plain)) return plainXmlToHtml(plain)

  if (!looksLikeXmlSnippet(html)) return null

  const tmp = document.createElement('div')
  tmp.innerHTML = stripOfficeMarkup(html)
  const text = (tmp.innerText || tmp.textContent || '').replace(/\u00a0/g, ' ')
  if (looksLikeXmlSnippet(text) && text.trim()) return plainXmlToHtml(text)

  return cleanWordPastedHtml(escapeXmlLikeMarkup(stripOfficeMarkup(html)))
}

export class WordPasteCleanupPlugin extends Plugin {
  public static get pluginName() {
    return 'WordPasteCleanupPlugin'
  }

  public static get requires() {
    return ['ClipboardPipeline'] as const
  }

  public init() {
    const editor = this.editor
    const processor = editor.data.processor as {
      toData: (fragment: unknown) => string
      toView: (html: string) => unknown
    }
    let pendingXmlHtml: string | null = null
    let insertedNatively = false

    const insertXmlHtml = (xmlHtml: string) => {
      const viewFragment = processor.toView(xmlHtml)
      const modelFragment = editor.data.toModel(viewFragment as never)
      editor.model.insertContent(modelFragment)
    }

    const attachNativePaste = () => {
      const root = editor.editing.view.getDomRoot() as
        | (HTMLElement & { __xmlPasteBound?: boolean })
        | null
      if (!root || root.__xmlPasteBound) return
      root.__xmlPasteBound = true
      root.addEventListener(
        'paste',
        (domEvent: ClipboardEvent) => {
          const { html, plain } = readClipboardTexts(domEvent.clipboardData)
          const xmlHtml = xmlSnippetToHtml(plain, html)
          if (!xmlHtml) return

          pendingXmlHtml = xmlHtml
          insertedNatively = true
          domEvent.preventDefault()
          domEvent.stopImmediatePropagation()
          insertXmlHtml(xmlHtml)
        },
        true
      )
    }

    attachNativePaste()
    editor.ui?.on?.('ready', attachNativePaste)

    this.listenTo(
      editor.editing.view.document,
      'clipboardInput',
      (evt, data: any) => {
        if (insertedNatively) {
          insertedNatively = false
          evt.stop()
          return
        }

        const { html, plain } = readClipboardTexts(data.dataTransfer)
        const xmlHtml = xmlSnippetToHtml(plain, html)
        if (xmlHtml) {
          pendingXmlHtml = xmlHtml
          data.content = processor.toView(xmlHtml)
          return
        }
        if (html) {
          data.content = processor.toView(cleanWordPastedHtml(html))
        }
      },
      { priority: 'highest' }
    )

    const clipboard = editor.plugins.get('ClipboardPipeline') as any
    clipboard.on(
      'inputTransformation',
      (_evt: unknown, data: { content: unknown }) => {
        if (pendingXmlHtml) {
          data.content = processor.toView(pendingXmlHtml)
          pendingXmlHtml = null
          return
        }
        const html = processor.toData(data.content)
        data.content = processor.toView(cleanWordPastedHtml(html))
      },
      { priority: 'highest' }
    )
  }
}

export class ProvisionHeadingCommand extends Command {
  public override refresh() {
    // Chỉ cần block đầu tiên: duyệt hết vùng chọn sẽ rất chậm khi Ctrl+A văn bản dài.
    const firstBlock = this.editor.model.document.selection
      .getSelectedBlocks()
      .next().value

    this.isEnabled = !!firstBlock
    this.value = firstBlock
      ? getBlockProvisionClass(this.editor as ClassicEditor, firstBlock)
      : null
  }

  public override execute(
    options: { value?: ProvisionClass; classOnly?: boolean } = {}
  ) {
    const { value, classOnly } = options
    const model = this.editor.model
    const blocks = Array.from(model.document.selection.getSelectedBlocks())

    model.change((writer) => {
      const shouldToggleOff =
        !!value &&
        blocks.every(
          (block) =>
            getBlockProvisionClass(this.editor as ClassicEditor, block) ===
            value
        )

      blocks.forEach((block) => {
        if (classOnly || !value) {
          stripAllClassesKeepPresentation(writer, block)
          return
        }

        if (shouldToggleOff) {
          toggleOffHeadingLikeTinyMce(writer, block)
          return
        }

        writer.setAttribute('provisionClass', value, block)
        applyHeadingPresentation(writer, block, value)
      })
    })
  }
}

export class MergeProvisionBlocksCommand extends Command {
  public override refresh() {
    const blocks = this.editor.model.document.selection.getSelectedBlocks()
    blocks.next()
    this.isEnabled = !blocks.next().done
  }

  public override execute() {
    const editor = this.editor
    const blocks = Array.from(
      editor.model.document.selection.getSelectedBlocks()
    )
    if (blocks.length < 2) return

    editor.model.change((writer) => {
      const [firstBlock, ...rest] = blocks
      rest.forEach((block) => {
        writer.insert(
          writer.createElement('softBreak'),
          writer.createPositionAt(firstBlock, 'end')
        )
        const range = writer.createRangeIn(block)
        writer.move(range, writer.createPositionAt(firstBlock, 'end'))
        writer.remove(block)
      })
    })
  }
}

export class ProvisionHeadingPlugin extends Plugin {
  public static get pluginName() {
    return 'ProvisionHeadingPlugin'
  }

  public init() {
    const editor = this.editor

    editor.model.schema.extend('$block', {
      allowAttributes: ['provisionClass', 'elementId', 'dataMerged'],
    })
    editor.model.schema.extend('paragraph', {
      allowAttributes: ['provisionClass', 'elementId', 'dataMerged'],
    })

    editor.conversion.attributeToAttribute({
      model: { name: 'paragraph', key: 'elementId' },
      view: 'id',
    })
    editor.conversion.attributeToAttribute({
      model: { name: 'paragraph', key: 'dataMerged' },
      view: 'data-merged',
    })

    editor.conversion.for('upcast').add((dispatcher) => {
      dispatcher.on(
        'element:p',
        (_evt, data, conversionApi) => {
          const className = data.viewItem.getAttribute('class')
          const id = data.viewItem.getAttribute('id')
          const dataMerged = data.viewItem.getAttribute('data-merged')
          const style = data.viewItem.getAttribute('style')
          if (!className && !id && !dataMerged && !style) return
          if (!data.modelRange) return

          const tokens = toClassList(className)
          const provisionClass = pickProvisionClass(tokens)

          for (const item of data.modelRange.getItems({ shallow: true })) {
            if (!item.is('element')) continue

            if (provisionClass) {
              conversionApi.writer.setAttribute(
                'provisionClass',
                provisionClass,
                item
              )
            }

            if (id) {
              conversionApi.writer.setAttribute('elementId', id, item)
            }
            if (dataMerged) {
              conversionApi.writer.setAttribute('dataMerged', dataMerged, item)
            }

            const html = readHtmlSupport(item)
            const styles = { ...(html.styles || {}) }
            if (style) {
              style.split(';').forEach((chunk: string) => {
                const [rawKey, ...rest] = chunk.split(':')
                const key = rawKey?.trim()
                const val = rest.join(':').trim()
                if (key && val) styles[key] = val
              })
            }
            writeHtmlSupport(conversionApi.writer, item, {
              ...html,
              attributes: {
                ...(html.attributes || {}),
                ...(id ? { id } : {}),
                ...(dataMerged ? { 'data-merged': dataMerged } : {}),
              },
              styles,
              classes: uniqueProvClasses(tokens),
            })
          }
        },
        { priority: 'low' }
      )
    })

    editor.conversion.for('downcast').add((dispatcher) => {
      dispatcher.on('attribute:provisionClass', (evt, data, conversionApi) => {
        if (!conversionApi.consumable.consume(data.item, evt.name)) return

        const viewElement = conversionApi.mapper.toViewElement(data.item)
        if (!viewElement) return

        conversionApi.writer.removeClass(PROVISION_CLASSES, viewElement)
        const value = data.attributeNewValue as ProvisionClass | undefined
        if (value) {
          conversionApi.writer.addClass(value, viewElement)
          conversionApi.writer.setStyle('font-size', '14px', viewElement)
          if (
            CENTER_FORMATS.has(value) &&
            !viewElement.getStyle('text-align')
          ) {
            conversionApi.writer.setStyle('text-align', 'center', viewElement)
          }
        }
      })
    })

    editor.commands.add('provisionHeading', new ProvisionHeadingCommand(editor))
    editor.commands.add(
      'mergeProvisionBlocks',
      new MergeProvisionBlocksCommand(editor)
    )

    editor.ui.componentFactory.add('provisionHeading', (locale) => {
      const dropdown = createDropdown(locale)
      const command = editor.commands.get('provisionHeading') as
        | ProvisionHeadingCommand
        | undefined

      dropdown.set({
        class: 'ck-provision-heading-dropdown',
      })
      dropdown.buttonView.set({
        withText: true,
        tooltip: false,
        class: 'ck-provision-heading-button',
      })
      dropdown.bind('isEnabled').to(command!, 'isEnabled')
      dropdown.buttonView.bind('label').to(command!, 'value', (value) => {
        const found = PROVISION_HEADING_OPTIONS.find(
          (item) => item.value === value
        )
        return found ? found.label : 'Chưa xác định'
      })

      const items = new Collection()
      PROVISION_HEADING_OPTIONS.forEach((item) => {
        const model = new ViewModel({
          withText: true,
          isToggleable: true,
          label: item.label,
        })
        model
          .bind('isOn')
          .to(command!, 'value', (value) => value === item.value)
        items.add({ type: 'button', model } as never)
      })

      addListToDropdown(dropdown, items as never)
      dropdown.on('execute', (evt: { source?: { label?: string } }) => {
        const label = evt.source?.label || ''
        const found = PROVISION_HEADING_OPTIONS.find(
          (item) => item.label === label
        )
        if (found) {
          editor.execute('provisionHeading', { value: found.value })
        }
        editor.editing.view.focus()
      })

      return dropdown
    })

    PROVISION_HEADING_OPTIONS.forEach((item, index) => {
      editor.keystrokes.set(`CTRL+ALT+${index + 1}`, (_data, cancel) => {
        editor.execute('provisionHeading', { value: item.value })
        cancel()
      })
    })

    editor.keystrokes.set('CTRL+ALT+0', (_data, cancel) => {
      editor.execute('provisionHeading', { classOnly: true })
      cancel()
    })

    editor.keystrokes.set('CTRL+ALT+9', (_data, cancel) => {
      editor.execute('mergeProvisionBlocks')
      cancel()
    })
  }
}
