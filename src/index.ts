export { ComposeErrorHandler, Composer } from './compose/composer.js'
export { Lexer } from './lexer.js'
export { Parser } from './parser.js'

import { Composer } from './compose/composer.js'
import { Parser } from './parser.js'

export function parseAll(source: string): any[] {
  const parser = new Parser()
  const composer = new Composer()
  const docs = composer.compose(parser.parse(source))
  return Array.from(docs).map(doc => {
    for (const error of doc.errors) console.error(error)
    for (const warn of doc.warnings) console.warn(warn)
    return doc.toJS()
  })
}
