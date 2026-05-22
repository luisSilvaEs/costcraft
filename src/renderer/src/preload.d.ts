/**
 * preload.d.ts  (src/renderer/src/)
 *
 * Declara window.api para que TypeScript reconozca el API en el renderer
 * sin necesidad de importar nada en tiempo de ejecución.
 *
 * Coloca este archivo en src/renderer/src/preload.d.ts
 * y agrega la referencia al inicio de cualquier archivo .tsx que lo necesite:
 *
 *   /// <reference path="./preload.d.ts" />
 *
 */

import type { Api } from '../../preload/index'

declare global {
  interface Window {
    api: Api
  }
}
