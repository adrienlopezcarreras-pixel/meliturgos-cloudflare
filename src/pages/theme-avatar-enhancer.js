/**
 * Legacy compatibility shim.
 *
 * Canonical normal-mode theming now belongs exclusively to mvp-interface.js.
 * Keeping this exported function as a transparent pass-through lets older
 * entrypoints continue importing it without injecting a second visual layer.
 * It must never mutate /professor or any other response.
 */
export async function enhanceThemeAvatars(response) {
  return response;
}
