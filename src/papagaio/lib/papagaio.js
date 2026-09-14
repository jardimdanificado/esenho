// src/lib/papagaio.js
// Exportação central e instalação opcional no String.prototype
import { interpolate } from "./interpolate.js";
import { match } from "./matcher.js";
import { replace } from "./replacement.js";
import { compile } from "./compiler.js";
import { registerModifier, getModifier, BUILTIN_MODIFIERS } from "./modifiers.js";

/**
 * Função principal papagaio
 */
export function papagaio(template, context, options) {
  return interpolate(template, context, options);
}

// Namespace de métodos especializados na função papagaio
papagaio.match = match;
papagaio.replace = replace;
papagaio.compile = compile;
papagaio.registerModifier = registerModifier;
papagaio.getModifier = getModifier;
papagaio.modifiers = BUILTIN_MODIFIERS;

/**
 * Instala o monkey patch em String.prototype de forma segura e idiomática.
 */
export function installStringPrototype() {
  if (typeof String.prototype.papagaio === "undefined") {
    // Definimos getter no String.prototype para retornar uma função especializada
    // vinculada à string corrente (this)
    Object.defineProperty(String.prototype, "papagaio", {
      get() {
        const str = String(this);
        
        function runner(context, options) {
          return papagaio(str, context, options);
        }

        runner.match = function (input, options) {
          // Quando chamado como "pat".papagaio.match(input)
          if (arguments.length === 1 || (arguments.length === 2 && typeof options === "object")) {
            return match(str, input, options);
          }
          // Caso seja chamado passando o pattern como 1º arg: papagaio.match(pattern, input)
          return match(...arguments);
        };

        runner.replace = function (input, replacement, options) {
          if (arguments.length >= 2) {
            return replace(str, input, replacement, options);
          }
          return replace(...arguments);
        };

        runner.compile = function (options) {
          return compile(str, options);
        };

        return runner;
      },
      configurable: true,
      enumerable: false
    });
  }
}

// Auto-instalação no ambiente quando importado diretamente
installStringPrototype();

export default papagaio;
