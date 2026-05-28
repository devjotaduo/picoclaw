#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Empacota um workspace Picoclaw em ZIP validado para upload via admin SaaS.

.DESCRIPTION
    Monta um ZIP que passa em validateWorkspaceZip() do controlplane:
    POST /api/v1/workspaces/upload (internal/saas/api/workspaces_upload.go).

    O script:
      1. Detecta o layout fonte (PICOCLAW_HOME completo OU pasta workspace/ pura).
      2. Estagia em diretorio temporario seguindo o layout 'home/' canonico.
      3. Aplica a drop-list do backend (sessions/, whatsapp/, state/, *.pid, etc).
      4. Detecta secrets reais em config.json/.security.yml/behavior.json e
         opcionalmente reescreve para os placeholders ${LITELLM_KEY},
         ${LITELLM_URL}, ${TENANT_ID}.
      5. Valida arquivos obrigatorios: home/config.json, home/.security.yml,
         home/workspace/AGENT.md.
      6. Valida limites: <= 5000 arquivos, <= 50 MiB compactado, <= 200 MiB
         expandido, nenhum symlink, nenhum path traversal.
      7. Gera o ZIP em build/workspace-<slug>-<timestamp>.zip.
      8. Se -Upload for passado, faz POST multipart usando credenciais admin.

.PARAMETER SourceDir
    Diretorio fonte. Pode ser:
      - Um PICOCLAW_HOME completo (com config.json, .security.yml, workspace/);
      - Uma pasta 'workspace/' pura (sem config.json no topo); nesse caso o
        script gera stubs minimos para home/config.json e home/.security.yml
        (somente se -GenerateStubs for passado).
    Default: $env:PICOCLAW_HOME ou ./workspace.

.PARAMETER Slug
    Slug do workspace (obrigatorio se -Upload). Vira ID prefixo no DB.

.PARAMETER Name
    Display name. Default = Slug.

.PARAMETER Description
    Descricao livre.

.PARAMETER IsRaw
    Modo raw: deixa passar launcher-auth.db, sessions/, launcher_policy.json
    (so descarta .picoclaw.pid + node_modules/.git/.cache/backups).

.PARAMETER IsDefaultAuto
    Marca o workspace como default para auto-provision (DB unique).

.PARAMETER IsAvailableManual
    Aparece no dropdown manual de criacao de tenant. Default: $true.

.PARAMETER GenerateStubs
    Quando -SourceDir aponta para uma pasta workspace/ pura, gera
    home/config.json e home/.security.yml minimos com placeholders.

.PARAMETER KeepSecrets
    NAO faz rewrite de api_key/url reais para placeholders. Use somente em
    desenvolvimento local.

.PARAMETER OutputPath
    Caminho do ZIP de saida. Default: build/workspace-<slug>-<timestamp>.zip.

.PARAMETER Upload
    Faz POST multipart para o controlplane apos validar.

