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
    /** Joins the last two items of a spoken list: "a, b e c". */
    and: 'e',
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

  /**
   * Screen wording.
   *
   * The screens used to hold these as literals, which quietly broke the rule
   * this project set for itself on day one: i18n from the first string. It was
   * cheap to fix while there are nine screens and it would not have been later.
   *
   * Grouped by screen rather than by phrase so a translator reads them in the
   * order a person meets them.
   */
  app: {
    crash: {
      title: 'Alguma coisa travou aqui',
      reassurance:
        'Nada do que você registrou se perdeu. O aplicativo guarda cada lançamento no aparelho no momento em que você confirma, então é só voltar e continuar de onde parou.',
      retry: 'Tentar de novo',
      detail: 'DETALHE TÉCNICO',
    },

    whatsNew: {
      title: 'Novidades',
      subtitle: 'O aplicativo se atualizou sozinho. Isto é o que mudou.',
      dismiss: 'Entendi',
    },

    confirm: {
      confirm: 'Confirmar',
      cancel: 'Cancelar',
      adjust: 'Ajustar',
      understood: 'Entendi',
      close: 'Fechar',
    },

    home: {
      overline: 'hoje na fábrica',
      unitCost: 'custo por unidade · calculado da receita e das notas de compra',
      changed: 'Mudou desde a última vez',
      steady: 'Nada mudou de preço',
      steadyDetail: 'Os custos estão estáveis. Não há nada para decidir hoje.',
      checking: 'Conferindo…',
      allSteady: 'Tudo estável',
      whereTo: 'Onde você quer ir',
      nav: {
        ask: { label: 'Pergunte', hint: 'escreva o que quer saber' },
        inputs: { label: 'Insumos', hint: 'o que você compra' },
        recipes: { label: 'Receitas', hint: 'o que entra no tacho' },
        products: { label: 'Produtos', hint: 'o que sai para vender' },
        purchases: { label: 'Compras', hint: 'a nota que move o custo' },
        settings: { label: 'Ajustes', hint: 'limpar dados e recomeçar' },
      },
    },
    settings: {
      title: 'Ajustes',
      stored: 'O que está guardado',
      checking: 'Conferindo…',
      inputs: 'Insumos',
      recipes: 'Receitas',
      products: 'Produtos',
      purchases: 'Compras lançadas',
      hasExample: 'Inclui os dados de exemplo',
      emptyNoExample: 'Vazio, sem exemplo',
      clearByArea: 'Limpar por área',
      clearByAreaHint: 'Uma área de cada vez, quando você quiser refazer só uma parte.',
      areas: {
        purchases: 'notas lançadas, custo médio e histórico de preço',
        recipes: 'fichas técnicas e todas as versões',
        products: 'o que sai para vender',
        inputs: 'almoxarifado, embalagem e material de loja',
      },
      startOver: 'Começar do zero',
      startOverHint:
        'Apaga tudo de uma vez, na ordem certa. Depois disso o aplicativo abre vazio e o exemplo não volta sozinho.',
      eraseAll: 'Apagar tudo',
      erasing: 'Apagando…',
      cannotYet: 'Ainda não dá',
      noUndo: 'Isso não tem volta.',
      eraseTitle: 'Apagar {{area}}?',
      eraseAllTitle: 'Apagar tudo?',
      erase: 'Apagar',
      failedToErase: 'Não deu para apagar',
      exampleTitle: 'Dados de exemplo',
      exampleEmpty:
        'Está vazio. Se quiser ver o aplicativo funcionando antes de cadastrar o seu, dá para trazer o exemplo de volta.',
      restore: 'Restaurar dados de exemplo',
      restoreTitle: 'Trazer o exemplo de volta?',
      restoreBody:
        'Recoloca os insumos, a receita e o produto de demonstração, com as compras que dão o custo a eles. Só funciona se estiver vazio.',
      restoreConfirm: 'Restaurar',
      failedToRestore: 'Não deu para restaurar',
      blocked: {
        recipesUseInputs: {
          one: 'Não dá para apagar os insumos enquanto 1 receita usa eles. Apague as receitas primeiro.',
          other: 'Não dá para apagar os insumos enquanto {{n}} receitas usam eles. Apague as receitas primeiro.',
        },
        purchasesUseInputs: {
          one: 'Não dá para apagar os insumos enquanto 1 compra lançada aponta para eles. Apague as compras primeiro.',
          other: 'Não dá para apagar os insumos enquanto {{n}} compras lançadas apontam para eles. Apague as compras primeiro.',
        },
        productsUseRecipes: {
          one: 'Não dá para apagar as receitas enquanto 1 produto é feito delas. Apague os produtos primeiro.',
          other: 'Não dá para apagar as receitas enquanto {{n}} produtos são feitos delas. Apague os produtos primeiro.',
        },
        purchasesUseProducts:
          'Não dá para apagar os produtos enquanto há compras de revenda lançadas neles. Apague as compras primeiro.',
      },
      purchasesRow: 'Compras',
      erases: 'Isso apaga {{what}}.',
      nothingToErase: 'Não há nada para apagar aqui.',
      alreadyEmpty: 'Já está tudo vazio.',
      alsoPurchases: 'Isso apaga {{what}}, e zera o custo médio de todos os insumos — eles ficam sem preço até a próxima nota.',
      alsoRecipes: 'Isso apaga {{what}}, com todas as versões e linhas delas. O histórico de versões vai junto.',
      alsoInputs: 'Isso apaga {{what}}, junto com o custo médio e o histórico de preço deles.',
      alsoAll: 'Isso apaga {{what}}. O aplicativo volta a abrir vazio, e os dados de exemplo não voltam sozinhos.',
      counted: {
        inputs: { one: '1 insumo', other: '{{n}} insumos' },
        recipes: { one: '1 receita', other: '{{n}} receitas' },
        products: { one: '1 produto', other: '{{n}} produtos' },
        purchases: { one: '1 compra', other: '{{n}} compras' },
      },
      back: 'Voltar',
    },

    inputs: {
      title: 'Almoxarifado',
      overline: 'o que você compra',
      tabs: {
        input: 'Insumos',
        packaging: 'Embalagem',
        storeSupply: 'Material de loja',
      },
      empty: {
        input: 'Nada cadastrado ainda.',
        packaging: 'Palito, saquinho, rótulo — nada ainda.',
        storeSupply: 'Copo, colher, guardanapo — nada ainda.',
      },
      heldTitle: 'PARADO NO ESTOQUE',
      heldDetail: '{{count}} · ao custo médio de cada um',
      withoutPrice:
        '{{count}} sem preço — lance a nota de compra e o custo aparece sozinho.',
      opening: 'Abrindo…',
      perThousand: 'O valor à direita é o custo a cada 1.000 {{unit}}.',
      addNew: 'Cadastrar novo',
      inStock: '{{amount}} em estoque',
    },

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
