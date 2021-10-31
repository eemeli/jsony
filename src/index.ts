export { ComposeErrorHandler, Composer } from './compose/composer.js'
export { Lexer } from './lexer.js'
export { Parser } from './parser.js'

import { Document } from 'yaml'
import { Composer } from './compose/composer.js'
import { Parser } from './parser.js'

export function parseDocs(source: string): Document.Parsed[] {
  const parser = new Parser()
  const composer = new Composer()
  return Array.from(composer.compose(parser.parse(source)))
}

export function parseAll(source: string): any[] {
  return parseDocs(source).map(doc => {
    for (const error of doc.errors) console.error(error)
    for (const warn of doc.warnings) console.warn(warn)
    return doc.toJS()
  })
}
