/*
START -> input

input
  white-space -> white-space
  line-end -> input
  // -> line-comment
  /* -> block-comment
  " ' -> quoted-scalar
  { } [ ] : , -> input
  input-end -> END
  [else] -> input

white-space
  white-space -> white-space
  [else] -> input

line-comment
  line-end -> input
  [else] -> line-comment

block-comment
  * / -> input
  [else] -> block-comment

quoted-scalar
  quote-end -> input
  not-\ line-end -> input
  [else] -> quoted-scalar
*/

const Input = Symbol('input')
const WhiteSpace = Symbol('white-space')
const LineComment = Symbol('line-comment')
const BlockComment = Symbol('block-comment')
const QuotedScalar = Symbol('quoted-scalar')

type State =
  | typeof Input
  | typeof WhiteSpace
  | typeof LineComment
  | typeof BlockComment
  | typeof QuotedScalar

/**
 * Splits an input string into lexical tokens, i.e. smaller strings that are
 * easily identifiable by `tokens.tokenType()`.
 *
 * Lexing starts always in a "stream" context. Incomplete input may be buffered
 * until a complete token can be emitted.
 *
 * In addition to slices of the original input, the following control characters
 * may also be emitted:
 *
 * - `\x02` (Start of Text): A document starts with the next token
 * - `\x18` (Cancel): Unexpected end of flow-mode (indicates an error)
 * - `\x1f` (Unit Separator): Next token is a scalar value
 * - `\u{FEFF}` (Byte order mark): Emitted separately outside documents
 */
export class Lexer {
  /** Current input */
  private buffer = ''

  /** A pointer to `buffer`; the current parsing position. */
  private peek = 0

  /** A pointer to `buffer`; the start of the current token. */
  private pos = 0

  /** Stores the state of the lexer if reaching the end of incomplete input */
  private state: State = Input;

  /**
   * Generate JSON5 tokens from the `source` string. If `incomplete`,
   * a part of the last line may be left as a buffer for the next call.
   *
   * @returns A generator of lexical tokens
   */
  *lex(source: string, incomplete = false) {
    if (source) this.buffer = this.buffer ? this.buffer + source : source
    let state: State | null = this.state
    while (state) state = yield* this.parseNextChar(state)
    if (!incomplete && this.buffer.length > 0) yield this.buffer
  }

  private *parseNextChar(state: State): Generator<string, State | null> {
    const ch = this.buffer[this.peek]
    if (!ch) return this.atEnd(state)

    switch (state) {
      case Input:
        return yield* this.parseInput(ch)
      case WhiteSpace:
        return yield* this.parseWhiteSpace(ch)
      case LineComment:
        return yield* this.parseLineComment(ch)
      case BlockComment:
        return yield* this.parseBlockComment(ch)
      case QuotedScalar:
        return yield* this.parseQuotedScalar(ch)
    }
  }

  private atEnd(state: State) {
    this.buffer = this.buffer.substring(this.pos)
    this.peek -= this.pos
    this.pos = 0
    this.state = state
    return null
  }

  private *pushToken() {
    if (this.pos < this.peek) {
      yield this.buffer.slice(this.pos, this.peek)
      this.pos = this.peek
    }
  }

  private *parseInput(ch0: string): Generator<string, State | null> {
    switch (ch0) {
      // LineTerminator & JSON5Punctuator
      case '\r': {
        yield* this.pushToken()
        const ch1 = this.buffer[this.peek + 1]
        if (!ch1) return this.atEnd(Input)
        if (ch1 === '\n') {
          yield '\r\n'
          this.peek += 2
        } else {
          yield '\r'
          this.peek += 1
        }
        this.pos = this.peek
        return Input
      }
      case '\n':
      case '\u{2028}': // line separator
      case '\u{2029}': // pragraph separator
      case '{':
      case '}':
      case '[':
      case ']':
      case ':':
      case ',':
        yield* this.pushToken()
        yield ch0
        this.peek += 1
        this.pos = this.peek
        return Input

      // WhiteSpace
      case '\t':
      case '\x0b': // vertical tab
      case '\x0c': // form feed
      case ' ':
      case '\xa0': // non-breaking space
      case '\u{feff}': // byte-order-mark
        yield* this.pushToken()
        this.peek += 1
        return WhiteSpace

      // Comment
      case '/': {
        const ch1 = this.buffer[this.peek + 1]
        if (!ch1) return this.atEnd(Input)
        switch (ch1) {
          case '/':
            yield* this.pushToken()
            this.peek += 1
            return LineComment
          case '*':
            yield* this.pushToken()
            this.peek += 1
            return BlockComment
          default:
            // error, treat as JSON5Identifier
            this.peek += 1
            return Input
        }
      }

      // JSON5String
      case "'":
      case '"':
        yield* this.pushToken()
        this.peek += 1
        return QuotedScalar

      // JSON5Identifier
      default:
        this.peek += 1
        return Input
    }
  }

  private *parseWhiteSpace(ch: string): Generator<string, State> {
    switch (ch) {
      // WhiteSpace
      case '\t':
      case '\x0b': // vertical tab
      case '\x0c': // form feed
      case ' ':
      case '\xa0': // non-breaking space
      case '\u{feff}': // byte-order-mark
        this.peek += 1
        return WhiteSpace
    }
    yield* this.pushToken()
    return Input
  }

  private *parseLineComment(ch: string): Generator<string, State> {
    switch (ch) {
      // LineTerminator
      case '\r':
      case '\n':
      case '\u{2028}': // line separator
      case '\u{2029}': // pragraph separator
        yield* this.pushToken()
        return Input
    }
    this.peek += 1
    return LineComment
  }

  private *parseBlockComment(ch0: string): Generator<string, State | null> {
    if (ch0 === '*') {
      const ch1 = this.buffer[this.peek + 1]
      if (!ch1) return this.atEnd(BlockComment)
      if (ch1 === '/') {
        // MultiLineComment end
        this.peek += 2
        yield* this.pushToken()
        return Input
      }
    }
    this.peek += 1
    return BlockComment
  }

  private *parseQuotedScalar(ch0: string): Generator<string, State | null> {
    const quote = this.buffer[this.pos]
    switch (ch0) {
      // JSON5String end
      case quote:
        this.peek += 1
        yield* this.pushToken()
        return Input

      // EscapeSequence
      case '\\': {
        const ch1 = this.buffer[this.peek + 1]
        if (!ch1) return this.atEnd(QuotedScalar)
        if (ch1 === '\r') {
          const ch2 = this.buffer[this.peek + 2]
          if (!ch2) return this.atEnd(QuotedScalar)
          if (ch2 === '\n') this.peek += 1 // escaped <CR><LF>
        }
        this.peek += 2
        return QuotedScalar
      }

      // Unexpected LineTerminator
      case '\r':
      case '\n':
        yield* this.pushToken()
        return Input

      default:
        this.peek += 1
        return QuotedScalar
    }
  }
}
