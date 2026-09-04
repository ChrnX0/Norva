## 34. Se começar do zero: o que levar, o que refazer, e em que ordem

Esta é a única seção opinativa do dossiê. Todas as outras descrevem o que existia; esta diz o
que fazer com isso.

### 34.1 O veredito, curto

O repositório tinha **fundações certas** e um **laço de trabalho quebrado**. As regras de
dinheiro, o livro-razão append-only, a permissão na consulta, os três idiomas obrigatórios por
tipo, o multi-empresa com RLS desde a primeira linha — nada disso é para jogar fora. São
decisões que custam caro para descobrir e estavam corretas.

O que estava quebrado é anterior ao código: **nunca houve um jeito de ver o aplicativo rodando
no aparelho de verdade.** Não havia emulador (a máquina não tem virtualização: `emulator
-accel-check` responde `KVM requires a CPU that supports vmx or svm`), e o APK compilado só
podia ser verificado no nível de artefato — assinatura, manifesto, tamanho, presença do bundle.
A única visão real da interface era a versão web dirigida por Playwright.

Toda a lista de defeitos visuais que chegou ao dono — o cartão do clima virando um hematoma
verde-oliva, o ícone de picolé num produto que não é sorvete, os rótulos das abas truncados
("Transpo…", "Relatóri…"), e a hierarquia das três tintas colapsada nos dois temas claros —
é consequência disso, não de descuido pontual. **Quem não vê a tela, conserta a tela por
dedução, e dedução erra.**

O caso mais instrutivo é o das tintas. A paleta tem três camadas de texto (`ink`, `inkMuted`,
`inkFaint`). Havia um teste guardando isso, e ele passava. Ele verificava a **ordem** das razões
de contraste (`5.34 > 5.07`) e não o **tamanho do passo** entre elas. Nos dois temas escuros o
passo era 1,5×; no papel claro era **1,05×** e no orgânico claro **1,24×** — ou seja, três
camadas de texto que na prática eram uma. O teste verde não era proteção: era permissão para
não olhar. Só depois passou a exigir passo mínimo de 1,35×.

**A lição transferível:** um guard que verifica a propriedade errada é pior do que nenhum, porque
compra confiança. Antes de escrever o guard, escreva o defeito que ele deve pegar e veja o guard
falhar.

### 34.2 O que levar sem discussão

Ordem de valor, do mais alto para o mais baixo.

**1. O livro-razão append-only, com imutabilidade imposta pelo banco.** Não existe coluna de
saldo; saldo é a soma dos movimentos, e a correção é por estorno. A imposição por *trigger* — não
por convenção — é o detalhe que faz a regra sobreviver a um desenvolvedor apressado. Levar
inclusive o `movement_group_id` (um ato, várias linhas) e o índice sobre o que ainda não foi
estornado.

**2. `Cents` inteiro e `Rate` fracionário como tipos distintos.** Nasceu de um bug real: polpa a
R$ 12,40/kg é 1,24 centavo por grama, e arredondar isso para inteiro perde um quinto do valor
antes da primeira multiplicação. Um único ponto de arredondamento, no valor final. Dinheiro nunca
em ponto flutuante, em lugar nenhum. Levar também o guard que procura `float`/`double` perto de
dinheiro.

**3. Permissão dentro da consulta, nunca em cima dela.** Quem não pode ver custo não recebe a
coluna — a checagem roda antes da consulta, então não existe número para vazar. Esconder botão é
decoração. Os sete papéis (`owner`, `operator`, `storeManager`, `driver`, `buyer`, `customer`,
`salesperson`) e as capacidades como pacote editável pela empresa, não como cela.

**4. `Widen<T>` para os três idiomas.** Chave nova em português quebra a compilação do inglês e
do espanhol até serem escritas. Isso é a única coisa que faz i18n sobreviver a um sprint apertado
— e o custo de retrofitar i18n depois é dez vezes maior. Levar junto: moeda define região
(`es-MX` e `es-ES` têm separador decimal diferente) e formatação por `Intl`, nunca à mão.

**5. `company_id` em toda tabela e RLS no servidor desde a primeira migração.** Multi-empresa
não é feature de depois; é forma de tabela. Levar também a regra de que uma linha nunca pode
apontar para outra empresa (havia migração dedicada a isso).

**6. "Depende" vira configuração, não pergunta e não escolha nossa.** Uma fábrica usa celular
compartilhado na câmara fria com PIN numa grade de nomes; outra dá um aparelho por pessoa. Uma
quer aprovação de pedido, outra não. Uma tem uma câmara fria só, outra tem três salas. Quando a
resposta certa é "depende de quem usa", os dois caminhos existem e a empresa escolhe — e a
pergunta ao dono é qual é o **padrão**, não qual é o único. Essa regra economizou várias rodadas
e evitou construir o lado errado.

