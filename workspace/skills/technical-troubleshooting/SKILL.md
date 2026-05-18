---
name: technical-troubleshooting
description: Conduzir triagem técnica de problemas reportados por usuários do produto — coletar contexto estruturado (sistema, versão, mensagem de erro, passos para reproduzir, impacto), buscar na base de conhecimento e classificar severidade antes de escalar. Ativar quando a pessoa relatar bug, erro, falha, lentidão, comportamento inesperado ou qualquer problema com o produto/serviço.
version: 1.0.0
language: pt-br
---

# Technical Troubleshooting

## Princípios

- Coletar dados antes de hipóteses. Hipótese sem dado é chute.
- Buscar na base de conhecimento ANTES de escalar — muitos casos têm solução já documentada.
- Não pedir senha do usuário sob nenhuma hipótese.
- Não executar comandos destrutivos ou em produção sem aprovação.

## Contexto a coletar

- **Sistema**: navegador/OS/dispositivo/versão
- **Versão do produto**: build, plano, ambiente (sandbox/produção)
- **O que estava tentando fazer**: ação desejada
- **O que aconteceu**: comportamento observado
- **Mensagem de erro**: texto exato, código, screenshot
- **Passos para reproduzir**: sequência mínima
- **Quando começou**: agora, hoje, há dias
- **Impacto**: bloqueio total, parcial, cosmético; quantos usuários afetados

## Workflow

1. Acolher a pessoa e fazer 1-2 perguntas curtas para classificar o tipo de problema.
2. Coletar o contexto técnico de forma faseada — não despejar checklist completo de uma vez.
3. Sanitizar logs/prints antes de armazenar (`log-sanitizer`).
4. Buscar na base de conhecimento (`knowledge-base-resolution`):
   - Se houver solução documentada → orientar a pessoa, validar resolução, fechar caso.
   - Se não houver → escalar para engenharia com relatório completo (`bug-report-builder` + `severity-classification`).
5. Confirmar resolução antes de fechar. Se a pessoa continuar com o problema, reabrir e reclassificar.

## Exemplos

**Cenário**: "Não consigo entrar no sistema."
- ✅ "Vamos ver. Qual mensagem aparece? Em qual navegador? Acontece em outra rede também?"
- ❌ "Tente reiniciar o computador." (genérico antes de coletar contexto)

**Cenário**: "O botão de salvar não funciona."
- ✅ Coletar: qual tela, qual ação, qual navegador, mensagem de erro, console do navegador se possível.
- ❌ Já criar ticket de bug sem investigação básica.

**Cenário**: usuário cola um stack trace com tokens.
- ✅ Acionar `log-sanitizer` — mascarar tokens antes de gravar em qualquer lugar.
- ❌ Anexar log cru ao ticket.

## Encaminhamento

Encaminhar à equipe de engenharia/operações quando:
- A base de conhecimento não tem solução.
- O problema afeta vários usuários ou produção.
- Requer acesso de produção, comandos destrutivos ou rotação de credenciais → exige aprovação.
- Há suspeita de incidente de segurança → `security-incident-routing`.
