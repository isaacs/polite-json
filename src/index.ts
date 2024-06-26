/**
 * Copyright 2017 Kat Marchán
 * Copyright npm, Inc.
 * Copyright 2023 Isaac Z. Schlueter
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 * ---
 *
 * 'polite-json' is a fork of 'json-parse-even-better-errors',
 * extended and distributed under the terms of the MIT license
 * above.
 *
 * 'json-parse-even-better-errors' is a fork of
 * 'json-parse-better-errors' by Kat Marchán, extended and
 * distributed under the terms of the MIT license above.
 */

// version specific
/* c8 ignore start */
const hexify = (s: string) =>
  Array.from(s)
    .map(
      c => '0x' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')
    )
    .join('')
/* c8 ignore stop */

type ParseErrorMeta = {
  message: string
  position: number
}
const parseError = (e: Error, txt: string, context: number): ParseErrorMeta => {
  if (!txt) {
    return {
      message: e.message + ' while parsing empty string',
      position: 0,
    }
  }
  const badToken = e.message.match(/^Unexpected (?:token (.*?))?/i)
  const atPos = e.message.match(/at positions? (\d+)/)

  // version specific
  /* c8 ignore start */
  const errIdx = /^Unexpected end of JSON|Unterminated string in JSON/i.test(
    e.message
  )
    ? txt.length - 1
    : atPos && atPos[1]
    ? +atPos[1]
    : /is not valid JSON$/.test(e.message)
    ? 0
    : null

  const msg =
    badToken && badToken[1]
      ? e.message.replace(
          /^Unexpected token ./,
          `Unexpected token ${JSON.stringify(badToken[1])} (${hexify(
            badToken[1]
          )})`
        )
      : e.message
  /* c8 ignore stop */

  if (errIdx !== null && errIdx !== undefined) {
    const start = errIdx <= context ? 0 : errIdx - context

    const end = errIdx + context >= txt.length ? txt.length : errIdx + context

    const slice =
      (start === 0 ? '' : '...') +
      txt.slice(start, end) +
      (end === txt.length ? '' : '...')

    const near = txt === slice ? '' : 'near '

    return {
      message: msg + ` while parsing ${near}${JSON.stringify(slice)}`,
      position: errIdx,
    }
  } else {
    return {
      message: msg + ` while parsing '${txt.slice(0, context * 2)}'`,
      position: 0,
    }
  }
}

export class JSONParseError extends SyntaxError {
  code: 'EJSONPARSE'
  cause: Error
  position: number
  constructor(
    er: Error,
    txt: string,
    context: number = 20,
    caller?: Function | ((...a: any[]) => any)
  ) {
    const { message, position } = parseError(er, txt, context)
    super(message)
    this.cause = er
    this.position = position
    this.code = 'EJSONPARSE'
    Error.captureStackTrace(this, caller || this.constructor)
  }
  get name() {
    return this.constructor.name
  }
  set name(_) {}
  get [Symbol.toStringTag]() {
    return this.constructor.name
  }
}

export const kIndent = Symbol.for('indent')
export const kNewline = Symbol.for('newline')
// only respect indentation if we got a line break, otherwise squash it
// things other than objects and arrays aren't indented, so ignore those
// Important: in both of these regexps, the $1 capture group is the newline
// or undefined, and the $2 capture group is the indent, or undefined.
const formatRE = /^\s*[{\[]((?:\r?\n)+)([\s\t]*)/
const emptyRE = /^(?:\{\}|\[\])((?:\r?\n)+)?$/

export type Reviver = (this: any, key: string, value: any) => any
export type Replacer =
  | ((this: any, key: string, value: any) => any)
  | (string | number)[]
  | null
export type Scalar = string | number | null
export type JSONResult =
  | {
      [k: string]: JSONResult
      [kIndent]?: string
      [kNewline]?: string
    }
  | (JSONResult[] & { [kIndent]?: string; [kNewline]?: string })
  | Scalar

export const parse = (
  txt: string | Buffer,
  reviver?: Reviver | null,
  context?: number
): JSONResult => {
  const parseText = stripBOM(String(txt))
  if (!reviver) reviver = undefined
  context = context || 20
  try {
    // get the indentation so that we can save it back nicely
    // if the file starts with {" then we have an indent of '', ie, none
    // otherwise, pick the indentation of the next line after the first \n
    // If the pattern doesn't match, then it means no indentation.
    // JSON.stringify ignores symbols, so this is reasonably safe.
    // if the string is '{}' or '[]', then use the default 2-space indent.
    const [, newline = '\n', indent = '  '] = parseText.match(emptyRE) ||
      parseText.match(formatRE) || [, '', '']

    const result = JSON.parse(parseText, reviver)
    if (result && typeof result === 'object') {
      result[kNewline] = newline
      result[kIndent] = indent
    }
    return result
  } catch (e) {
    if (typeof txt !== 'string' && !Buffer.isBuffer(txt)) {
      const isEmptyArray =
        Array.isArray(txt) && (txt as Array<any>).length === 0
      throw Object.assign(
        new TypeError(
          `Cannot parse ${isEmptyArray ? 'an empty array' : String(txt)}`
        ),
        {
          code: 'EJSONPARSE',
          systemError: e,
        }
      )
    }

    throw new JSONParseError(e as Error, parseText, context, parse)
  }
}

export const parseNoExceptions = (txt: string | Buffer, reviver?: Reviver) => {
  try {
    return JSON.parse(stripBOM(String(txt)), reviver)
  } catch (e) {}
}

// Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
// because the buffer-to-string conversion in `fs.readFileSync()`
// translates it to FEFF, the UTF-16 BOM.
const stripBOM = (txt: string) => String(txt).replace(/^\uFEFF/, '')

export const stringify = (
  obj: any,
  replacer?: Replacer,
  indent?: string | number
) => {
  const space = indent === undefined ? obj[kIndent] : indent
  // TS is so weird with parameter overloads
  const res =
    /* c8 ignore start */
    typeof replacer === 'function'
      ? JSON.stringify(obj, replacer, space)
      : JSON.stringify(obj, replacer, space)
  /* c8 ignore stop */
  const nl = obj[kNewline] || '\n'
  return space ? (nl === '\n' ? res : res.split('\n').join(nl)) + nl : res
}