.PARAMETER AdminBase
    Base URL do controlplane (ex: https://admin.jotaduo.com). Default:
    $env:PICOCLAW_SAAS_ADMIN_BASE.

.PARAMETER AdminEmail / AdminPassword
    Credenciais do platform_admin. Default: $env:PICOCLAW_SAAS_ADMIN_EMAIL /
    $env:PICOCLAW_SAAS_ADMIN_PASSWORD.

.EXAMPLE
    pwsh ./scripts/build-workspace-zip.ps1 -SourceDir ./workspace -Slug atendimento-geral -GenerateStubs

.EXAMPLE
    pwsh ./scripts/build-workspace-zip.ps1 -Slug clinica -Upload `
        -AdminBase https://admin.jotaduo.com `
        -AdminEmail dev@jotaduo.com -AdminPassword (Read-Host -AsSecureString)

.EXAMPLE
    # Publish the same dev workspace as the PUBLIC onboarding tenant
    # template. -Public overlays the public-web channel + resets
    # memory/empresa.md (so the Sofia onboarding default fires for
    # anonymous visitors) + drops memory/jotaduo/ client dossiers.
    pwsh ./scripts/build-workspace-zip.ps1 -SourceDir ./workspace `
        -Slug onboarding -Name "Onboarding" -Public -Upload
#>

[CmdletBinding()]
param(
    [string]$SourceDir,
    [string]$Slug,
    [string]$Name,
    [string]$Description = "",
    [switch]$IsRaw,
    [switch]$IsDefaultAuto,
    [bool]$IsAvailableManual = $true,
    [switch]$GenerateStubs,
    [switch]$KeepSecrets,
    # Public-tenant overlay: enables the public-web channel + resets
    # memory/empresa.md (so the Sofia onboarding-default override fires)
    # + clears memory/jotaduo/ client dossiers. Use when packaging the
    # workspace for is_public=true tenant provisioning. Local dev
    # `workspace/` keeps its private state; the overlay is applied only
    # against the staging copy.
    [switch]$Public,
    [string]$OutputPath,
    [switch]$Upload,
    [string]$AdminBase = $env:PICOCLAW_SAAS_ADMIN_BASE,
    [string]$AdminEmail = $env:PICOCLAW_SAAS_ADMIN_EMAIL,
    [string]$AdminPassword = $env:PICOCLAW_SAAS_ADMIN_PASSWORD
)

$ErrorActionPreference = 'Stop'
$script:WarnCount = 0

# Constantes espelhando o backend (workspaces_upload.go)
$MAX_UPLOAD_BYTES    = 50  * 1024 * 1024
$MAX_EXTRACTED_BYTES = 200 * 1024 * 1024
$MAX_EXTRACTED_FILES = 5000

# Espelha shouldHideTenantPath() em internal/saas/api/tenants_files.go
$HIDDEN_TOP_FILES = @(
    '.picoclaw.pid',
    'launcher-auth.db',
    'launcher_policy.json',
    'litellm.key',
    '.picoclaw-admin.creds'
)
$HIDDEN_PREFIXES = @(
    'sessions/',
    'whatsapp/',
    'state/',
    'logs/',
    'runtime-user-env/',
    'backups/',
    'node_modules/',
    '.cache/',
    '.git/',
    'workspace/sessions/',
    'workspace/whatsapp/',
    'workspace/state/',
    'workspace/runtime-user-env/',
    'workspace/logs/'
)
# Modo raw (shouldDropOnRawUpload)
$RAW_HIDDEN_TOP_FILES = @('.picoclaw.pid')
$RAW_HIDDEN_PREFIXES  = @('node_modules/', '.cache/', '.git/', 'backups/')

function Write-Section($msg) { Write-Host "`n== $msg ==" -ForegroundColor Cyan }
function Write-Ok($msg)      { Write-Host "  [OK]  $msg" -ForegroundColor Green }
function Write-Warn2($msg)   { Write-Host "  [!!]  $msg" -ForegroundColor Yellow; $script:WarnCount++ }
function Write-Err2($msg)    { Write-Host "  [XX]  $msg" -ForegroundColor Red }

function Test-DropHomePath {
    param([string]$RelHome, [bool]$IsDir)
    $topFiles = if ($IsRaw) { $RAW_HIDDEN_TOP_FILES } else { $HIDDEN_TOP_FILES }
    $prefixes = if ($IsRaw) { $RAW_HIDDEN_PREFIXES } else { $HIDDEN_PREFIXES }

    if (-not $IsDir -and ($topFiles -contains $RelHome)) { return $true }
    foreach ($p in $prefixes) {
        if ($RelHome.StartsWith($p)) { return $true }
        if ($IsDir -and ($RelHome + '/') -eq $p) { return $true }
    }
    # Sempre descartar artefatos transientes de DB SQLite e locks
    if (-not $IsDir) {
        $base = Split-Path -Leaf $RelHome
        if ($base -match '\.(db-wal|db-shm|db-journal|lock|pid|sock)$') { return $true }
    }
    return $false
}

function Resolve-SourceLayout {
    param([string]$Src)

    if (-not (Test-Path $Src)) { throw "SourceDir nao existe: $Src" }
    $hasConfig   = Test-Path (Join-Path $Src 'config.json')
    $hasSecurity = Test-Path (Join-Path $Src '.security.yml')
    $hasWorkspaceDir  = Test-Path (Join-Path $Src 'workspace')
    $hasAgentMdHere   = Test-Path (Join-Path $Src 'AGENT.md')

    if ($hasConfig -and $hasWorkspaceDir) { return 'home-root' }
    if ($hasAgentMdHere -and -not $hasWorkspaceDir) { return 'workspace-only' }
    if ($hasWorkspaceDir) { return 'home-root-partial' }
    throw "Layout nao reconhecido em '$Src'. Esperado config.json+workspace/ (PICOCLAW_HOME) ou AGENT.md (pasta workspace/)."
}

function New-StubConfigJson {
    param([string]$DestPath, [string]$WorkspaceSlug)
    # Formato V3 canonico (CurrentVersion=3 em pkg/config/config.go:27).
    # Diferencas que quebram o launcher se erradas:
    #   - "tenant_id" top-level: rejeitado (struct Config nao tem)
    #   - "litellm_params" wrapper: rejeitado (V3 eh flat)
    #   - "api_key" string: precisa virar "api_keys" array
    #   - model="openai/gpt-4o-mini" ou model="default": LiteLLM 400 (Invalid model name)
    #     O LiteLLM aceita o nome do modelo sem prefix; o provider field
    #     ("openai") instrui o roteamento. Em prod, gpt-4o-mini funciona.
    # ${LITELLM_KEY}/${LITELLM_URL} sao substituidos pelo provisioner via
    # string replace antes do tenant subir.
    $stub = [pscustomobject]@{
        version = 3
        agents = [pscustomobject]@{
            defaults = [pscustomobject]@{
                workspace                    = '/root/.picoclaw/workspace'
                restrict_to_workspace        = $true
                allow_read_outside_workspace = $false
                provider                     = 'litellm'
                model_name                   = 'default'
                max_tokens                   = 4096
                active_template_id           = $WorkspaceSlug
            }
        }
        model_list = @(
            [pscustomobject]@{
                model_name = 'default'
                provider   = 'openai'
                model      = 'gpt-4o-mini'
                api_base   = '${LITELLM_URL}'
                api_keys   = @('${LITELLM_KEY}')
            }
        )
    }
    ($stub | ConvertTo-Json -Depth 10) | Set-Content -Path $DestPath -Encoding UTF8 -NoNewline
}

function New-StubSecurityYml {
    param([string]$DestPath)
    @"
# Auto-generated stub by build-workspace-zip.ps1
# Substitua conforme a politica do template.
version: 1
permissions:
  filesystem:
    workspace_only: true
    allow_read_outside_workspace: false
  network:
    allow_outbound: true
tenant_id: \${TENANT_ID}
"@ | Set-Content -Path $DestPath -Encoding UTF8
}

function Test-FileLooksLikeSecret {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return @() }
    $findings = @()
    $content = Get-Content -Path $Path -Raw -Encoding UTF8
    # Padroes de chave real: sk-..., sk-or-..., glsa_..., chaves OpenAI/LiteLLM tipicas
    $patterns = @(
        '"api_key"\s*:\s*"(sk-[A-Za-z0-9_\-]{12,})"',
        '"api_key"\s*:\s*"(sk-proj-[A-Za-z0-9_\-]{12,})"',
        '"api_key"\s*:\s*"(sk-or-[A-Za-z0-9_\-]{12,})"',
        '"api_key"\s*:\s*"(litellm-[A-Za-z0-9_\-]{12,})"'
    )
    foreach ($p in $patterns) {
        $matches = [regex]::Matches($content, $p)
        foreach ($m in $matches) { $findings += $m.Groups[1].Value }
    }
    # api_base http(s) real (nao placeholder)
    $apiBaseMatches = [regex]::Matches($content, '"api_base"\s*:\s*"(https?://[^"$][^"]+)"')
    foreach ($m in $apiBaseMatches) { $findings += "api_base=$($m.Groups[1].Value)" }
    return $findings
}

