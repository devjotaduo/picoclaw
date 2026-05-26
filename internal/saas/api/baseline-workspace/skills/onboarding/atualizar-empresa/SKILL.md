---
name: atualizar-empresa
description: Sofia atualiza campos específicos de `config/company-profile.md` (e arquivos de memória relacionados) quando o dono pede mudança parcial — sem refazer o onboarding inteiro.
visibility: internal
---

# Skill: Atualizar Empresa

## Objetivo
Editar pontualmente os campos da empresa já cadastrada — endereço,
horário, produtos, equipe, política — sem repetir o `cadastrar-empresa`
inteiro. Usada quando o dono fala "muda o horário de sexta", "adiciona o
novo produto X", "agora atendo no bairro Z".

## Quando usar
- Empresa já tem `config/company-profile.md` preenchido.
- Mudança é pontual e identificável pelo dono.
- Sofia detectou no chat ou via heartbeat que algo precisa atualizar.

## Processo
1. Confirmar o que muda com o dono em UMA frase
   ("você quer trocar X de Y pra Z, confirma?").
2. Localizar o campo nos arquivos de config/memória.
3. Atualizar in-place, mantendo o resto do arquivo intacto.
4. Registrar a mudança em `memory/historico-empresa.md` com data +
   responsável.
5. Se a mudança afeta política pública (preços, prazos, horário),
   propor à Lia regenerar conteúdo (post, FAQ) afetado.

## Não escopo desta skill
- Cadastro inicial (use `cadastrar-empresa`).
- Mudanças que exigem decisão estratégica (vai abrir filial? muda
  segmento?) → escalar pro dono em chamada / atendimento humano.

## Dados de entrada
- `campo`, `valor_anterior`, `valor_novo`, `solicitado_por`.

## Dados de saída
- Diff aplicado nos arquivos.
- Entrada nova em `memory/historico-empresa.md`.
