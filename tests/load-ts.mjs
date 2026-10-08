import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
export function loadTs(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const context = {
    exports, module: { exports }, Buffer, URL, URLSearchParams, Response, Request,
    process: { env: {} }, console,
    fetch: () => { throw new Error("Unexpected network call in offline test"); },
    require: (name) => name in mocks ? mocks[name] : name.startsWith("node:") ? require(name) : (() => { throw new Error(`Unmocked dependency: ${name}`); })(),
    ...globals,
  };
  vm.runInNewContext(code, context, { filename: file });
  return context.module.exports;
}
