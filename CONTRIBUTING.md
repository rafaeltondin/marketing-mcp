# Contribuindo com o storekit

## Princípio inegociável

**Um fato, uma fonte; uma métrica, uma implementação.** Nunca escreva uma segunda
query que calcula algo que uma métrica já calcula. Se precisa do mesmo número em
outro lugar, ele já está exposto por REST, MCP e glossário a partir da mesma
definição. Divergência entre painel e agente é o bug que este projeto existe para matar.

## Rodar localmente

```bash
npm ci
npm run genkeys > .env.local && export $(grep -v '^#' .env.local | xargs)
DATA_DIR=./data node src/main.js
npm test          # node --test
npm run lint
```

## Criar um conector

Um conector é um arquivo em `src/connectors/<nome>.js` com `export default`:

```js
export default {
  name: 'meu',                         // id único, minúsculo
  label: 'Meu Serviço',
  auth: { kind: 'apikey' },            // 'apikey' | 'oauth2'
  setup: { /* campos do wizard */ },
  async validate(ctx) { /* UMA chamada real; lança se falhar */ },
  describeTables() { return [{ tabela, origem, chave, descricao }]; },
  jobs: [
    { name: 'x', schedule: '*/15 * * * *', run: async (ctx, { modo }) => ({ registros }) },
    { name: 'y', after: 'x', run: syncY },   // roda só se x deu ok no fluxo automático
  ],
};
```

`ctx` traz: `db`, `config`, `cripto`, `cofre`, `log`, `cred()`, `lerCursor()`,
`gravarCursor()`. **Erro nunca destrói o cursor** — grave `null` com status `error`.
O `INSERT` deve ser idempotente (`ON CONFLICT ... DO UPDATE`).

Os testes de contrato (`test/contrato.test.js`) validam automaticamente todo conector
registrado — você herda a suíte sem escrever teste. Adicione um teste específico só
para a lógica particular do seu conector.

## Criar uma métrica

Um objeto em `src/metrics/<dominio>.js`:

```js
{
  key: 'minha_metrica',
  title: 'Título',
  descricao: 'O que retorna (vira a descrição da tool MCP).',
  params: { periodo: true, limite: { tipo: 'number', padrao: 20 } },
  requires: ['shopify'],               // fica indisponível se o conector não estiver conectado
  glossary: 'Fórmula em uma frase.',
  query: (db, p) => ({ /* ... */ }),   // SEMPRE usar VENDA_VALIDA/PEDIDO_PAGO/faixaDia de core/db.js
}
```

Uma definição vira rota REST (`/api/m/<key>`), tool MCP e verbete de glossário —
automaticamente. Não escreva nenhum dos três à mão.

## Migrations

Arquivo `.sql` numerado em `migrations/` (ex.: `003_minha.sql`). Aplicado uma vez,
em transação, na ordem do nome. Idempotente (`CREATE TABLE IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS`).

## Git

- Branch por tarefa; **nunca** commit direto na `main`.
- Conventional Commits em pt-BR (`feat:`, `fix:`, `chore:`, `docs:`...).
- Bump de versão (SemVer) + entrada no `CHANGELOG.md` ao mudar comportamento.
- `npm run lint` e `npm test` verdes antes de abrir PR.
