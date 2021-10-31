import type { CST } from 'yaml'
import { Lexer } from './lexer.js'

const Space = 'space'
const LineEnd = 'newline'
const Comment = 'comment'
const SingleQuoted = 'single-quoted-scalar'
const DoubleQuoted = 'double-quoted-scalar'
const Identifier = 'scalar'

const MapStart = 'flow-map-start'
const MapEnd = 'flow-map-end'
const MapValue = 'map-value-ind'
const SeqStart = 'flow-seq-start'
const SeqEnd = 'flow-seq-end'
const Comma = 'comma'

type TokenType =
  | typeof Space
  | typeof LineEnd
  | typeof Comment
  | typeof SingleQuoted
  | typeof DoubleQuoted
  | typeof Identifier
  | typeof MapStart
  | typeof MapEnd
  | typeof MapValue
  | typeof SeqStart
  | typeof SeqEnd
  | typeof Comma

/** Identify the type of a lexer token. May return `null` for unknown tokens. */
function tokenType(source: string): TokenType {
  switch (source) {
    case '\r':
    case '\n':
    case '\r\n':
    case '\u{2028}':
    case '\u{2029}':
      return LineEnd
    case '{':
      return MapStart
    case '}':
      return MapEnd
    case ':':
      return MapValue
    case '[':
      return SeqStart
    case ']':
      return SeqEnd
    case ',':
      return Comma
  }
  switch (source[0]) {
    case '\t':
    case '\x0b': // vertical tab
    case '\x0c': // form feed
    case ' ':
    case '\xa0': // non-breaking space
    case '\u{feff}':
      return Space
    case "'":
      return SingleQuoted
    case '"':
      return DoubleQuoted
    case '/':
      switch (source[1]) {
        case '/':
        case '*':
          return Comment
      }
      break
  }
  return Identifier
}

function isFlowToken(
  token: CST.Token | null | undefined
): token is CST.FlowScalar | CST.FlowCollection {
  switch (token?.type) {
    case Identifier:
    case SingleQuoted:
    case DoubleQuoted:
    case 'flow-collection':
      return true
    default:
      return false
  }
}

function fixFlowSeqItems(fc: CST.FlowCollection) {
  for (const it of fc.items) {
    if (it.sep && !it.value && it.sep.every(st => st.type !== MapValue)) {
      if (it.key) it.value = it.key
      delete it.key
      if (isFlowToken(it.value)) {
        if (it.value.end) Array.prototype.push.apply(it.value.end, it.sep)
        else it.value.end = it.sep
      } else Array.prototype.push.apply(it.start, it.sep)
      delete it.sep
    }
  }
}

/**
 * A JSON5 concrete syntax tree (CST) parser
 *
 * ```ts
 * const src: string = ...
 * for (const token of new Parser().parse(src)) {
 *   // token: CST.Token
 * }
 * ```
 *
 * To use the parser with a user-provided lexer:
 *
 * ```ts
 * function* parse(source: string, lexer: Lexer) {
 *   const parser = new Parser()
 *   for (const lexeme of lexer.lex(source))
 *     yield* parser.next(lexeme)
 *   yield* parser.end()
 * }
 *
 * const src: string = ...
 * const lexer = new Lexer()
 * for (const token of parse(src, lexer)) {
 *   // token: CST.Token
 * }
 * ```
 */
export class Parser {
  private onNewLine?: (offset: number) => void

  /** Current offset since the start of parsing */
  offset = 0

  /** Top indicates the node that's currently being built */
  stack: Array<CST.Document | CST.FlowCollection | CST.FlowScalar> = []

  /** The source of the current token, set in parse() */
  private source = ''

  /** The type of the current token, set in parse() */
  private type: TokenType = Identifier

  /**
   * @param onNewLine - If defined, called separately with the start position of
   *   each new line (in `parse()`, including the start of input).
   */
  constructor(onNewLine?: (offset: number) => void) {
    this.onNewLine = onNewLine
  }

  /**
   * Parse `source` as a YAML stream.
   * If `incomplete`, a part of the last line may be left as a buffer for the next call.
   *
   * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
   *
   * @returns A generator of tokens representing each directive, document, and other structure.
   */
  *parse(source: string, incomplete = false) {
    if (this.onNewLine && this.offset === 0) this.onNewLine(0)
    for (const lexeme of this.lexer.lex(source, incomplete))
      yield* this.next(lexeme)
    if (!incomplete) yield* this.end()
  }

  /**
   * Advance the parser by the `source` of one lexical token.
   */
  *next(source: string) {
    this.source = source
    if (process.env.LOG_TOKENS) console.log('|', JSON.stringify(source))

    this.type = tokenType(source)
    yield* this.step()
    if (this.type === LineEnd && this.onNewLine)
      this.onNewLine(this.offset + source.length)
    this.offset += source.length
  }

  // Must be defined after `next()`
  private lexer = new Lexer();

  /** Call at end of input to push out any remaining constructions */
  *end() {
    while (this.stack.length > 0) yield* this.pop()
  }

