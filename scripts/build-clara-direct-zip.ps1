#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Gera um ZIP do template "Clara atende direto" pra upload via admin SaaS.

.DESCRIPTION
    Variação do baseline-workspace pra clientes que NÃO precisam passar pela
    fase de discovery com a Sofia — o admin cadastra os dados manualmente
    (ou via planilha externa) ANTES de provisionar e o tenant nasce com:

      - active_profile = "tenant" (painel completo desde o boot, sem WaitingScreen
        nem chat-only-Sofia)
      - memory/empresa.md com placeholders <EDITAR PELO ADMIN> ao invés de
        campos vazios → detector de onboarding NÃO ativa Sofia override
      - Rafael (main) como default agent desde o início
      - Clara/Luna/Marcos/Camila/Lia/Catarina/Operador/QA-Tester todos
        disponíveis via dispatch rules normais (panel + pico)

    Use quando:
      - Cliente já passou por discovery em outro canal (planilha, ligação,
        formulário próprio) e admin tem todos os dados em mãos
      - Você quer pular a "experiência guiada" da Sofia
      - O tenant é interno (operação Jotaduo, não cliente externo)

    Saída:
      output/clara-direct-<timestamp>.zip

    Como subir no admin:
      adm.jotaduo.com/workspaces → [Upload (.zip)] → seleciona o arquivo
      → nome "Clara atende direto" → slug "clara-direct"
      → Cria. Marca is_available_manual=true pra aparecer no dropdown
      "Novo tenant" do admin.

.EXAMPLE
    pwsh scripts/build-clara-direct-zip.ps1

.NOTES
    O script lê o baseline embarcado em
    internal/saas/api/baseline-workspace/ — então pra atualizar o template,
    edite o baseline e re-rode o script.
#>

param(
    [string]$RepoRoot = "$PSScriptRoot/..",
    [string]$OutputDir = "$PSScriptRoot/../output"
)

$ErrorActionPreference = "Stop"

