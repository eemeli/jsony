import type { CST } from 'yaml'
import type { ComposeErrorHandler } from './composer.js'
import { resolveComment } from './resolve-comment.js'

export function resolveEnd(
  end: CST.SourceToken[] | undefined,
  offset: number,
  onError: ComposeErrorHandler
) {
  let comment = ''
  if (end) {
    let sep = ''
    for (const token of end) {
      const { source, type } = token
      switch (type) {
        case 'space':
          break
        case 'comment': {
          const cb = resolveComment(token, onError)
          if (!comment) comment = cb
          else comment += sep + cb
          sep = ''
          break
        }
        case 'newline':
          if (comment) sep += source
          break
        default:
          onError(token, 'UNEXPECTED_TOKEN', `Unexpected ${type} at node end`)
      }
      offset += source.length
    }
  }
  return { comment, offset }
}
