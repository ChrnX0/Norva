# NORVA

**Português** · [English](docs/README.en.md) · [Español](docs/README.es.md)

Sistema de gestão para quem **fabrica e distribui**: da receita ao custo real, da
produção ao lote, da câmara fria à loja, e do que saiu ao lucro que deveria ter
saído.

Nasce para uma fábrica de picolés e sorvetes, mas sem nenhuma regra chumbada de
sorvete — a hierarquia de embalagem, os módulos e os papéis são todos
configuráveis, porque o produto será publicado nas lojas Android e Apple.

> **Estado: Fase 1 — o que você produz e quanto custa.** Sobre o alicerce da
> Fase 0 (livro-razão, multi-empresa, permissão por capacidade, design system,
> i18n) já rodam as telas de insumo, receita, produto e nota de compra, com o
> custo recalculando enquanto se digita. Produção, lote e distribuição são as
> fases seguintes.

---

## O vazio que este produto ocupa

Pesquisa em cinco mercados (Brasil, América Latina hispânica, mundo anglófono,
Itália e Índia) encontrou sempre a mesma divisão:

| Região | Resolve bem | Ignora |
|---|---|---|
| 🇧🇷 Brasil | PDV de loja **ou** ERP industrial pesado | O fabricante pequeno que distribui |
| 🇦🇷🇨🇱🇲🇽🇨🇴 LATAM | PDV de gastronomia | Produção como indústria |
| 🇺🇸🇬🇧 Anglófono | Custo de receita, rastreabilidade | Mobile, preço acessível |
| 🇮🇹 Itália | Balanceamento técnico (PAC/POD) | Estoque, distribuição, dinheiro |
| 🇮🇳 Índia | Distribuição, cadeia fria | Porte pequeno, simplicidade |

Cada região resolve um pedaço. **Ninguém junta.** E a reclamação nº 1 do setor
não é falta de recurso — é **implantação e suporte**. Por isso o assistente de
início, que a pessoa conclui sozinha sem consultor, é tratado aqui como
funcionalidade principal, não como detalhe.

---

## As nove fundações

Nenhuma delas pode ser adicionada depois.

**F1 · Livro-razão imutável.** Não existe coluna `estoque_atual`. Saldo é a soma
de uma lista append-only de movimentos. Isso entrega de graça: histórico,
auditoria, correção por estorno em vez de exclusão, relatório que não pode
divergir do histórico, e sincronização offline sem conflito. A imutabilidade é
imposta por *trigger no banco*, não por convenção.

**F2 · Custo congelado.** Cada movimento guarda o custo do instante. Mudar o
preço do açúcar em março não pode reescrever a margem de janeiro.

**F3 · Offline-first.** Câmara fria é caixa de metal e rota não tem sinal. O id
é gerado no aparelho, então reenviar a fila duas vezes é inofensivo.

**F4 · Multi-empresa desde a primeira linha.** `company_id` em toda tabela,
isolamento por RLS no servidor.

**F5 · Modularidade por chave.** Módulo desligado é **invisível**, nunca cinza —
campo bloqueado lê como cobrança disfarçada. Desligar nunca apaga dado.

**F6 · Permissão por capacidade, nunca por tela.** Papel é um pacote de
capacidades. Esconder botão é decoração, não segurança.

**F7 · "Depende" vira dado.** Cada loja e cliente carrega uma ficha de acordo
(preço, dias de entrega, aprovação, crédito, política de devolução). O sistema
não tem *o* fluxo — tem o fluxo daquele cliente.

**F8 · Colete o sinal desde já, ative a inteligência depois.** Temperatura
diária e coordenadas são guardadas desde o dia 1 mesmo sem uso: histórico não se
cria retroativamente.

**F9 · Dinheiro em centavos inteiros.** Nunca float.

---

## O assistente

O dono da fábrica não deveria precisar aprender a navegar — ele pergunta. O
Modo Conversa é outra porta para a mesma casa: mesmos dados, mesmas permissões,
mesmas ações.

Três regras o mantêm confiável, e todas as três são testadas:

1. **Ele nunca produz um número.** A frase escolhe a consulta, o motor
   determinístico calcula, e a resposta é montada em volta do que o motor
   devolveu. Quando o modelo de linguagem entrar, ele vai mapear a pergunta para
   uma habilidade e seus campos — nada mais. Intérprete, nunca contador.
2. **Ele nunca escreve no livro-razão.** Uma frase que registraria algo preenche
   uma ficha em português e espera confirmação humana. Se entendeu errado, isso
   aparece antes de gravar, não meses depois num relatório.
3. **A trava de permissão está na consulta, não numa instrução ao modelo.**
   Modelo instruído a guardar segredo acaba contando; consulta que nunca
   devolveu o número não tem o que vazar.

Ele também funciona offline, porque reconhecer as perguntas que se repetem é
aritmética sobre texto — e câmara fria não tem sinal.

## Design

**Cor é acento, nunca superfície.** Oito ambientes pastéis (um por área) apontam
*onde você está*; quatro sinais saturados dizem *o que está acontecendo*. As duas
famílias nunca se misturam, separadas por saturação e função. A cor da área
aparece em exatamente quatro lugares: o filete de 3 px do card, o ícone do topo,
o botão principal e o traço de um gráfico.

