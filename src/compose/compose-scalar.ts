import { isScalar, Scalar } from 'yaml'
import type { CST, ScalarTag } from 'yaml'
import { stringTag } from 'yaml/util'
import type { ComposeContext } from './compose-node.js'
import type { ComposeErrorHandler } from './composer.js'
import { resolveScalarValue } from './resolve-scalar-value.js'

export function composeScalar(
  ctx: ComposeContext,
  token: CST.FlowScalar,
  onError: ComposeErrorHandler
) {
  const { value, type, comment, range } = resolveScalarValue(token, onError)

  let tag: ScalarTag | null = null
  if (token.type === 'scalar') {
    for (const st of ctx.schema.tags) {
      if (st.default && st.test?.test(value)) {
        tag = st
        break
      }
    }
  }
  if (!tag) tag = stringTag

  let scalar: Scalar
  try {
    const res = tag.resolve(
      value,
      msg => onError(token, 'TAG_RESOLVE_FAILED', msg),
      ctx.options
    )
    scalar = isScalar(res) ? res : new Scalar(res)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    onError(token, 'TAG_RESOLVE_FAILED', msg)
    scalar = new Scalar(value)
  }
  scalar.range = range
  scalar.source = value
  if (type) scalar.type = type
  if (tag.format) scalar.format = tag.format
  if (comment) scalar.comment = comment

  return scalar as Scalar.Parsed
}
