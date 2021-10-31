import { isPair, Pair, YAMLMap, YAMLSeq } from 'yaml'
import type { CST } from 'yaml'
import type { ComposeContext, ComposeNode } from './compose-node.js'
import type { ComposeErrorHandler } from './composer.js'
import { resolveEnd } from './resolve-end.js'
import { resolveProps } from './resolve-props.js'

export function composeCollection(
  { composeNode, composeEmptyNode }: ComposeNode,
  ctx: ComposeContext,
  fc: CST.FlowCollection,
  onError: ComposeErrorHandler
) {
  const isMap = fc.start.source === '{'
  const fcName = isMap ? 'flow map' : 'flow sequence'
  const coll = isMap
    ? (new YAMLMap(ctx.schema) as YAMLMap.Parsed)
    : (new YAMLSeq(ctx.schema) as YAMLSeq.Parsed)
  coll.flow = true

  let offset = fc.offset
  for (let i = 0; i < fc.items.length; ++i) {
    const collItem = fc.items[i]
    const { start, key, sep, value } = collItem

    const props = resolveProps(start, {
      flow: fcName,
      offset,
      onError,
      startOnNewline: false
    })
    if (!sep && !value) {
      if (i === 0 && props.comma)
        onError(props.comma, 'UNEXPECTED_TOKEN', `Unexpected , in ${fcName}`)
      else if (i < fc.items.length - 1)
        onError(
          props.end,
          'UNEXPECTED_TOKEN',
          `Unexpected empty item in ${fcName}`
        )
      if (props.comment) {
        if (coll.comment) coll.comment += '\n' + props.comment
        else coll.comment = props.comment
      }
      continue
    }
    if (i === 0) {
      if (props.comma)
        onError(props.comma, 'UNEXPECTED_TOKEN', `Unexpected , in ${fcName}`)
    } else {
      if (!props.comma)
        onError(props.end, 'MISSING_CHAR', `Missing , between ${fcName} items`)
      if (props.comment) {
        let prevItemComment = ''
        loop: for (const st of start) {
          switch (st.type) {
            case 'comma':
            case 'space':
              break
            case 'comment':
              prevItemComment = st.source.substring(1)
              break loop
            default:
              break loop
          }
        }
        if (prevItemComment) {
          let prev = coll.items[coll.items.length - 1]
          if (isPair(prev)) prev = prev.value || prev.key
          if (prev.comment) prev.comment += '\n' + prevItemComment
          else prev.comment = prevItemComment
          props.comment = props.comment.substring(prevItemComment.length + 1)
        }
      }
    }

    if (!isMap && !sep) {
      // item is a value in a seq
      // → key & sep are empty, start does not include :
      const valueNode = value
        ? composeNode(ctx, value, props, false, onError)
        : composeEmptyNode(ctx, props.end, props, onError)
      ;(coll as YAMLSeq).items.push(valueNode)
      offset = valueNode.range[2]
    } else {
      // item is a key+value pair

      // key value
      const keyStart = props.end
      const keyNode = key
        ? composeNode(ctx, key, props, true, onError)
        : composeEmptyNode(ctx, keyStart, props, onError)

      // value properties
      const valueProps = resolveProps(sep || [], {
        expectMapInd: true,
        flow: fcName,
        offset: keyNode.range[2],
        onError,
        startOnNewline: false
      })

      if (value && !valueProps.found) {
        const ind = isMap ? ', or :' : ','
        const message = `Missing ${ind} between ${fcName} items`
        onError(valueProps.end, 'MISSING_CHAR', message)
      }

      // value value
      const valueNode = value
        ? composeNode(ctx, value, valueProps, false, onError)
        : composeEmptyNode(ctx, valueProps.end, valueProps, onError)

      const pair = new Pair(keyNode, valueNode)
      if (ctx.options.keepSourceTokens) pair.srcToken = collItem
      if (isMap) {
        const map = coll as YAMLMap.Parsed
        map.items.push(pair)
      } else {
        onError(
          [keyStart, valueNode.range[1]],
          'MISSING_CHAR',
          'Missing {} around map in seq'
        )
        const map = new YAMLMap(ctx.schema)
        map.flow = true
        map.items.push(pair)
        ;(coll as YAMLSeq).items.push(map)
      }
      offset = valueNode.range[2]
    }
  }

  const expectedEnd = isMap ? '}' : ']'
  const [ce, ...ee] = fc.end
  let cePos = offset
  if (ce && ce.source === expectedEnd) cePos = ce.offset + ce.source.length
  else {
    onError(
      offset + 1,
      'MISSING_CHAR',
      `Expected ${fcName} to end with ${expectedEnd}`
    )
    if (ce && ce.source.length !== 1) ee.unshift(ce)
  }
  if (ee.length > 0) {
    const end = resolveEnd(ee, cePos, onError)
    if (end.comment) {
      if (coll.comment) coll.comment += '\n' + end.comment
      else coll.comment = end.comment
    }
    coll.range = [fc.offset, cePos, end.offset]
  } else {
    coll.range = [fc.offset, cePos, cePos]
  }

  return coll as YAMLMap.Parsed | YAMLSeq.Parsed
}