**A vida vem do movimento.** Nada pisca; a pulsação corre entre 2,6 e 3,2 s. No
máximo dois elementos animados por tela. Só pulsa o que está vivo de verdade —
pulso ao lado de número parado é mentira visual. `prefers-reduced-motion`
desliga tudo e a tela continua completa.

**Acessibilidade cognitiva tem precedência sobre estética.** Ícone nunca
sozinho · uma ação principal por tela, com verbo · confirmação em português
natural com os dados por extenso · **cor nunca vem sozinha, sempre com a
palavra** · corpo em 17 pt, um passo acima do padrão de mercado, porque isto é
lido em galpão sob luz ruim.

**Tipografia: IBM Plex Sans + IBM Plex Mono.** Escolha técnica, não estética —
números tabulares (senão a coluna de valor dança ao atualizar) e uma
monoespaçada irmã na qual `0` e `O`, `1` e `l` não se confundem. Alguém vai
digitar códigos de lote com luva, no frio, com a etiqueta molhada.

---

## Rodando

```bash
npm install
npx expo start
```

Verificação:

```bash
npm run typecheck   # tipos
npm test            # o motor de custo, incluindo a cadeia nota → receita → produto
npm run db:verify   # sobe um Postgres descartável e prova o que o esquema promete
```

---

## Estrutura

```
app/                    rotas (Expo Router)
src/config/brand.ts     nome, marca e deep link — ponto único
src/theme/              tokens e provedor de tema
src/domain/             livro-razão, dinheiro, receita, custo médio, embalagem
src/data/               SQLite local e o caminho único de consulta
src/assistant/          habilidades, permissão e a ficha de confirmação
src/components/         Card, Chip, Button, UnitStepper, PulseDot, CountUp…
src/i18n/               pt-BR · es · en, com moeda e data por locale
supabase/migrations/    esquema versionado (não aplicado a nenhum projeto)
```

O nome da marca vive só em `src/config/brand.ts` e em `app.json`. Trocar de
marca é uma edição de arquivo, não uma refatoração — decisão deliberada,
enquanto a busca de marca no INPI ainda está pendente.

---

## O que falta e depende de decisão humana

- **Registro formal da marca no INPI.** A busca prévia foi feita e voltou
  verde para o Brasil; o depósito continua sendo ato do titular. A consulta não
  é automatizável: o INPI exige login gov.br e a base da WIPO tem CAPTCHA.
- **Projeto Supabase.** As migrações estão prontas; aplicá-las exige uma conta.
- **Conta Expo/EAS** para build e atualização OTA.
- **Domínio.**

---

## Licença

Proprietário. Todos os direitos reservados.

---

## Idiomas

As telas leem cada palavra de `src/i18n/locales/`, em **pt-BR, espanhol e
inglês**. O tipo `Widen<T>` faz a estrutura ser verificada e a redação ser
livre: acrescentar uma chave em português quebra a compilação das outras duas
até serem escritas. Não existe caminho em que uma tela chegue ao aparelho com
tradução faltando.

O idioma é propriedade da **empresa**, não do aparelho — uma fábrica brasileira
cujo dono lê em inglês continua rodando em português no chão de fábrica. Quem
decide isso é `src/i18n/useLocale.ts`, num lugar só.

**O assistente ainda é só português**, e isso é fronteira, não descuido: o que
ele reconhece são frases em português. Traduzir as respostas seria meio
trabalho — as perguntas continuariam chegando num idioma só. Quando o modelo de
linguagem fizer o reconhecimento, o idioma da pergunta deixa de ser problema do
casador, e as respostas vão para o dicionário na mesma mudança.

---

## Rodando na web

O mesmo código roda no navegador, o que é útil para ver o aplicativo sem
instalar nada:

```bash
npx expo export --platform web
```

Duas configurações fazem isso funcionar e não são opcionais:

- `metro.config.js` trata `.wasm` como asset. O `expo-sqlite` roda no navegador
  através de uma compilação WebAssembly do SQLite, e sem isso o banco não existe.
- O servidor precisa mandar `Cross-Origin-Opener-Policy: same-origin` e
  `Cross-Origin-Embedder-Policy: require-corp`. Sem isolamento de origem o
  navegador recusa `SharedArrayBuffer` e o banco não abre. O `vercel.json` já
  manda esses cabeçalhos.

Os dados ficam **no navegador de quem abre**, não num servidor — é o mesmo
desenho offline-first do aplicativo.

### Testes

```bash
npm run typecheck
npm run lint
npm test        # motor de custo, dados e assistente
npm run e2e     # o aplicativo dirigido num navegador de verdade
npm run db:verify
bash .proofgate/verify.sh   # o portão de entrega, sobre o diff
```

O `e2e` existe porque três bugs passaram por toda a bateria de testes unitários
e só apareceram quando o aplicativo foi aberto de fato: uma caixa de confirmação
que não existe na web (e portanto nada era gravado), rotas que abriam num banco
vazio, e uma tela falando dois idiomas ao mesmo tempo. Nenhum deles é visível de
dentro de um módulo.