function Invoke-PlaceholderRewrite {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $false }
    $orig = Get-Content -Path $Path -Raw -Encoding UTF8
    $new = $orig
    $new = [regex]::Replace($new, '"api_key"\s*:\s*"(sk-[A-Za-z0-9_\-]{12,}|sk-proj-[A-Za-z0-9_\-]{12,}|sk-or-[A-Za-z0-9_\-]{12,}|litellm-[A-Za-z0-9_\-]{12,})"', '"api_key": "${LITELLM_KEY}"')
    # Reescreve api_base SOMENTE quando aponta para LiteLLM real (heuristica: contem 'litellm' no host ou eh https com /v1)
    $new = [regex]::Replace($new, '"api_base"\s*:\s*"https?://[^"$]*litellm[^"]*"', '"api_base": "${LITELLM_URL}"')
    if ($new -ne $orig) {
        $new | Set-Content -Path $Path -Encoding UTF8 -NoNewline
        return $true
    }
    return $false
}

# -- 1. Resolve fonte ---------------------------------------------------------
Write-Section "Resolvendo fonte"
if (-not $SourceDir) {
    if ($env:PICOCLAW_HOME -and (Test-Path $env:PICOCLAW_HOME)) {
        $SourceDir = $env:PICOCLAW_HOME
        Write-Ok "Usando \$env:PICOCLAW_HOME = $SourceDir"
    } elseif (Test-Path './workspace') {
        $SourceDir = (Resolve-Path './workspace').Path
        Write-Ok "Usando ./workspace = $SourceDir"
    } else {
        throw "Nao foi possivel detectar SourceDir. Passe -SourceDir, defina \$env:PICOCLAW_HOME, ou rode do diretorio raiz do repo."
    }
}
$SourceDir = (Resolve-Path $SourceDir).Path
$layout = Resolve-SourceLayout -Src $SourceDir
Write-Ok "Layout detectado: $layout"

