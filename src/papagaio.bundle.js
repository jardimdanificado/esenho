/**
 * Papagaio Pattern Matching & String Interpolation Engine (UMD Bundle)
 */
(function(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    const p = factory();
    root.papagaio = p.papagaio;
    if (typeof globalThis !== "undefined") globalThis.papagaio = p.papagaio;
    if (typeof window !== "undefined") window.papagaio = p.papagaio;
  }
})(typeof self !== "undefined" ? self : this, function() {
  "use strict";

  // src/lib/options.js
// Configurações padrão e normalização de opções

const DEFAULT_OPTIONS = {
  sigil: "$",
  open: "{",
  close: "}",
  optional: "?",
  all: true,
  strict: false,
  exact: false,
  caseInsensitive: false
};

function mergeOptions(opts = {}) {
  return {
    ...DEFAULT_OPTIONS,
    ...opts
  };
}


  // src/lib/modifiers.js
// Catálogo de validadores e transformadores de tokens para pattern matching

const BUILTIN_MODIFIERS = {
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

function registerModifier(name, fn) {
  customModifiers.set(name, fn);
}

function getModifier(name) {
  if (customModifiers.has(name)) {
    return customModifiers.get(name);
  }
  return BUILTIN_MODIFIERS[name] || null;
}


  // src/lib/matcher.js
// Pattern Matching Engine para Papagaio com flex-matching, captures, blocks e modifiers



/**
 * Token types
 */
const TOK_LITERAL = "LITERAL";
const TOK_VAR = "VAR";
const TOK_BLOCK = "BLOCK";
const TOK_WS = "WS";

/**
 * Extrai bloco balanceado respeitando profundidade.
 */
function extractBlock(src, pos, openStr, closeStr) {
  if (!src.startsWith(openStr, pos)) return null;
  pos += openStr.length;
  const start = pos;
  let depth = 1;

  while (pos < src.length && depth > 0) {
    if (src.startsWith(openStr, pos) && openStr !== closeStr) {
      depth++;
      pos += openStr.length;
    } else if (src.startsWith(closeStr, pos)) {
      depth--;
      if (depth === 0) {
        return {
          content: src.slice(start, pos),
          nextPos: pos + closeStr.length
        };
      }
      pos += closeStr.length;
    } else {
      pos++;
    }
  }

  return {
    content: src.slice(start),
    nextPos: src.length
  };
}

/**
 * Desfaz escape em delimitadores
 */
function unescapeDelim(str) {
  return str.replace(/\\([{}()[\]\\])/g, "$1");
}

/**
 * Faz o parser da string de padrão gerando a lista de tokens.
 */
function parsePattern(patternStr, options = {}) {
  const opts = mergeOptions(options);
  const sigil = opts.sigil;
  const open = opts.open;
  const close = opts.close;
  const optMarker = opts.optional;

  const tokens = [];
  let i = 0;
  const len = patternStr.length;

  while (i < len) {
    // Espaços em branco
    if (/\s/.test(patternStr[i])) {
      while (i < len && /\s/.test(patternStr[i])) i++;
      tokens.push({ type: TOK_WS });
      continue;
    }

    // Variável iniciada por sigil
    if (patternStr.startsWith(sigil, i)) {
      let pos = i + sigil.length;
      let varStart = pos;
      while (pos < len && /[a-zA-Z0-9_]/.test(patternStr[pos])) pos++;

      const varName = patternStr.slice(varStart, pos);
      if (varName.length === 0) {
        tokens.push({ type: TOK_LITERAL, value: sigil });
        i += sigil.length;
        continue;
      }

      const tok = {
        type: TOK_VAR,
        name: varName,
        modifier: null,
        modArgs: null,
        optional: false,
        wsConsume: false
      };

      // Verifica encadeamento de modifier: $var$mod ou $var$block{o}{c}
      if (patternStr.startsWith(sigil, pos)) {
        pos += sigil.length;
        let modStart = pos;
        while (pos < len && /[a-zA-Z0-9_]/.test(patternStr[pos])) pos++;
        const modName = patternStr.slice(modStart, pos);

        if (modName.length === 0) {
          // Trailing sigil isolado
          tok.wsConsume = true;
        } else if (modName === "block") {
          tok.type = TOK_BLOCK;
          while (pos < len && /\s/.test(patternStr[pos])) pos++;
          if (patternStr.startsWith(open, pos)) {
            const blk1 = extractBlock(patternStr, pos, open, close);
            if (blk1) {
              tok.openDelim = unescapeDelim(blk1.content.trim()) || open;
              pos = blk1.nextPos;
              while (pos < len && /\s/.test(patternStr[pos])) pos++;
              if (patternStr.startsWith(open, pos)) {
                const blk2 = extractBlock(patternStr, pos, open, close);
                if (blk2) {
                  tok.closeDelim = unescapeDelim(blk2.content.trim()) || close;
                  pos = blk2.nextPos;
                }
              } else {
                tok.closeDelim = close;
              }
            }
          } else {
            tok.openDelim = open;
            tok.closeDelim = close;
          }
        } else if (modName === "aliases") {
          tok.modifier = "aliases";
          tok.alts = [];
          while (pos < len) {
            while (pos < len && /\s/.test(patternStr[pos])) pos++;
            if (patternStr.startsWith(open, pos)) {
              const blk = extractBlock(patternStr, pos, open, close);
              if (blk) {
                tok.alts.push(blk.content);
                pos = blk.nextPos;
              } else break;
            } else break;
          }
        } else if (["starts", "ends", "prefix", "suffix", "infix", "includes", "group"].includes(modName)) {
          tok.modifier = modName;
          while (pos < len && /\s/.test(patternStr[pos])) pos++;
          if (patternStr.startsWith(open, pos)) {
            const blk = extractBlock(patternStr, pos, open, close);
            if (blk) {
              tok.subPatternStr = blk.content.trim();
              pos = blk.nextPos;
            }
          }
        } else {
          tok.modifier = modName;
        }
      }

      // Marcador de opcionalidade ?
      if (patternStr.startsWith(optMarker, pos)) {
        tok.optional = true;
        pos += optMarker.length;
      }

      // Trailing sigil para consumir espaços posteriores
      if (patternStr.startsWith(sigil, pos)) {
        const nextCharPos = pos + sigil.length;
        if (nextCharPos >= len || (!/[a-zA-Z0-9_]/.test(patternStr[nextCharPos]))) {
          tok.wsConsume = true;
          pos += sigil.length;
        }
      }

      tokens.push(tok);
      i = pos;
      continue;
    }

    // Literal normal
    let litStart = i;
    while (
      i < len &&
      !/\s/.test(patternStr[i]) &&
      !patternStr.startsWith(sigil, i) &&
      !patternStr.startsWith(optMarker, i)
    ) {
      i++;
    }

    let litVal = patternStr.slice(litStart, i);
    let opt = false;
    let wsCon = false;

    if (i < len && patternStr.startsWith(optMarker, i)) {
      opt = true;
      i += optMarker.length;
    }

    if (i < len && patternStr.startsWith(sigil, i)) {
      const nextCharPos = i + sigil.length;
      if (nextCharPos >= len || (!/[a-zA-Z0-9_]/.test(patternStr[nextCharPos]))) {
        wsCon = true;
        i += sigil.length;
      }
    }

    tokens.push({
      type: TOK_LITERAL,
      value: litVal,
      optional: opt,
      wsConsume: wsCon
    });
  }

  // Calcula nextSig (próximo token não-whitespace) exatamente como no motor C (next_sig)
  for (let a = 0; a < tokens.length; a++) {
    tokens[a].nextSig = null;
    for (let b = a + 1; b < tokens.length; b++) {
      if (tokens[b].type !== TOK_WS) {
        tokens[a].nextSig = tokens[b];
        break;
      }
    }
  }

  return tokens;
}

/**
 * Valida um valor capturado contra as regras de um modifier.
 */
function validateModifier(modifier, val, tok) {
  if (!modifier) return val;

  // Modifiers estruturais especiais
  if (modifier === "starts" || modifier === "prefix") {
    if (tok.subPatternStr && !val.startsWith(tok.subPatternStr)) return null;
    if (modifier === "prefix" && val === tok.subPatternStr) return null;
    return val;
  }
  if (modifier === "ends" || modifier === "suffix") {
    if (tok.subPatternStr && !val.endsWith(tok.subPatternStr)) return null;
    if (modifier === "suffix" && val === tok.subPatternStr) return null;
    return val;
  }
  if (modifier === "infix") {
    if (!tok.subPatternStr) return val;
    const idx = val.indexOf(tok.subPatternStr);
    if (idx > 0 && idx + tok.subPatternStr.length < val.length) return val;
    return null;
  }
  if (modifier === "includes") {
    if (tok.subPatternStr && !val.includes(tok.subPatternStr)) return null;
    return val;
  }
  if (modifier === "group") {
    return val;
  }

  // Modifiers catalogados
  const modFn = getModifier(modifier);
  if (typeof modFn === "function") {
    const res = modFn(val);
    if (res === false || res === null) return null;
    return typeof res === "string" ? res : val;
  }

  return val;
}

/**
 * Executa o casamento de tokens a partir da posição `startIndex` no texto `src`.
 */
function matchTokens(tokens, src, startIndex = 0, options = {}) {
  const opts = mergeOptions(options);
  let pos = startIndex;
  const captures = {};

  for (let ti = 0; ti < tokens.length; ti++) {
    const tok = tokens[ti];
    const nextTok = ti + 1 < tokens.length ? tokens[ti + 1] : null;

    if (tok.type === TOK_WS) {
      if (!/\s/.test(src[pos] || "")) {
        // Se for adjacente a opcional ou após token wsConsume, pode pular
        if (tokens[ti - 1]?.optional || tokens[ti - 1]?.wsConsume || nextTok?.optional) continue;
        return null;
      }
      while (pos < src.length && /\s/.test(src[pos])) pos++;
      continue;
    }

    if (tok.type === TOK_LITERAL) {
      const matchLit = opts.caseInsensitive
        ? src.slice(pos, pos + tok.value.length).toLowerCase() === tok.value.toLowerCase()
        : src.startsWith(tok.value, pos);
      if (!matchLit) {
        if (tok.optional) continue;
        return null;
      }
      pos += tok.value.length;
      if (tok.wsConsume) {
        while (pos < src.length && /\s/.test(src[pos])) pos++;
      }
      continue;
    }

    if (tok.type === TOK_BLOCK) {
      if (!src.startsWith(tok.openDelim, pos)) {
        if (tok.optional) {
          captures[tok.name] = "";
          continue;
        }
        return null;
      }
      const blk = extractBlock(src, pos, tok.openDelim, tok.closeDelim);
      if (!blk) {
        if (tok.optional) {
          captures[tok.name] = "";
          continue;
        }
        return null;
      }
      captures[tok.name] = blk.content;
      pos = blk.nextPos;
      continue;
    }

    if (tok.type === TOK_VAR) {
      // Flex-matching: pular espaços em branco horizontais se não vier após espaço explícito
      if (ti === 0 || tokens[ti - 1].type !== TOK_WS) {
        while (pos < src.length && (src[pos] === " " || src[pos] === "\t")) pos++;
      }

      const varStart = pos;

      // Se for aliases
      if (tok.modifier === "aliases" && Array.isArray(tok.alts)) {
        let matchedAlt = null;
        for (const alt of tok.alts) {
          if (src.startsWith(alt, pos)) {
            matchedAlt = alt;
            break;
          }
        }
        if (matchedAlt !== null) {
          captures[tok.name] = matchedAlt;
          pos += matchedAlt.length;
          continue;
        }
        if (tok.optional) {
          captures[tok.name] = "";
          continue;
        }
        return null;
      }

      // Função para validar se o caractere c na posição atual é válido para o modifier (fiel ao C original)
      function isCharValid(c, currentPos, startPos) {
        if (!tok.modifier) return true;
        const mod = tok.modifier;
        const isFirst = currentPos === startPos;

        if (mod === "int") {
          return /\d/.test(c) || (isFirst && c === "-");
        }
        if (mod === "float" || mod === "number") {
          return /\d/.test(c) || c === "." || (isFirst && c === "-");
        }
        if (mod === "upper") {
          return /[A-Z]/.test(c);
        }
        if (mod === "lower") {
          return /[a-z]/.test(c);
        }
        if (mod === "capitalized") {
          return isFirst ? /[A-Z]/.test(c) : /[a-z]/.test(c);
        }
        if (mod === "word") {
          return /[a-zA-Z]/.test(c);
        }
        if (mod === "identifier") {
          return /[a-zA-Z0-9_]/.test(c) && (!isFirst || !/\d/.test(c));
        }
        if (mod === "hex") {
          const is0x = (c === "x" || c === "X") && currentPos > startPos && src[currentPos - 1] === "0";
          return /[0-9a-fA-F]/.test(c) || is0x;
        }
        if (mod === "path") {
          return !/\s/.test(c) && c !== "\n";
        }
        if (mod === "binary") {
          return c === "0" || c === "1" || c === "b" || c === "B";
        }
        if (mod === "percent") {
          return /\d/.test(c) || c === "." || c === "%" || (isFirst && c === "-");
        }
        return true;
      }

      // Procura o término do capture da variável usando o próximo token significativo (nx = tok.nextSig)
      const nx = tok.nextSig;

      if (nx && (nx.type === TOK_LITERAL || nx.type === TOK_BLOCK)) {
        const stopCond = nx.type === TOK_LITERAL ? nx.value : nx.openDelim;
        while (pos < src.length) {
          if (src[pos] === "\n") break;
          const hitsStop = opts.caseInsensitive && nx.type === TOK_LITERAL
            ? src.slice(pos, pos + stopCond.length).toLowerCase() === stopCond.toLowerCase()
            : src.startsWith(stopCond, pos);
          if (hitsStop) break;
          if (!isCharValid(src[pos], pos, varStart)) break;
          pos++;
          if ((tok.modifier === "ends" || tok.modifier === "suffix") && tok.subPatternStr) {
            if (pos - varStart >= tok.subPatternStr.length && src.slice(pos - tok.subPatternStr.length, pos) === tok.subPatternStr) break;
          }
        }
      } else {
        while (pos < src.length) {
          if (nextTok && nextTok.type === TOK_WS && /\s/.test(src[pos])) break;
          const hitsLit = opts.caseInsensitive && nx && nx.type === TOK_LITERAL
            ? src.slice(pos, pos + nx.value.length).toLowerCase() === nx.value.toLowerCase()
            : (nx && nx.type === TOK_LITERAL && src.startsWith(nx.value, pos));
          if (hitsLit) break;
          if (nx && nx.type === TOK_BLOCK && src.startsWith(nx.openDelim, pos)) break;
          if (!nx && src[pos] === "\n") break;
          if (!isCharValid(src[pos], pos, varStart)) break;
          pos++;
          if ((tok.modifier === "ends" || tok.modifier === "suffix") && tok.subPatternStr) {
            if (pos - varStart >= tok.subPatternStr.length && src.slice(pos - tok.subPatternStr.length, pos) === tok.subPatternStr) break;
          }
        }
      }

      // Poda espaços finais do capture se houver
      let end = pos;
      while (end > varStart && /\s/.test(src[end - 1])) end--;

      let rawVal = src.slice(varStart, end);
      if (rawVal.length === 0) {
        if (tok.optional) {
          captures[tok.name] = "";
          continue;
        }
        return null;
      }

      const validated = validateModifier(tok.modifier, rawVal, tok);
      if (validated === null) {
        if (tok.optional) {
          captures[tok.name] = "";
          pos = varStart;
          continue;
        }
        return null;
      }

      captures[tok.name] = validated;
      pos = end;
      if (tok.wsConsume) {
        while (pos < src.length && /\s/.test(src[pos])) pos++;
      }
      continue;
    }
  }

  return {
    captures,
    start: startIndex,
    end: pos
  };
}

/**
 * Função pública de pattern matching
 */
function match(pattern, input, options = {}) {
  if (typeof pattern !== "string" || typeof input !== "string") return null;
  const opts = mergeOptions(options);
  const tokens = parsePattern(pattern, opts);

  if (opts.exact) {
    const res = matchTokens(tokens, input, 0, opts);
    if (res && res.start === 0 && res.end === input.length) {
      return res.captures;
    }
    return null;
  }

  // Procura primeira correspondência
  for (let s = 0; s <= input.length; s++) {
    const res = matchTokens(tokens, input, s, opts);
    if (res) {
      return res.captures;
    }
  }

  return null;
}


  // src/lib/interpolate.js
// Interpolação textual compatível com ES2023 / QuickJS


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
function interpolate(template, context = {}, options = {}) {
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


  // src/lib/replacement.js
// Replacement engine com suporte a captures, strings de substituição e funções




/**
 * Aplica substituição de um pattern em input.
 *
 * @param {string} pattern
 * @param {string} input
 * @param {string|Function} replacement
 * @param {object} [options={}]
 * @returns {string}
 */
function replace(pattern, input, replacement, options = {}) {
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


  // src/lib/compiler.js
// Compilação antecipada de padrões e templates para máxima performance





/**
 * Compila um pattern ou template.
 *
 * @param {string} source
 * @param {object} [options={}]
 * @returns {Function}
 */
function compile(source, options = {}) {
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


  function papagaio(template, context, options) {
    return interpolate(template, context, options);
  }

  papagaio.match = match;
  papagaio.replace = replace;
  papagaio.compile = compile;
  papagaio.registerModifier = registerModifier;
  papagaio.getModifier = getModifier;
  papagaio.modifiers = BUILTIN_MODIFIERS;

  function installStringPrototype() {
    if (typeof String.prototype.papagaio === "undefined") {
      Object.defineProperty(String.prototype, "papagaio", {
        get() {
          const str = String(this);
          function runner(context, options) {
            return papagaio(str, context, options);
          }
          runner.match = function(input, options) {
            if (arguments.length === 1 || (arguments.length === 2 && typeof options === "object")) {
              return match(str, input, options);
            }
            return match(...arguments);
          };
          runner.replace = function(input, replacement, options) {
            if (arguments.length >= 2) {
              return replace(str, input, replacement, options);
            }
            return replace(...arguments);
          };
          runner.compile = function(options) {
            return compile(str, options);
          };
          return runner;
        },
        configurable: true,
        enumerable: false
      });
    }
  }

  return { papagaio, installStringPrototype };
});
