---
name: catalogo-interativo
description: Gera um catálogo interativo completo (HTML único) com mini-admin, carrinho e checkout via WhatsApp
triggers:
  - "criar catálogo"
  - "catálogo interativo"
  - "catálogo com admin"
  - "catálogo de produtos"
  - "catálogo de serviços"
  - "página de catálogo"
  - "site de catálogo"
  - "mini-site com carrinho"
output:
  - arquivo HTML único salvo em workspace/public/marketing/
  - link público via /api/marketing/public-base-url
---

# Skill: Catálogo Interativo

Gera um arquivo HTML único, autocontido, com:

- **Página pública**: listagem de produtos/serviços com preço, ícone, descrição e botão "Adicionar"
- **Carrinho flutuante**: drawer lateral com qtd por item, total calculado
- **Checkout WhatsApp**: mensagem estruturada com itens, quantidades, subtotais e total enviada para o número da empresa
- **Botão "Sugerir alteração"**: modal com 4 opções predefinidas → WhatsApp
- **Mini-admin** (PIN numérico, padrão `1234`): acesso via `#admin` na URL
  - CRUD de produtos/serviços (nome, descrição, preço, ícone, disponível/indisponível)
  - Configuração da empresa (nome, WhatsApp, tagline, promoção com countdown)
  - Alterar PIN
  - Exportar/Importar JSON
- **Sincronização servidor**: salva em `workspace/public/marketing/catalog-data.json` via `PUT /api/marketing/catalog-data`; carrega desse JSON no início (localStorage como fallback offline)

## Como usar esta skill

1. Obter dados da empresa em `memory/empresa.md` e `memory/marca.md`
2. Obter lista de produtos/serviços do contexto ou pedir ao solicitante
3. Gerar o HTML baseado no template abaixo, substituindo os dados de DEFAULT_DATA
4. Salvar em `workspace/public/marketing/<slug-empresa>/index.html`
5. Chamar `GET /api/marketing/public-base-url` para obter a base URL
6. Retornar o link público: `<base_url>/public/marketing/<slug-empresa>/index.html`
7. Informar: arquivo salvo, link público, PIN admin padrão (1234), instrução para trocar o PIN

## Paleta de design

O template usa Playfair Display + DM Sans. Adapte a paleta de cores ao `memory/marca.md`:

- Cores padrão (wellness/beleza): terracota `#A0674A`, creme `#F7EDE0`, areia `#C9A882`
- Para varejo/moda: use azul-marinho + off-white + dourado
- Para alimentação: use verde-escuro + laranja + branco
- Para tecnologia: use cinza escuro + azul elétrico + branco

Mantenha sempre:
- Tipografia serif para títulos e sans-serif para corpo
- Grain overlay sutil (SVG noise)
- Transições CSS suaves (0.25s cubic-bezier)
- Responsivo: max-width 680px centrado no mobile

## Campos obrigatórios em DEFAULT_DATA

```json
{
  "empresa": {
    "nome": "Nome da empresa",
    "tagline": "Slogan curto",
    "whatsapp": "5511999999999",
    "endereco": "Rua, número — Cidade - UF",
    "instagram": "@handle",
    "email": "contato@empresa.com.br",
    "cnpj": "00.000.000/0001-00",
    "promo_texto": "",
    "promo_expira": ""
  },
  "produtos": [
    {
      "id": "1",
      "nome": "Nome do produto",
      "descricao": "Descrição em 2-3 frases",
      "preco": 100,
      "icone": "✦",
      "disponivel": true
    }
  ]
}
```

## O que informar ao entregar

- "Catálogo gerado e salvo em `workspace/public/marketing/<slug>/index.html`"
- "Link público: `<url>`"
- "Admin: acesse `<url>#admin` com PIN `1234` — troque o PIN na primeira entrada"
- "Dados sincronizados via servidor; qualquer edição no admin é salva automaticamente"
- Se houver PENDENCIAS (campos vazios em empresa.md), listar o que falta sem inventar
