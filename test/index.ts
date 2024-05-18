import t from 'tap'
import {
  JSONParseError,
  kIndent,
  kNewline,
  parse,
  parseNoExceptions,
  stringify,
} from '../dist/esm/index.js'

type MaybePolite = Record<string, any> & {
  [kIndent]?: string
  [kNewline]?: string
}
const c = (p: unknown): unknown => {
  if (p && typeof p === 'object') {
    const mp = { ...(p as MaybePolite) }
    delete mp[kIndent]
    delete mp[kNewline]
    return mp
  }
  return p
}

t.test('parses JSON', t => {
  const cases = Object.entries({
    object: {
      foo: 1,
      bar: {
        baz: [1, 2, 3, 'four'],
      },
    },
    array: [1, 2, null, 'hello', { world: true }, false],
    num: 420.69,
    null: null,
    true: true,
    false: false,
  }).map(([name, obj]) => [name, JSON.stringify(obj)])
  t.plan(cases.length)
  for (const [name, data] of cases as [string, string][]) {
    t.same(c(parse(data)), JSON.parse(data), name)
  }
})

t.test('preserves indentation and newline styles', t => {
  const object = { name: 'object', version: '1.2.3' }
  const array = [1, 2, 3, { object: true }, null]
  for (const newline of ['\n', '\r\n', '\n\n', '\r\n\r\n']) {
    for (const indent of ['', '  ', '\t', ' \t \t ']) {
      for (const [type, obj] of Object.entries({ object, array })) {
        const n = JSON.stringify({ type, newline, indent })
        const txt = JSON.stringify(obj, null, indent).replace(/\n/g, newline)
        t.test(n, t => {
          const res = parse(txt)
          if (!res || typeof res !== 'object') {
            throw new Error('parse failed')
          }
          // no newline if no indentation
          t.equal(
            res[kNewline] as string | undefined,
            indent && newline,
            'preserved newline'
          )
          t.equal(
            res[kIndent] as string | undefined,
            indent,
            'preserved indent'
          )
          t.end()
        })
      }
    }
  }
  t.end()
})

t.test('indentation is the default when object/array is empty', t => {
  const obj = '{}'
  const arr = '[]'
  for (const newline of ['', '\n', '\r\n', '\n\n', '\r\n\r\n']) {
    const expect = newline || '\n'
    for (const str of [obj, arr]) {
      t.test(JSON.stringify({ str, newline, expect }), t => {
        const res = parse(str + newline)
        if (!res || typeof res !== 'object') {
          throw new Error('parse failed')
        }
        t.equal(res[kNewline], expect, 'got expected newline')
        t.equal(res[kIndent], '  ', 'got expected default indentation')
        t.end()
      })
    }
  }
  t.end()
})

t.test('parses JSON if it is a Buffer, removing BOM bytes', t => {
  const str = JSON.stringify({
    foo: 1,
    bar: {
      baz: [1, 2, 3, 'four'],
    },
  })
  const data = Buffer.from(str)
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), data])
  t.same(c(parse(data)), JSON.parse(str))
  t.same(c(parse(bom)), JSON.parse(str), 'strips the byte order marker')
  t.end()
})

t.test('better errors when faced with \\b and other malarky', t => {
  const str = JSON.stringify({
    foo: 1,
    bar: {
      baz: [1, 2, 3, 'four'],
    },
  })
  const data = Buffer.from(str)
  const bombom = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf]),
    data,
  ])
  t.throws(() => parse(bombom))
  const bs = str + '\b\b\b\b\b\b\b\b\b\b\b\b'
  t.throws(() => parse(bs))
  t.end()
})

t.test('throws SyntaxError for unexpected token', t => {
  const data = 'foo'
  t.throws(() => parse(data), {
    message: String,
    code: 'EJSONPARSE',
    position: Number,
    name: 'JSONParseError',
    cause: SyntaxError,
  })
  t.end()
})

t.test('throws SyntaxError for unexpected end of JSON', t => {
  const data = '{"foo: bar}'
  t.throws(() => parse(data), {
    message: String,
    code: 'EJSONPARSE',
    position: Number,
    name: 'JSONParseError',
    cause: SyntaxError,
  })
  t.end()
})

t.test('throws SyntaxError for unexpected number', t => {
  const data = '[[1,2],{3,3,3,3,3}]'
  t.throws(() => parse(data), {
    message: String,
    code: 'EJSONPARSE',
    position: 8,
    name: 'JSONParseError',
    cause: SyntaxError,
  })
  t.end()
})

