import { CST } from 'yaml'
import { ComposeErrorHandler } from './composer.js'

export function resolveComment(
  token: CST.SourceToken,
  onError: ComposeErrorHandler
) {
  const { source } = token
  if (source.startsWith('/*')) {
    if (source.length >= 4 && source.endsWith('*/'))
      return source.slice(2, -2) || ' '
    onError(token, 'MISSING_CHAR', 'Block comment must end with */')
  }
  return source.slice(2)
}