if (-not $Slug) {
    $Slug = (Split-Path -Leaf $SourceDir).ToLowerInvariant() -replace '[^a-z0-9-]', '-'
    Write-Warn2 "Slug nao informado; derivado: '$Slug'"
}
if (-not $Name) { $Name = $Slug }

# -- 2. Diretorio de staging --------------------------------------------------
Write-Section "Estagiando em diretorio temporario"
$stage = Join-Path ([IO.Path]::GetTempPath()) ("picoclaw-ws-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
$home_ = Join-Path $stage 'home'
New-Item -ItemType Directory -Path $home_ | Out-Null

# Roteia para home/ conforme layout
$copyRoot = switch ($layout) {
    'home-root'         { $SourceDir }
    'home-root-partial' { $SourceDir }
    'workspace-only'    {
        $wsDest = Join-Path $home_ 'workspace'
        New-Item -ItemType Directory -Path $wsDest | Out-Null
        # Marca para copiar como home/workspace/<conteudo de SourceDir>
        $null
    }
}

$copiedCount = 0
$totalBytes  = [int64]0
$skipped     = @()

if ($layout -eq 'workspace-only') {
    $base = $SourceDir
    Get-ChildItem -LiteralPath $base -Recurse -Force | ForEach-Object {
        $rel = $_.FullName.Substring($base.Length).TrimStart('\','/') -replace '\\','/'
        # rel agora eh relativo dentro de home/workspace/
        $homeRel = "workspace/$rel"
        if (Test-DropHomePath -RelHome $homeRel -IsDir $_.PSIsContainer) {
            $skipped += $homeRel
            return
        }
        $dest = Join-Path $home_ (Join-Path 'workspace' $rel)
        if ($_.PSIsContainer) {
            if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest | Out-Null }
        } else {
            $destDir = Split-Path -Parent $dest
            if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir | Out-Null }
            Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
            $copiedCount++
            $totalBytes += $_.Length
        }
    }
} else {
    # home-root ou home-root-partial: copia tudo de SourceDir para home/ aplicando drop-list
    Get-ChildItem -LiteralPath $SourceDir -Recurse -Force | ForEach-Object {
        $rel = $_.FullName.Substring($SourceDir.Length).TrimStart('\','/') -replace '\\','/'
        if (Test-DropHomePath -RelHome $rel -IsDir $_.PSIsContainer) {
            $skipped += $rel
            return
        }
        $dest = Join-Path $home_ $rel
        if ($_.PSIsContainer) {
            if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest | Out-Null }
        } else {
            $destDir = Split-Path -Parent $dest
            if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir | Out-Null }
            Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
            $copiedCount++
            $totalBytes += $_.Length
        }
    }
}

