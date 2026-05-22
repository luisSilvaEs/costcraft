/**
 * costcraft/src/renderer/src/preload.d.ts
 */

declare global {
  interface Window {
    api: import('../../preload/index').Api
  }
}

export {}
