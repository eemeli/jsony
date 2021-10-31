import { CollectionTag, Scalar, ScalarTag } from 'yaml'
import { mapTag, seqTag } from 'yaml/util'

function intIdentify(value: unknown): value is number | bigint {
  return typeof value === 'bigint' || Number.isInteger(value)
}

const stringifyJSON = ({ value }: Scalar) => JSON.stringify(value)

function stringifyFloat({ value }: Scalar) {
  const num = typeof value === 'number' ? value : Number(value)
  if (isFinite(num)) return JSON.stringify(value)
  return isNaN(num) ? 'NaN' : num < 0 ? '-Infinity' : 'Infinity'
}

const jsonScalars: ScalarTag[] = [
  {
    identify: value => value == null,
    createNode: () => new Scalar(null),
    default: true,
    tag: 'tag:json5.org:null',
    test: /^null$/,
    resolve: () => null,
    stringify: stringifyJSON
  },
  {
    identify: value => typeof value === 'boolean',
    default: true,
    tag: 'tag:json5.org:bool',
    test: /^true|false$/,
    resolve: str => str === 'true',
    stringify: stringifyJSON
  },
  {
    identify: intIdentify,
    default: true,
    tag: 'tag:json5.org:int',
    test: /^[-+]?(?:0|[1-9][0-9]*)$/,
    resolve: (str, _onError, { intAsBigInt }) =>
      intAsBigInt ? BigInt(str) : parseInt(str, 10),
    stringify: ({ value }) =>
      intIdentify(value) ? value.toString() : JSON.stringify(value)
  },
  {
    identify: value => typeof value === 'number',
    default: true,
    tag: 'tag:json5.org:float',
    test: /^[-+]?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
    resolve: str => parseFloat(str),
    stringify: stringifyFloat
  },
  {
    default: true,
    tag: 'tag:json5.org:float',
    test: /^[-+]?(?:Infinity|NaN)$/,
    resolve: str =>
      str.slice(-3) === 'NaN'
        ? NaN
        : str[0] === '-'
        ? Number.NEGATIVE_INFINITY
        : Number.POSITIVE_INFINITY,
    stringify: stringifyFloat
  },
  {
    identify: value => typeof value === 'string',
    default: true,
    format: 'identifier',
    tag: 'tag:json5.org:str',
    test: /^[$_\p{Letter}\p{Nl}][$_\p{Letter}\p{Nl}\p{Nd}\p{Mn}\p{Mc}\p{Pc}\u{200c}\u{200d}]*$/u,
    resolve: (str, onError) =>
      str.replace(/\\u(.{0,4})/gs, (raw, code) => {
        if (/^[0-9a-fA-F]{4}$/.test(code)) {
          return String.fromCodePoint(parseInt(code, 16))
        } else {
          onError(`Invalid escape sequence ${raw}`)
          return raw
        }
      }),
    stringify: stringifyJSON
  }
]

export const tags = (
  [mapTag, seqTag] as Array<CollectionTag | ScalarTag>
).concat(jsonScalars)
