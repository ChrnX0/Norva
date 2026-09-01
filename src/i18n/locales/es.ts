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
    settings: {
      title: 'Ajustes',
      stored: 'Lo que está guardado',
      checking: 'Comprobando…',
      inputs: 'Insumos',
      recipes: 'Recetas',
      products: 'Productos',
      purchases: 'Compras registradas',
      hasExample: 'Incluye los datos de ejemplo',
      emptyNoExample: 'Vacío, sin ejemplo',
      clearByArea: 'Limpiar por área',
      clearByAreaHint: 'Un área a la vez, cuando quieras rehacer solo una parte.',
      areas: {
        purchases: 'facturas registradas, costo promedio e historial de precio',
        recipes: 'fichas técnicas y todas las versiones',
        products: 'lo que sale para vender',
        inputs: 'almacén, empaque y material de tienda',
      },
      startOver: 'Empezar de cero',
      startOverHint:
        'Borra todo de una vez, en el orden correcto. Después la aplicación abre vacía y el ejemplo no vuelve solo.',
      eraseAll: 'Borrar todo',
      erasing: 'Borrando…',
      cannotYet: 'Todavía no se puede',
      noUndo: 'Esto no tiene vuelta atrás.',
      eraseTitle: '¿Borrar {{area}}?',
      eraseAllTitle: '¿Borrar todo?',
      erase: 'Borrar',
      failedToErase: 'No se pudo borrar',
      exampleTitle: 'Datos de ejemplo',
      exampleEmpty:
        'Está vacío. Si quieres ver la aplicación funcionando antes de cargar lo tuyo, puedes traer el ejemplo de vuelta.',
      restore: 'Restaurar datos de ejemplo',
      restoreTitle: '¿Traer el ejemplo de vuelta?',
      restoreBody:
        'Repone los insumos, la receta y el producto de demostración, con las compras que les dan su costo. Solo funciona si está vacío.',
      restoreConfirm: 'Restaurar',
      failedToRestore: 'No se pudo restaurar',
      blocked: {
        recipesUseInputs: {
          one: 'No se pueden borrar los insumos mientras 1 receta los usa. Borra las recetas primero.',
          other: 'No se pueden borrar los insumos mientras {{n}} recetas los usan. Borra las recetas primero.',
        },
        purchasesUseInputs: {
          one: 'No se pueden borrar los insumos mientras 1 compra registrada apunta a ellos. Borra las compras primero.',
          other: 'No se pueden borrar los insumos mientras {{n}} compras registradas apuntan a ellos. Borra las compras primero.',
        },
        productsUseRecipes: {
          one: 'No se pueden borrar las recetas mientras 1 producto se hace con ellas. Borra los productos primero.',
          other: 'No se pueden borrar las recetas mientras {{n}} productos se hacen con ellas. Borra los productos primero.',
        },
        purchasesUseProducts:
          'No se pueden borrar los productos mientras haya compras de reventa registradas en ellos. Borra las compras primero.',
      },
      purchasesRow: 'Compras',
      erases: 'Esto borra {{what}}.',
      nothingToErase: 'No hay nada que borrar aquí.',
      alreadyEmpty: 'Ya está todo vacío.',
      alsoPurchases: 'Esto borra {{what}}, y pone en cero el costo promedio de todos los insumos — quedan sin precio hasta la próxima factura.',
      alsoRecipes: 'Esto borra {{what}}, con todas sus versiones y líneas. El historial de versiones se va con ellas.',
      alsoInputs: 'Esto borra {{what}}, junto con su costo promedio y su historial de precio.',
      alsoAll: 'Esto borra {{what}}. La aplicación vuelve a abrir vacía, y los datos de ejemplo no vuelven solos.',
      counted: {
        inputs: { one: '1 insumo', other: '{{n}} insumos' },
        recipes: { one: '1 receta', other: '{{n}} recetas' },
        products: { one: '1 producto', other: '{{n}} productos' },
        purchases: { one: '1 compra', other: '{{n}} compras' },
      },
      back: 'Volver',
    },

    inputs: {
      title: 'Almacén',
      overline: 'lo que compras',
      tabs: {
        input: 'Insumos',
        packaging: 'Empaque',
        storeSupply: 'Material de tienda',
      },
      empty: {
        input: 'Nada cargado todavía.',
        packaging: 'Palito, bolsita, etiqueta — nada todavía.',
        storeSupply: 'Vaso, cuchara, servilleta — nada todavía.',
      },
      heldTitle: 'PARADO EN EL ALMACÉN',
      heldDetail: '{{count}} · al costo promedio de cada uno',
      withoutPrice:
        '{{count}} sin precio — registra la factura y el costo aparece solo.',
      opening: 'Abriendo…',
      perThousand: 'El valor a la derecha es el costo por cada 1.000 {{unit}}.',
      addNew: 'Cargar nuevo',
      inStock: '{{amount}} en existencia',
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
