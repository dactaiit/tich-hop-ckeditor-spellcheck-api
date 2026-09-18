#!/usr/bin/env node
// word-to-section (CLI): chuyển .doc/.docx sang MỘT <section> HTML tự chứa để nối
// vào cuối một file HTML, giữ định dạng ở mức cao nhất. Lõi ở word-to-section-core.mjs.
//
// Dùng:
//   node tools/word-to-section.mjs <input.doc|.docx> [tùy chọn]
//     --out <file>         ghi <section> ra file (mặc định: stdout)
//     --append <target>    chèn <section> vào ngay trước </body> file HTML đích
//                          (không có </body> thì nối vào cuối file)
//     --assets <dir>       xuất ảnh ra thư mục này thay vì nhúng base64
//     --class <name>       tên class wrapper (mặc định: word-import)
//     --soffice <path>     đường dẫn soffice.exe
//
// Ví dụ:
//   node tools/word-to-section.mjs 143976.doc --append dist/index.html
//   node tools/word-to-section.mjs report.docx --out section.html

import { readFile, writeFile, appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { convertWordToSection } from './word-to-section-core.mjs'

function parseArgs(argv) {
  const opts = { className: 'word-import' }
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out') opts.out = argv[++i]
    else if (a === '--append') opts.append = argv[++i]
    else if (a === '--assets') opts.assets = argv[++i]
    else if (a === '--class') opts.className = argv[++i]
    else if (a === '--soffice') opts.soffice = argv[++i]
    else if (a === '-h' || a === '--help') opts.help = true
    else rest.push(a)
  }
  opts.input = rest[0]
  return opts
}

const HELP = `word-to-section — Word (.doc/.docx) -> <section> HTML self-contained

  node tools/word-to-section.mjs <input.doc|.docx> [--out f | --append target.html]
                                 [--assets dir] [--class name] [--soffice path]`

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help || !opts.input) {
    console.log(HELP)
    process.exit(opts.input ? 0 : 1)
  }

  const { section, id } = await convertWordToSection(opts.input, {
    className: opts.className,
    soffice: opts.soffice,
    assetsDir: opts.assets,
    // Khi dùng --assets: ảnh trỏ tương đối theo thư mục đã cho.
    assetsPrefix: opts.assets ? opts.assets.replace(/\\/g, '/').replace(/\/?$/, '/') : '',
  })

  if (opts.append) {
    const target = resolve(opts.append)
    let existing = ''
    try { existing = await readFile(target, 'utf8') } catch { /* file mới */ }
    if (/<\/body>/i.test(existing)) {
      await writeFile(target, existing.replace(/<\/body>/i, `${section}</body>`))
    } else {
      await appendFile(target, `\n${section}`)
    }
    console.error(`✔ Đã append section (id="${id}") vào ${target}`)
  } else if (opts.out) {
    await writeFile(resolve(opts.out), section)
    console.error(`✔ Đã ghi section (id="${id}") ra ${resolve(opts.out)}`)
  } else {
    process.stdout.write(section)
  }
}

main().catch((err) => {
  console.error(`✖ ${err.message}`)
  process.exit(1)
})