Write-Ok "Arquivos copiados: $copiedCount"
Write-Ok "Tamanho estagiado: $([math]::Round($totalBytes/1MB,2)) MiB"
if ($skipped.Count -gt 0) {
    Write-Ok "Itens descartados pela drop-list: $($skipped.Count) (primeiros 5: $(($skipped | Select-Object -First 5) -join ', '))"
}

# -- 3. Stubs (se solicitado) -------------------------------------------------
$configPath   = Join-Path $home_ 'config.json'
$securityPath = Join-Path $home_ '.security.yml'
$agentMdPath  = Join-Path $home_ 'workspace/AGENT.md'

if ($GenerateStubs) {
    if (-not (Test-Path $configPath)) {
        New-StubConfigJson -DestPath $configPath -WorkspaceSlug $Slug
        Write-Ok "Stub criado: home/config.json"
    }
    if (-not (Test-Path $securityPath)) {
        New-StubSecurityYml -DestPath $securityPath
        Write-Ok "Stub criado: home/.security.yml"
    }
}

# -- 3.5 Overlay -Public (channel_list.public-web + memory reset) -------------
# Mantem o source dev intacto; aplica somente na copia staged. Justificativa
# de cada peca esta em docs/architecture/public-onboarding-tenant.md.
if ($Public) {
    Write-Section "Aplicando overlay -Public"

    # a) Liga o canal public-web em channel_list. Se ja existir, so flipa
    #    enabled=true; se nao, injeta a entrada canonica (mesmo shape que
    #    estava em workspace-onboarding/config.json antes da deprecation).
    if (Test-Path $configPath) {
        $cfg = Get-Content -Raw -Path $configPath | ConvertFrom-Json
        if (-not $cfg.channel_list) {
            $cfg | Add-Member -NotePropertyName channel_list -NotePropertyValue ([pscustomobject]@{}) -Force
        }
        $pubWeb = [pscustomobject]@{
            type     = 'public-web'
            enabled  = $true
            allow_from = @('*')
            settings = [pscustomobject]@{
                rate_limit_per_ip       = 30
                session_ttl_seconds     = 1800
                require_captcha_header  = $true
            }
        }
        # Idempotente: substitui se ja existir
        if ($cfg.channel_list.PSObject.Properties.Match('public-web').Count -gt 0) {
            $cfg.channel_list.'public-web' = $pubWeb
        } else {
            $cfg.channel_list | Add-Member -NotePropertyName 'public-web' -NotePropertyValue $pubWeb -Force
        }
        ($cfg | ConvertTo-Json -Depth 20) | Set-Content -Path $configPath -Encoding UTF8 -NoNewline
        Write-Ok "channel_list.public-web habilitado em home/config.json"
    } else {
        Write-Warn2 "home/config.json nao encontrado; pula overlay public-web"
    }

    # b) Reset memory/empresa.md pro estado-template que dispara o Sofia
    #    override (pkg/agent/onboarding_default.go). Sem isso, qualquer
    #    visitante anonimo cai no agente default da workspace (Rafael),
    #    nao na Sofia de discovery.
    $empresaPath = Join-Path $home_ 'workspace/memory/empresa.md'
    if (Test-Path (Split-Path -Parent $empresaPath)) {
        $empresaTemplate = @'
# Memoria da empresa

Nome:
Segmento:
Descricao:
Produtos ou servicos:
Horario:
Enderecho:
Regioes atendidas:
WhatsApp:
Email:
Instagram:
Site:
Formas de pagamento:
Pode falar preco:
Faixa de preco:
Quando chamar humano:
Informacoes que nunca podem ser inventadas:
Informacoes proibidas de falar:
Segmento detectado:
Status da informacao: pendente de validacao

## Cadastro da empresa

Tenant novo, aguardando discovery com Sofia.
'@
        Set-Content -Path $empresaPath -Value $empresaTemplate -Encoding UTF8 -NoNewline
        Write-Ok "memory/empresa.md resetado pro template (Sofia override ativo)"
    }

    # c) Limpa memory/jotaduo/ — dossies de clientes locais do operador.
    #    Nunca devem vazar pra um tenant publico fresco.
    $jotaduoMemory = Join-Path $home_ 'workspace/memory/jotaduo'
    if (Test-Path $jotaduoMemory) {
        Remove-Item -Recurse -Force $jotaduoMemory
        Write-Ok "memory/jotaduo/ removido"
    }

    # d) historico-empresa.md tambem zera (eventos de discoveries anteriores)
    $historicoPath = Join-Path $home_ 'workspace/memory/historico-empresa.md'
    if (Test-Path $historicoPath) {
        Set-Content -Path $historicoPath -Value "# Historico`n`nNenhum evento registrado ainda.`n" -Encoding UTF8 -NoNewline
        Write-Ok "memory/historico-empresa.md zerado"
    }
}

