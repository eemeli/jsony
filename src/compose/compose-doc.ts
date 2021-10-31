import { Document } from 'yaml'
import type { CST, DocumentOptions, ParseOptions, SchemaOptions } from 'yaml'
import {
  ComposeContext,
  composeEmptyNode,
  composeNode
} from './compose-node.js'
import type { ComposeErrorHandler } from './composer.js'
import { resolveEnd } from './resolve-end.js'
import { resolveProps } from './resolve-props.js'

export function composeDoc(
  options: ParseOptions & DocumentOptions & SchemaOptions,
  { offset, start, value, end }: CST.Document,
  onError: ComposeErrorHandler
) {
  const doc = new Document(undefined, options) as Document.Parsed
  const ctx: ComposeContext = {
    options: doc.options,
    schema: doc.schema
  }
  const props = resolveProps(start, {
    offset,
    onError,
    startOnNewline: true
  })
  doc.contents = value
    ? composeNode(ctx, value, props, false, onError)
    : composeEmptyNode(ctx, props.end, props, onError)

  const contentEnd = doc.contents.range[2]
  const re = resolveEnd(end, contentEnd, onError)
  if (re.comment) doc.comment = re.comment
  doc.range = [offset, contentEnd, re.offset]
  return doc
}
