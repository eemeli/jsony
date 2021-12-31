export { ComposeErrorHandler, Composer } from './compose/composer.js'
export { Lexer } from './lexer.js'
export { Parser } from './parser.js'

import { Document, Schema, SchemaOptions } from 'yaml'
import { Composer } from './compose/composer.js'
import { Parser } from './parser.js'
import { tags } from './tags.js'

export class JsonSchema extends Schema {
  constructor({ sortMapEntries }: SchemaOptions = {}) {
    super({
      customTags: tags,
      merge: false,
      resolveKnownTags: false,
      schema: 'json5',
      sortMapEntries,
      toStringDefaults: {
        blockQuote: false,
        collectionStyle: 'flow',
        commentString: str => str.replace(/^(?!$)(?: $)?/gm, '//'),
        simpleKeys: true
      }
    })
  }
}

export function parseDocs(source: string): Document.Parsed[] {
  const parser = new Parser()
  const composer = new Composer({
    toStringDefaults: {
      blockQuote: false,
      commentString: str => str.replace(/^(?!$)(?: $)?/gm, '//'),
      simpleKeys: true
    }
  })
  return Array.from(composer.compose(parser.parse(source)))
}

export function parseAll(source: string): any[] {
  return parseDocs(source).map(doc => {
    for (const error of doc.errors) console.error(error)
    for (const warn of doc.warnings) console.warn(warn)
    return doc.toJS()
  })
}
