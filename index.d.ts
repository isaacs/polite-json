declare class JSONParseError extends SyntaxError {
    code: 'EJSONPARSE';
    systemError: Error;
    constructor(er: Error, txt: string, context: number, caller: Function | ((...a: any[]) => any));
    get name(): string;
    set name(_: string);
    get [Symbol.toStringTag](): string;
}
declare const kIndent: unique symbol;
declare const kNewline: unique symbol;
declare namespace parseJson {
    type Reviver = (this: any, key: string, value: any) => any;
    type WithFormat<T> = T & {
        [kIndent]?: string;
        [kNewline]?: string;
    };
    type Scalar = string | number | null;
    type JSONResult = {
        [k: string]: JSONResult;
    } | JSONResult[] | Scalar;
    type Result = WithFormat<{
        [k: string]: JSONResult;
    }> | WithFormat<JSONResult[]> | Scalar;
}
declare const parseJson: {
    (txt: string, reviver?: parseJson.Reviver, context?: number): parseJson.Result;
    JSONParseError: typeof JSONParseError;
    kIndent: typeof kIndent;
    kNewline: typeof kNewline;
    noExceptions(txt: string, reviver?: parseJson.Reviver): any;
};
export = parseJson;
