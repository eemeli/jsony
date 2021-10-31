import { Scalar } from 'yaml'
import type { CST, ErrorCode } from 'yaml'
import type { ComposeErrorHandler } from './composer.js'
import { resolveEnd } from './resolve-end.js'

type FlowScalarErrorHandler = (
  offset: number,
  code: ErrorCode,
  message: string
) => void

export function composeQuotedScalar(
  { offset, type, source, end }: CST.FlowScalar,
  onError: ComposeErrorHandler
) {
  const value = quotedString(source, (rel, code, msg) =>
    onError(offset + rel, code, msg)
  )
  const scalar = new Scalar(value)

  const valueEnd = offset + source.length
  const re = resolveEnd(end, valueEnd, onError)

  scalar.range = [offset, valueEnd, re.offset]
  scalar.source = value
  scalar.type =
    type === 'single-quoted-scalar' ? Scalar.QUOTE_SINGLE : Scalar.QUOTE_DOUBLE
  if (re.comment) scalar.comment = re.comment

  return scalar as Scalar.Parsed
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
