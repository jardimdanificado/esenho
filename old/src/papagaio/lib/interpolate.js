// src/lib/interpolate.js
// Interpolação textual compatível com ES2023 / QuickJS
import { mergeOptions } from "./options.js";

/**
 * Avalia uma expressão JS em um contexto fornecido.
 */
function evaluateExpression(expr, context) {
  try {
    const keys = Object.keys(context || {});
    const vals = Object.values(context || {});
    // Cria função segura passando propriedades como argumentos
    const fn = new Function(...keys, `"use strict"; return (${expr});`);
    const res = fn(...vals);
    return res !== undefined && res !== null ? String(res) : "";
  } catch (err) {
    return "";
  }
}

/**
 * Executa a interpolação de strings no formato $var e ${expr}.
 *
 * @param {string} template
 * @param {object} [context={}]
 * @param {object} [options={}]
 * @returns {string}
 */
export function interpolate(template, context = {}, options = {}) {
  if (typeof template !== "string") {
    template = String(template ?? "");
  }
  const opts = mergeOptions(options);
  const sigil = opts.sigil;
  const open = opts.open;
  const close = opts.close;

  let result = "";
  let i = 0;
  const len = template.length;

  while (i < len) {
    // Escaping: \$ ou \\
    if (template[i] === "\\" && i + 1 < len) {
      const next = template[i + 1];
      if (next === sigil || next === "\\" || next === open || next === close) {
        result += next;
        i += 2;
        continue;
      }
    }

    // Verifica ocorrência do sigil
    if (template.startsWith(sigil, i)) {
      const afterSigil = i + sigil.length;

      // 1. Expressão ou variável delimitada: ${...}
      if (template.startsWith(open, afterSigil)) {
        let depth = 1;
        let pos = afterSigil + open.length;
        const exprStart = pos;

        while (pos < len && depth > 0) {
          if (template.startsWith(open, pos)) {
            depth++;
            pos += open.length;
          } else if (template.startsWith(close, pos)) {
            depth--;
            if (depth === 0) break;
            pos += close.length;
          } else {
            pos++;
          }
        }

        if (depth === 0) {
          const expr = template.slice(exprStart, pos).trim();
          // Verifica se é um identificador simples existente no contexto
          if (/^[a-zA-Z_]\w*$/.test(expr)) {
            if (context && Object.prototype.hasOwnProperty.call(context, expr)) {
              const val = context[expr];
              result += val !== undefined && val !== null ? String(val) : "";
            } else {
              // Se a variável com chaves não existe no contexto, mantém literal ${unknown}
              result += sigil + open + expr + close;
            }
          } else {
            // Expressão JavaScript arbitrária
            result += evaluateExpression(expr, context);
          }
          i = pos + close.length;
          continue;
        }
      }

      // 2. Variável simples: $nome
      let vEnd = afterSigil;
      while (vEnd < len && /[a-zA-Z0-9_]/.test(template[vEnd])) {
        vEnd++;
      }

      if (vEnd > afterSigil) {
        const varName = template.slice(afterSigil, vEnd);
        if (context && Object.prototype.hasOwnProperty.call(context, varName)) {
          const val = context[varName];
          result += val !== undefined && val !== null ? String(val) : "";
        } else {
          result += ""; // Default para variável não definida no contexto
        }
        i = vEnd;
        continue;
      }
    }

    result += template[i];
    i++;
  }

  return result;
}