**7. A disciplina do registro de aprendizados.** Toda rodada terminava com "o que apareceu aqui
que ninguém tinha visto?", e o achado virava uma linha num arquivo, com o que se viu, por que
importa e o que mudou por causa disso. Achado sem consequência não entrava. É o Apêndice G deste
dossiê e é, em volume de informação útil por linha, a coisa mais valiosa do repositório.

**8. Teste de mutação.** Suíte verde não quer dizer regra protegida — quer dizer que os exemplos
escolhidos não a exercitam. Na primeira execução, trocar o `Math.round` do `amountOf` por
`Math.floor` — *o* ponto de arredondamento do sistema — deixou **92 testes verdes**. A regra da
capa do projeto estava sustentada por coincidência aritmética.

**9. O portão de entrega com níveis de evidência.** Dizer em que nível a afirmação se sustenta
(acreditado → exercitado de verdade → visto em produção), com o comando que provou. "Compilou"
não é "funciona".

**10. O roadmap como arquivo, com `arquivo:linha`.** Item fechado sai no mesmo commit que o
fecha. Sem isso, a lista fica na cabeça de quem trabalha e desaparece com a sessão.

### 34.3 O que refazer diferente

**1. O laço de verificação visual vem antes da primeira tela.** Isto é a mudança principal e
todas as outras são detalhe. Antes de escrever componente, garanta *um* destes caminhos:

- o aplicativo em Expo Go no telefone do dono, com atualização por canal (o mais barato);
- ou EAS Build + distribuição interna, com o dono como testador;
- ou uma máquina com virtualização, para emulador Android de verdade.

O que **não** funciona é o que foi feito: web em Playwright como único olho. A versão web mente
sobre densidade de pixel, sobre truncamento de rótulo em fonte de sistema, sobre toque, sobre
tela capacitiva com luva, e sobre como a paleta aparece num painel OLED a -18°C.

**2. Capturas de tela desde o primeiro dia, nos dois esquemas, automáticas por commit.** Existiu
uma ferramenta assim (`npm run shot`) e ela achou os defeitos em minutos — só chegou tarde. Ela
tinha três cegueiras que valem a pena evitar de saída: rodava num navegador em inglês (então
fotografava o app no idioma errado), reusava o pacote compilado só porque ele existia (então
fotografava uma tela sem a mudança), e mudava o esquema do navegador em vez de clicar na opção do
próprio app (então as duas fotos saíam iguais).

**3. Tokens de tema com métrica, não com asserção de ordem.** Gere uma folha visual e uma tabela
de razões medidas (contraste de cada tinta contra cada fundo, e o passo entre camadas) como
artefato de build. O teste deve reprovar por *passo mínimo*, não por ordenação. E defina o passo
antes de escolher os hexadecimais.

**4. Divida a camada de dados.** `src/data/repository.ts` chegou a **4.525 linhas** com
leitura e escrita no mesmo arquivo. Um arquivo por agregado (itens, receitas, produção, pedidos,
lugares, pessoas), e a fronteira entre "consulta" e "ato que grava movimento" explícita no nome
do módulo.

**5. `unit_packaging_cents` deve ser `Rate` desde a primeira migração.** Do jeito que ficou,
embalagem abaixo de meio centavo por unidade arredonda para zero e a embalagem fica de graça.
Consertar depois custa migração no servidor *e* passo novo no aparelho — é exatamente o tipo de
erro que o portão P3 existe para pegar (forma de esquema se adivinha de graça enquanto há zero
linhas; conteúdo de livro-razão não se corrige, se estorna).

**6. Resolva a "sala do tacho" antes de escrever consumo de produção.** A pergunta em aberto:
quando a produção consome insumo, ela consome de uma sala estrita (o tacho é um local com saldo
próprio) ou de um conjunto agrupado de salas internas? A resposta muda a forma dos movimentos, e
movimento gravado não se corrige. Pela regra da configuração, provavelmente os dois caminhos —
mas o **padrão** é decisão do dono e precisa ser tomada antes, não depois.

**7. Generalize `location_id` no saldo desde o começo.** O código criava um local único cujo id
era o próprio `company_id`, e as três consultas de saldo somavam por empresa e item, sem filtrar
local. Correto para uma fábrica com um lugar só, e é a primeira coisa que a fase de câmara fria
precisa desfazer.

**8. Nenhuma peça sem chamador no mesmo commit.** A doença provada do repositório: uma coluna de
frase do assistente com índice dedicado e nenhuma escrita, um campo de rascunho sem leitor, duas
funções de saldo chamadas só por teste, quatro seções de dicionário nos três idiomas sem uma tela
que as use. O número da fase não pegou nenhuma delas; a pergunta "quem chama isto no mesmo
commit?" pega todas.

**9. Um fluxo inteiro antes de qualquer largura.** Compra → estoque → produção → saldo, no
telefone do dono, com ele usando. Depois lote e etiqueta. Depois pedido e separação. O
repositório tinha 17 telas e nenhuma tinha sido usada por uma pessoa de verdade numa fábrica.

