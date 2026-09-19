// src/lib/modifiers.js
// Catálogo de validadores e transformadores de tokens para pattern matching

export const BUILTIN_MODIFIERS = {
  int: (val) => /^-?\d+$/.test(val),
  float: (val) => /^-?\d+(\.\d+)?$/.test(val),
  number: (val) => /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(val),
  upper: (val) => val.length > 0 && val === val.toUpperCase() && /[A-Z]/.test(val),
  lower: (val) => val.length > 0 && val === val.toLowerCase() && /[a-z]/.test(val),
  capitalized: (val) => /^[A-Z][a-z]*$/.test(val),
  word: (val) => /^[a-zA-Z]+$/.test(val),
  identifier: (val) => /^[a-zA-Z_]\w*$/.test(val),
  hex: (val) => /^(0x)?[0-9a-fA-F]+$/.test(val),
  path: (val) => val.length > 0 && !/\s/.test(val),
  binary: (val) => /^(0b)?[01]+$/i.test(val),
  percent: (val) => /^-?\d+(\.\d+)?%$/.test(val),
  alpha: (val) => {
    if (/^[a-zA-Z]+$/.test(val)) {
      return val.toUpperCase(); // built-in histórico converte para maiúsculo
    }
    return false;
  },
  alphanum: (val) => /^[a-zA-Z0-9]+$/.test(val)
};

const customModifiers = new Map();

export function registerModifier(name, fn) {
  customModifiers.set(name, fn);
}

export function getModifier(name) {
  if (customModifiers.has(name)) {
    return customModifiers.get(name);
  }
  return BUILTIN_MODIFIERS[name] || null;
}
