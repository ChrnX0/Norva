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
      yesterdayWas: 'Ontem foram {{amount}}.',
      noYesterday: 'Ontem não houve produção.',
      runningOut: 'Compre esta semana',
      ordersShort: 'Produza para os pedidos',
      ordersCovered: 'Os pedidos estão cobertos',
      ordersCoveredDetail: 'O que foi pedido até {{date}} cabe no que já tem na fábrica.',
      ordersWhy: 'Pelo que foi pedido até {{date}}, contra o que tem na fábrica. Toque para ver os pedidos.',
      orderCount: { one: '1 pedido', other: '{{n}} pedidos' },
      runningOutWhy: 'Pela saída dos últimos sete dias. Toque para ver o almoxarifado.',
      inputsFine: 'Insumos em dia',
      inputsFineDetail: 'Pelo consumo das últimas semanas, nada acaba nos próximos sete dias.',
      overline: 'hoje na fábrica',
      each: 'cada um',
      producedToday: { one: 'saiu hoje', other: 'saíram hoje' },
      today: 'Hoje na fábrica',
      producedSame: 'mesmo que {{day}}',
      producedMore: '{{amount}} a mais que {{day}}',
      producedLess: '{{amount}} a menos que {{day}}',
      // O verbo concorda com a contagem: "1 caixa saíram hoje" foi o que
      // apareceu na tela do dono. O substantivo já era plural e o verbo era
      // string fixa - meia concordância é pior que nenhuma, porque só quebra
      // no dia de movimento pequeno.
      boxesSent: { one: 'saiu hoje', other: 'saíram hoje' },
      boxesTitle: 'Saiu para as lojas',
      running: 'tacho rodando',
      runningSince: 'aberto desde {{time}}',
      boxCount: { one: '1 caixa', other: '{{n}} caixas' },
      alsoSent: 'e mais {{items}}',
      alsoSentItem: '{{amount}} de {{name}}',
      producedFirst: 'primeira produção registrada',
      lastWeekday: 'na semana passada',
      why: 'por quê?',
      stableFor: 'estável há {{days}}',
      dayCount: { one: '1 dia', other: '{{n}} dias' },
      stableAlways: 'nenhuma mudança de preço registrada',
      record: 'Lançar produção',
      unitCost: 'custo por unidade · calculado da receita e das notas de compra',
      costWas: 'custava {{before}} antes das últimas compras',
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
        production: { label: 'Produção', hint: 'o que saiu do tacho hoje' },
        places: { label: 'Estoque', hint: 'onde está cada coisa' },
        transfer: { label: 'Transferir', hint: 'o que vai para a loja' },
        purchases: { label: 'Compras', hint: 'a nota que move o custo' },
        settings: { label: 'Ajustes', hint: 'limpar dados e recomeçar' },
      },
    },
    tabs: {
      home: 'Início',
      production: 'Produção',
      transport: 'Transporte',
      reports: 'Relatórios',
      more: 'Mais',
    },

    reports: {
      title: 'Relatórios',
      subtitle: 'Cada um abre num resumo de uma tela',
      rows: {
        stock: { label: 'Estoque', detail: 'o que tem e onde' },
        losses: { label: 'Perdas', detail: 'quanto, onde e por quê' },
        cost: { label: 'Custo', detail: 'o que cada unidade custa' },
      },
    },

    lotLabel: {
      title: 'Etiqueta do lote',
      overline: 'para colar na caixa',
      madeOn: 'produzido em {{date}}',
      validUntil: 'válido até {{date}}',
      noExpiry: 'não vence',
      gone: 'Esse lote não está mais aqui.',
      why: 'O código aparece duas vezes de propósito: quando a etiqueta congela ou descasca, alguém digita os onze caracteres e a conferência segue.',
    },

    losses: {
      title: 'Perdas',
      window: 'Últimos 30 dias',
      empty: 'Nenhuma perda registrada nos últimos 30 dias.',
      emptyHint: 'Quando alguma coisa vencer, derreter ou quebrar, registre no item — é o motivo que faz esta tela servir.',
      total: '{{money}} em {{count}}',
      lossCount: { one: '1 perda', other: '{{n}} perdas' },
      worst: 'O que mais pesou: {{reason}}, {{money}}.',
    },
    /**
     * Pedido é demanda, e a tela inteira segue disso: nada aqui mexe em estoque.
     * A palavra "anotar" no lugar de "lançar" é deliberada - lançar é o que se
     * faz com o que aconteceu, e um pedido é o que ainda vai acontecer.
     */
    orders: {
      title: 'Pedidos',
      overline: 'o que os clientes pediram',
      add: 'Anotar pedido',
      empty: 'Nenhum pedido aberto',
      emptyHint: 'Anote o que o cliente pedir. A capa passa a dizer o que falta produzir até o dia combinado.',
      forDate: 'para {{date}}',
      noDate: 'sem dia combinado',
      pending: 'Espera aprovação',
      approve: 'Aprovar',
      deliver: 'Marcar entregue',
      cancel: 'Cancelar',
      cancelTitle: 'Cancelar este pedido?',
      cancelBody: 'O pedido de {{place}} sai da lista. Nada muda no estoque: pedido não move caixa.',
    },

    newOrder: {
      title: 'Anotar pedido',
      overline: 'para quem, para quando, o quê',
      customer: 'Cliente',
      noCustomers: 'Nenhum cliente cadastrado ainda. Toque para cadastrar.',
      noProducts: 'Nenhum produto cadastrado ainda. Toque para cadastrar.',
      when: 'Para quando',
      today: 'hoje',
      tomorrow: 'amanhã',
      dayAfter: 'depois de amanhã',
      product: 'Produto',
      quantity: 'Quantidade',
      addLine: 'Adicionar ao pedido',
      listed: 'No pedido',
      remove: 'tirar',
      save: 'Anotar pedido',
      back: 'Voltar',
      needsCustomer: 'Escolha para quem é o pedido.',
      needsLine: 'Adicione pelo menos um produto ao pedido.',
      confirmTitle: 'Confirma o pedido?',
      confirmAction: 'Anotar',
      confirmBody: 'Você vai anotar {{items}} para {{place}}, {{when}}. Nada sai do estoque agora.',
      confirmItem: '{{amount}} de {{name}}',
    },

    /**
     * O clima, dito como fato e nunca como conselho.
     *
     * A tela não diz "produza mais amanhã": a relação entre calor e venda desta
     * fábrica ainda não está no livro-razão, e uma frase dessas seria palpite
     * com cara de conta. Ela diz a máxima, a de amanhã e a diferença — e quem
     * conhece a própria fábrica decide sozinho o que fazer com isso.
     */
    weather: {
      overline: 'clima em {{city}}',
      today: 'máxima de hoje',
      low: 'mínima de {{degrees}}',
      rain: '{{percent}}% de chance de chuva',
      warmer: 'Amanhã esquenta {{degrees}}.',
      cooler: 'Amanhã esfria {{degrees}}.',
      same: 'Amanhã, temperatura parecida.',
      measured: 'medido às {{time}}',
      change: 'trocar a cidade',
      degrees: { one: '1°', other: '{{n}}°' },
    },

    weatherPlace: {
      title: 'Clima',
      overline: 'onde fica a fábrica',
      why: 'Sorvete vende com calor, então o tempo entra na tela inicial. A cidade veio do fuso do aparelho — troque se a fábrica é em outra.',
      current: 'Cidade de agora',
      none: 'Nenhuma cidade escolhida ainda.',
      search: 'Procurar cidade',
      searchHint: 'Escreva o nome e escolha na lista.',
      searching: 'Procurando…',
      noResults: 'Nenhuma cidade com esse nome. Confira a escrita.',
      offline: 'Sem internet agora. Procurar cidade precisa dela; o resto do aplicativo não.',
      saved: 'Pronto. A tela inicial já mostra o tempo de {{city}}.',
      back: 'Voltar',
    },

    more: {
      title: 'Mais',
      ask: { label: 'Pergunte', hint: 'escreva o que quer saber' },
      groups: {
        registers: 'CADASTROS',
        settings: 'CONFIGURAÇÕES',
      },
      rows: {
        inputs: 'Insumos',
        recipes: 'Receitas',
        products: 'Produtos',
        places: 'Lojas e clientes',
        purchases: 'Compras',
        orders: 'Pedidos',
        weather: 'Clima',
        settings: 'Ajustes',
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
      simulate: 'Plantar duas semanas de movimento',
      simulateTitle: 'Encher o app com duas semanas?',
      simulateBody:
        'Escreve catorze dias de fábrica em cima do que já existe: produção quase todo dia, entregas para a loja, e notas de compra com o preço variando. Serve para ver as telas com movimento — o livro-razão fica com esses lançamentos, e apagar tudo continua sendo em Ajustes.',
      simulateConfirm: 'Plantar',
      simulateDone: 'Pronto: {{runs}} corridas, {{deliveries}} entregas e {{invoices}} notas.',
      failedToSimulate: 'Não deu para plantar o movimento',
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
        places: { one: '1 lugar', other: '{{n}} lugares' },
        purchases: { one: '1 compra', other: '{{n}} compras' },
      },
      back: 'Voltar',
      appearance: {
        label: 'A cara do aplicativo',
        hint: 'O claro e o escuro seguem o aparelho. Aqui você escolhe entre as duas identidades.',
        papel: 'Papel',
        papelHint: 'serifa, traço fino, cantos retos',
        organico: 'Orgânico',
        organicoHint: 'paisagem, curva, cantos macios',
        palette: 'A cor da paisagem',
        paletteHint: 'Muda o céu e a colina. Os sinais de alta e de queda não mudam — eles são leitura, não enfeite.',
        hues: {
          verde: 'Verde',
          azul: 'Azul',
          ambar: 'Âmbar',
          terracota: 'Terracota',
          lavanda: 'Lavanda',
        },
      },
      approval: {
        label: 'Pedido precisa de aprovação',
        hint: 'Ligado, todo pedido novo aparece como "espera aprovação" até alguém aprovar. Ele já entra na conta do que falta produzir: quem espera a aprovação para começar descobre tarde.',
        on: 'Ligado',
        off: 'Desligado',
      },
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

    inputForm: {
      newTitle: 'Novo insumo',
      newOverline: 'cadastro',
      editOverline: 'corrigindo o cadastro',
      fallbackTitle: 'Insumo',
      name: 'Nome',
      namePlaceholder: 'Açúcar cristal',
      whatFor: 'PARA QUE SERVE',
      kinds: { input: 'Insumo', packaging: 'Embalagem', storeSupply: 'Material de loja' },
      kindHint: {
        input: 'Entra na receita e vira custo do produto.',
        packaging: 'Palito, saquinho, rótulo — custa por unidade produzida.',
        storeSupply: 'Copo, colher, guardanapo — custa dinheiro na loja, mas não entra em receita.',
      },
      howYouBuy: 'Como você compra',
      howYouBuyHint: 'Do jeito que vem do fornecedor, não do jeito que entra na receita.',
      pack: 'Embalagem',
      packPlaceholder: 'saco 25 kg',
      perPack: 'Quanto vem dentro',
      useUnit: 'Medida de uso',
      useUnitHint: 'A menor medida com que a receita trabalha: g, ml, un.',
      price: 'Preço pago',
      priceNotAsked:
        'O preço não é perguntado aqui. Ele vem das notas de compra, e mexer nele por este caminho moveria o custo médio sem uma nota por trás.',
      conversion:
        '{{paid}} ÷ {{factor}} = {{perThousand}} a cada 1.000 {{unit}} · {{rate}} centavos por {{unit}}',
      entersAs: 'ENTRA NA RECEITA COMO',
      perThousandOf: 'a cada 1.000 {{unit}}',
      conversionOk: 'Conversão confere',
      fillFirst:
        'Preencha a embalagem e o preço para o app calcular o custo por unidade de uso.',
      save: 'Salvar insumo',
      saveEdit: 'Salvar correção',
      saving: 'Salvando…',
      confirmTitle: 'Confirma?',
      confirmNew:
        'Você vai cadastrar {{name}}, comprado em {{pack}} com {{factor}} {{unit}} por embalagem, custando {{price}}.',
      confirmEdit:
        '{{name}} passa a ser comprado em {{pack}}, com {{factor}} {{unit}} por embalagem. O custo médio e o histórico de compras não mudam.',
      failedToSave: 'Não deu para salvar',
    },

    inputDetail: {
      overline: 'almoxarifado',
      retiredOverline: 'almoxarifado · fora de circulação',
      opening: 'Abrindo…',
      gone: 'Esse item não está mais cadastrado.',
      retiredTitle: 'Fora de circulação',
      retiredBody:
        'Ele não aparece mais quando você escolhe um item, e tudo o que já passou por ele continua como estava.',
      currentCost: 'CUSTO ATUAL',
      averageOf: 'a cada 1.000 {{unit}} · média das compras',
      noInvoiceYet: 'ainda sem nota lançada',
      wentUp: 'Subiu {{percent}} na última compra',
      wentDown: 'Caiu {{percent}} na última compra',
      howYouBuy: 'Como você compra',
      pack: 'Embalagem',
      perPack: 'Quanto vem dentro',
      pricePer: 'Preço por {{pack}}',
      inStock: 'Em estoque',
      heldHere: '{{amount}} parados aqui',
      lossTitle: 'Perdeu alguma coisa?',
      lossHint: 'Registre com o motivo. É o motivo que faz o relatório servir para decidir.',
      lossStart: 'Registrar perda',
      lossAmount: 'Quanto se perdeu',
      lossWhy: 'O que aconteceu',
      lossConfirm: 'Registrar a perda',
      lossCancel: 'Deixa para lá',
      lossAsk: 'Registrar esta perda?',
      lossBody: 'Você vai baixar {{amount}} de {{item}}: {{reason}}. Vale {{money}}, e fica no histórico.',
      lossDone: 'Perda registrada.',
      lossFailed: 'Não deu para registrar a perda',
      countTitle: 'Conferir o estoque',
      countHint:
        'Conte o que está na prateleira e escreva aqui. O número que o sistema espera fica escondido até você terminar — se ele estiver na tela, a conferência vira cópia.',
      countLabel: 'Quanto tem de verdade',
      countStart: 'Conferir estoque',
      countCancel: 'Deixar para depois',
      countConfirm: 'Registrar a contagem',
      countConfirmAction: 'Registrar',
      countHidden: 'escondido enquanto você conta',
      countConfirmTitle: 'Registrar a contagem?',
      countConfirmShort:
        'Você contou {{counted}}. O sistema esperava {{expected}}. Estão faltando {{diff}}, que valem {{money}}. A diferença fica registrada e nada é apagado.',
      countConfirmOver:
        'Você contou {{counted}}. O sistema esperava {{expected}}. Estão sobrando {{diff}}, que valem {{money}}. A diferença fica registrada e nada é apagado.',
      countConfirmExact:
        'Você contou {{counted}}, exatamente o que o sistema esperava. Fica registrado que você conferiu.',
      lastCounted: 'conferido em {{date}}',
      history: 'Histórico de preço',
      historyHint: 'Ninguém escreveu isto. Cada linha nasceu de uma nota lançada.',
      historyEmpty: 'Só houve uma compra até agora, então ainda não há o que comparar.',
      usedBy: 'Quem usa isto',
      usedByOne: 'Uma receita depende deste item.',
      usedByMany: '{{count}} receitas dependem deste item — um aumento aqui move todas elas.',
      recordPurchase: 'Lançar uma compra deste item',
      correct: 'Corrigir o cadastro',
      retire: 'Tirar de circulação',
      bringBack: 'Voltar a usar',
      retireTitle: 'Tirar de circulação?',
      retireBody:
        '{{name}} some das listas de escolha, mas continua no histórico: as compras já lançadas e as receitas que o usam ficam intactas. Dá para voltar atrás quando quiser.',
      retireConfirm: 'Tirar',
      bringBackTitle: 'Voltar a usar?',
      bringBackBody: '{{name}} volta a aparecer nas listas de escolha.',
    },

    places: {
      title: 'Estoque por lugar',
      overline: 'onde está o que você tem',
      factory: 'Fábrica',
      empty: 'Nada entrou em lugar nenhum ainda. Lance uma compra ou registre uma produção.',
      worth: 'vale {{amount}}',
      itemCount: { one: 'um item', other: '{{n}} itens' },
      goTransfer: 'Mandar para uma loja',
      newPlace: 'Cadastrar um lugar',
      placeName: 'Como se chama',
      placeNameHint: 'O nome que a equipe usa. Dá para trocar depois sem mexer em saldo.',
      placeKind: 'Que tipo de lugar',
      save: 'Salvar lugar',
      saved: 'Lugar salvo.',
      kinds: {
        store_room: 'Almoxarifado',
        cold_room: 'Câmara fria',
        own_store: 'Loja própria',
        factory: 'Fábrica',
        customer: 'Cliente',
        vehicle: 'Veículo',
      },
    },
    transport: {
      title: 'Para onde foi',
      today: 'Hoje · {{summary}}',
      empty: 'Nada saiu hoje ainda.',
      emptyHint: 'O que sair para uma loja ou cliente aparece aqui, por destino.',
      destinations: { one: '1 destino', other: '{{n}} destinos' },
      send: 'Registrar uma saída',
      returned: 'devolvido para cá',
      notChecked: '{{place}} ainda não conferiu o que chegou.',
      check: 'Conferir chegada',
      checkTitle: 'O que chegou em {{place}}?',
      checkedOk: 'Conferido, bateu.',
      checkedShort: 'Conferido: faltaram {{amount}}.',
    },
    transfer: {
      title: 'Transferir',
      overline: 'o que sai da fábrica',
      notASale: 'Loja própria é transferência, não venda: não há faturamento nem margem aqui. O valor só muda de sala.',
      noPlaces: 'Você ainda não cadastrou para onde mandar.',
      createFirst: 'Cadastrar a primeira loja',
      from: 'De onde sai',
      to: 'Para onde vai',
      pick: 'O que vai',
      nothingHere: 'Não há nada em {{place}} para mandar.',
      howMuch: 'Quanto vai',
      available: 'Tem {{amount}} em {{place}}',
      lastTime: 'Da última vez você mandou {{amount}}',
      overBalance: 'Isso é mais do que tem em {{place}}.',
      send: 'Registrar a transferência',
      sending: 'Registrando…',
      confirmTitle: 'Confirmar a transferência',
      confirmBody: 'Você vai mandar {{amount}} de {{item}} de {{from}} para {{to}}. O saldo sai de um lugar e entra no outro; a empresa continua com a mesma coisa.',
      confirmAction: 'Mandar',
      failed: 'Não deu para transferir',
    },
    production: {
      byBatch: 'Lancei por tacho',
      todayTotal: 'Produzido hoje',
      vsYesterday: 'Ontem foram {{units}}.',
      noYesterday: 'Ontem não houve produção.',
      aboveYesterday: '{{percent}}% acima de ontem',
      belowYesterday: '{{percent}}% abaixo de ontem',
      add: 'Adicionar produção',
      openRuns: 'Tachos abertos',
      whatCameOut: 'O que saiu hoje',
      lotsToday: 'Lotes de hoje',
      lotValid: 'vence {{date}}',
      lotNoExpiry: 'sem validade',
      nothingYet: 'Nada lançado hoje ainda. Toque em adicionar quando a primeira caixa fechar.',
      confirmAction: 'Registrar',
      batchCount: { one: 'um tacho', other: '{{n}} tachos' },
      unitCount: { one: 'uma unidade', other: '{{n}} unidades' },
      title: 'Produção',
      overline: 'o que saiu do tacho',
      pick: 'O que você produziu',
      noRecipes: 'Nenhum produto tem ficha técnica ainda. Cadastre a receita primeiro.',
      batches: 'Quantos tachos',
      batchesHint: 'É isto que decide quanto de insumo sai do almoxarifado.',
      units: 'Quantas unidades saíram',
      packedAs: 'dá {{packed}}',
      unitsHint: 'O que saiu de verdade. Se rendeu menos que o previsto, é aqui que a perda aparece.',
      expected: 'A ficha prevê {{units}}',
      willConsume: 'Vai baixar do estoque',
      unitCost: 'Custo por unidade',
      shortfall: '▼ {{units}} a menos que o previsto · {{percent}}%',
      over: '▲ {{units}} a mais que o previsto',
      record: 'Registrar produção',
      recording: 'Registrando…',
      confirmTitle: 'Confirmar a produção',
      confirmBody:
        'Você produziu {{units}} de {{product}}, em {{batches}}. Isso baixa {{lines}} do estoque e congela o custo em {{cost}} por unidade.',
      confirmBodyNoBatch:
        'Você produziu {{units}} de {{product}}. Isso baixa {{lines}} do estoque e congela o custo em {{cost}} por unidade.',
      recorded: 'Produção registrada.',
      open: 'Abrir o tacho',
      openHint: 'Marque agora e feche quando sair, ou registre tudo de uma vez.',
      close: 'Fechar o tacho',
      running: 'Tacho aberto desde {{time}}',
      cancel: 'Cancelar o tacho',
      cancelTitle: 'Cancelar este tacho?',
      cancelBody: 'Nada foi lançado ainda, então não há o que estornar.',
      missingTitle: 'Falta insumo para esta corrida',
      failed: 'Não deu para registrar',
      missingStock:
        'Falta insumo para esta corrida: {{items}}. Confira o estoque deles, ou lance a compra que chegou.',
    },
    purchase: {
      title: 'Nova compra',
      overline: 'compras · a nota move o custo',
      openingStoreroom: 'Abrindo o almoxarifado…',
      whatYouBought: 'O que você comprou',
      supplier: 'Fornecedor',
      supplierPlaceholder: 'quem vendeu',
      howMany: 'Quantas {{pack}}',
      conversion: '{{packs}} × {{factor}} = {{baseUnits}} {{unit}} entrando no estoque.',
      total: 'Total da nota',
      perPack: '{{price}} por {{pack}}',
      beforeClosing: 'ANTES DE FECHAR',
      firstPurchase: 'Primeira compra deste item. A próxima já vem com a comparação.',
      nowVsBefore: '{{now}} agora · {{before}} na compra anterior',
      wellAbove: 'Subiu bem acima do normal',
      cheaper: 'Está mais barato que da última vez',
      smallChange: 'Variação pequena',
      averageMoves: 'O custo médio de {{name}} passa de {{from}} para {{to}} a cada 1.000 {{unit}}.',
      whatItMoved: 'O que essa nota mexeu',
      nobodyUpdated: 'Ninguém precisou atualizar preço nenhum.',
      record: 'Lançar compra',
      recording: 'Lançando…',
      confirmTitle: 'Lançar esta compra?',
      confirmBody: '{{packs}} × {{pack}} de {{name}}, por {{total}}.',
      confirmAction: 'Lançar',
      failed: 'Não deu para lançar',
    },

    recipes: {
      title: 'Receitas',
      overline: 'o que entra no tacho',
      costing: 'Calculando os custos…',
      empty: 'Nenhuma ficha técnica ainda. Cadastre os insumos primeiro, depois a receita que os usa.',
      perUnitOf: 'por unidade de {{product}} · lote de {{batch}}',
      perLitre: 'por litro de massa · usada dentro de outras receitas',
      cycle: 'Esta receita contém a si mesma — abra para corrigir.',
      missingPrice: 'Falta preço em algum insumo.',
      orderedByBatch: 'Em ordem de quanto custa o lote — a mais cara primeiro, que é onde mexer rende mais.',
    },

    recipe: {
      overlineVersion: 'ficha técnica · versão {{version}}',
      overline: 'ficha técnica',
      fallbackTitle: 'Receita',
      opening: 'Abrindo a ficha…',
      none: 'Nenhuma receita cadastrada ainda.',
      missingData: 'Falta um dado',
      needYield: 'Informe quanto o tacho rende.',
      lossRange: 'A perda tem de ficar entre 0% e 100%.',
      containsItself: 'Essa receita contém a si mesma: {{path}}',
      subRecipeMissing: 'Sub-receita não encontrada: {{id}}',
      unitCost: 'CUSTO POR UNIDADE',
      needPortion: 'Informe quantos ml vão em cada unidade.',
      unitsPerBatch: '{{units}} unidades por tacho · lote de {{batch}}',
      cheaperThan: '{{amount}} por unidade contra a versão {{version}} ({{percent}})',
      roundUp: 'Produza {{rounded}} para fechar caixa cheia — sobram {{loose}} soltas em {{units}}.',
      why: 'POR QUÊ?',
      whatGoesIn: 'O que entra no tacho',
      subRecipe: 'sub-receita',
      shareOfBatch: '{{quantity}} · {{percent}} do lote',
      lessTen: '−10%',
      moreTen: '+10%',
      remove: 'tirar',
      add: 'ACRESCENTAR',
      batchYield: 'Rendimento do tacho',
      expectedLoss: 'Perda esperada',
      lossHint:
        'Sobram {{net}} ml de {{gross}}. O lote é pago inteiro, então a perda encarece o que sobra.',
      perUnit: 'Vai em cada unidade',
      packagingHint: 'Mais {{amount}} de palito e embalagem por unidade.',
      saveAs: 'Salvar como versão {{version}}',
      saving: 'Salvando…',
      saveTitle: 'Salvar versão {{version}}?',
      saveBody:
        'A versão {{previous}} continua guardada — as produções antigas mantêm o custo delas. {{summary}}',
      summaryCheaper: 'Fica {{amount}} por unidade em relação à versão {{version}}.',
      summaryDearer: 'Sobe {{amount}} por unidade em relação à versão {{version}}.',
      summarySame: 'O custo por unidade não muda.',
      keepEditing: 'Continuar editando',
      save: 'Salvar',
      failedToSave: 'Não deu para salvar',
    },

    products: {
      title: 'Produtos',
      overline: 'o que sai para vender',
      opening: 'Abrindo…',
      empty:
        'Nenhum produto ainda. Um produto fabricado precisa de uma receita e de quanto vai em cada unidade.',
      resale: 'Revenda — o custo vem da nota de compra.',
      batchYields: 'Um tacho rende {{units}} — {{packed}}',
      addNew: 'Cadastrar novo',
    },

    catalog: {
      duplicate: 'Esse nome já está cadastrado. Caixa e espaço não contam como diferença.',
      title: 'Linhas, tipos e sabores',
      overline: 'a grade do que você fabrica',
      intro:
        'Cadastre uma vez e combine à vontade. Picolé tradicional de morango é uma linha, um tipo e um sabor — não um nome digitado inteiro.',
      lines: 'Linhas',
      linesHint: 'o que você fabrica: Picolé, Pote de sorvete',
      types: 'Tipos de {{line}}',
      typesHint: 'o que divide a linha: Tradicional, Skimó, Top — ou 240 ml, 500 ml, 1 litro',
      flavors: 'Sabores',
      flavorsHint: 'valem para todas as linhas: morango, chocolate, coco branco',
      addLine: 'Nova linha',
      addType: 'Novo tipo',
      addFlavor: 'Novo sabor',
      namePlaceholder: 'Nome',
      pickLineFirst: 'Escolha uma linha para ver os tipos dela.',
      noLines: 'Nenhuma linha ainda. Comece pela mais óbvia: o que você fabrica todo dia?',
      noTypes: 'Nenhum tipo nesta linha. Sem tipo também funciona — o produto fica só linha e sabor.',
      noFlavors: 'Nenhum sabor ainda.',
      /** Como o nome do produto se monta a partir da grade. */
      composed: '{{line}} {{type}} de {{flavor}}',
      composedNoType: '{{line}} de {{flavor}}',
      composedNoFlavor: '{{line}} {{type}}',
      saved: '{{name}} cadastrado.',
      typeFromAnotherLine: 'Esse tipo é de outra linha. Escolha a linha dele ou um tipo desta.',
    },

    productForm: {
      title: 'Novo produto',
      overline: 'cadastro',
      name: 'Nome',
      namePlaceholder: 'Picolé de morango',
      whereFrom: 'DE ONDE ELE VEM',
      made: 'Fabricado',
      resale: 'Revenda',
      madeHint: 'O custo vem da receita e se atualiza sozinho quando um insumo muda de preço.',
      resaleHint: 'O custo vem da nota de compra, pelo custo médio dos fornecedores.',
      whichRecipe: 'Feito com qual receita',
      loading: 'Carregando…',
      noRecipes: 'Nenhuma receita cadastrada ainda — cadastre a ficha técnica antes.',
      perUnit: 'Quanto vai em cada unidade',
      perUnitHint: 'Um tacho rende {{units}} unidades.',
      packagingCost: 'Palito, embalagem e rótulo',
      packagingHint: 'Embalagem custa por unidade, não por tacho — diluir no lote esconde a margem.',
      howPacked: 'Como ele é empacotado',
      howPackedHint: 'O estoque conta sempre em unidade; as telas falam na sua embalagem.',
      perBox: 'Unidades por caixa',
      shelfLife: 'Validade, em dias',
      shelfLifeHint:
        'Quantos dias o produto dura depois de feito. Deixe vazio se não vence — o lote continua existindo.',
      lotIs: 'Lote {{code}}',
      lotExpires: 'vence em {{date}}',
      lotForever: 'sem validade',
      perCrate: 'Caixas por engradado',
      looseOnly: 'Só unidade solta, sem caixa nem engradado.',
      unitCost: 'CUSTO POR UNIDADE',
      mixPlusPackaging: '{{mix}} de massa + {{packaging}} de embalagem',
      fullBox: 'Caixa fechada: {{amount}}',
      save: 'Cadastrar produto',
      saving: 'Cadastrando…',
      confirmTitle: 'Cadastrar este produto?',
      confirmMade: '{{name}}, feito da receita {{recipe}}, {{perUnit}} ml por unidade. {{packaging}}',
      confirmResale: '{{name}}, produto de revenda. {{packaging}}',
      confirmAction: 'Cadastrar',
      failed: 'Não deu para cadastrar',
    },

    assistant: {
      title: 'Pergunte',
      overline: 'modo conversa',
      placeholder: 'quanto custa o picolé de morango',
      inputLabel: 'Sua pergunta',
      ask: 'Perguntar',
      thinking: 'Vendo…',
      examplesTitle: 'Eu sei responder, por exemplo',
      why: 'POR QUÊ?',
      close: 'FECHAR',
      openScreen: 'ABRIR A TELA',
      recorded: 'Lançado.',
      confirmAndRecord: 'Confirmar e lançar',
      confirmTitle: 'Confirma?',
      no: 'Não',
      failed: 'Não deu para gravar',
      trouble: 'Deu problema aqui: {{error}}',
    },

  },

  signals: {
    checked: 'Conferido',
    expiringIn: 'Vence em {{days}} dias',
    missing: 'Faltaram {{count}} caixas',
    awaitingRoute: 'Aguardando rota',
  },

  /**
   * A folha do `[por quê?]`, que falava um idioma só.
   *
   * Ela é a Lei 6 em pessoa - a conta aberta de toda conclusão - e estava com o
   * texto cravado em português enquanto o resto do aplicativo já falava três.
   * Quem rodasse em espanhol via a interface traduzida e, no instante em que
   * pedia a prova do número, recebia português. O `Widen` não pega isto: ele
   * obriga a chave a existir nos três dicionários, nunca a tela a usá-la.
   */
  whySheet: {
    close: 'Fechar',
    where: 'De onde sai esse número',
    shareOfBatch: '{{percent}} do lote',
    batchCost: 'Custo do lote',
    expectedLoss: 'Perda prevista ({{percent}})',
    remains: 'sobram {{amount}}',
    perMassUnit: 'Custo por unidade de massa',
    perAmount: '{{money}} / {{amount}}',
    lossNote:
      'A perda encarece o que sobra: o lote é pago inteiro, mas só parte dele chega ao cliente.',
  },

  loss: {
    melted: 'Derreteu',
    broken: 'Quebrou',
    expired: 'Venceu',
    courtesy: 'Cortesia',
    internal_use: 'Consumo interno',
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
