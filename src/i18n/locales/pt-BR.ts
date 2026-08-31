/**
 * Portuguese (Brazil) - the source language.
 *
 * Voice rules, which matter more here than anywhere else in the codebase:
 *   - short sentence, verb first, second person
 *   - guide, never police: "Produza ate segunda", not "Estoque insuficiente"
 *   - never blame a person: "Faltaram 3 caixas na conferencia", not "a loja errou"
 *   - no system jargon: say what will happen, spelled out
 *
 * A system that accuses gets hidden data. A system that guides gets honest data.
 * The tone of voice is what protects the quality of the information.
 */
export const ptBR = {
  common: {
    confirm: 'Confirmar',
    adjust: 'Ajustar',
    cancel: 'Cancelar',
    why: 'por quê?',
    seeScreens: 'Ver telas',
    ask: 'Pergunte alguma coisa…',
    allClear: 'Hoje está tudo em ordem.',
  },

  areas: {
    home: 'Início',
    production: 'Produção',
    inventory: 'Estoque',
    distribution: 'Distribuição',
    storeMirror: 'Espelho da Loja',
    purchasing: 'Compras',
    finance: 'Financeiro',
    settings: 'Ajustes',
  },

  units: {
    unit: { one: 'unidade', other: 'unidades' },
    box: { one: 'caixa', other: 'caixas' },
    crate: { one: 'engradado', other: 'engradados' },
  },

  signals: {
    checked: 'Conferido',
    expiringIn: 'Vence em {{days}} dias',
    missing: 'Faltaram {{count}} caixas',
    awaitingRoute: 'Aguardando rota',
  },

  loss: {
    melted: 'Derreteu',
    broken: 'Quebrou',
    expired: 'Venceu',
    courtesy: 'Cortesia',
    internalUse: 'Consumo interno',
    reasonRequired: 'Diga o que aconteceu — isso protege o relatório de todo mundo.',
  },

  posts: {
    picked: 'Separado',
    loaded: 'Carregado',
    delivered: 'Entregue',
    checked: 'Conferido',
  },

  stepper: {
    /** The echo that removes mental math: "12 engradados = 72 caixas = 3.600 picolés" */
    echo: '{{parts}}',
    decrease: 'Diminuir',
    increase: 'Aumentar',
  },

  production: {
    suggestedToday: 'Sugerido para hoje',
    yields: 'Rende {{units}}',
    roundedUp: 'arredondado de {{from}}, que fecha {{boxes}} caixas cheias',
    willDraw: 'Vai baixar do almoxarifado',
    costOfRun: 'Custo desta produção',
    frozenAtRecord: 'por unidade · congelado no registro',
    register: 'Registrar produção',
  },

  scan: {
    typeCode: 'Digitar o código',
    progress: '{{done}} de {{total}}',
    duplicate: 'Esse engradado já foi bipado.',
  },

  confirmation: {
    /** Spelled out in full so a mistake is visible before it is committed. */
    shipment:
      'Você vai enviar {{quantity}} de {{product}} para {{destination}}. Confirma?',
    checkForMe: 'Confere pra mim',
  },

  assistant: {
    title: 'Modo Conversa',
    understood: 'Entendi: {{intent}}',
    offline: 'Preciso de internet pra isso. Enquanto isso, abro a tela.',
    noAccess: 'Valores não fazem parte do seu acesso.',
  },
} as const;

/**
 * Widens every leaf string to `string` while keeping the shape intact.
 * Without this, `as const` would freeze the Portuguese wording into the type
 * and no translation could ever satisfy it - while a missing key must still be
 * a compile error. Structure is checked, wording is free.
 */
type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };

export type Dictionary = Widen<typeof ptBR>;
