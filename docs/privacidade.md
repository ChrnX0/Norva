# Política de privacidade — RASCUNHO, derivado do código

> **Este arquivo é rascunho e não está publicado.** Ele foi escrito lendo o que o
> aplicativo de fato manda e não manda, arquivo por arquivo, para o dono aprovar, hospedar
> numa URL e assinar em nome da empresa. **Quem assina é ele; quem mede é o código.**
>
> A regra que este documento segue: **nenhuma frase aqui é sobre intenção.** Cada uma tem o
> arquivo que a sustenta ao lado, e no dia em que o código mandar mais coisa, a frase fica
> falsa e tem de mudar junto — do mesmo jeito que o plano tem guarda contra envelhecer.

## O que sai do aparelho

**1. O dado da fábrica, para o servidor da própria empresa.**
`src/sync/supabase.ts` monta o cliente e **devolve nulo quando não há servidor
configurado** — o aplicativo inteiro funciona assim, e essa é a decisão do dono (*"o
servidor sobe o mais tarde possível"*). Havendo conta, a fila (`src/data/outbox.ts`) sobe
as linhas do razão: movimentos, itens, receitas, produtos, compras, lugares, pessoas,
pedidos e lotes. O destino é o projeto Supabase **da própria empresa**, e a separação é
imposta no servidor por RLS sobre `company_id`, não por confiança no aplicativo.

**2. A cidade, para a previsão do tempo.**
`src/weather/index.ts` chama `api.open-meteo.com` e `geocoding-api.open-meteo.com`. O que
viaja é **coordenada ou nome de cidade** — nunca dado da fábrica, nunca dinheiro, nunca
nome de pessoa. A previsão é guardada por 180 minutos antes de perguntar de novo.

**3. A cópia de segurança, quando o dono liga.**
`src/nuvem/drive.ts` envia o arquivo de cópia para a pasta `appDataFolder` do **Google
Drive do próprio usuário** — uma pasta que só este aplicativo enxerga, e que o Google não
mostra ao dono na interface do Drive. Não há servidor nosso no caminho. **A cópia contém o
razão inteiro, com custo e fornecedor dentro.**

**4. Nada mais.**
Não há analytics. Não há rastreador de terceiros. Não há notificação push (os avisos são
agendados **no próprio aparelho**, `src/notify/gatilho.ts`). As atualizações pelo ar estão
**desligadas** (`app.json`, `updates.enabled: false`). O backup automático do Android está
**desligado** (`android:allowBackup="false"`), então o sistema não copia o banco para a
conta Google sem alguém pedir.

## O que fica só no aparelho

O banco inteiro é SQLite local (`src/data/db.ts`). Sem conta configurada, **nada sai** — e
esse é um estado legítimo e suportado, não um aplicativo pela metade. As fotos de cadastro
ficam no armazenamento do aparelho, por decisão do dono (*"começa simples, pelo celular"*).

## Quem entra

A conta autentica **o sistema, não a pessoa** (decisão registrada): o e-mail é da empresa,
e quem estava operando é anotação do registro, escolhida na hora. Quem entra pela grade de
nomes com PIN **não tem conta de autenticação nenhuma**.

## Apagar

O Reset existe, é do administrador, e passa por **duas confirmações** — a segunda explica o
que o registro é e o que se perde com ele. No aparelho o apagamento é imediato; no servidor
o prazo padrão da empresa é de **10 dias corridos**, e os extremos existem como
configuração (zero destrói no ato, "nunca" guarda o livro fechado para sempre).

## O que este rascunho NÃO decide, porque é do dono

- a URL onde ele fica hospedado, e quem assina;
- o texto de **Data Safety** da Google Play, que é a mesma informação noutro formulário;
- a base legal da LGPD para cada uso, e o encarregado;
- se o clima continua na versão de loja — **a Open-Meteo é licença não comercial**, e isso
  é decisão de produto, não de engenharia (o ponto de troca é uma constante:
  `FORECAST_URL`, `src/weather/index.ts`).
