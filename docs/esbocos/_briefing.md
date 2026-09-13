# Briefing dos esboços — leia antes de escrever

Você desenha UMA tela: a capa (briefing) do NORVA, sistema de uma fábrica de
picolés. Arquivo HTML único, sem JS, sem rede, sem fonte externa (a máquina que
fotografa não tem internet — Google Fonts NÃO carrega). Só CSS e SVG inline.

## Tamanho e forma
- `body { width: 412px; min-height: 915px; }` — é um celular.
- A barra de abas fica fixa embaixo, 78px de altura, e **tem os ícones de
  verdade** (o snippet está em `_tabbar.html`, cole e ajuste só as cores).
- Deixe ~110px de respiro no fim do conteúdo para a barra não cobrir nada.

## O dado é sempre este, e não se inventa outro
- Produção de hoje: **500 unidades**. Ontem: **478**. Contra a quarta passada: **+19**.
- Semana (7 colunas, da mais velha para hoje, altura relativa): 38% 44% 41% 6% 82% 46% **64% (hoje)**.
  Rótulos: Q S S D S T Q (ou qui sex sáb dom seg ter qua).
- Insumo acabando: **Polpa de morango, acaba em 1 dia**.
- Expedição: **1 caixa saiu hoje**.
- Preços que mexeram: Polpa de morango ▼0,6% · Açúcar cristal ▼2,2% · Glucose 38DE ▲0,9%.
- Clima **São Paulo: 21°**, mínima 13°, **47% de chance de chuva**, amanhã **+4°**.
- Data: quarta-feira, 2 de setembro.
- Marca: **NORVA**.

## Regras que não se quebram
- **Nada de botão "Lançar produção" na capa** — o dono mandou tirar; a aba
  Produção já é essa porta.
- O clima aparece em TODAS as telas, com destaque próprio.
- Todo número tem sua comparação do lado (500 nunca aparece sozinho).
- Nada de foto: o que parecer imagem é desenhado em SVG/CSS.
- Português do Brasil, tom curto e direto.

## O que o dono pediu explicitamente
- **Mais ícones e imagens na tela** — foi a crítica principal.
- **Menos monocromático** onde a família for escura/neutra.
- Que cada variante seja **claramente diferente das outras duas** da mesma
  família: não mude só a cor, mude a ESTRUTURA (o que é grande, o que divide
  linha, o que vira lista, o que vira bloco).
