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
    amountOf: '{{amount}} de {{name}}',
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
      levelFull: 'cheio',
      levelLasts: 'dura {{days}} pelo consumo da semana',
      levelEndsIn: 'acaba em {{days}}',
      inputsFine: 'Insumos em dia',
      inputsFineDetail: 'Pelo consumo das últimas semanas, nada acaba nos próximos sete dias.',
      each: 'cada um',
      // O verbo concorda com a contagem: "1 caixa saíram hoje" foi o que
      // apareceu na tela do dono. O substantivo já era plural e o verbo era
      // string fixa - meia concordância é pior que nenhuma, porque só quebra
      // no dia de movimento pequeno.
      boxesSent: { one: 'saiu hoje', other: 'saíram hoje' },
      boxesTitle: 'Saiu para as lojas',
      noBoxesYesterday: 'Ontem não saiu carga.',
      running: 'produzindo agora',
      runningSince: 'aberto desde {{time}}',
      boxCount: { one: '1 caixa', other: '{{n}} caixas' },
      alsoSent: 'e mais {{items}}',
      alsoSentItem: '{{amount}} de {{name}}',
      why: 'por quê?',
      stableFor: 'estável há {{days}}',
      more: 'toque para ver mais',
      less: 'toque para fechar',
      // ---- A capa editorial, como o dono aprovou (docs/design/aprovados) ----
      capaLead: 'Hoje a fábrica',
      capaMade: 'fez {{amount}}',
      capaQuiet: 'ainda não produziu',
      capaLegend: 'A linha inteira — do tacho à caixa que saiu.',
      boxYesterday: 'Ontem',
      boxLastWeek: '{{weekday}}, há uma semana',
      todayUnits: '{{unit}} · hoje',
      weekTitle: 'A semana',
      mathAgainst: '{{today}} − {{base}} = {{delta}}',
      mathAbove: '{{when}} ficou {{gap}} abaixo',
      mathBelow: '{{when}} ficou {{gap}} acima',
      mathSame: '{{when}} deu o mesmo',
      mathNoBase: 'primeiro dia com produção registrada',
      firstDayBody: 'A capa se enche sozinha conforme a fábrica trabalha: o que saiu hoje, o que está acabando, o que os clientes pediram.',
      firstDayAction: 'Lançar a primeira produção',
      liveTitle: 'Produção ao vivo',
      liveNothing: 'Nada saiu ainda hoje.',
      runCount: { one: 'uma produção', other: '{{n}} produções' },
      liveRuns: '{{count}} em curso agora',
      liveOpened: 'aberto às {{time}}',
      historyTitle: 'Últimas corridas',
      historyEmpty: 'Nenhuma corrida registrada ainda.',
      historyRun: '{{amount}} · {{code}}',
      historyAverage: 'média das últimas: {{amount}}',
      coverTitle: 'O estoque dura',
      coverDays: '{{days}} pelo consumo da semana',
      coverTightest: 'o mais curto é {{item}}',
      coverUnknown: 'sem saída registrada — ninguém sabe quanto dura',
      dueTitle: 'Quem recebe hoje',
      dueNobody: 'nenhuma entrega combinada para hoje',
      duePending: '{{name}} espera carga',
      dueDone: '{{name}} já recebeu',
      expiryTitle: 'Vence primeiro',
      expiryNone: 'nada vencendo nos próximos 30 dias',
      expiryLot: '{{code}} vence {{date}}',
      expiryDays: 'em {{days}}',
      lossTitle: 'Perdas do mês',
      lossNone: 'nenhuma perda registrada no mês',
      lossVsBefore: 'no mês anterior foram {{amount}}',
      lossFirst: 'primeiro mês com perda registrada',
      lossWorst: 'o que mais pesou: {{reason}}',
      costTitle: 'Custo por unidade',
      costFrozen: '{{amount}} na última corrida',
      costBefore: 'na anterior foi {{amount}}',
      costOnlyOne: 'primeira corrida registrada',
      heldTitle: 'Dinheiro parado',
      heldDetail: 'em insumo e embalagem',
      openScreen: 'Abrir a tela',
      placeCount: { one: 'uma loja', other: '{{n}} lojas' },
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
        recipes: { label: 'Receitas', hint: 'o que entra em cada uma' },
        products: { label: 'Produtos', hint: 'o que sai para vender' },
        production: { label: 'Produção', hint: 'o que saiu hoje' },
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
      /** A ficha que rodou — dentro do app, nunca no papel que vai na caixa. */
      runTitle: 'A corrida',
      fromSheet: 'Saiu da ficha {{recipe}}, versão {{version}}.',
      fromSheetWhy:
        'Corrigir a ficha depois não muda este lote: ele guarda a versão que estava valendo no dia.',
      madeOn: 'produzido em {{date}}',
      validUntil: 'válido até {{date}}',
      noExpiry: 'não vence',
      gone: 'Esse lote não está mais aqui.',
      why: 'O código aparece duas vezes de propósito: quando a etiqueta congela ou descasca, alguém digita os onze caracteres e a conferência segue.',
      // O conserto do livro-razão, dito sem a palavra "estorno" - que é
      // vocabulário de contador, e quem lança a corrida é quem estava no tacho.
      reverse: 'Corrigir esta corrida',
      reverseTitle: 'Corrigir a corrida {{code}}?',
      reverseBody: 'Sai do estoque {{out}}. Volta para o almoxarifado {{back}}. Os dois lançamentos ficam no histórico — nada é apagado.',
      reverseConfirm: 'Corrigir',
      reverseBlocked: 'Não dá para corrigir: {{items}} já saiu daqui.',
      reverseBlockedItem: '{{name}} — tem {{held}}, precisaria de {{needed}}',
      reverseBlockedHint: 'Traga a carga de volta primeiro, aí a correção passa a valer.',
      reverseAlready: 'Esta corrida já foi corrigida.',
    },

    losses: {
      title: 'Perdas',
      window: 'Últimos 30 dias',
      empty: 'Nenhuma perda registrada nos últimos 30 dias.',
      emptyHint: 'Quando alguma coisa vencer, derreter ou quebrar, registre no item — é o motivo que faz esta tela servir.',
      total: '{{money}} em {{count}}',
      lossCount: { one: '1 perda', other: '{{n}} perdas' },
      vsPrevious: 'nos 30 dias anteriores foram {{money}}',
      firstWindow: 'primeira janela com perda registrada — não há antes para comparar',
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
      /** O botão de desistir, para o diálogo de cancelar não sair com "Cancelar" duas vezes. */
      keep: 'Manter o pedido',
      cancelTitle: 'Cancelar este pedido?',
      cancelBody: 'O pedido de {{place}} sai da lista. Nada muda no estoque: pedido não move caixa.',
    },

    newOrder: {
      free: 'livre para esta data: {{amount}}',
      freeHint: 'o que tem no freezer menos o que já foi prometido até esse dia',
      /** O número é o excesso sobre o LIVRE, não sobre o saldo: livre já desconta as outras promessas. */
      over: 'Isso promete {{amount}} a mais do que está livre. Dá para produzir até lá?',
      title: 'Anotar pedido',
      overline: 'para quem, para quando, o quê',
      /** Loja própria também recebe pedido, e câmara fria não recebe nenhum. */
      recipient: 'Loja ou cliente',
      noCustomers: 'Nenhuma loja ou cliente cadastrado ainda. Toque para cadastrar.',
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
      // O cartão do clima da capa aprovada fala curto: a cidade, o número, e o
      // que muda amanhã. As frases longas continuam existindo para a peça aberta.
      nowAt: '{{city}} · agora',
      lowShort: 'mín {{degrees}}',
      tomorrowDelta: 'amanhã {{delta}}',
      measured: 'medido às {{time}}',
      change: 'trocar a cidade',
      degrees: { one: '1°', other: '{{n}}°' },
    },

    weatherPlace: {
      title: 'Clima',
      overline: 'onde fica a fábrica',
      why: 'Calor muda o que sai e o que estraga, então o tempo entra na tela inicial. A cidade veio do fuso do aparelho — troque se a fábrica é em outra.',
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
      overline: 'o que se abre uma vez por mês',
      ask: { label: 'Pergunte', hint: 'escreva o que quer saber' },
      groups: {
        registers: 'Cadastros',
        /** Pedido e compra não são cadastro: um é livro de pedidos, o outro escreve no livro-razão. */
        entries: 'Lançamentos',
        settings: 'Ajustes',
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
      placesRow: 'Lojas e clientes',
      placesHint: 'saem só com "começar do zero"',
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
      simulate: 'Plantar três meses de movimento',
      simulateTitle: 'Encher o app com três meses?',
      simulateBody:
        'Escreve noventa dias de fábrica em cima do que já existe: produção quase todo dia, entregas para a loja, e notas de compra com o preço variando. Um trimestre é o menor horizonte em que dá para ver o custo médio andar e a cobertura encolher — coisas que catorze dias não mostram. O livro-razão fica com esses lançamentos, e apagar tudo continua sendo em Ajustes.',
      simulateConfirm: 'Plantar',
      simulateDone:
        'Pronto: {{runs}} corridas, {{deliveries}} entregas, {{invoices}} notas e {{counts}} conferências de prateleira.',
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
      alsoPurchases: 'Isso apaga {{what}}, e zera o custo médio de todos os insumos — eles ficam sem preço até a próxima nota. O movimento é o registro de tudo o que entrou e saiu: produção, contagem, perda e transferência vão junto.',
      alsoRecipes: 'Isso apaga {{what}}, com todas as versões e linhas delas. O histórico de versões vai junto.',
      alsoInputs: 'Isso apaga {{what}}, junto com o custo médio e o histórico de preço deles.',
      alsoAll: 'Isso apaga {{what}}. O aplicativo volta a abrir vazio, e os dados de exemplo não voltam sozinhos.',
      counted: {
        inputs: { one: '1 insumo', other: '{{n}} insumos' },
        movements: { one: '1 movimento do livro-razão', other: '{{n}} movimentos do livro-razão' },
        recipes: { one: '1 receita', other: '{{n}} receitas' },
        products: { one: '1 produto', other: '{{n}} produtos' },
        places: { one: '1 lugar', other: '{{n}} lugares' },
        purchases: { one: '1 compra', other: '{{n}} compras' },
      },
      back: 'Voltar',
      /**
       * Idioma e moeda: escolha da EMPRESA, e a dica diz isso na primeira linha.
       *
       * Sem essa frase, quem troca acha que mexeu no próprio aparelho — e descobre
       * que mexeu no de todo mundo quando alguém no chão de fábrica reclama.
       */
      language: {
        label: 'Idioma e moeda',
        hint: 'Escolha da empresa: vale para todo mundo que usa este sistema, não só para este aparelho. O fuso vem do celular, que está na fábrica.',
        currency: 'Moeda',
        currencyHint: 'Ela decide o símbolo E o jeito de escrever o número. O exemplo ao lado é a mesma quantia em cada uma.',
      },
      appearance: {
        label: 'A cara do aplicativo',
        hint: 'Duas identidades e três luzes. É escolha deste aparelho — não muda nada para mais ninguém.',
        light: 'Claro',
        dark: 'Escuro',
        system: 'Seguir o aparelho',
        lightLabel: 'A luz da tela',
        lightHint: 'O padrão é o claro. Escolha o escuro para a câmara fria, ou deixe o aparelho decidir.',
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
      briefing: {
        label: 'O que aparece na tela inicial',
        hint: 'A ordem é da casa: todo mundo vê a mesma capa. Esconder é só neste aparelho.',
        hidden: 'escondido aqui',
        show: 'Mostrar',
        hide: 'Esconder',
        up: 'Subir',
        down: 'Descer',
        offCover: 'FORA DA CAPA',
        putOnCover: 'Colocar na capa',
        widgets: {
          aoVivo: 'Produção ao vivo',
          historico: 'Últimas corridas',
          cobertura: 'Quanto tempo o estoque dura',
          entregaHoje: 'Quem recebe hoje',
          validade: 'Vence primeiro',
          perdas: 'Perdas do mês',
          custo: 'Custo por unidade',
          parado: 'Dinheiro parado',
          producao: 'Produção do dia',
          insumos: 'Insumo acabando',
          pedidos: 'Pedidos dos clientes',
          clima: 'Tempo',
          expedicao: 'Saiu para as lojas',
          precos: 'Preços que mexeram',
        },
      },
      alerts: {
        label: 'Avisos no celular',
        /**
         * Descrevia três das cinco linhas e afirmava as cinco.
         *
         * "Cada aviso liga sozinho" é falso para o volume, que nasce desligado;
         * "você escolhe a antecedência" é falso para as duas linhas de faixa, que
         * não têm antecedência nenhuma — e uma delas é a primeira da lista.
         */
        hint: 'Cada aviso liga e desliga aqui. Os que se veem chegando avisam com dias de antecedência; os de faixa comparam com a régua que você cadastrar. O aplicativo avisa na data em que ainda dá para decidir, não na do problema.',
        kinds: {
          insumo: 'Insumo acabando',
          pedido: 'Pedido sem estoque',
          volume: 'Volume fora da faixa',
          ambiente: 'Câmara fora da faixa',
          validade: 'Lote perto de vencer',
        },
        daysAhead: '{{days}} de antecedência',
        ambienteHint: 'Compara com a faixa que você cadastrar na câmara. Sem faixa, ele não avisa — o app não sabe qual é a temperatura boa da sua câmara.',
        notifyFull: 'Avisar quando encher',
        volumeHint: 'Compara com a faixa que você cadastrar no item. Sem faixa, ele não avisa.',
        hour: 'Hora do aviso',
        hourField: 'Hora',
        minuteField: 'Minuto',
        hourHint: 'Antes do turno começar. Aviso de madrugada é despertador, e aparelho que acorda a pessoa vira aparelho silenciado.',
        weekdays: 'Em que dias',
        everyDay: 'todos os dias',
        on: 'Ligado',
        off: 'Desligado',
        never: 'Este aparelho não deu permissão de aviso. O aplicativo continua inteiro — a capa mostra as mesmas contas.',
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
      everywhere: 'Todos os lugares',
      inRoom: 'no lugar escolhido',
      coverComfortable: 'nada aqui acaba antes de um mês',
      shortestCover: 'o mais curto é {{item}}, que acaba em {{days}}',
      coverUnknown: 'sem saída registrada ainda — ninguém sabe quanto tempo isso dura',
      heldTitle: 'PARADO NO ESTOQUE',
      heldDetail: '{{count}} · ao custo médio de cada um',
      itemCount: { one: '1 item', other: '{{n}} itens' },
      withoutPrice:
        '{{count}} sem preço — lance a nota de compra e o custo aparece sozinho.',
      opening: 'Abrindo…',
      perThousand: 'O valor à direita é o custo a cada 1.000 {{unit}}.',
      addNew: 'Cadastrar novo',
      ofFull: '{{percent}} do cheio',
      inStock: '{{amount}} em estoque',
    },

    inputForm: {
      /** Neutro entre os três tipos: a etiqueta acesa pode dizer embalagem ou material de loja. */
      newTitle: 'Novo cadastro',
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
      fullLevel: 'Quanto é "cheio"',
      fullLevelHint: 'Só se você quiser a leitura por cor: vermelho, amarelo, verde, azul. Vazio, o item não ganha cor nem aviso de volume.',
      useUnitHint: 'A menor medida com que a receita trabalha: g, ml, un.',
      price: 'Preço pago',
      priceNotAsked:
        'O preço não é perguntado aqui. Ele vem das notas de compra, e mexer nele por este caminho moveria o custo médio sem uma nota por trás.',
      conversion:
        '{{paid}} ÷ {{factor}} = {{perThousand}} a cada 1.000 {{unit}} · {{rate}} centavos por {{unit}}',
      entersAs: 'ENTRA NA RECEITA COMO',
      /** Material de loja não entra em receita nenhuma — o seletor de ingrediente não o lista. */
      costsInStore: 'CUSTA NA LOJA',
      perThousandOf: 'a cada 1.000 {{unit}}',
      conversionOk: 'Conversão confere',
      /** Sem tamanho legível no nome da embalagem, não houve conferência: só a conta. */
      mathCloses: 'A conta fecha',
      conversionDiffers: 'A embalagem diz {{pack}} {{unit}}, o campo diz {{typed}}. Confira.',
      fillFirst:
        'Preencha quanto vem dentro e o preço para o app calcular o custo por unidade de uso.',
      /** Qual dos dois falta, porque a tela sabe — e a embalagem não entra na conta. */
      fillInside: 'Falta quanto vem dentro da embalagem: é por ele que o preço se divide.',
      fillPrice: 'Falta o preço pago. Com ele o app calcula o custo por unidade de uso.',
      save: 'Salvar cadastro',
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
      /** O histórico de lançamentos, e o desfazer de cada um. */
      entries: 'Últimos lançamentos',
      entriesHint: 'Toque num lançamento para desfazer. Nada é apagado: a correção entra como linha nova, e as duas ficam.',
      undone: 'já corrigido',
      undoTitle: 'Desfazer esta {{what}}?',
      undoBody:
        'Volta para o estoque: {{back}}. Sai do estoque: {{out}}. Fica registrado que houve correção, e nada é apagado.',
      undoNothingBack: 'nada',
      undoNothingOut: 'nada',
      undoConfirm: 'Desfazer',
      undoDone: 'Este lançamento já foi corrigido',
      undoDoneBody: 'A correção dele já está no registro. Não se corrige duas vezes.',
      undoBlocked: 'Falta o que devolver',
      undoBlockedBody:
        'Desfazer isto tiraria do estoque mais do que tem: {{items}}. Traga a mercadoria de volta primeiro, ou registre a contagem do que existe.',
      undoBlockedLine: '{{name}} precisa de {{needed}} e tem {{held}}',
      undoFailed: 'Não deu para desfazer',
      /** Qual sala este saldo é. Sem isso o número da sala parece o da empresa. */
      countRoom: 'Este é o saldo da {{room}}. A contagem é dessa sala.',
      /** Mais de um lugar e nenhum escolhido: contar aqui gravaria em lugar errado. */
      countSpread:
        'Este item está em {{count}} lugares. Conta-se um lugar por vez — toque no lugar para conferir ali.',
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
      placeCount: { one: 'em 1 lugar', other: 'em {{n}} lugares' },
      agreement: 'O que ficou combinado',
      agreementHint: 'Nada aqui é obrigatório — sem acordo, a loja recebe quando dá.',
      phone: 'Telefone de quem recebe',
      phoneHint: 'Para avisar quando a carga atrasar.',
      deliveryDays: 'Dias de entrega',
      deliveryDaysHint: 'Sem dia combinado, o pedido não ganha atalho de data.',
      agreementNote: 'Combinado',
      agreementNoteHint: 'Uma frase: onde descarregar, com quem falar, o que evitar.',
      noAgreement: 'sem acordo de dia',
      agreedDays: 'entrega {{days}}',
      reading: 'Temperatura agora',
      readingHint: 'Anote quando passar pela câmara. Vira histórico — e quando o sensor chegar, ele escreve no mesmo lugar.',
      readingSave: 'Anotar leitura',
      lastReading: 'última: {{value}} às {{time}}',
      noReading: 'nenhuma leitura anotada ainda',
      rangeLabel: 'Faixa aceitável',
      rangeHint: 'Sem faixa o app registra e não julga — ele não sabe qual é a temperatura boa da sua câmara.',
      rangeMin: 'mínima',
      rangeMax: 'máxima',
      /** O que estava dentro quando a leitura saiu da faixa — a ação que o selo vermelho pede. */
      exposedTitle: 'ESTAVA NA CÂMARA ÀS {{time}}',
      outOfRange: 'fora da faixa de {{min}} a {{max}}',
      inRange: 'dentro da faixa',
      editAgreement: 'Combinar entrega',
      deliversToday: 'hoje é dia de entrega',
      deliversIn: 'a próxima é {{day}}',
      emptyPlace: 'nada aqui ainda',
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
      /** O cartão conta DESTINOS; o título era o das caixas da capa. */
      dayTitle: 'Saiu hoje',
      vsYesterday: 'Ontem foram {{count}}.',
      /** O fato medido é ontem, e só ontem: "primeira carga" olhava o histórico que a consulta não lê. */
      noYesterday: 'Ontem não saiu carga.',
      title: 'Para onde foi',
      today: 'Hoje · {{summary}}',
      subtitle: 'a carga do dia, por destino',
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
      fromLot: 'Sai do lote {{code}}, que vence primeiro.',
      /** Lote sem validade é caso normal, e aí a escolha foi por código: a frase não promete data. */
      fromLotNoDate: 'Sai do lote {{code}}.',
      closeAsk: 'Fechar o pedido dessa loja?',
      /** A cobertura é do DIA, não desta viagem — quem carrega faz duas idas ao freezer. */
      closeBody: 'O que saiu hoje para essa loja cobre {{count}} em aberto. Fechar tira da lista de separação e da conta do que falta produzir.',
      closeAction: 'Fechar',
      closeKeep: 'Deixar aberto',
      closeCount: { one: '1 pedido', other: '{{n}} pedidos' },
      toStore: 'Mandar para a loja',
      returning: 'A loja devolveu',
      returnTitle: 'Registrar a devolução',
      returnAsk: 'Registrar esta devolução?',
      returnBody: 'Você vai trazer {{amount}} de {{item}} de volta de {{place}} para a fábrica.',
      returnAction: 'Trazer de volta',
      ordered: 'pedido para {{date}}: {{amount}}',
      /** A quantidade soma todos os pedidos em aberto da loja; a data é a do primeiro. */
      orderedMany: '{{count}}, o primeiro para {{date}}: {{amount}}',
      orderedNone: 'nenhum pedido em aberto para esta loja',
      title: 'Transferir',
      overline: 'o que sai da fábrica',
      returnOverline: 'o que volta para a fábrica',
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
      byBatch: 'Informar pela receita',
      todayTotal: 'Produzido hoje',
      vsYesterday: 'Ontem foram {{units}}.',
      noYesterday: 'Ontem não houve produção.',
      aboveYesterday: '{{percent}}% acima de ontem',
      belowYesterday: '{{percent}}% abaixo de ontem',
      /** O empate, que caía em "0% acima de ontem" com os dois números iguais na tela. */
      sameAsYesterday: 'Mesmo que ontem',
      /** E a quase-igualdade, que também imprimia 0%: 4.802 contra 4.800. */
      nearYesterday: 'Praticamente o mesmo de ontem',
      add: 'Adicionar produção',
      openRuns: 'Produção em curso',
      whatCameOut: 'O que saiu hoje',
      lotsToday: 'Lotes de hoje',
      lotValid: 'vence {{date}}',
      lotNoExpiry: 'sem validade',
      nothingYet: 'Nada lançado hoje ainda. Toque em adicionar quando a primeira caixa fechar.',
      confirmAction: 'Registrar',
      batchCount: { one: 'uma vez', other: '{{n}} vezes' },
      unitCount: { one: 'uma unidade', other: '{{n}} unidades' },
      title: 'Produção',
      overline: 'o que saiu hoje',
      formTitle: 'Lançar produção',
      formOverline: 'o que saiu do tacho agora',
      pick: 'O que você produziu',
      noRecipes: 'Nenhum produto tem ficha técnica ainda. Cadastre a receita primeiro.',
      batches: 'Quantas vezes a receita rodou',
      batchesHint: 'Cada vez rende {{yield}}. É isto que decide quanto de insumo sai do almoxarifado.',
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
        'Você produziu {{units}} de {{product}}, rodando a receita {{batches}}. Isso baixa {{lines}} do estoque e congela o custo em {{cost}} por unidade.',
      confirmBodyNoBatch:
        'Você produziu {{units}} de {{product}}. Isso baixa {{lines}} do estoque e congela o custo em {{cost}} por unidade.',
      recorded: 'Produção registrada.',
      open: 'Começar agora',
      openHint: 'Marque que começou e feche quando sair, ou registre tudo de uma vez.',
      close: 'Fechar a produção',
      running: 'Em curso desde {{time}}',
      cancel: 'Cancelar',
      cancelTitle: 'Cancelar esta produção?',
      cancelBody: 'Nada foi lançado ainda, então não há o que estornar.',
      missingTitle: 'Falta insumo para esta produção',
      failed: 'Não deu para registrar',
      missingStock:
        'Falta insumo para esta corrida: {{items}}. Confira o estoque deles, ou lance a compra que chegou.',
      /** Onde está o que falta aqui, quando está numa sala da própria fábrica. */
      missingElsewhere: 'Tem {{item}}: {{where}}. Traga para o almoxarifado antes de rodar.',
      missingIn: 'na',
    },
    purchase: {
      title: 'Nova compra',
      /** Sem repetir a palavra do título nem do grupo que leva até aqui. */
      overline: 'a nota move o custo',
      openingStoreroom: 'Abrindo o almoxarifado…',
      whatYouBought: 'O que você comprou',
      /** Existe insumo, mas nenhum com embalagem e quanto vem dentro — sem isso a nota não converte. */
      noneBuyable:
        'Nenhum insumo tem embalagem e quanto vem dentro ainda. Complete o cadastro para a nota virar estoque.',
      supplier: 'Fornecedor',
      supplierPlaceholder: 'quem vendeu',
      /**
       * Sem tentar concordar com um nome que a pessoa digitou.
       *
       * "Quantas {{pack}}" saía como "QUANTAS SACO 25 KG": a embalagem é texto
       * livre, então gênero e número não se calculam daqui. A vírgula resolve.
       */
      howMany: 'Quantidade, em {{pack}}',
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
      overline: 'o que entra em cada vez',
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
      needYield: 'Informe quanto a receita rende de cada vez.',
      lossRange: 'A perda tem de ficar entre 0% e 100%.',
      containsItself: 'Essa receita contém a si mesma: {{path}}',
      subRecipeMissing: 'Sub-receita não encontrada: {{id}}',
      unitCost: 'CUSTO POR UNIDADE',
      needPortion: 'Informe quantos ml vão em cada unidade.',
      unitsPerBatch: '{{units}} unidades de cada vez · lote de {{batch}}',
      cheaperThan: '{{amount}} por unidade contra a versão {{version}} ({{percent}})',
      roundUp: 'Produza {{rounded}} para fechar caixa cheia — sobram {{loose}} soltas em {{units}}.',
      why: 'POR QUÊ?',
      whatGoesIn: 'O que entra de cada vez',
      subRecipe: 'sub-receita',
      shareOfBatch: '{{quantity}} · {{percent}} do lote',
      lessTen: '−10%',
      moreTen: '+10%',
      remove: 'tirar',
      add: 'ACRESCENTAR',
      batchYield: 'Quanto rende de cada vez',
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
      batchYields: 'Cada vez rende {{units}} — {{packed}}',
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
      /** Sem linha, o cartão não tem formulário: o título nomeia o assunto, não a ação ausente. */
      typesTitle: 'Tipos',
      typesHint: 'o que divide a linha: Tradicional, Skimó, Top — ou 240 ml, 500 ml, 1 litro',
      flavors: 'Sabores',
      flavorsHint: 'valem para todas as linhas: morango, chocolate, coco branco',
      addLine: 'Nova linha',
      addType: 'Novo tipo',
      addFlavor: 'Novo sabor',
      namePlaceholder: 'Nome',
      /** O estado é "não existe linha", e não "existe e nenhuma foi escolhida": a tela escolhe a primeira sozinha. */
      noLineYet: 'Cadastre uma linha primeiro — o tipo é dela.',
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
      perUnitHint: 'Cada vez rende {{units}} unidades.',
      packagingCost: 'Palito, embalagem e rótulo',
      /** O sufixo do campo. Curto porque mora dentro da caixa, ao lado do número. */
      perUnitShort: '/ un',
      packagingHint: 'Embalagem custa por unidade, não por receita — diluir no lote esconde a margem.',
      fromStock: 'O que sai do estoque por unidade',
      fromStockCost: 'a embalagem listada custa {{amount}} por unidade, pelas notas de compra',
      perUnitOf: 'Quanto de {{item}} por unidade',
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
      mixPlusBoth: '{{mix}} de massa + {{stock}} de embalagem do estoque + {{packaging}} digitado',
      mixPlusPackaging: '{{mix}} de massa + {{packaging}} de embalagem',
      fullBox: 'Caixa fechada: {{amount}}',
      save: 'Cadastrar produto',
      saving: 'Cadastrando…',
      confirmTitle: 'Cadastrar este produto?',
      confirmMade: '{{name}}, feito da receita {{recipe}}, {{perUnit}} ml por unidade. {{packaging}}',
      confirmResale: '{{name}}, produto de revenda. {{packaging}}',
      confirmAction: 'Cadastrar',
      gridTaken: 'Já existe {{name}} com essa classificação. Dê linha, tipo ou sabor a um dos dois — o catálogo fica em Ajustes.',
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
      /** Cadastrar não é lançar: `saveItem` escreve a linha do item e nenhum movimento. */
      registered: 'Cadastrado.',
      confirmAndRegister: 'Confirmar e cadastrar',
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

  /**
   * A frase de cada aviso, e ela é curta de propósito.
   *
   * Notificação é lida de relance na tela de bloqueio, com o polegar no caminho.
   * Título é o que decide; corpo é o número que sustenta. Nada de "confira o
   * estoque" — o dono já sabe conferir, o que ele não sabe é o quê.
   */
  alertText: {
    insumo: { title: 'Compre {{subject}}', body: 'Acaba em {{amount}} pelo consumo desta semana.' },
    pedido: {
      title: '{{places}} esperando carga',
      body: 'Faltam {{amount}} de {{subject}} para atender.',
    },
    volume: { title: '{{subject}} em {{amount}}%', body: 'Do cheio que você cadastrou.' },
    validade: { title: 'Lote {{subject}} vence', body: 'Em {{amount}} — mande esse primeiro.' },
    ambiente: {
      title: '{{subject}} fora da faixa',
      body: '{{amount}} °{{unit}} agora. Confira a porta e o motor.',
    },
  },

  loss: {
    melted: 'Derreteu',
    broken: 'Quebrou',
    expired: 'Venceu',
    courtesy: 'Cortesia',
    internal_use: 'Consumo interno',
    reasonRequired: 'Diga o que aconteceu — isso protege o relatório de todo mundo.',
  },

  /**
   * O que cada linha do razão é, em uma palavra.
   *
   * A camada de dados devolve `kind`, que é vocabulário de esquema; a tela que
   * mostra o histórico de um insumo precisa da palavra que a equipe usa. Estão
   * aqui, e não dentro de uma tela, porque três telas vão querer as mesmas.
   */
  movement: {
    purchase: 'Compra',
    production: 'Produção',
    consumption: 'Consumo',
    transfer: 'Transferência',
    sale: 'Venda',
    loss: 'Perda',
    return: 'Devolução',
    adjustment: 'Contagem',
    discrepancy: 'Diferença na conferência',
    reversal: 'Correção',
  },

  /**
   * O nome de cada moeda, para quem não decora código ISO.
   *
   * "BRL" sozinho não diz nada a quem está cadastrando o primeiro insumo; "BRL ·
   * Real" diz, e o exemplo formatado ao lado prova.
   */
  currency: {
    BRL: 'Real',
    USD: 'Dólar',
    EUR: 'Euro',
    MXN: 'Peso mexicano',
    ARS: 'Peso argentino',
    CLP: 'Peso chileno',
    COP: 'Peso colombiano',
    PYG: 'Guarani',
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

  scan: {
    typeCode: 'Digitar o código',
    progress: '{{done}} de {{total}}',
    duplicate: 'Esse engradado já foi bipado.',
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
