import { Scalar } from 'yaml'
import type { CST, ErrorCode, Range } from 'yaml'
import type { ComposeErrorHandler } from './composer.js'
import { resolveEnd } from './resolve-end.js'

type FlowScalarErrorHandler = (
  offset: number,
  code: ErrorCode,
  message: string
) => void

export function resolveScalarValue(
  scalar: CST.FlowScalar,
  onError: ComposeErrorHandler
): {
  value: string
  type: Scalar.PLAIN | Scalar.QUOTE_DOUBLE | Scalar.QUOTE_SINGLE | null
  comment: string
  range: Range
} {
  const { offset, type, source, end } = scalar
  let _type: Scalar.PLAIN | Scalar.QUOTE_DOUBLE | Scalar.QUOTE_SINGLE
  let value: string
  const _onError: FlowScalarErrorHandler = (rel, code, msg) =>
    onError(offset + rel, code, msg)
  switch (type) {
    case 'scalar':
      _type = Scalar.PLAIN
      value = plainValue(source, _onError)
      break

    case 'single-quoted-scalar':
      _type = Scalar.QUOTE_SINGLE
      value = quotedString(source, _onError)
      break

    case 'double-quoted-scalar':
      _type = Scalar.QUOTE_DOUBLE
      value = quotedString(source, _onError)
      break

    /* istanbul ignore next should not happen */
    default:
      onError(
        scalar,
        'UNEXPECTED_TOKEN',
        `Expected a flow scalar value, but found: ${type}`
      )
      return {
        value: '',
        type: null,
        comment: '',
        range: [offset, offset + source.length, offset + source.length]
      }
  }

  const valueEnd = offset + source.length
  const re = resolveEnd(end, valueEnd, onError)
  return {
    value,
    type: _type,
    comment: re.comment,
    range: [offset, valueEnd, re.offset]
  }
}

// ECMAScript 5.1 IdentifierName: https://262.ecma-international.org/5.1/#sec-7.6
// https://unicode.org/Public/UNIDATA/PropertyValueAliases.txt
const IdentifierStart = /[$_\p{Letter}\p{Nl}]/u
const IdentifierPart =
  /[$_\p{Letter}\p{Nl}\p{Nd}\p{Mn}\p{Mc}\p{Pc}\u{200c}\u{200d}]/u

function plainValue(source: string, onError: FlowScalarErrorHandler) {
  // JSON5NumericLiteral, validated later
  if ('-+.0123456789'.includes(source[0])) return source

  let res = ''
  for (let i = 0; i < source.length; ++i) {
    let ch = source[i]
    if (ch === '\\' && source[i + 1] === 'u') {
      ch = parseCharCode(source, i + 2, 4, onError)
      i += 5
    }
    const re = i === 0 ? IdentifierStart : IdentifierPart
    if (!re.test(ch)) {
      let cp = ch.codePointAt(0)?.toString(16) ?? '????'
      while (cp.length < 4) cp = '0' + cp
      onError(i, 'BAD_SCALAR_START', `Invalid character \\u${cp}`)
    }
    res += ch
  }
  return res
}

function quotedString(source: string, onError: FlowScalarErrorHandler) {
  let res = ''
  for (let i = 1; i < source.length - 1; ++i) {
    const ch = source[i]
    if (ch === '\r' || ch === '\n') {
      onError(i, 'BAD_DQ_ESCAPE', `Unescaped newline`)
      if (ch === '\r' && source[i + 1] === '\n') {
        i += 1
        res += '\r\n'
      } else {
        res += ch
      }
    } else if (ch === '\\') {
      const next = source[++i]
      switch (next) {
        case '\n':
        case '\u{2028}':
        case '\u{2029}':
          // skip escaped newlines
          break
        case '\r':
          // skip escaped CRLF newlines
          if (source[i + 1] === '\n') i += 1
          break
        case 'x':
          res += parseCharCode(source, i + 1, 2, onError)
          i += 2
          break
        case 'u':
          res += parseCharCode(source, i + 1, 4, onError)
          i += 4
          break
        default:
          if ('123456789'.includes(next))
            onError(i, 'BAD_DQ_ESCAPE', `Invalid escaped character ${next}`)
          res += escapeCodes[next] || next
      }
    } else {
      res += ch
    }
  }
  if (source[source.length - 1] !== source[0] || source.length === 1)
    onError(source.length, 'MISSING_CHAR', `Missing closing ${source[0]}quote`)
  return res
}

const escapeCodes: Record<string, string> = {
  '0': '\0', // null character
  b: '\b', // backspace
  f: '\f', // form feed
  n: '\n', // line feed
  r: '\r', // carriage return
  t: '\t', // horizontal tab
  v: '\v' // vertical tab
}

function parseCharCode(
  source: string,
  offset: number,
  length: number,
  onError: FlowScalarErrorHandler
) {
  const cc = source.substr(offset, length)
  const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc)
  const code = ok ? parseInt(cc, 16) : NaN
  if (isNaN(code)) {
    const raw = source.substr(offset - 2, length + 2)
    onError(offset - 2, 'BAD_DQ_ESCAPE', `Invalid escape sequence ${raw}`)
    return raw
  }
  return String.fromCodePoint(code)
}