# 1. Localizar paths
$repo = (Resolve-Path $RepoRoot).Path
$baseline = Join-Path $repo "internal\saas\api\baseline-workspace"
if (-not (Test-Path $baseline)) {
    throw "Baseline workspace não encontrado em $baseline"
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$outDir = (Resolve-Path $OutputDir).Path

# 2. Stage temp com layout home/ canônico
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$staging = Join-Path $env:TEMP "clara-direct-stage-$stamp"
if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
New-Item -ItemType Directory -Force -Path $staging | Out-Null

# Tudo do baseline vira home/ no ZIP. O baseline já tem layout
# home/-shape (config.json + workspace/ + agents/ + memory/ + skills/),
# só falta envolver em pasta "home/".
$homeDir = Join-Path $staging "home"
New-Item -ItemType Directory -Force -Path $homeDir | Out-Null
Copy-Item -Recurse -Force "$baseline\*" -Destination $homeDir
# Remove README.md interno (não é conteúdo do tenant)
Remove-Item -Force "$homeDir\README.md" -ErrorAction SilentlyContinue
# Remove .gitkeep stubs
Get-ChildItem -Recurse -File -Filter ".gitkeep" $homeDir | Remove-Item -Force

Write-Host "[1/4] Baseline copiado pra $homeDir" -ForegroundColor Cyan

# 3. Override 1: ui-visibility.json com active_profile=tenant
$uiPath = Join-Path $homeDir "ui-visibility.json"
@'
{
  "version": 1,
  "source": "clara-direct",
  "active_profile": "tenant",
  "default_profile": "tenant",
  "default_visibility": true,
  "profiles": {}
}
'@ | Set-Content -Path $uiPath -Encoding UTF8 -NoNewline
Write-Host "[2/4] ui-visibility.json → active_profile=tenant" -ForegroundColor Cyan

# 4. Override 2: empresa.md com placeholders preenchidos (admin edita rápido)
# Importante: detector de Sofia override considera empresa.md "incompleto"
# quando Nome:/Segmento: estão vazios OU quando "Status: pendente de validação"
# aparece. Preenchendo com placeholders genéricos + Status validado, o
# override NÃO ativa → Rafael (main, default) atende desde o boot.
$empresaPath = Join-Path $homeDir "workspace\memory\empresa.md"
@'
# Memória da empresa

Nome: <EDITAR PELO ADMIN>
Segmento: <EDITAR — saude/alimentacao/varejo/servicos/beleza/educacao/imobiliaria>
Descrição: <EDITAR — 1 frase sobre o negócio>
Produtos ou serviços: <EDITAR — lista>
Horário: <EDITAR — ex: seg-sex 9-18h>
Endereço: <EDITAR — cidade ou "atendimento online">
Regiões atendidas: <EDITAR>
WhatsApp: <EDITAR — número Business>
Email: <EDITAR — contato do dono>
Instagram:
Site:
Formas de pagamento: <EDITAR — Pix, cartão, etc>
Pode falar preço: <EDITAR — pode informar | só faixa | nunca>
Faixa de preço: <EDITAR — se aplicável>
Quando chamar humano: <EDITAR — regras de escalation>
Informações que nunca podem ser inventadas: <EDITAR>
Informações proibidas de falar: <EDITAR>
Segmento detectado: <EDITAR — mesma chave do Segmento>
Status da informação: configurado pelo admin via painel

## Cadastro da empresa — configurado externamente

Este tenant foi criado a partir do template "Clara atende direto".
O admin populou os campos acima ANTES de provisionar — não houve
fase de discovery com a Sofia.

Pra ativar a equipe completa de atendimento:
1. Edite os campos acima substituindo todos os <EDITAR ...>
2. (Opcional) Adicione campos específicos do segmento (ex: Canal
   de agendamento, Especialidades, Convênios aceitos pra saúde)
3. Quando satisfeito, considere rodar a skill `tenant-liberation/
   validate_workspace.py` pra checar prontidão antes de divulgar
   o número WhatsApp pro público.

## Pendências sinalizadas pro dono resolver

<EDITAR — integrações externas que o admin já mapeou>
'@ | Set-Content -Path $empresaPath -Encoding UTF8 -NoNewline
Write-Host "[3/4] empresa.md → placeholders <EDITAR> + Status configurado" -ForegroundColor Cyan

# 5. Sanity check: arquivos obrigatórios
$required = @(
    "home\config.json",
    "home\.security.yml",
    "home\workspace\AGENT.md"
)
foreach ($rel in $required) {
    $full = Join-Path $staging $rel
    if (-not (Test-Path $full)) {
        throw "FAIL: arquivo obrigatório ausente no staging: $rel"
    }
}

# 6. ZIP
$zipPath = Join-Path $outDir "clara-direct-$stamp.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path "$staging\*" -DestinationPath $zipPath -CompressionLevel Optimal

# Cleanup staging
Remove-Item -Recurse -Force $staging

$zipSize = (Get-Item $zipPath).Length / 1KB
Write-Host "[4/4] ZIP gerado:" -ForegroundColor Green
Write-Host "       $zipPath" -ForegroundColor Green
Write-Host "       Tamanho: $([Math]::Round($zipSize, 1)) KB" -ForegroundColor Green
Write-Host ""
Write-Host "Próximo passo:" -ForegroundColor Yellow
Write-Host "  1. Abre adm.jotaduo.com/workspaces" -ForegroundColor Yellow
Write-Host "  2. Clica [Upload (.zip)]" -ForegroundColor Yellow
Write-Host "  3. Seleciona o arquivo acima" -ForegroundColor Yellow
Write-Host "  4. Nome: 'Clara atende direto'  Slug: 'clara-direct'" -ForegroundColor Yellow
Write-Host "  5. is_available_manual=true (default), is_default_auto=false" -ForegroundColor Yellow
Write-Host "  6. Cria. Aparece no dropdown 'Novo tenant'." -ForegroundColor Yellow
