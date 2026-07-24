# Usando o MCP do storekit

O storekit expõe um servidor MCP em `POST /mcp` (Streamable HTTP, stateless).
Cada métrica ativa vira uma tool; mais `descrever_painel` e `glossario`.

## Autenticação

Se `MCP_TOKEN` está definido, envie em `Authorization: Bearer <token>` (ou `x-api-key`).
A comparação é timing-safe. Sem `MCP_TOKEN`, o endpoint fica aberto — só faça isso em
rede confiável.

## Claude Code / Claude Desktop (HTTP)

```json
{
  "mcpServers": {
    "storekit-minhaloja": {
      "type": "http",
      "url": "https://minhaloja.exemplo.com/mcp",
      "headers": { "Authorization": "Bearer SEU_MCP_TOKEN" }
    }
  }
}
```

## Tools

- `kpis`, `vendas_diarias`, `vendas_por_canal`, `mais_vendidos`, `catalogo`, `status_sync` — núcleo.
- `comparar_periodos`, `margem_por_produto`, `previsao_ruptura`, `vendas_por_origem`,
  `ltv_coortes`, `qualidade_dado`, `metas`, `busca_produtos` — quando os dados existem.
- `descrever_painel` — dicionário de dados (chame antes de interpretar um valor).
- `glossario` — fórmula de cada métrica.

Regra do servidor: nunca inventar número. Tool vazia = não há dado no período.
Métrica ausente = a integração dela não está conectada.
