import {
  Document,
  isCollection,
  isPair,
  YAMLParseError,
  YAMLWarning
} from 'yaml'
import type {
  CST,
  DocumentOptions,
  ErrorCode,
  ParseOptions,
  SchemaOptions
} from 'yaml'
import { tags } from '../tags.js'
import { composeDoc } from './compose-doc.js'
import { resolveEnd } from './resolve-end.js'
import { resolveComment } from './resolve-comment.js'

type ErrorSource =
  | number
  | [number, number]
  | [number, number, number]
  | { offset: number; source?: string }

export type ComposeErrorHandler = (
  source: ErrorSource,
  code: ErrorCode,
  message: string,
  warning?: boolean
) => void

function getErrorPos(src: ErrorSource): [number, number] {
  if (typeof src === 'number') return [src, src + 1]
  if (Array.isArray(src)) return src.length === 2 ? src : [src[0], src[1]]
  const { offset, source } = src
  return [offset, offset + (typeof source === 'string' ? source.length : 1)]
}

function parsePrelude(
  prelude: CST.SourceToken[],
  onError: ComposeErrorHandler
) {
  let comment = ''
  let atComment = false
  let atEmptyLine = false
  for (const token of prelude) {
    if (token.type === 'comment') {
      resolveComment(token, onError)
      comment +=
        (comment === '' ? '' : atEmptyLine ? '\n\n' : '\n') +
        resolveComment(token, onError)
      atComment = true
      atEmptyLine = false
    } else {
      // This may be wrong after doc-end, but in that case it doesn't matter
      if (!atComment) atEmptyLine = true
      atComment = false
    }
  }
  return { comment, atEmptyLine }
}

/**
 * Compose a stream of CST nodes into a stream of YAML Documents.
 *
 * ```ts
 * import { Composer, Parser } from 'yaml'
 *
 * const src: string = ...
 * const tokens = new Parser().parse(src)
 * const docs = new Composer().compose(tokens)
 * ```
 */
export class Composer {
  private doc: Document.Parsed | null = null
  private options: ParseOptions & DocumentOptions & SchemaOptions
  private atDirectives = false
  private prelude: CST.SourceToken[] = []
  private errors: YAMLParseError[] = []
  private warnings: YAMLWarning[] = []

  constructor(options: ParseOptions & DocumentOptions & SchemaOptions = {}) {
    this.options = Object.assign(
      { customTags: tags, resolveKnownTags: false, schema: 'json5' },
      options
    )
  }

  private onError: ComposeErrorHandler = (source, code, message, warning) => {
    const pos = getErrorPos(source)
    if (warning) this.warnings.push(new YAMLWarning(pos, code, message))
    else this.errors.push(new YAMLParseError(pos, code, message))
  }

  private decorate(doc: Document.Parsed, afterDoc: boolean) {
    const { atEmptyLine, comment } = parsePrelude(this.prelude, this.onError)
    if (comment) {
      const dc = doc.contents
      if (afterDoc) {
        doc.comment = doc.comment ? `${doc.comment}\n${comment}` : comment
      } else if (atEmptyLine || !dc) {
        doc.commentBefore = comment
      } else if (isCollection(dc) && !dc.flow && dc.items.length > 0) {
        let it = dc.items[0]
        if (isPair(it)) it = it.key
        const cb = it.commentBefore
        it.commentBefore = cb ? `${comment}\n${cb}` : comment
      } else {
        const cb = dc.commentBefore
        dc.commentBefore = cb ? `${comment}\n${cb}` : comment
      }
    }

    if (afterDoc) {
      Array.prototype.push.apply(doc.errors, this.errors)
      Array.prototype.push.apply(doc.warnings, this.warnings)
    } else {
      doc.errors = this.errors
      doc.warnings = this.warnings
    }

    this.prelude = []
    this.errors = []
    this.warnings = []
  }

  /**
   * Current stream status information.
   *
   * Mostly useful at the end of input for an empty stream.
   */
  streamInfo() {
    return {
      comment: parsePrelude(this.prelude, this.onError).comment,
      errors: this.errors,
      warnings: this.warnings
    }
  }

  /**
   * Compose tokens into documents.
   *
   * @param forceDoc - If the stream contains no document, still emit a final document including any comments that would be applied to a subsequent document.
   * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
   */
  *compose(tokens: Iterable<CST.Token>, forceDoc = false, endOffset = -1) {
    for (const token of tokens) yield* this.next(token)
    yield* this.end(forceDoc, endOffset)
  }

  /** Advance the composer by one CST token. */
  *next(token: CST.Token) {
    if (process.env.LOG_STREAM) console.dir(token, { depth: null })
    switch (token.type) {
      case 'document': {
        const doc = composeDoc(this.options, token, this.onError)
        if (this.atDirectives && !doc.directives.marker)
          this.onError(
            token,
            'MISSING_CHAR',
            'Missing directives-end indicator line'
          )
        this.decorate(doc, false)
        if (this.doc) yield this.doc
        this.doc = doc
        this.atDirectives = false
        break
      }
      case 'byte-order-mark':
      case 'space':
        break
      case 'comment':
      case 'newline':
        this.prelude.push(token)
        break
      case 'error': {
        const msg = token.source
          ? `${token.message}: ${JSON.stringify(token.source)}`
          : token.message
        const error = new YAMLParseError(
          getErrorPos(token),
          'UNEXPECTED_TOKEN',
          msg
        )
        if (this.atDirectives || !this.doc) this.errors.push(error)
        else this.doc.errors.push(error)
        break
      }
      case 'doc-end': {
        if (!this.doc) {
          const msg = 'Unexpected doc-end without preceding document'
          this.errors.push(
            new YAMLParseError(getErrorPos(token), 'UNEXPECTED_TOKEN', msg)
          )
          break
        }
        const end = resolveEnd(
          token.end,
          token.offset + token.source.length,
          this.onError
        )
        this.decorate(this.doc, true)
        if (end.comment) {
          const dc = this.doc.comment
          this.doc.comment = dc ? `${dc}\n${end.comment}` : end.comment
        }
        this.doc.range[2] = end.offset
        break
      }
      default:
        this.errors.push(
          new YAMLParseError(
            getErrorPos(token),
            'UNEXPECTED_TOKEN',
            `Unsupported token ${token.type}`
          )
        )
    }
  }

  /**
   * Call at end of input to yield any remaining document.
   *
   * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
   * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
   */
  *end(forceDoc = false, endOffset = -1) {
    if (this.doc) {
      this.decorate(this.doc, true)
      yield this.doc
      this.doc = null
    } else if (forceDoc) {
      const doc = new Document(undefined, this.options) as Document.Parsed
      if (this.atDirectives)
        this.onError(
          endOffset,
          'MISSING_CHAR',
          'Missing directives-end indicator line'
        )
      doc.range = [0, endOffset, endOffset]
      this.decorate(doc, false)
      yield doc
    }
  }
}
