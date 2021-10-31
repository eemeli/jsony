import { isScalar, Scalar } from 'yaml'
import type { CST } from 'yaml'
import type { ComposeContext } from './compose-node.js'
import type { ComposeErrorHandler } from './composer.js'
import { resolveEnd } from './resolve-end.js'

export function composePlainScalar(
  ctx: ComposeContext,
  token: CST.FlowScalar,
  onError: ComposeErrorHandler
) {
  const { end, offset, source } = token

  let scalar: Scalar | null = null
  for (const tag of ctx.schema.tags) {
    if (tag.default && tag.test?.test(source)) {
      try {
        const res = tag.resolve(
          source,
          msg => onError(token, 'TAG_RESOLVE_FAILED', msg),
          ctx.options
        )
        scalar = isScalar(res) ? res : new Scalar(res)
        if (tag.format) scalar.format = tag.format
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        onError(token, 'TAG_RESOLVE_FAILED', msg)
      }
      break
    }
  }
  scalar ||= new Scalar(source)

  const valueEnd = offset + source.length
  const re = resolveEnd(end, valueEnd, onError)

  scalar.range = [offset, valueEnd, re.offset]
  scalar.source = source
  scalar.type = Scalar.PLAIN
  if (re.comment) scalar.comment = re.comment

  return scalar as Scalar.Parsed
}
