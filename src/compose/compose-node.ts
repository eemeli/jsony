import type { CST, ParsedNode, ParseOptions, Schema } from 'yaml'
import { composeCollection } from './compose-collection.js'
import { composeScalar } from './compose-scalar.js'
import type { ComposeErrorHandler } from './composer.js'
import { emptyScalarPosition } from './util-empty-scalar-position.js'

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
  onError: ComposeErrorHandler
) {
  const { spaceBefore, comment } = props
  let node: ParsedNode
  switch (token.type) {
    case 'scalar':
    case 'single-quoted-scalar':
    case 'double-quoted-scalar':
      node = composeScalar(ctx, token, onError)
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
  return node
}

export function composeEmptyNode(
  ctx: ComposeContext,
  offset: number,
  before: CST.Token[] | undefined,
  pos: number | null,
  { spaceBefore, comment }: Props,
  onError: ComposeErrorHandler
) {
  const emptyPos = emptyScalarPosition(offset, before, pos)
  onError(emptyPos, 'UNEXPECTED_TOKEN', 'Expected a value')
  const token: CST.FlowScalar = {
    type: 'scalar',
    offset: emptyPos,
    indent: -1,
    source: ''
  }
  const node = composeScalar(ctx, token, onError)
  if (spaceBefore) node.spaceBefore = true
  if (comment) node.comment = comment
  return node
}
