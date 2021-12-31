import { readdirSync, readFileSync } from 'fs'
import { basename, extname, resolve } from 'path'
import * as YAML from 'yaml'
import { JsonSchema, parseDocs } from '.'

const skip: Record<string, Array<'yaml'>> = {
  'duplicate-keys': ['yaml']
}

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
    describe(`JSON5 ${dir.name}`, () => {
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

        const name = basename(tf, ext)
        test(`${name} (${pass ? 'pass' : 'reject'})`, () => {
          const src = readFileSync(resolve(td, tf), 'utf8')
          if (pass) {
            const doc = parseOne(src)
            const res = doc.toJS()

            const str = doc.toString()
            try {
              parseOne(str)
            } catch (err) {
              console.log(td, tf, '::\n', str)
              throw err
            }

            if (!skip[name]?.includes('yaml')) {
              doc.setSchema('1.2', { schema: 'core' })
              const yamlStr = doc.toString()
              const yamlDoc = YAML.parseDocument(yamlStr)
              expect(yamlDoc.errors).toHaveLength(0)
              expect(yamlDoc.warnings).toHaveLength(0)
              const yamlRes = doc.toJS()
              expect(JSON.stringify(yamlRes)).toBe(JSON.stringify(res))
            }
          } else {
            expect(() => parseOne(src)).toThrow()
          }
        })
      }
    })
  }
}

describe('setSchema', () => {
  test('YAML block map', () => {
    const doc = YAML.parseDocument('foo: bar')

    const schema = new JsonSchema()
    doc.setSchema(null, { schema })
    expect(doc.toString()).toBe('{ "foo": "bar" }\n')

    doc.setSchema('1.2', { schema: 'core' })
    expect(doc.toString()).toBe('foo: bar\n')
  })

  test('YAML block seq', () => {
    const doc = YAML.parseDocument('- foo\n- bar\n')
    const schema = new JsonSchema()
    doc.setSchema(null, { schema })
    expect(doc.toString()).toBe('[ "foo", "bar" ]\n')

    doc.setSchema('1.2', { schema: 'core' })
    expect(doc.toString()).toBe('- foo\n- bar\n')
  })

  test('YAML complex key', () => {
    const doc = YAML.parseDocument('[foo]: bar')
    const schema = new JsonSchema()
    doc.setSchema(null, { schema })
    expect(() => doc.toString()).toThrow(/simple keys/)

    doc.setSchema('1.2', { schema: 'core' })
    expect(doc.toString()).toBe('? [ foo ]\n: bar\n')
  })

  test('YAML explicit tag', () => {
    const doc = YAML.parseDocument('!!str foo')

    const schema = new JsonSchema()
    doc.setSchema(null, { schema })
    expect(doc.toString()).toBe('"foo"\n')

    doc.setSchema('1.2', { schema: 'core' })
    expect(doc.toString()).toBe('!!str foo\n')
  })

  test('YAML anchor & alias', () => {
    const doc = YAML.parseDocument('[ &x foo, *x ]')

    const schema = new JsonSchema()
    doc.setSchema(null, { schema })
    expect(doc.toString()).toBe('[ "foo", "foo" ]\n')

    doc.setSchema('1.2', { schema: 'core' })
    expect(doc.toString()).toBe('[ &x foo, *x ]\n')
  })
})
