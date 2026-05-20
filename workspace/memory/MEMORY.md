# MEMORY

Esta memória organiza informações úteis da empresa. Não salvar conversa inteira.

## Regras
- Salvar apenas informação útil.
- Não salvar dados sensíveis desnecessários.
- Sempre que possível, registrar data e fonte.
- Se a informação for oficial, marcar como validada.
- Se a informação for incerta, marcar como pendente.
- Se houver conflito entre memória antiga e informação nova, pedir confirmação ao dono.
- Nenhum agente deve inventar informação ausente na memória.
- Se faltar informação importante, chamar Rafael ou Atendimento Humano.

## Retenção de dados
Ver política completa em `config/privacy-policy.md` (seção 3).

Resumo:
- leads.md: arquivar após 12 meses sem interação.
- atendimentos.md: arquivar após 24 meses.
- clientes.md: arquivar 12 meses após fim da relação comercial.
- vendas.md: arquivar após 5 anos (obrigação fiscal).
- suporte.md: arquivar após 24 meses.
- humano.md: arquivar após 36 meses.

## Formato obrigatório de registro
Todo registro novo deve incluir:
```
id: [identificador único, ex: ATD-20260520-001]
data: [YYYY-MM-DD]
fonte: [agente ou humano que registrou]
status: validado | pendente
expira_em: [YYYY-MM-DD ou "permanente"]
informacao: [conteúdo resumido]
observacao: [opcional]
```

## Arquivos de memória
- Empresa: empresa.md
- Canais autorizados: canais-autorizados.md
- Clientes: clientes.md
- Leads: leads.md
- FAQ: faq.md
- Atendimentos: atendimentos.md
- Vendas: vendas.md
- Suporte: suporte.md
- Decisões humanas: humano.md
- Melhorias: melhorias.md

## Uso obrigatório
Todos os agentes devem consultar a memória antes de responder sobre:

- empresa;
- produtos ou serviços;
- preço;
- prazo;
- desconto;
- disponibilidade;
- clientes;
- leads;
- histórico de atendimento;
- suporte;
- regras internas;
- canais autorizados.

Se a informação não estiver validada, o agente deve dizer que vai confirmar e encaminhar para Rafael ou Atendimento Humano.

