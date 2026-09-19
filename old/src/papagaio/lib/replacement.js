// src/lib/replacement.js
// Replacement engine com suporte a captures, strings de substituição e funções
import { parsePattern, matchTokens } from "./matcher.js";
import { interpolate } from "./interpolate.js";
import { mergeOptions } from "./options.js";

/**
 * Aplica substituição de um pattern em input.
 *
 * @param {string} pattern
 * @param {string} input
 * @param {string|Function} replacement
 * @param {object} [options={}]
 * @returns {string}
 */
export function replace(pattern, input, replacement, options = {}) {
  if (typeof pattern !== "string" || typeof input !== "string") {
    return String(input ?? "");
  }

  const opts = mergeOptions(options);
  const tokens = parsePattern(pattern, opts);
  const replaceAll = opts.all !== false;

  let result = "";
  let pos = 0;
  const len = input.length;

  while (pos < len) {
    const matched = matchTokens(tokens, input, pos, opts);

    if (matched) {
      let repText = "";
      if (typeof replacement === "function") {
        repText = String(replacement(matched.captures, matched) ?? "");
      } else if (typeof replacement === "string") {
        // Interpola as capturas na string de substituição
        repText = interpolate(replacement, matched.captures, opts);
      }

      result += repText;
      pos = matched.end;

      if (!replaceAll) {
        result += input.slice(pos);
        break;
      }
    } else {
      result += input[pos];
      pos++;
    }
  }

  return result;
}
