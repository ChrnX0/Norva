# NORVA

**Português** · [English](docs/README.en.md) · [Español](docs/README.es.md)

Sistema de gestão para quem **fabrica e distribui**: da receita ao custo real, da
produção ao lote, da câmara fria à loja, e do que saiu ao lucro que deveria ter
saído.

Nasce para uma fábrica de picolés e sorvetes, mas sem nenhuma regra chumbada de
sorvete — a hierarquia de embalagem, os módulos e os papéis são todos
configuráveis, porque o produto será publicado nas lojas Android e Apple.

> **Estado: Fase 0 — Alicerce.** O que está aqui é a fundação: livro-razão,
> multi-empresa, permissão por capacidade, design system e i18n. Ainda não há
> telas de produto.

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
npm run typecheck
```

---

## Estrutura

```
app/                    rotas (Expo Router)
src/config/brand.ts     nome, marca e deep link — ponto único
src/theme/              tokens e provedor de tema
src/domain/             livro-razão, dinheiro, hierarquia de embalagem
src/components/         Card, Chip, Button, UnitStepper, PulseDot, CountUp…
src/i18n/               pt-BR · es · en, com moeda e data por locale
supabase/migrations/    esquema versionado (não aplicado a nenhum projeto)
```

O nome da marca vive só em `src/config/brand.ts` e em `app.json`. Trocar de
marca é uma edição de arquivo, não uma refatoração — decisão deliberada,
enquanto a busca de marca no INPI ainda está pendente.

---

## O que falta e depende de decisão humana

- **Busca de marca (INPI classes 9 e 42).** Não automatizável: o INPI exige
  login gov.br e a base da WIPO tem CAPTCHA.
- **Projeto Supabase.** As migrações estão prontas; aplicá-las exige uma conta.
- **Conta Expo/EAS** para build e atualização OTA.
- **Domínio.**

---

## Licença

Proprietário. Todos os direitos reservados.
