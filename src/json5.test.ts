import { readdirSync, readFileSync } from 'fs'
import { basename, extname, resolve } from 'path'
import { Composer, Parser } from '.'

function parseDocs(source: string) {
  const parser = new Parser()
  const composer = new Composer()
  let seen = false
  let res: unknown
  for (const doc of composer.compose(parser.parse(source))) {
    for (const error of doc.errors) throw error
    for (const warning of doc.warnings) throw warning
    res = doc.toJS()
    if (seen) throw new Error('Expected only one document')
    seen = true
  }
  return res
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
            parseDocs(src)
          } else {
            expect(() => parseDocs(src)).toThrow()
          }
        })
      }
    })
  }
}
