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
    /**
     * Quando o dinheiro não é desta pessoa para ver.
     *
     * Diz onde o número MORA em vez de dizer o que a pessoa não pode — é a
     * mesma escolha de tom do resto do app: orienta, não fiscaliza, e não culpa
     * ninguém. "Você não tem permissão" transforma o app em porteiro; isto
     * responde a pergunta que a pessoa de fato tem ao ver um travessão no lugar
     * de um valor, que é *por que não tem número aqui*.
     *
     * Aparece UMA vez por tela, no cartão de cima, e não em cada linha da lista:
     * vinte linhas repetindo a mesma frase é castigo, não informação.
     */
    moneyHidden: 'O custo fica com quem cuida do dinheiro.',
    /** O caminho de volta, para quem é o dono e emprestou o aparelho. */
    moneyHiddenWay: 'Se este aparelho é seu, troque o nome em Quem está com o aparelho.',
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
      // ---- A capa do Orgânico, como o dono aprovou (docs/design/aprovados/organico-*.jpg) ----
      // O número é a manchete e mora em cima da paisagem; o resto é dito em selos.
      organico: {
        producedToday: '{{unit}} produzidas hoje',
        quietToday: 'ainda não produziu hoje',
        yesterdayPill: 'ontem',
        /**
         * "da semana passada", e não "na {{weekday}} passada" — por gênero.
         *
         * Cinco dias da semana são femininos em português (segunda a sexta) e
         * dois são masculinos (sábado, domingo). "que na qua passada" está certo;
         * "que na dom passada" está errado, e era o que a capa escrevia dois dias
         * por semana. Apareceu na foto de um domingo.
         *
         * A moldura sem artigo serve aos sete. O espanhol não tem o problema —
         * lá todos os dias são masculinos —, e o inglês não tem gênero.
         */
        vsWeekdayPill: 'que {{weekday}} da semana passada',
        /**
         * O empate se diz com palavra, nunca com "+0".
         *
         * Um sinal e uma seta ao lado de zero sugerem movimento que não houve —
         * a mesma regra que o `sinal()` da capa do Papel já segue desde o começo,
         * e que o selo do Orgânico não seguia. Apareceu na foto de um domingo, em
         * que hoje e o domingo passado deram zero os dois: "↑ +0 que na dom
         * passada", com seta verde para cima.
         */
        sameAsWeekdayPill: 'igual a {{weekday}} da semana passada',
        weekBest: 'hoje é o melhor dia',
        weekRank: 'hoje é o {{rank}} melhor dia',
        /** Os ordinais que a frase da semana usa, do segundo ao sétimo. */
        ordinals: ['segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo'],
        shortestInput: 'é o insumo mais curto da casa',
        runsOutIn: 'até acabar',
        shipmentToday: 'expedição de hoje',
        movedSince: '{{count}}, desde ontem',
        movedCount: { one: 'um', other: '{{n}}' },
      },
      // ---- A capa editorial, como o dono aprovou (docs/design/aprovados) ----
      capaLead: 'Hoje a fábrica',
      capaMade: 'fez {{amount}}',
      capaQuiet: 'ainda não produziu',
      capaLegend: 'A linha inteira — do tacho à caixa que saiu.',
      // A cena tem três peças que só existem quando o dia as produz: a fumaça
      // (tacho aberto), o picolé enchendo (o que se fez) e a caixa (o que saiu).
      // Num dia parado some a metade do desenho, e o dono leu isso como app
      // quebrado — *"faltam cores e principalmente animações"*. A ausência era
      // dado, e dado que ninguém consegue ler não é dado. Então ela vira frase.
      capaLegendStill: 'Parada agora: sem tacho aberto, nada feito e nada saiu hoje.',
      boxYesterday: 'Ontem',
      boxLastWeek: '{{weekday}}, há uma semana',
      todayUnits: '{{unit}} · hoje',
      weekTitle: 'A semana',
      mathAgainst: '{{today}} − {{base}} = {{delta}}',
      weekWasBelow: '{{when}} ficou {{gap}} abaixo',
      weekWasAbove: '{{when}} ficou {{gap}} acima',
      mathSame: '{{when}} deu o mesmo',
      mathNoBase: 'primeiro dia com produção registrada',
      firstDayBody: 'A capa se enche sozinha conforme a fábrica trabalha: o que saiu hoje, o que está acabando, o que os clientes pediram.',
      firstDayAction: 'Lançar a primeira produção',
      copyNeverTitle: 'Guarde uma cópia',
      copyNeverBody: 'Tudo o que a fábrica registrou mora neste aparelho. Se ele quebrar, some junto.',
      copyOldTitle: 'Sua cópia tem {{days}} dias',
      copyOldBody: 'Entraram {{movements}} depois dela — é isso que se perde se o aparelho sumir.',
      copyOldQuiet: 'Nada entrou depois dela, mas o aparelho continua sendo o único lugar.',
      movementCount: { one: '1 movimento', other: '{{n}} movimentos' },
      firstDayNext: 'O QUE VAI APARECER AQUI',
      firstDayPreview: {
        producao: {
          title: 'O que saiu hoje',
          body: 'A conta do dia, e ao lado dela a sua semana — porque um número sozinho não diz se foi muito.',
        },
        estoque: {
          title: 'Quantos dias faltam',
          body: 'Quando cada insumo acaba, contando o prazo do fornecedor e a folga que você escolher.',
        },
        entregas: {
          title: 'Quem recebe hoje',
          body: 'O que cada loja combinou, o que já foi carregado, e o que ainda falta separar.',
        },
        validade: {
          title: 'O que vence antes de sair',
          body: 'Avisado com dias de antecedência, na data em que ainda dá para decidir.',
        },
      },
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
        mirror: { label: 'Espelho da Loja', detail: 'quanto volta de cada uma' },
      },
      /**
       * O Espelho da Loja — o que cada loja faz com o que recebe.
       *
       * A frase central é uma FRAÇÃO e não um total, e é isso que ela existe para
       * dizer: mil de volta é ótimo em vinte mil e péssimo em três mil. O total vem
       * logo abaixo porque toda conclusão abre a conta (Lei 6), e a janela anterior
       * vem ao lado porque número sozinho não decide (Lei 3).
       *
       * Nenhuma frase aqui julga a loja. "Devolve demais" é uma régua, e régua se
       * afere contra uma fábrica de verdade — o que a tela faz é mostrar o número e
       * a direção, e deixar quem conhece a loja concluir.
       */
      mirror: {
        title: 'Espelho da Loja',
        overline: 'o que volta de cada uma',
        window: 'nos últimos {{days}} dias',
        share: '{{percent}} do que chegou voltou',
        account: '{{returned}} de {{received}} que chegaram',
        before: 'antes eram {{percent}}',
        first: 'primeira janela desta loja',
        /**
         * O silêncio, dito uma vez e no plural.
         *
         * A foto mostrou seis blocos idênticos de "Nada voltou" com seis selos
         * de "antes eram 0,0%" — que é o alerta inventado na forma calma: uma
         * parede de nada que ensina a rolar sem ler. Produto que não voltou não
         * tem notícia, e notícia nenhuma cabe numa linha.
         */
        nothingFrom: 'Nada voltou de {{products}}.',
        productCount: { one: '1 produto', other: '{{n}} produtos' },
        empty: 'Nenhuma loja recebeu carga ainda.',
        emptyHint: 'Assim que a primeira carga sair, esta tela começa a comparar.',
      },
    },

    who: {
      /* A busca, que só existe quando a grade fica longa. */
      search: 'Procurar pelo nome',
      searchHint: 'Escreva as primeiras letras. Com ou sem acento, tanto faz.',
      searchNone: 'Nenhum nome com isso. Confira as letras.',
      searchOf: '{{shown}} de {{total}} nomes',
      title: 'Quem está com o aparelho',
      overline: 'toque no seu nome',
      /** Sem acusar ninguém: a frase explica para que serve, não cobra. */
      hint: 'O nome fica junto do que você registrar. Serve para a conferência saber a quem perguntar, nunca para cobrar.',
      pinAsk: 'Digite o PIN de {{name}}',
      pinWrong: 'PIN não confere.',
      pinLabel: 'PIN',
      confirm: 'Entrar',
      none: 'Ninguém ainda',
      leave: 'Largar o aparelho',
      empty: 'Ninguém cadastrado ainda.',
      emptyHint: 'Cadastre quem trabalha aqui e a grade aparece.',
      current: 'Agora é {{name}}',
    },

    picking: {
      title: 'Separar',
      overline: 'o que vai no carrinho',
      /** A pergunta que a tela responde: quanto do pedido já está no carrinho. */
      progress: '{{done}} de {{total}} itens contados',
      ready: 'Tudo contado',
      empty: 'Essa loja não tem pedido em aberto.',
      emptyHint: 'Sem pedido, a carga é reposição — e a tela de transferir dá conta dela.',
      noPlacesTitle: 'Não há para onde mandar ainda',
      noPlacesHint: 'Separar carga precisa de um destino. Cadastre a primeira loja ou cliente — leva um minuto, e depois é só escolher aqui.',
      noPlacesAction: 'Cadastrar loja ou cliente',
      ordered: 'pedido {{amount}}',
      alreadySent: 'já foram {{amount}} hoje',
      left: 'faltam {{amount}}',
      /** Contado a mais que o pedido é fato, não erro: às vezes a loja pediu mais na porta. */
      over: '{{amount}} a mais do que o pedido',
      finish: 'Registrar a carga',
      confirmTitle: 'Mandar o carrinho para {{place}}?',
      confirmBody: 'Vão {{count}} de uma vez. O saldo sai da fábrica e entra na loja, um lançamento por item.',
      confirmAction: 'Mandar',
      lineCount: { one: '1 item', other: '{{n}} itens' },
      sending: 'Registrando…',
      missingTitle: 'Falta produto na fábrica para esta carga',
      missingStock:
        'A fábrica não tem tudo o que está no carrinho: {{items}}. Confira o estoque, ou mande só o que tem.',
      failed: 'Não deu para registrar a carga',
      /** Largar o carrinho é ato de gente, não defeito: a separação de ontem não serve hoje. */
      clear: 'Esvaziar o carrinho',
      clearAsk: 'Esvaziar o carrinho?',
      clearBody: 'O que foi contado se perde. Nada foi gravado ainda, então nada é desfeito — o carrinho só volta a ficar vazio.',
      kept: 'O carrinho fica guardado neste aparelho até você mandar a carga.',
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
      /**
       * Achar a caixa que não é de hoje.
       *
       * O cartão de cima só lista os lotes do DIA, e o comentário dele já dizia
       * a verdade que faltava: quem procura o lote de uma caixa procura HORAS
       * depois. Três dias depois, não havia caminho nenhum — o código impresso
       * era um endereço que o aplicativo não sabia abrir.
       */
      findTitle: 'Achar um lote',
      findLabel: 'Código do lote',
      findHint: 'Digite o código que está na caixa — o mesmo que aparece embaixo do quadrado.',
      findAction: 'Abrir a etiqueta',
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

    /**
     * A cópia do aparelho — a única tela cujo assunto é o que acontece se o
     * aparelho não existir mais.
     *
     * O tom aqui é o da casa e ele custa uma linha a mais: **orienta, não
     * fiscaliza**, e não assusta. "Você pode perder tudo" é verdade e é o jeito
     * de fazer alguém fechar a tela; "Guarde uma cópia hoje" é a mesma verdade
     * virada para a ação. E a confirmação diz o que vai acontecer com os números
     * por extenso, porque restaurar é o ato mais destrutivo do aplicativo.
     */
    backup: {
      title: 'Cópia de segurança',
      overline: 'o que fica se o aparelho não ficar',
      lead: 'Tudo o que a fábrica registrou mora neste aparelho. Guarde uma cópia.',
      never: 'Você ainda não guardou nenhuma cópia.',
      neverHint: 'Uma cópia é um arquivo. Guarde onde você já guarda o que importa — conversa sua, e-mail, nuvem.',
      lastOne: 'Última cópia: {{when}}',
      today: 'hoje',
      yesterday: 'ontem',
      /**
       * Sem forma singular de propósito, e isto é para o próximo leitor não
       * "consertar" o que está certo: zero vira `today` e um vira `yesterday` na
       * tela, então `daysAgo` só é chamado de dois em diante. Uma chave plural
       * aqui seria um ramo que nunca roda — e ramo que nunca roda é onde o defeito
       * dorme.
       */
      daysAgo: 'há {{n}} dias',
      countsMovements: { one: '1 movimento', other: '{{n}} movimentos' },
      holds: 'Ela guarda {{movements}} e pesa {{size}}.',
      sinceThen: 'Depois dela entraram {{movements}}.',
      upToDate: 'Nada entrou depois dela — a cópia está em dia.',
      make: 'Guardar uma cópia agora',
      making: 'Preparando a cópia…',
      madeTitle: 'Cópia pronta',
      madeBody: 'A cópia tem {{movements}} e pesa {{size}}. Agora escolha onde guardá-la.',
      share: 'Escolher onde guardar',
      inside: 'O que vai dentro',
      // O NÚMERO em cima da palavra — e por que aqui não entra confirmação.
      //
      // Guardar a cópia é a única ação do aplicativo que PUBLICA para fora: um
      // toque grava e abre a folha de partilha com o livro-razão inteiro dentro.
      // Pela borda das perguntas isso pediria confirmação, e não pede, por uma
      // decisão escrita no código e que é boa: "pedir um segundo toque para o
      // passo que fecha o risco é onde as pessoas param" — e quem para não faz
      // cópia. A folha de partilha do sistema JÁ é o segundo passo, com destino
      // a escolher e saída pela lateral.
      //
      // O que faltava não era um diálogo, era a pessoa saber QUANTO está saindo
      // antes de tocar. A frase dizia o que vai dentro sem dizer o tamanho.
      insideBody: 'A cópia leva o livro-razão inteiro — o que entrou, o que saiu, custos e fornecedores. Quem abrir o arquivo lê tudo isso: hoje são {{movements}}.',
      insideBodyEmpty: 'A cópia leva o livro-razão inteiro — o que entrou, o que saiu, custos e fornecedores. Quem abrir o arquivo lê tudo isso.',
      insidePrefs: 'Suas escolhas vêm junto: cidade do tempo, ordem da capa, como se entra. Num aparelho novo é isso que faz ele parecer o antigo.',
      restoreTitle: 'Trazer uma cópia de volta',
      restoreLead: 'Aparelho novo, ou aparelho formatado. Escolha o arquivo da cópia.',
      pick: 'Escolher o arquivo',
      reading: 'Lendo a cópia…',
      confirmTitle: 'Trazer esta cópia de volta?',
      // A SEGUNDA folha. A primeira compara os dois números; esta diz o que a
      // subtração significa, e o que ela não conta.
      apagaAntesTitle: 'O que está aqui agora sai',
      apagaAntesBody:
        'Trazer a cópia de volta esvazia este aparelho antes de enchê-lo com ela. Tudo o que foi registrado depois da data da cópia sai junto — lançamentos, lotes, pedidos e as pessoas cadastradas com PIN —, e o que ainda não subiu deixa de existir. Se quiser os dois, guarde uma cópia de agora antes.',
      apagaAntesConfirm: 'Trazer de volta mesmo assim',
      confirmBody: 'A cópia é de {{when}} e tem {{copyMovements}}. Este aparelho tem {{hereMovements}} agora, e eles serão substituídos pelos da cópia.',
      confirmNoDate: 'A cópia tem {{copyMovements}}. Este aparelho tem {{hereMovements}} agora, e eles serão substituídos pelos da cópia.',
      confirm: 'Trazer de volta',
      restoring: 'Trazendo de volta…',
      doneTitle: 'A fábrica voltou',
      doneBody: 'Voltaram {{rows}} em {{tables}}.',
      rowCount: { one: '1 linha', other: '{{n}} linhas' },
      tableCount: { one: '1 tabela', other: '{{n}} tabelas' },
      naoEhCopiaNossa: 'Este arquivo não é uma cópia do {{app}}.',
      maisNovaQueOApp: 'Esta cópia veio de uma versão mais nova do aplicativo. Atualize o aplicativo e tente de novo — trazer o que ele entende deixaria a fábrica sem uma parte dela.',
      ilegivel: 'Este arquivo não abriu. Ele pode ter chegado incompleto.',
      referenciasQuebradas: 'Esta cópia está inconsistente e nada foi mudado. O aparelho está como estava.',
      naoDeuParaGuardar: 'Não deu para guardar a cópia agora.',
      semPartilha: 'Este aparelho não sabe partilhar arquivo. A cópia está guardada aqui: {{path}}',
    },
    extract: {
      title: 'Extrato',
      overline: 'tudo o que foi registrado, e como desfazer',
      ofPlace: 'o que {{place}} recebeu e devolveu',
      ofPlaceAction: 'Ver o extrato desta loja',
      empty: 'Nada foi registrado ainda.',
      emptyHint: 'Cada compra, produção, carga e conferência aparece aqui — com o caminho de volta ao lado.',
      lineCount: { one: '1 linha', other: '{{n}} linhas' },
      undo: 'Desfazer',
      undone: 'Desfeito',
      undoOf: 'Correção de {{what}}',
      undoTitle: 'Desfazer {{what}}?',
      undoBody: 'Sai do estoque: {{out}}. Volta para o estoque: {{back}}. Os dois lançamentos ficam no histórico — nada é apagado.',
      nothing: 'nada',
      alreadyUndone: 'Isto já foi desfeito. Desfazer duas vezes dobraria a correção.',
      blocked: 'Não dá para desfazer agora: {{items}} já saiu daqui.',
      blockedItem: '{{name}} — tem {{held}}, precisaria de {{needed}}',
      undoFailed: 'Não deu para desfazer agora. Nada foi mudado.',
      more: 'Ver mais — {{n}} até aqui',
      allOfIt: 'Isto é tudo: {{n}}.',
      recordCount: { one: '1 registro', other: '{{n}} registros' },
    },
    losses: {
      title: 'Perdas',
      window: 'Últimos 30 dias',
      empty: 'Nenhuma perda registrada nos últimos 30 dias.',
      emptyHint: 'Quando alguma coisa vencer, derreter ou quebrar, registre no item — é o motivo que faz esta tela servir.',
      total: '{{money}} em {{count}}',
      lossCount: { one: '1 perda', other: '{{n}} perdas' },
      /**
       * A palavra sozinha, sem o número — para quando a FIGURA já é a contagem.
       *
       * Sem ela a linha saía "12   12 perdas": o mesmo defeito que este projeto já
       * nomeou na capa ("500 duas vezes"), agora dentro de uma linha só. E a
       * alternativa que eu ia escrever era pior — recortar o `{{n}}` do plural
       * dentro da tela, que é a tela voltando a escrever português.
       */
      lossWord: { one: 'perda', other: 'perdas' },
      vsPrevious: 'nos 30 dias anteriores foram {{money}}',
      firstWindow: 'primeira janela com perda registrada — não há antes para comparar',
      worst: 'O que mais pesou: {{reason}}, {{money}}.',
      /**
       * A mesma tela sem o dinheiro — e ela continua servindo.
       *
       * Perder três caixas é fato de chão de fábrica; quanto custou é outra
       * pergunta. Sem o custo a figura passa a ser a CONTAGEM e o ranking passa a
       * ser por vezes em vez de por valor: "derreteu, 8 vezes" muda a mesma
       * decisão que "derreteu, R$ 240" — olhar o freezer.
       */
      worstByCount: 'O que mais pesou: {{reason}}, {{count}}.',
      totalByCount: '{{count}} na janela',
      vsPreviousByCount: 'nos 30 dias anteriores foram {{count}}',
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
      // O caminho de volta de um pedido decidido por engano. Ver o docblock da
      // consulta em app/orders/index.tsx: o ato não tocava o razão e mesmo assim
      // não tinha volta, porque a lista escondia o que foi decidido.
      decidedToday: 'Decididos hoje',
      wasDelivered: 'marcado como entregue',
      wasCancelled: 'cancelado',
      undo: 'Desfazer',
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
    account: {
      title: 'Conta',
      overline: 'o que liga este aparelho ao servidor',
      /* A frase que evita a pergunta mais provável: "sou obrigado a fazer isto?" */
      why:
        'O aplicativo funciona inteiro sem conta. Ela serve para o que sai deste aparelho: '
        + 'guardar no servidor, cadastrar quem trabalha aqui, e abrir o app noutro celular '
        + 'com os mesmos dados.',
      email: 'E-mail',
      password: 'Senha',
      passwordHint: 'Pelo menos 6 letras ou números.',
      signIn: 'Entrar',
      signUp: 'Criar conta',
      switchToSignUp: 'Ainda não tenho conta',
      switchToSignIn: 'Já tenho conta',
      checkEmail: 'Conta criada. Confirme pelo link que chegou no seu e-mail e volte aqui para entrar.',
      companyTitle: 'A sua empresa',
      companyBody: 'Falta dar um nome. É ele que aparece no topo do aplicativo e nos relatórios.',
      companyName: 'Nome da empresa',
      createCompany: 'Criar a empresa',
      signedInAs: 'Entrou como',
      companyIs: 'Empresa',
      /* O convite — o segundo caminho de entrada que o dono decidiu. */
      codeTitle: 'O código da sua empresa',
      codeBody:
        'Dite estas seis letras para quem for usar o aplicativo. Elas não dão acesso a nada '
        + 'sozinhas: criam um pedido, e você decide.',
      joinTitle: 'Entrar numa empresa que já existe',
      joinBody: 'Peça o código de seis letras a quem administra.',
      joinCode: 'Código',
      joinAsk: 'Pedir para entrar',
      joinSent: 'Pedido enviado para {{company}}. Espere alguém de lá aprovar.',
      waitingTitle: 'Esperando você',
      waitingNone: 'Ninguém pediu para entrar.',
      approve: 'Aprovar',
      refuse: 'Recusar',
      approveAs: 'entra como operador — produz, despacha e confere, sem ver dinheiro',
      signOut: 'Sair da conta',
      signOutHint: 'O que está gravado neste aparelho continua aqui.',
      /* Ligar o aparelho à empresa: o carimbo do que já está gravado aqui. */
      adoptTitle: 'Ligar este aparelho à sua empresa',
      adoptBody:
        'O que já está gravado neste aparelho foi anotado antes de a empresa existir. '
        + 'Ligar passa tudo para a {{company}} — os movimentos, os itens, as pessoas, os lugares.',
      adoptAction: 'Ligar à {{company}}',
      adoptAsk:
        'Tudo o que está neste aparelho passa a ser da {{company}}. Nada é apagado, e isto vale uma vez.',
      adoptDone: 'Este aparelho é da {{company}}.',
      adoptRefuse: {
        idVazio: 'A empresa voltou sem identificação do servidor. Entre e saia da conta e tente de novo.',
        jaSubiu:
          'Este aparelho já mandou dado para um servidor, e o que subiu não se reescreve. '
          + 'Fale comigo antes de continuar: o certo aqui é começar deste aparelho outra vez.',
        exemploAqui:
          'Este aparelho ainda tem os dados de exemplo. Eles nasceram de notas inventadas, e '
          + 'nota inventada não entra no livro da sua fábrica. Em Ajustes, apague o que está aqui '
          + 'e volte — a tela de lá diz exatamente o que sai.',
        idOcupado:
          'Já existe coisa gravada aqui com o mesmo número desta empresa. Isso acontece quando '
          + 'uma cópia de outro aparelho foi restaurada. Fale comigo antes de continuar.',
      },
      working: 'Um instante…',
      /* Os motivos: fato do servidor traduzido em frase, e a frase diz o que FAZER. */
      reason: {
        semServidor: 'Este aplicativo está sem servidor configurado. Só o aparelho, por enquanto.',
        semRede: 'Sem alcançar o servidor. Confira a internet e tente de novo.',
        credenciais: 'E-mail ou senha não conferem.',
        emailEmUso: 'Já existe conta com este e-mail. Entre em vez de criar.',
        senhaFraca: 'A senha é curta demais. Use pelo menos 6 letras ou números.',
        emailNaoConfirmado: 'Falta confirmar o e-mail. Procure o link que o servidor mandou.',
        codigoNaoConfere: 'Esse código não pertence a nenhuma empresa. Confira as seis letras.',
        desconhecido: 'Não deu certo, e o motivo não é um dos conhecidos.',
      },
    },
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
        who: 'Trocar de pessoa',
        inputs: 'Insumos',
        recipes: 'Receitas',
        products: 'Produtos',
        places: 'Lojas e clientes',
        people: 'Pessoas',
        purchases: 'Compras',
        orders: 'Pedidos',
        account: 'Conta',
        extract: 'Extrato',
        backup: 'Cópia de segurança',
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
      // A SEGUNDA folha, e ela diz coisa diferente da primeira: a primeira conta
      // o que sai, esta explica o que o registro é e por que ele não se refaz.
      // Decisão do dono, 7 de setembro.
      registroTitle: 'O registro não se refaz',
      registroBody:
        'O que a fábrica registrou é a soma de cada lançamento — é dela que saem o estoque, o custo e a margem. Apagar não desfaz os lançamentos: tira-os do mundo. Nenhum estorno alcança o que não existe mais.',
      registroConfirm: 'Apagar mesmo assim',
      /* O prazo do Reset no servidor — os três casos que o dono nomeou. */
      graceTitle: 'Depois de apagar, no servidor',
      graceHint:
        'Neste aparelho o apagamento é na hora. No servidor o livro fica guardado por este '
        + 'tempo antes de ser destruído — e até lá dá para desistir.',
      graceDays: '{{days}} dias',
      graceNow: 'destruir junto',
      graceNever: 'guardar para sempre',
      /* A frase que a segunda confirmação acrescenta, e ela DIZ o que vai acontecer. */
      registroServerWait:
        'No servidor, o livro fica guardado por {{days}} dias e depois é destruído. Até lá, você pode desistir.',
      registroServerNow: 'No servidor, ele é destruído junto — não há prazo para desistir.',
      registroServerNever:
        'No servidor, o livro continua guardado: este Reset vale só neste aparelho.',
      registroOnlyHere: 'Este aparelho é o único lugar onde eles estão.',
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
      // A SEGUNDA folha, e o motivo dela é medido: nada marca o que a simulação
      // planta. `src/data/simulate.ts` não escreve nenhuma anotação nas linhas,
      // então não há como SELECIONAR o inventado depois — o estorno não alcança
      // o que não se consegue identificar, e o único removedor é "apagar tudo",
      // que leva o dado de verdade junto.
      simulateMixTitle: 'Eles entram no mesmo livro que os seus',
      simulateMixBody:
        'Nada distingue um lançamento plantado de um seu depois que ele entra. Não dá para tirar só os inventados: para removê-los existe apenas "apagar tudo", em Ajustes, e isso leva os seus junto. Esta fábrica já tem {{movements}}.',
      simulateMixEmpty:
        'Nada distingue um lançamento plantado de um seu depois que ele entra. Não dá para tirar só os inventados: para removê-los existe apenas "apagar tudo", em Ajustes.',
      simulateMixConfirm: 'Plantar mesmo assim',
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
        // As três que a confirmação não contava. A primeira é a que mais dói:
        // "apagar tudo" leva a grade de nomes com PIN, e dizia zero.
        people: { one: '1 pessoa cadastrada', other: '{{n}} pessoas cadastradas' },
        lots: { one: '1 lote', other: '{{n}} lotes' },
        orders: { one: '1 pedido', other: '{{n}} pedidos' },
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
        /**
         * O nome e a frase de cada pele, com a CHAVE sendo o id da pele.
         *
         * Estava em quatro chaves soltas (`papel`, `papelHint`, `organico`,
         * `organicoHint`), e a tela listava as duas à mão. Uma pele nova
         * exigiria acrescentar duas chaves em três idiomas E lembrar de vir
         * mexer na lista da tela — a segunda parte é a que se esquece.
         * Assim a tela percorre `skins` e o `Widen` obriga os três idiomas.
         */
        peles: {
          papel: { nome: 'Papel', dica: 'serifa, traço fino, cantos retos' },
          organico: { nome: 'Orgânico', dica: 'paisagem, curva, cantos macios' },
        },
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
      /* A folga de compra — configuração da empresa, pela F7. */
      safety: {
        label: 'Quanta folga antes de comprar',
        hint:
          'O app soma esta folga ao prazo que o seu fornecedor leva de verdade, e avisa nesse dia. '
          + 'Zero serve para quem compra na esquina.',
        none: 'Sem folga',
        days: { one: '1 dia', other: '{{n}} dias' },
      },
      briefing: {
        label: 'O que aparece na tela inicial',
        hint: 'A ordem é da casa: todo mundo vê a mesma capa. Esconder é só neste aparelho.',
        hidden: 'escondido aqui',
        show: 'Mostrar',
        hide: 'Esconder',
        /* Meia coluna: a peça divide a linha com a vizinha. A frase diz o
            RESULTADO e não o interruptor, porque marcar uma peça como meia pode
            não mudar nada — a regra é que meia sozinha vira inteira, e quem
            quiser o par marca as duas. */
        half: 'Meia',
        whole: 'Inteira',
        halfAlone: 'sozinha, ocupa a linha',
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
          semana: 'A semana',
          insumos: 'Insumo acabando',
          pedidos: 'Pedidos dos clientes',
          clima: 'Tempo',
          expedicao: 'Saiu para as lojas',
          precos: 'Preços que mexeram',
          copia: 'Cópia de segurança',
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
      naming: {
        label: 'Nomear quem gravou',
        /**
         * A frase diz o que MUDA, não o que a chave se chama: quem lê decide com isso.
         *
         * E ela cresceu porque a chave passou a fazer DUAS coisas. Junto com
         * "compartilhado", nomear quem gravou é o que liga o portão do dinheiro:
         * cada perfil passa a ver o que o perfil permite. A regra da casa é que a
         * confirmação diz o que vai acontecer — chave que faz o que a frase não
         * anuncia é a mesma falta de um botão que mente.
         */
        hint: 'Desligado, o relatório fala de onde — "faltaram 3 caixas na conferência". Ligado, o aparelho pergunta quem está com ele e cada linha guarda o nome. Num aparelho compartilhado, ligar isto também faz cada pessoa ver só o que o perfil dela permite: quem trabalha na produção não vê custo nem preço.',
        on: 'Ligado',
        off: 'Desligado',
      },
      signIn: {
        label: 'Como se entra no chão de fábrica',
        hint: 'Um celular por pessoa escolhe uma vez e fica. Aparelho que passa de mão pergunta toda vez que o app abre — porque quem pegou agora não é quem largou. Com "Nomear quem gravou" ligado, é aqui que o custo deixa de aparecer para quem não cuida do dinheiro.',
        personal: 'Um por pessoa',
        shared: 'Compartilhado',
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
        'Você vai cadastrar {{name}}, comprado em {{pack}} com {{factor}} {{unit}} por embalagem, custando {{price}}. Entra 1 {{pack}} no estoque agora, como a primeira nota — se ainda não comprou, lance a nota depois em vez de cadastrar com preço.',
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
      /**
       * Quanto o fornecedor demora — fato medido, nunca conselho.
       *
       * A média entre pedir e receber, das notas que trazem as duas datas. Não há
       * "compre agora" em lugar nenhum: essa régua precisa de fábrica, e o que a
       * tela faz é pôr o prazo ao lado de como se compra, que é a vizinhança onde
       * a conta se fecha sozinha na cabeça de quem compra.
       */
      leadTime: 'O fornecedor leva',
      leadTimeFrom: 'média de {{count}}',
      noteCount: { one: '1 nota', other: '{{n}} notas' },
      /* O ponto de recompra, dito na data da DECISÃO. */
      buyNow: 'Compre hoje',
      buyBy: 'Compre até {{weekday}}',
      buyWhy:
        'Sobram {{cover}} de estoque e o fornecedor leva {{lead}}, com {{slack}} de folga que você escolheu.',
      buyCalm: 'Não precisa comprar ainda',
      buyCalmWhy: 'Sobram {{cover}} de estoque, e a conta já conta o prazo do fornecedor.',
      leadTimeUnknown:
        'Anote quando você pediu, na próxima nota, e o app passa a saber quanto seu fornecedor demora.',
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
      /**
       * A mesma confirmação, sem a cláusula do dinheiro.
       *
       * Existe porque `record_loss` e `adjust_stock` SÃO capacidades do operador
       * (`src/domain/access.ts`) — quem não vê custo é exatamente quem mais
       * encontra estes dois diálogos. Com a frase de cima e o custo escondido, a
       * confirmação passava a dizer *"vale R$ 0,00"* no momento em que o
       * `CLAUDE.md` exige os números por extenso. Tirar a cláusula é honesto;
       * zerá-la é mentir na tela que grava.
       */
      lossBodyNoMoney: 'Você vai baixar {{amount}} de {{item}}: {{reason}}. Fica no histórico.',
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
      countConfirmShortNoMoney:
        'Você contou {{counted}}. O sistema esperava {{expected}}. Estão faltando {{diff}}. A diferença fica registrada e nada é apagado.',
      countConfirmOverNoMoney:
        'Você contou {{counted}}. O sistema esperava {{expected}}. Estão sobrando {{diff}}. A diferença fica registrada e nada é apagado.',
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
      /** O preço combinado com este lugar, item a item. */
      prices: 'O QUE ELE PAGA',
      /**
       * A frase diz o que o vazio SIGNIFICA, e não que o campo é opcional.
       *
       * "Opcional" faz a pessoa pular sem saber o que acontece; isto responde a
       * pergunta que ela tem com o dedo no campo — se eu não escrever nada, quanto
       * é que ele paga?
       */
      pricesHint: 'Em branco vale o preço de tabela. O que você escrever aqui vence a tabela, só para este lugar.',
      listPrice: 'tabela {{amount}}',
      noListPrice: 'sem preço de tabela',
      priceWas: 'era {{amount}} até {{date}}',
      pricePerUnit: 'por {{unit}}',
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
      // Renomear não existia em tela nenhuma — e é a primeira coisa que quem
      // instala quer fazer. A sala padrão nasce sem nome; é aqui que ela ganha um.
      rename: 'Renomear',
      renameHint: 'O nome que a sua equipe usa para este lugar.',
      keep: 'Deixar como está',
      onlyAdminEdits: 'Cadastrar e renomear lugares é de quem administra a empresa.',
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
      /* A transportadora: quem levou, quando não foi o carro da fábrica. */
      carrierTitle: 'Transportadoras',
      carrierHint: 'Quem leva a carga quando não é o carro da fábrica.',
      carrierNone: 'Nenhuma cadastrada. A fábrica entrega com o carro dela.',
      carrierAdd: 'Cadastrar transportadora',
      carrierName: 'Nome',
      carrierPhone: 'Telefone',
      carrierSave: 'Salvar transportadora',
      carrierRetire: 'Tirar de uso',
      carrierRetired: 'fora de uso',
      carrierRetireAsk:
        'Ela sai da lista de escolha. O que ela já levou continua no registro, com o nome dela.',
      carrierOnlyAdmin: 'Só quem administra a empresa cadastra transportadora.',
      carrierPick: 'Quem leva',
      carrierOwn: 'Carro da fábrica',
      carrierTook: 'levou {{carrier}}',
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
    /**
     * Os sete papéis do produto, que são MODELOS e não a lista fechada.
     *
     * O nome mora aqui e não no banco porque o perfil semeado nasce sem nome —
     * "Entregador" é uma palavra em três idiomas. No dia em que o dono renomear,
     * o nome dele vence e esta chave deixa de ser consultada para aquele perfil.
     */
    roles: {
      owner: 'Dono',
      operator: 'Operador',
      storeManager: 'Gerente de loja',
      driver: 'Entregador',
      buyer: 'Comprador',
      customer: 'Cliente',
      salesperson: 'Vendedor',
    },

    /**
     * As doze permissões, com o que cada uma deixa fazer.
     *
     * A frase não é enfeite: o dono marca permissão por permissão, e uma lista de
     * doze nomes técnicos sem explicação é uma tela que obriga a adivinhar. Cada
     * linha diz o ATO, com o verbo na frente.
     */
    capabilities: {
      view_cost: { label: 'Ver custo', hint: 'Quanto custa fazer, e quanto vale o que está parado.' },
      view_sale_price: { label: 'Ver preço de venda', hint: 'Por quanto a mercadoria sai para a loja ou para o cliente.' },
      record_production: { label: 'Registrar produção', hint: 'Lançar o que saiu do tacho, baixando o insumo.' },
      dispatch: { label: 'Despachar carga', hint: 'Mandar mercadoria da fábrica para uma loja.' },
      check_receipt: { label: 'Conferir chegada', hint: 'Abrir a caixa na loja e dizer o que veio.' },
      record_loss: { label: 'Registrar perda', hint: 'Anotar o que derreteu, quebrou ou passou da validade.' },
      place_order: { label: 'Anotar pedido', hint: 'Pedir para a fábrica em nome de uma loja.' },
      approve_order: { label: 'Aprovar pedido', hint: 'Deixar um pedido virar carga.' },
      adjust_stock: { label: 'Conferir prateleira', hint: 'Contar o que tem e gravar a diferença.' },
      view_finance: { label: 'Ver dinheiro', hint: 'Quanto entrou, quanto saiu e quanto está parado.' },
      issue_invoice: { label: 'Emitir nota', hint: 'Fazer a nota fiscal da carga.' },
      manage_company: { label: 'Gerir a empresa', hint: 'Cadastrar gente, perfil, loja e aparelho.' },
    },

    people: {
      title: 'Pessoas',
      overline: 'quem trabalha aqui',
      empty: 'Você ainda não cadastrou ninguém.',
      emptyHint: 'Cadastre quem trabalha aqui para poder dizer, depois, quem estava com o aparelho.',
      add: 'Cadastrar uma pessoa',
      name: 'Como se chama',
      profile: 'O que faz aqui',
      save: 'Salvar pessoa',
      saved: 'Pessoa salva',
      away: 'Não trabalha mais aqui',
      readOnly: 'Só quem administra a empresa muda quem trabalha nela.',
      awayHint: 'Ela sai da lista e o histórico continua apontando para ela — nada é apagado.',
      profilesTitle: 'Perfis',
      profilesOverline: 'o que cada um pode fazer',
      wearers: { one: '1 pessoa', other: '{{n}} pessoas' },
      nobody: 'ninguém ainda',
      canDo: { one: '1 permissão', other: '{{n}} permissões' },
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
      /** Segunda viagem ao freezer: o palpite é o que falta, e a dica diz por quê. */
      orderedPartly: 'pedido para {{date}}: {{amount}} — já foram {{sent}} hoje',
      title: 'Transferir',
      overline: 'o que sai da fábrica',
      /**
       * Por que a carga voltou — as quatro respostas, e cada uma manda fazer
       * uma coisa diferente.
       *
       * "Não vendeu" manda produzir menos para aquela loja. "Derreteu no
       * caminho" manda olhar o caminhão e a câmara. Sem a distinção, o relatório
       * dá o conselho errado com convicção.
       */
      returnReason: 'Por que voltou',
      returnReasonHint: 'A resposta muda o que fazer: não vendeu manda produzir menos; derreteu manda olhar o caminhão.',
      unsold: 'Não vendeu',
      wrong_item: 'Veio errado',
      returnMelted: 'Derreteu no caminho',
      returnExpired: 'Passou da validade',
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
      /**
       * A reserva na hora que ela pode ser perdida.
       *
       * A tela de anotar pedido já descontava o que outros pedidos reservaram, e
       * esta limitava pelo saldo FÍSICO — que não sabe de promessa. As frases são
       * duas porque os dois fatos são diferentes: o de cima diz quem espera, e só
       * aparece quando alguém espera; o de baixo só aparece quando esta carga
       * passa da folga. Nenhuma das duas impede: às vezes a loja está na porta.
       */
      promised: '{{amount}} disso já tem dono: {{place}} espera {{when}}',
      promisedMany: '{{amount}} disso já tem dono: {{place}} espera {{when}}, e mais {{rest}}',
      promisedWhen: 'para {{date}}',
      promisedWhenever: 'sem dia marcado',
      promisedRest: { one: '1 pedido', other: '{{n}} pedidos' },
      short: 'Mandando isso, faltam {{amount}} para quem espera',
      /** No diálogo o aviso é dito de novo: o botão fica embaixo, e num telefone
          a frase do cartão pode ter saído da tela quando o dedo chega nele. */
      confirmShort: 'Depois desta carga faltam {{amount}} para quem espera.',
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
      makeTitle: 'O que produzir',
      makeBy: 'Produza {{name}} até {{day}}.',
      makeToday: 'Produza {{name}} hoje — o estoque acaba.',
      makeWhy: 'Tem {{held}}, e saem cerca de {{perDay}} por dia.',
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
      /**
       * As mesmas duas, sem a cláusula do custo.
       *
       * O custo CONTINUA sendo congelado — e certo, com a embalagem inteira, lido
       * pelo caminho do livro-razão. O que sai é a frase que o anuncia, porque
       * `record_production` é capacidade do operador e é ele quem mais vê este
       * diálogo. Prometer um número que a tela não mostra é pior que não prometer.
       */
      confirmBodyNoCost:
        'Você produziu {{units}} de {{product}}, rodando a receita {{batches}}. Isso baixa {{lines}} do estoque.',
      confirmBodyNoBatchNoCost:
        'Você produziu {{units}} de {{product}}. Isso baixa {{lines}} do estoque.',
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
      /**
       * Quando o pedido foi feito — a pergunta rara que a Lei 1 permite.
       *
       * A lei proíbe pedir o que o sistema pode deduzir, e a data em que alguém
       * ligou para o fornecedor não está no razão em lugar nenhum. Sem ela,
       * `observedLeadTimeDays` recebe lista vazia e o ponto de recompra é
       * adivinhação — esperar meses de nota não conserta, porque a coluna
       * continua nula.
       *
       * "Não sei" nasce marcado de propósito: é o estado de hoje, e obrigar uma
       * resposta trocaria uma lacuna honesta por um número inventado. A dica diz
       * o que a resposta compra, em vez de cobrar.
       */
      orderedWhen: 'Quando você pediu',
      orderedWhenHint:
        'Com isso o app aprende quanto seu fornecedor demora, e avisa antes de faltar. Sem isso, ele não tem como saber.',
      orderedUnknown: 'Não sei',
      orderedToday: 'Hoje',
      /** Uma palavra, e é a que a pessoa usa. "Há 1 dia" é como um sistema fala. */
      orderedYesterday: 'Ontem',
      orderedDaysAgo: 'Há {{days}}',
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
      perUnitOfNoCost: 'por unidade de {{product}}',
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
      sellsFor: 'vende a {{amount}}',
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
      /**
       * O preço de tabela, em cartão próprio e logo depois do custo por unidade.
       *
       * A vizinhança é a Lei 3 aplicada ao cadastro — R$ 0,64 para fazer, R$ 2,50
       * para sair —, e ela custou uma correção: o campo nasceu dentro de "Palito,
       * embalagem e rótulo", onde o número ao lado eram os cinco centavos da
       * embalagem. Comparação que não decide nada, sob um título que não é o
       * assunto. Quem viu foi a foto.
       */
      salePrice: 'Por quanto você vende',
      /** O título do cartão. É a pergunta que ele responde, não o nome do campo. */
      sellingTitle: 'Por quanto ele sai',
      salePriceHint:
        'Em branco, este produto não é vendido — é o caso de quem só abastece as próprias lojas. Cada loja pode ter um preço combinado, e ele vence este.',
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
    /** O gesto, dito em palavras — para quem usa leitor de tela e para a legenda. */
    open: 'Abrir a conta',
    stockWhere: 'Somado lugar por lugar, com o custo de hoje',
    stockTotal: 'Parado no total',
    stockNote:
      'Cada lugar vale o que tem dentro, pelo custo médio de hoje. O total é a soma — nada aqui é estimativa.',
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
