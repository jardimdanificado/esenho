// src/lib/options.js
// Configurações padrão e normalização de opções

export const DEFAULT_OPTIONS = {
  sigil: "$",
  open: "{",
  close: "}",
  optional: "?",
  all: true,
  strict: false,
  exact: false,
  caseInsensitive: false
};

export function mergeOptions(opts = {}) {
  return {
    ...DEFAULT_OPTIONS,
    ...opts
  };
}