t.test('SyntaxError with less context (limited start)', t => {
  const data = '{"6543210'
  t.throws(() => parse(data, null, 3), {
    message: 'while parsing near "...3210"',
    code: 'EJSONPARSE',
    position: 8,
    name: 'JSONParseError',
    cause: SyntaxError,
  })
  t.end()
})

t.test('SyntaxError with less context (limited end)', t => {
  const data = 'abcde'
  t.throws(() => parse(data, null, 2), {
    message: 'while parsing near "ab..."',
    code: 'EJSONPARSE',
    position: 0,
    name: 'JSONParseError',
    cause: SyntaxError,
  })
  t.end()
})

t.test('throws TypeError for undefined', t => {
  t.throws(
    //@ts-expect-error
    () => parse(undefined),
    new TypeError('Cannot parse undefined')
  )
  t.end()
})

t.test('throws TypeError for non-strings', t => {
  t.throws(
    //@ts-expect-error
    () => parse(new Map()),
    new TypeError('Cannot parse [object Map]')
  )
  t.end()
})

t.test('throws TypeError for empty arrays', t => {
  t.throws(
    //@ts-expect-error
    () => parse([]),
    new TypeError('Cannot parse an empty array')
  )
  t.end()
})

t.test('handles empty string helpfully', t => {
  t.throws(() => parse(''), {
    message: 'Unexpected end of JSON input while parsing empty string',
    name: 'JSONParseError',
    position: 0,
    code: 'EJSONPARSE',
    cause: SyntaxError,
  })
  t.end()
})

t.test('json parse error class', t => {
  t.type(JSONParseError, 'function')
  // we already checked all the various index checking logic above
  const poop = new Error('poop')
  const fooShouldNotShowUpInStackTrace = () => {
    return new JSONParseError(poop, 'this is some json', undefined, bar)
  }
  const bar = () => fooShouldNotShowUpInStackTrace()
  const err1 = bar()
  t.equal(err1.cause, poop, 'gets the original error attached')
  t.equal(err1.position, 0)
  t.equal(err1.message, `poop while parsing 'this is some json'`)
  t.equal(err1.name, 'JSONParseError')
  err1.name = 'something else'
  t.equal(err1.name, 'JSONParseError')
  t.notMatch(err1.stack, /fooShouldNotShowUpInStackTrace/)
  // calling it directly, tho, it does
  const fooShouldShowUpInStackTrace = () => {
    return new JSONParseError(poop, 'this is some json')
  }
  const err2 = fooShouldShowUpInStackTrace()
  t.equal(err2.cause, poop, 'gets the original error attached')
  t.equal(err2.position, 0)
  t.equal(err2.message, `poop while parsing 'this is some json'`)
  t.match(err2.stack, /fooShouldShowUpInStackTrace/)

  t.end()
})

t.test('parse without exception', t => {
  const bad = 'this is not json'
  t.equal(parseNoExceptions(bad), undefined, 'does not throw')
  const obj = { this: 'is json' }
  const good = JSON.stringify(obj)
  t.same(parseNoExceptions(good), obj, 'parses json string')
  const buf = Buffer.from(good)
  t.same(parseNoExceptions(buf), obj, 'parses json buffer')
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), buf])
  t.same(parseNoExceptions(bom), obj, 'parses json buffer with bom')
  t.end()
})

t.test('stringify', t => {
  const obj = { a: 1, b: { c: 3 } }
  const min = JSON.stringify(obj)
  const twosp = JSON.stringify(obj, null, 2)
  const spaces = ['', 2, '\t']
  const nls = ['\n', '\r\n', '\n\n']
  for (const space of spaces) {
    for (const nl of nls) {
      t.test(JSON.stringify({ space, nl }), t => {
        const split = JSON.stringify(obj, null, space).split('\n')
        const json = split.join(nl) + (split.length > 1 ? nl : '')
        const parsed = parse(json)
        t.same(c(parsed), obj, 'object parsed properly')
        const stringified = stringify(parsed)
        t.equal(stringified, json, 'got same json back that we started with')
        // trailing newline only matters if we are indenting
        if (space) {
          const noTrailingNL = split.join(nl)
          const parsed2 = parse(noTrailingNL)
          const stringified2 = stringify(parsed2)
          t.equal(stringified2, stringified, 'trailing newline added')
          t.equal(stringify(obj, null, ''), min, 'override to minify')
          t.equal(stringify(obj, null, 0), min, 'override to minify')
          const twospWithNL = twosp.split('\n').join(nl) + nl
          t.equal(stringify(parsed2, null, 2), twospWithNL)
        }
        t.end()
      })
    }
  }
  t.end()
})
