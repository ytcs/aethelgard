// Polyfill for Map/WeakMap.prototype.getOrInsert(Computed).
//
// pdf.js v6 calls Map.prototype.getOrInsertComputed (a very new TC39 proposal)
// inside its MessageHandler. It's shipping in V8/Chromium but NOT yet in WebKit,
// so on iOS (every iOS browser is WebKit, including Chrome/CriOS) every page
// render throws "getOrInsertComputed is not a function" and the PDF shows blank.
//
// This installs a spec-compatible fallback when the engine lacks it. Imported in
// both the main thread and the pdf.js worker (the failing code runs on both).

function install(proto: any) {
  if (typeof proto.getOrInsertComputed !== 'function') {
    Object.defineProperty(proto, 'getOrInsertComputed', {
      configurable: true,
      writable: true,
      enumerable: false,
      value: function (key: any, callbackFunction: (key: any) => any) {
        if (this.has(key)) return this.get(key);
        const value = callbackFunction(key);
        this.set(key, value);
        return value;
      },
    });
  }
  if (typeof proto.getOrInsert !== 'function') {
    Object.defineProperty(proto, 'getOrInsert', {
      configurable: true,
      writable: true,
      enumerable: false,
      value: function (key: any, defaultValue: any) {
        if (this.has(key)) return this.get(key);
        this.set(key, defaultValue);
        return defaultValue;
      },
    });
  }
}

install(Map.prototype);
install(WeakMap.prototype);
