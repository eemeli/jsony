import { CST } from 'yaml'
import { ComposeErrorHandler } from './composer.js'

export function checkCommentEnd(
  token: CST.SourceToken,
  onError: ComposeErrorHandler
) {
  if (
    token.source.startsWith('/*') &&
    (token.source.length < 4 || !token.source.endsWith('*/'))
  )
    onError(token, 'MISSING_CHAR', 'Block comment must end with */')
}
