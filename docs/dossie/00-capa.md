# NORVA — Dossiê completo do produto

**O que é este documento.** O repositório que gerou este texto vai ser apagado. Este é o
registro que sobrevive: tudo que o produto NORVA é — a ideia, as regras, o modelo de dados,
cada tela, cada cálculo, cada decisão do dono, cada armadilha já paga com tempo — escrito de
forma que alguém possa **reconstruir o produto do zero sem ter o código na frente**.

Não é um resumo. É o inventário. Onde o código dizia "R$ 12,40/kg é 1,24 centavo por grama",
o dossiê repete o número. Onde uma migração criava um `CHECK`, o dossiê transcreve a expressão.
Onde uma decisão foi tomada por um motivo que ninguém mais lembraria, o motivo está escrito
junto.

**Como ler.** As seções são independentes e ordenadas de fora para dentro: produto e fundações
(1–2), tipos e regras de negócio (3–6), banco (7–10), camada de dados e sincronia (11–14),
apresentação (15–21), inteligência (22–23), verificação (24–27), estado do projeto (28–29),
aprendizados (30–31), design (32) e processo (33). A seção 34 é a única opinativa: o que
reaproveitar e o que fazer diferente ao recomeçar.

**Convenções.**

- Referências a arquivos aparecem como `caminho/arquivo.ts:linha` — são ponteiros para o
  repositório original, úteis se ele existir em algum lugar (um clone, um PR, um backup).
- Onde o código não respondia, está escrito **NÃO ESTÁ NO CÓDIGO** ou **NÃO IMPLEMENTADO**.
  Isso é informação, não falha do dossiê: distingue o que o produto faz do que ele prometia.
- Três estados aparecem marcados ao longo do texto: **implementado e usado por uma tela**,
  **implementado sem chamador** (existe a função, nenhuma tela chama), e **planejado**.
  A distinção importa: o repositório tinha peças das três categorias, e confundi-las foi um
  erro repetido.

---

## O repositório em números

Medido no commit `77b4f30`, o último antes deste dossiê.

| | |
|---|---|
| Commits | 296, entre 31 de agosto e 4 de setembro de 2026 |
| Linhas de código e documentação | ~57.000 (fora `package-lock.json`, `android/`, `ios/`) |
| Telas (rotas do Expo Router) | 24 |
| Componentes de interface | 26 |
| Módulos de domínio | 16 |
| Arquivos de teste | 42 (338 testes verdes no último commit) |
| Migrações do servidor (Postgres) | 32, append-only |
| Migrações do aparelho (SQLite) | 17 passos, append-only |
| Guards da proofgate | 25 |
| Esboços de design (HTML) | 38, mais o gerador em Python |
| Idiomas | 3 (pt-BR, en, es), obrigatórios por tipo |

Distribuição por área, em linhas:

| Área | Linhas | O que é |
|---|---|---|
| `app/` | 11.092 | as 24 telas |
| `src/data/` | 10.691 | banco do aparelho, repositório, semente, fila de saída |
| `docs/` | 10.359 | insights, roadmap, auditoria, linguagem, esboços |
| `src/domain/` | 4.466 | as regras puras: dinheiro, medida, razão, custo, receita, lote, acesso |
| `src/i18n/` | 3.997 | os três dicionários e o mecanismo que obriga os três |
| `src/components/` | 3.621 | a biblioteca de interface, incluindo os desenhos SVG |
| `scripts/` | 3.256 | mutação, capturas, folha, sessão de aparelho |
| `src/assistant/` | 2.256 | a inteligência determinística |
| `supabase/migrations/` | 2.251 | o esquema do servidor |
| `e2e/` | 2.037 | o aplicativo dirigido num navegador de verdade |
| `.proofgate/` | 1.568 | o portão de entrega |
| `src/sync/` | 1.490 | aparelho ↔ servidor |
| `src/home/` | 1.151 | o mosaico da capa |
| `src/theme/` | 890 | peles, esquemas, tokens |
| `src/notify/` | 632 | avisos locais |
| `src/weather/` | 520 | clima |

## A stack, com as versões que rodavam

Aplicativo React Native sobre Expo, com banco local em SQLite e servidor em Postgres
gerenciado (Supabase). O mesmo código roda como aplicativo Android e como página web — e a
página web era o único jeito de dirigir o aplicativo automaticamente neste ambiente.

**Produção:** `expo ~57.0.18` · `react-native 0.86.3` · `react 19.2.3` · `expo-router ~57.0.17`
· `expo-sqlite ~57.0.2` · `expo-notifications ~57.0.16` · `expo-updates ~57.0.19` ·
`expo-localization ~57.0.1` · `expo-haptics ~57.0.2` · `expo-linking ~57.0.8` ·
`expo-constants ~57.0.16` · `@expo/metro-runtime ~57.0.14` ·
`@react-native-async-storage/async-storage 2.2.0` · `react-native-reanimated 4.5.1` ·
`react-native-svg ^15.15.4` · `react-native-gesture-handler ~2.32.0` ·
`react-native-safe-area-context ~5.7.0` · `react-native-screens ~4.26.0` ·
`react-native-web ^0.21.2` · `react-dom 19.2.3` · `qrcode ^1.5.4`

**Desenvolvimento:** `typescript ~6.0.3` · `tsx ^4.23.13` (roda os testes com o `--test` do
Node, sem framework) · `playwright ^1.56.0` (e2e e capturas) · `eslint ^9` com
`eslint-config-expo ~57.0.2` · `babel-preset-expo ^57.0.9` · `@types/node ^26.4.0` ·
`@types/react ~19.2.2` · `@types/qrcode ^1.5.6`

**Nenhum framework de teste.** Os 338 testes rodam no `node:test` via `tsx`. Foi decisão:
menos uma dependência que envelhece, e a saída é legível sem aprender uma ferramenta.

**Comandos** (`package.json`):

| Comando | O que faz |
|---|---|
| `npm start` / `android` / `ios` / `web` | `expo start` nas quatro formas |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` |
| `npm test` | `tsx --test 'src/**/*.test.ts'` |
| `npm run db:verify` | `bash scripts/verify-migrations.sh` — Postgres descartável, 13 garantias |
| `npm run e2e` | `node e2e/flow.mjs` — o app num navegador de verdade |
| `npm run e2e:fast` | `node scripts/e2e-parallel.mjs` — as mesmas checagens em quatro fatias |
| `npm run mutate` | `node scripts/mutate.mjs` — quebra o código de propósito |
| `npm run shot` | `node scripts/shot.mjs` — capturas de tela nos dois esquemas |
| `npm run folha` | `node scripts/folha.mjs` — a folha de referência visual |
| `npm run dossie` | `node scripts/dossie.mjs` — monta `docs/DOSSIE.md` a partir das seções de `docs/dossie/` |

---
