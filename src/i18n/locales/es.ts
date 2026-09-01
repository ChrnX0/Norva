import type { Dictionary } from './pt-BR';

/**
 * Spanish. The largest market available to this positioning: research across
 * Argentina, Chile, Mexico and Colombia found the same gap as in Brazil, only
 * wider - every "heladeria" product there is a restaurant POS, and the small
 * manufacturer who also distributes has nothing at all.
 */
export const es: Dictionary = {
  common: {
    /** Joins the last two items of a spoken list: "a, b y c". */
    and: 'y',
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

  app: {
    crash: {
      title: 'Algo se rompió aquí',
      reassurance:
        'Nada de lo que registraste se perdió. La aplicación guarda cada asiento en el dispositivo en el momento en que confirmas, así que basta con volver y seguir donde estabas.',
      retry: 'Intentar de nuevo',
      detail: 'DETALLE TÉCNICO',
    },

    whatsNew: {
      title: 'Novedades',
      subtitle: 'La aplicación se actualizó sola. Esto es lo que cambió.',
      dismiss: 'Entendido',
    },

    confirm: {
      confirm: 'Confirmar',
      cancel: 'Cancelar',
      adjust: 'Ajustar',
      understood: 'Entendido',
      close: 'Cerrar',
    },

    home: {
      overline: 'hoy en la fábrica',
      unitCost: 'costo por unidad · calculado de la receta y de las facturas de compra',
      changed: 'Cambió desde la última vez',
      steady: 'Ningún precio cambió',
      steadyDetail: 'Los costos están estables. No hay nada que decidir hoy.',
      checking: 'Comprobando…',
      allSteady: 'Todo estable',
      whereTo: 'A dónde quieres ir',
      nav: {
        ask: { label: 'Pregunta', hint: 'escribe lo que quieres saber' },
        inputs: { label: 'Insumos', hint: 'lo que compras' },
        recipes: { label: 'Recetas', hint: 'lo que entra en la olla' },
        products: { label: 'Productos', hint: 'lo que sale para vender' },
        purchases: { label: 'Compras', hint: 'la factura que mueve el costo' },
        settings: { label: 'Ajustes', hint: 'limpiar datos y empezar de nuevo' },
      },
    },
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