# -- 4. Reverse-placeholder em arquivos sensiveis -----------------------------
Write-Section "Verificando secrets"
$secretFiles = @($configPath, $securityPath, (Join-Path $home_ 'workspace/behavior.json'), (Join-Path $home_ 'workspace/agent_config.json'))
$secretsFound = $false
foreach ($f in $secretFiles) {
    $finds = Test-FileLooksLikeSecret -Path $f
    if ($finds.Count -gt 0) {
        $secretsFound = $true
        $relF = $f.Substring($home_.Length).TrimStart('\','/')
        Write-Warn2 "Secrets detectados em home/$relF : $($finds -join ' ; ')"
        if (-not $KeepSecrets) {
            if (Invoke-PlaceholderRewrite -Path $f) {
                Write-Ok "Reescrito para placeholders em home/$relF"
            }
        }
    }
}
if (-not $secretsFound) { Write-Ok "Nenhum secret real detectado" }
elseif ($KeepSecrets)   { Write-Warn2 "-KeepSecrets foi passado; chaves reais permanecem no ZIP" }

# -- 5. Validacao final dos obrigatorios e limites ----------------------------
Write-Section "Validando estrutura final"

foreach ($req in @($configPath, $securityPath, $agentMdPath)) {
    if (-not (Test-Path $req)) {
        $rel = $req.Substring($stage.Length).TrimStart('\','/')
        Write-Err2 "Faltando obrigatorio: $rel"
        throw "Estrutura invalida. Use -GenerateStubs ou ajuste a fonte."
    }
}
Write-Ok "config.json, .security.yml e workspace/AGENT.md presentes"

# Contagem + bytes
$allFiles = Get-ChildItem -LiteralPath $stage -Recurse -File -Force
$fileCount = $allFiles.Count
$finalBytes = ($allFiles | Measure-Object -Property Length -Sum).Sum
Write-Ok "Total de arquivos no ZIP: $fileCount (cap: $MAX_EXTRACTED_FILES)"
Write-Ok "Bytes expandidos: $([math]::Round($finalBytes/1MB,2)) MiB (cap: $([math]::Round($MAX_EXTRACTED_BYTES/1MB,0)) MiB)"
if ($fileCount -gt $MAX_EXTRACTED_FILES) {
    throw "Excede $MAX_EXTRACTED_FILES arquivos. Reduza ou suba via clone tenant->tenant."
}
if ($finalBytes -gt $MAX_EXTRACTED_BYTES) {
    throw "Excede $([math]::Round($MAX_EXTRACTED_BYTES/1MB,0)) MiB expandidos."
}

# Symlinks (Windows reconhece via Attributes)
$symlinks = $allFiles | Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 }
if ($symlinks.Count -gt 0) {
    Write-Err2 "Symlinks detectados (rejeitados pelo backend):"
    $symlinks | ForEach-Object { Write-Err2 "  $($_.FullName)" }
    throw "Resolva os symlinks antes de empacotar."
}

# -- 6. Gera o ZIP ------------------------------------------------------------
Write-Section "Gerando ZIP"
if (-not $OutputPath) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $buildDir = Join-Path (Get-Location) 'build'
    if (-not (Test-Path $buildDir)) { New-Item -ItemType Directory -Path $buildDir | Out-Null }
    $OutputPath = Join-Path $buildDir "workspace-$Slug-$stamp.zip"
}

