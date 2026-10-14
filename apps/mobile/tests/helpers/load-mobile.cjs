const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the actual mobile TypeScript with native bridges replaced in Node.
function createLoader(mocks = {}, globals = {}) {
  const cache = new Map();
  function load(file) {
    const filename = path.resolve(__dirname, '../../src', file);
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const source = fs.readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(compiled, {
      exports, console: { ...console, warn() {}, error() {}, log() {} },
      setTimeout, clearTimeout, setInterval, clearInterval, ...globals,
      require(id) {
        if (Object.hasOwn(mocks, id)) return mocks[id];
        if (id.startsWith('.')) {
          let target = path.resolve(path.dirname(filename), id);
          target = fs.existsSync(`${target}.ts`) ? `${target}.ts` : path.join(target, 'index.ts');
          if (Object.hasOwn(mocks, target)) return mocks[target];
          return load(target);
        }
        throw new Error(`Native module unavailable: ${id}`);
      },
    }, { filename });
    return exports;
  }
  return load;
}

function memoryStorage() {
  const data = new Map();
  return {
    data,
    async getItem(key) { await Promise.resolve(); return data.get(key) ?? null; },
    async setItem(key, value) { await Promise.resolve(); data.set(key, value); },
    async removeItem(key) { data.delete(key); },
    async getAllKeys() { return [...data.keys()]; },
    async multiGet(keys) { return keys.map(key => [key, data.get(key) ?? null]); },
    async multiSet(pairs) { pairs.forEach(([key, value]) => data.set(key, value)); },
    async multiRemove(keys) { keys.forEach(key => data.delete(key)); },
  };
}

module.exports = { createLoader, memoryStorage };
