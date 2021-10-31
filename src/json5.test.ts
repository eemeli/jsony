import { readdirSync, readFileSync } from 'fs'
import { basename, extname, resolve } from 'path'
import { parseDocs } from '.'

function parseOne(source: string) {
  const docs = parseDocs(source)
  if (docs.length !== 1)
    throw new Error(`Expected exactly one document, found ${docs.length}`)
  const doc = docs[0]
  for (const error of doc.errors) throw error
  for (const warning of doc.warnings) throw warning
  doc.toJS()
  return doc
}

const root = resolve('json5-tests')
for (const dir of readdirSync(root, { withFileTypes: true })) {
  if (dir.isDirectory()) {
    describe(dir.name, () => {
      const td = resolve(root, dir.name)
      for (const tf of readdirSync(td)) {
        const ext = extname(tf)
        let pass: boolean
        switch (ext) {
          case '.json':
          case '.json5':
            pass = true
            break
          case '.js':
          case '.txt':
            pass = false
            break
          default:
            // not a test file
            continue
        }

        test(`${basename(tf, ext)} (${pass ? 'pass' : 'fail'})`, () => {
          const src = readFileSync(resolve(td, tf), 'utf8')
          if (pass) {
            parseOne(src)
          } else {
            expect(() => parseOne(src)).toThrow()
          }
        })
      }
    })
  }
}