**10. Splash e ícone de verdade antes do primeiro APK que alguém instala.** Ficou o splash do
scaffold do Expo. É pequeno e é a primeira coisa que o dono vê.

### 34.4 Ordem de construção sugerida

Cada etapa termina com o dono usando o resultado num telefone, não com testes verdes.

1. **Esqueleto verificável.** Projeto, três idiomas com `Widen`, tema com métrica de contraste,
   captura automática nos dois esquemas, e o app aberto no telefone do dono. Nenhuma regra de
   negócio ainda.
2. **Dinheiro e medida.** `Cents`, `Rate`, unidades e conversão, com teste de mutação já rodando
   sobre o ponto de arredondamento.
3. **O livro-razão.** Tabela de movimentos, trigger de imutabilidade, `movement_group_id`,
   estorno, saldo como soma, filtro por local desde já. Multi-empresa e RLS no mesmo passo.
4. **Um ato de escrita, ponta a ponta.** Compra: tela, validação, confirmação com os números por
   extenso, movimento gravado, saldo mudando na capa. O dono lança uma compra de verdade.
5. **Fila de saída e sincronia.** O aparelho grava offline e reenvia; o servidor aceita o mesmo
   registro duas vezes sem travar a fila (`on conflict do update` em toda tabela que o aparelho
   escreve — a ausência disso apareceu cinco vezes no repositório antigo).
6. **Produção com receita.** Consumo de insumo, rendimento, e **a versão de receita gravada no
   movimento** (era o único item ausente da fase 1 e é trabalho barato agora, caro depois).
7. **Lote, validade, etiqueta e QR.**
8. **Permissões e papéis**, com a checagem dentro da consulta.
9. **Inteligência da capa:** o que é normal, o que está diferente, qual a próxima ação — e o
   `[por quê?]` abrindo a conta. Determinístico sobre o livro-razão, para funcionar offline.
10. **Lojas, pedido, separação, entrega, devolução.**
11. **Contagem cega e perdas com motivo** (a captura do Espelho da Loja). O *relatório* fica para
    quando houver meses de movimento real — com duas semanas de dado ele mente.

Fora, com razão escrita: **fiscal/NFe** (microserviço à parte, certificado A1, homologação na
SEFAZ — nada depende dele), **compras inteligentes** (precisam do prazo de entrega observado, que
só existe depois de meses), e os **trunfos** (roteirização, clima aplicado a previsão, prova de
entrega) — diferencial de mercado, não a dor de hoje.

### 34.5 Armadilhas de ambiente já pagas com tempo

Todas foram pagas com horas de trabalho neste repositório. Estão detalhadas na seção 33; ficam
aqui porque cada uma vale um item na configuração inicial do próximo projeto.

| Armadilha | O que aconteceu | A regra |
|---|---|---|
| `pkill` largo | O padrão casou com a própria linha de comando e matou a verificação que tinha acabado de ser disparada | Parar só pelo PID que você mesmo anotou |
| `import()` para checar sintaxe | `node -e "import('./script.mjs')"` **executa** o arquivo; um dos processos ficou órfão e rodou oito horas roubando CPU | `node --check arquivo.mjs` valida e não executa |
| Reuso de `dist` no e2e | A suíte passou verde para uma tela que não tinha a mudança | O pacote é sempre o da execução |
| Prettier sem configuração | `npx prettier --write` reformatou o arquivo inteiro com aspas duplas | Nunca rodar formatador sem config no projeto |
| `expo prebuild` | Reescreveu os scripts do `package.json` sem avisar | Conferir o diff do `package.json` depois de qualquer comando de scaffold |
| Emulador Android | Impossível sem virtualização; `emulator -accel-check` diz `KVM requires vmx or svm` | Decidir o caminho de verificação visual antes de prometer verificação visual |
| Portão lido na árvore de trabalho | O portão lê `base..HEAD`; marcador em arquivo sem commit não existe para ele | Commit primeiro, conferir depois |

### 34.6 A conta honesta desta sessão

Para quem for retomar o trabalho, o que atrasou não foi falta de código:

- **338 testes verdes, 36 checagens de navegador verdes, e um tema claro ilegível chegando ao
  dono.** Verificação abundante no que se podia medir de dentro de um módulo; nenhuma no que só
  se vê olhando a tela.
- **Guards que verificavam a propriedade errada** — o de contraste checava ordem e não passo.
- **Três acusações de "violação de fundação" que eram decisões registradas** (um componente da
  fase 2 sem uso, o `[por quê?]` que abre num toque em outra tela, o assistente monolíngue com o
  raciocínio escrito no topo do arquivo). A busca pela decisão vem antes da acusação: `grep` no
  docblock, no registro de aprendizados e na lista de decisões do dono.
- **Ordem do dono cumprida pela metade:** o APK foi compilado e verificado como artefato, e nunca
  foi aberto. Isso deveria ter sido dito como bloqueio no primeiro minuto, não descoberto no fim.

---