if (Test-Path $OutputPath) { Remove-Item -LiteralPath $OutputPath -Force }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Cria zip manualmente para garantir paths com '/' e ordem determinstica
$zipStream = [IO.File]::Open($OutputPath, [IO.FileMode]::Create)
try {
    $zip = New-Object IO.Compression.ZipArchive($zipStream, [IO.Compression.ZipArchiveMode]::Create)
    try {
        $stageLen = $stage.Length
        Get-ChildItem -LiteralPath $stage -Recurse -File -Force | Sort-Object FullName | ForEach-Object {
            $rel = $_.FullName.Substring($stageLen).TrimStart('\','/') -replace '\\','/'
            $entry = $zip.CreateEntry($rel, [IO.Compression.CompressionLevel]::Optimal)
            $entryStream = $entry.Open()
            try {
                $fileStream = [IO.File]::OpenRead($_.FullName)
                try { $fileStream.CopyTo($entryStream) } finally { $fileStream.Dispose() }
            } finally { $entryStream.Dispose() }
        }
    } finally { $zip.Dispose() }
} finally { $zipStream.Dispose() }

$zipSize = (Get-Item -LiteralPath $OutputPath).Length
Write-Ok "ZIP gerado: $OutputPath"
Write-Ok "Tamanho compactado: $([math]::Round($zipSize/1MB,2)) MiB (cap upload: $([math]::Round($MAX_UPLOAD_BYTES/1MB,0)) MiB)"
if ($zipSize -gt $MAX_UPLOAD_BYTES) {
    Write-Err2 "ZIP excede $([math]::Round($MAX_UPLOAD_BYTES/1MB,0)) MiB de upload."
    throw "Reduza o conteudo (ex: descarte memory/ pesada, frontend-dist/) ou suba via clone tenant->tenant."
}

# Cleanup staging
Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue

# -- 7. Resumo ----------------------------------------------------------------
Write-Section "Resumo"
Write-Host "  Slug          : $Slug"
Write-Host "  Name          : $Name"
Write-Host "  is_raw        : $($IsRaw.IsPresent)"
Write-Host "  default_auto  : $($IsDefaultAuto.IsPresent)"
Write-Host "  manual        : $IsAvailableManual"
Write-Host "  Arquivos      : $fileCount"
Write-Host "  Tamanho ZIP   : $([math]::Round($zipSize/1MB,2)) MiB"
Write-Host "  Warnings      : $WarnCount"
Write-Host "  Saida         : $OutputPath"

# -- 8. Upload opcional -------------------------------------------------------
if (-not $Upload) {
    Write-Host "`nPara fazer upload, rode novamente com -Upload (ou via UI em adm.<dominio>/workspaces)." -ForegroundColor DarkGray
    exit 0
}

Write-Section "Upload para o controlplane"
if (-not $AdminBase)     { throw "-AdminBase ou \$env:PICOCLAW_SAAS_ADMIN_BASE eh obrigatorio para upload." }
if (-not $AdminEmail)    { throw "-AdminEmail ou \$env:PICOCLAW_SAAS_ADMIN_EMAIL eh obrigatorio para upload." }
if (-not $AdminPassword) { throw "-AdminPassword ou \$env:PICOCLAW_SAAS_ADMIN_PASSWORD eh obrigatorio para upload." }

$AdminBase = $AdminBase.TrimEnd('/')

# Login admin para obter cookie de sessao
$loginBody = @{ email = $AdminEmail; password = $AdminPassword } | ConvertTo-Json
$session = $null
$loginResp = Invoke-WebRequest -Uri "$AdminBase/api/v1/admin/login" -Method POST `
    -Body $loginBody -ContentType 'application/json' -SessionVariable session -SkipHttpErrorCheck
if ($loginResp.StatusCode -ne 200) {
    throw "Login admin falhou: HTTP $($loginResp.StatusCode) - $($loginResp.Content)"
}
Write-Ok "Autenticado como $AdminEmail"

# Monta multipart com .NET (curl tem comportamento errante no PowerShell)
$boundary = "----picoclaw-" + [Guid]::NewGuid().ToString('N')
$LF = "`r`n"
$ms = New-Object IO.MemoryStream
# UTF-8 SEM BOM: [Text.Encoding]::UTF8 emite BOM e o Go multipart parser
# interpreta os 3 bytes como prefixo do primeiro field name (=> "name is required").
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$sw = New-Object IO.StreamWriter($ms, $utf8NoBom)
$sw.NewLine = "`r`n"

function Add-FormField($n, $v) {
    $sw.Write("--$boundary$LF")
    $sw.Write("Content-Disposition: form-data; name=`"$n`"$LF$LF")
    $sw.Write("$v$LF")
}
Add-FormField 'name' $Name
Add-FormField 'slug' $Slug
if ($Description) { Add-FormField 'description' $Description }
Add-FormField 'is_default_auto'     ($(if ($IsDefaultAuto) {'true'} else {'false'}))
Add-FormField 'is_available_manual' ($(if ($IsAvailableManual) {'true'} else {'false'}))
Add-FormField 'is_raw'              ($(if ($IsRaw) {'true'} else {'false'}))

$sw.Write("--$boundary$LF")
$sw.Write("Content-Disposition: form-data; name=`"archive`"; filename=`"$(Split-Path -Leaf $OutputPath)`"$LF")
$sw.Write("Content-Type: application/zip$LF$LF")
$sw.Flush()
$zipBytes = [IO.File]::ReadAllBytes($OutputPath)
$ms.Write($zipBytes, 0, $zipBytes.Length)
$sw.Write("$LF--$boundary--$LF")
$sw.Flush()
$body = $ms.ToArray()
$sw.Dispose(); $ms.Dispose()

$uploadResp = Invoke-WebRequest -Uri "$AdminBase/api/v1/workspaces/upload" -Method POST `
    -Body $body -ContentType "multipart/form-data; boundary=$boundary" `
    -WebSession $session -SkipHttpErrorCheck -TimeoutSec 120
if ($uploadResp.StatusCode -ne 200 -and $uploadResp.StatusCode -ne 201) {
    throw "Upload falhou: HTTP $($uploadResp.StatusCode) - $($uploadResp.Content)"
}
Write-Ok "Upload aceito: HTTP $($uploadResp.StatusCode)"
Write-Host $uploadResp.Content
