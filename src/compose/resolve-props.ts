import type { CST } from 'yaml'
import type { ComposeErrorHandler } from './composer.js'

export interface ResolvePropsArg {
  expectMapInd?: boolean
  flow?: string
  offset: number
  onError: ComposeErrorHandler
  startOnNewline: boolean
}

export function resolveProps(
  tokens: CST.SourceToken[],
  { expectMapInd, flow, offset, onError, startOnNewline }: ResolvePropsArg
) {
  let spaceBefore = false
  let atNewline = startOnNewline
  let comment = ''
  let commentSep = ''
  let comma: CST.SourceToken | null = null
  let found: CST.SourceToken | null = null
  for (const token of tokens) {
    switch (token.type) {
      case 'space':
        break
      case 'comment': {
        const cb = token.source.substring(1) || ' '
        if (!comment) comment = cb
        else comment += commentSep + cb
        commentSep = ''
        atNewline = false
        break
      }
      case 'newline':
        if (atNewline) {
          if (comment) comment += token.source
          else spaceBefore = true
        } else commentSep += token.source
        atNewline = true
        break
      case 'comma':
        if (comma) onError(token, 'UNEXPECTED_TOKEN', `Unexpected , in ${flow}`)
        comma = token
        atNewline = false
        break
      case 'map-value-ind':
        if (expectMapInd) {
          found = token
          atNewline = false
          break
        }
      // fallthrough on else

      default:
        onError(token, 'UNEXPECTED_TOKEN', `Unexpected ${token.type} token`)
        atNewline = false
    }
  }
  const last = tokens[tokens.length - 1]
  const end = last ? last.offset + last.source.length : offset
  return {
    comma,
    found,
    spaceBefore,
    comment,
    end
  }
}
