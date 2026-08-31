import type { Dictionary } from './pt-BR';

/**
 * Spanish. The largest market available to this positioning: research across
 * Argentina, Chile, Mexico and Colombia found the same gap as in Brazil, only
 * wider - every "heladeria" product there is a restaurant POS, and the small
 * manufacturer who also distributes has nothing at all.
 */
export const es: Dictionary = {
  common: {
    confirm: 'Confirmar',
    adjust: 'Ajustar',
    cancel: 'Cancelar',
    why: '¿por qué?',
    seeScreens: 'Ver pantallas',
    ask: 'Pregunte algo…',
    allClear: 'Hoy está todo en orden.',
  },

  areas: {
    home: 'Inicio',
    production: 'Producción',
    inventory: 'Inventario',
    distribution: 'Distribución',
    storeMirror: 'Espejo de Tienda',
    purchasing: 'Compras',
    finance: 'Finanzas',
    settings: 'Ajustes',
  },

  units: {
    unit: { one: 'unidad', other: 'unidades' },
    box: { one: 'caja', other: 'cajas' },
    crate: { one: 'jaba', other: 'jabas' },
  },

  signals: {
    checked: 'Verificado',
    expiringIn: 'Vence en {{days}} días',
    missing: 'Faltaron {{count}} cajas',
    awaitingRoute: 'Esperando ruta',
  },

  loss: {
    melted: 'Se derritió',
    broken: 'Se rompió',
    expired: 'Venció',
    courtesy: 'Cortesía',
    internalUse: 'Consumo interno',
    reasonRequired: 'Diga qué pasó — eso protege el reporte de todos.',
  },

  posts: {
    picked: 'Preparado',
    loaded: 'Cargado',
    delivered: 'Entregado',
    checked: 'Verificado',
  },

  stepper: {
    echo: '{{parts}}',
    decrease: 'Disminuir',
    increase: 'Aumentar',
  },

  production: {
    suggestedToday: 'Sugerido para hoy',
    yields: 'Rinde {{units}}',
    roundedUp: 'redondeado desde {{from}}, que completa {{boxes}} cajas llenas',
    willDraw: 'Se descontará del almacén',
    costOfRun: 'Costo de esta producción',
    frozenAtRecord: 'por unidad · congelado al registrar',
    register: 'Registrar producción',
  },

  scan: {
    typeCode: 'Escribir el código',
    progress: '{{done}} de {{total}}',
    duplicate: 'Esa jaba ya fue escaneada.',
  },

  confirmation: {
    shipment: 'Va a enviar {{quantity}} de {{product}} a {{destination}}. ¿Confirma?',
    checkForMe: 'Revíselo conmigo',
  },

  assistant: {
    title: 'Modo Conversación',
    understood: 'Entendí: {{intent}}',
    offline: 'Necesito internet para eso. Mientras tanto, abro la pantalla.',
    noAccess: 'Los valores no forman parte de su acceso.',
  },
};
