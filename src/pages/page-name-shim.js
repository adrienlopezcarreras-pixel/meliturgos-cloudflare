// Les modules de page injectés via Function.prototype.toString() sont empaquetés
// par Wrangler/esbuild avec keepNames : esbuild insère alors des appels
// __name(fonction, "nom") dans leurs corps, mais ne définit __name que dans le
// bundle du Worker. Dans le navigateur, le premier appel levait
// « __name is not defined » (MEL Chat, 17/10). Ce shim, injecté avant ces
// modules, rend __name inoffensif (renvoie la fonction telle quelle).
export const MEL_PAGE_NAME_SHIM = 'var __name = typeof __name === "function" ? __name : function (target) { return target; };';
