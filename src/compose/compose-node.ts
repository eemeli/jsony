import { CST, ParsedNode, ParseOptions, Scalar, Schema } from 'yaml'
import { composeCollection } from './compose-collection.js'
import { composePlainScalar } from './compose-plain-scalar.js'
import { composeQuotedScalar } from './compose-quoted-scalar.js'
import type { ComposeErrorHandler } from './composer.js'

export interface ComposeContext {
  options: Readonly<Required<Omit<ParseOptions, 'lineCounter'>>>
  schema: Readonly<Schema>
}

interface Props {
  spaceBefore: boolean
  comment: string
}

const CN = { composeNode, composeEmptyNode }
export type ComposeNode = typeof CN

export function composeNode(
  ctx: ComposeContext,
  token: CST.Token,
  props: Props,
  isMapKey: boolean,
  onError: ComposeErrorHandler
) {
  const { spaceBefore, comment } = props
  let node: ParsedNode
  switch (token.type) {
    case 'scalar':
      node = composePlainScalar(ctx, token, onError)
      break
    case 'single-quoted-scalar':
    case 'double-quoted-scalar':
      node = composeQuotedScalar(token, onError)
      break
    case 'flow-collection':
      node = composeCollection(CN, ctx, token, onError)
      break
    default:
      console.log(token)
      throw new Error(`Unsupporten token type: ${(token as any).type}`)
  }
  if (spaceBefore) node.spaceBefore = true
  if (comment) {
    if (token.type === 'scalar' && token.source === '') node.comment = comment
    else node.commentBefore = comment
  }
  if (ctx.options.keepSourceTokens) node.srcToken = token

  if (isMapKey) {
    if (
      !(node instanceof Scalar) ||
      typeof node.value !== 'string' ||
      (node.type === Scalar.PLAIN && node.format !== 'ID')
    ) {
      onError(node.range, 'UNEXPECTED_TOKEN', 'Invalid map key')
    }
  } else if (
    node instanceof Scalar &&
    typeof node.value === 'string' &&
    node.type === Scalar.PLAIN
  ) {
    onError(node.range, 'UNEXPECTED_TOKEN', 'Invalid value')
  }

  return node
}

export function composeEmptyNode(
  ctx: ComposeContext,
  offset: number,
  { spaceBefore, comment }: Props,
  onError: ComposeErrorHandler
) {
  onError(offset, 'UNEXPECTED_TOKEN', 'Expected a value')
  const token: CST.FlowScalar = {
    type: 'scalar',
    offset,
    indent: -1,
    source: ''
  }
  const node = composePlainScalar(ctx, token, onError)
  if (spaceBefore) node.spaceBefore = true
  if (comment) node.comment = comment
  return node
}
