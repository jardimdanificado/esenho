// src/lib/compiler.js
// Compilação antecipada de padrões e templates para máxima performance
import { interpolate } from "./interpolate.js";
import { parsePattern, matchTokens } from "./matcher.js";
import { replace } from "./replacement.js";
import { mergeOptions } from "./options.js";

/**
 * Compila um pattern ou template.
 *
 * @param {string} source
 * @param {object} [options={}]
 * @returns {Function}
 */
export function compile(source, options = {}) {
  const opts = mergeOptions(options);
  const tokens = parsePattern(source, opts);

  // A função compilada pode ser usada diretamente como interpolador: fn(context)
  function compiled(context) {
    return interpolate(source, context, opts);
  }

  // E também expõe operações compiladas de match e replace
  compiled.match = function (input) {
    if (typeof input !== "string") return null;
    for (let s = 0; s <= input.length; s++) {
      const res = matchTokens(tokens, input, s, opts);
      if (res) return res.captures;
    }
    return null;
  };

  compiled.replace = function (input, replacement, overrideOpts = {}) {
    return replace(source, input, replacement, { ...opts, ...overrideOpts });
  };

  compiled.source = source;
  return compiled;
}