  private get sourceToken() {
    const st: CST.SourceToken = {
      type: this.type as CST.SourceToken['type'],
      offset: this.offset,
      indent: -1,
      source: this.source
    }
    return st
  }

  private *step(): Generator<CST.Token, void> {
    const top = this.stack[this.stack.length - 1]
    if (!top) return yield* this.stream()
    switch (top.type) {
      case 'document':
        return yield* this.document(top)
      case Identifier:
      case SingleQuoted:
      case DoubleQuoted:
        return yield* this.lineEnd(top)
      case 'flow-collection':
        return yield* this.collection(top)
    }
    /* istanbul ignore next should not happen */
    yield* this.pop()
  }

  private *pop(): Generator<CST.Token, unknown> {
    const token = this.stack.pop()
    /* istanbul ignore if should not happen */
    if (!token) {
      const message = 'Tried to pop an empty stack'
      return yield { type: 'error', offset: this.offset, source: '', message }
    }

    if (token.type === 'flow-collection' && token.start.type === SeqStart)
      fixFlowSeqItems(token)

    const top = this.stack[this.stack.length - 1]
    if (!top) return yield token

    switch (top.type) {
      case 'document':
        top.value = token
        break
      case 'flow-collection': {
        const it = top.items[top.items.length - 1]
        if (!it || it.value) top.items.push({ start: [], key: token, sep: [] })
        else if (it.sep) it.value = token
        else Object.assign(it, { key: token, sep: [] })
        return
      }
      /* istanbul ignore next should not happen */
      default:
        yield* this.pop()
        this.stack.push(token)
        yield* this.pop()
    }
  }

  private *stream(): Generator<CST.Token, void> {
    switch (this.type) {
      case Space:
      case Comment:
      case LineEnd:
        yield this.sourceToken
        return
    }

    const doc: CST.Document = {
      type: 'document',
      offset: this.offset,
      start: []
    }
    this.stack.push(doc)
    yield* this.document(doc)
  }

  private *document(doc: CST.Document): Generator<CST.Token, void> {
    if (doc.value) return yield* this.lineEnd(doc)
    switch (this.type) {
      case Identifier:
      case SingleQuoted:
      case DoubleQuoted:
        this.stack.push(this.scalar())
        return

      case MapStart:
      case SeqStart:
        this.stack.push(this.startCollection())
        return

      default:
        yield {
          type: 'error',
          offset: this.offset,
          message: `Unexpected ${this.type} token in JSON5 document`,
          source: this.source
        }
    }
  }

  private *collection(fc: CST.FlowCollection) {
    if (fc.end.length !== 0) return yield* this.lineEnd(fc)
    const it = fc.items[fc.items.length - 1]
    switch (this.type) {
      case Comma:
        if (!it || it.sep) fc.items.push({ start: [this.sourceToken] })
        else it.start.push(this.sourceToken)
        return

      case MapValue:
        if (!it || it.value)
          fc.items.push({ start: [], key: null, sep: [this.sourceToken] })
        else if (it.sep) it.sep.push(this.sourceToken)
        else Object.assign(it, { key: null, sep: [this.sourceToken] })
        return

      case Space:
      case Comment:
      case LineEnd:
        if (!it || it.value) fc.items.push({ start: [this.sourceToken] })
        else if (it.sep) it.sep.push(this.sourceToken)
        else it.start.push(this.sourceToken)
        return

      case Identifier:
      case SingleQuoted:
      case DoubleQuoted: {
        const fs = this.scalar()
        if (!it || it.value) fc.items.push({ start: [], key: fs, sep: [] })
        else if (it.sep) this.stack.push(fs)
        else Object.assign(it, { key: fs, sep: [] })
        return
      }

      case MapStart:
      case SeqStart:
        this.stack.push(this.startCollection())
        return

      case MapEnd:
      case SeqEnd:
        fc.end.push(this.sourceToken)
        return

      /* istanbul ignore next should not happen */
      default:
        yield* this.pop()
        yield* this.step()
    }
  }

  private scalar(): CST.FlowScalar {
    if (this.onNewLine) {
      for (const nl of this.source.matchAll(
        /\r?\n|\r(?!\n)|\u{2028}|\u{2029}/gu
      )) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.onNewLine(this.offset + nl.index! + nl[0].length)
      }
    }
    return {
      type: this.type as
        | typeof Identifier
        | typeof SingleQuoted
        | typeof DoubleQuoted,
      offset: this.offset,
      indent: -1,
      source: this.source
    }
  }

  private startCollection(): CST.FlowCollection {
    return {
      type: 'flow-collection',
      offset: this.offset,
      indent: -1,
      start: this.sourceToken,
      items: [],
      end: []
    }
  }

  private *lineEnd(token: CST.Document | CST.FlowCollection | CST.FlowScalar) {
    switch (this.type) {
      case Comma:
      case MapEnd:
      case MapValue:
      case SeqEnd:
        yield* this.pop()
        yield* this.step()
        break

      case Space:
      case Comment:
      case LineEnd:
      default:
        // all other values are errors
        if (token.end) token.end.push(this.sourceToken)
        else token.end = [this.sourceToken]
        if (this.type === 'newline') yield* this.pop()
    }
  }
}
