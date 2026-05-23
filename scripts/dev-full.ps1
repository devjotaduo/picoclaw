param(
  [switch]$NoDocker,
  [switch]$NoAdmin,
  [switch]$NoFrontend,
  [switch]$NoLauncher,
  [switch]$NoControlplane,
  [switch]$ResetPostgres,
  [int]$DockerWaitSeconds = 90
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$logDir = Join-Path $repoRoot ".codex-dev"
$tenantDir = Join-Path $logDir "tenants"
$workspaceDir = Join-Path $logDir "workspaces"

New-Item -ItemType Directory -Force -Path $logDir, $tenantDir, $workspaceDir | Out-Null

function Write-Step {
  param([string]$Message)
  Write-Host "[dev] $Message" -ForegroundColor Cyan
}

function Write-Ok {
  param([string]$Message)
  Write-Host "[ok]  $Message" -ForegroundColor Green
}

function Write-Warn {
  param([string]$Message)
  Write-Host "[warn] $Message" -ForegroundColor Yellow
}

function Require-Command {
  param([string]$Name)
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "Command not found: $Name"
  }
  return $cmd.Source
}

function Test-Port {
  param([int]$Port)
  $conn = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -eq $Port -and $_.LocalAddress -in @("127.0.0.1", "0.0.0.0", "::1", "::") } |
    Select-Object -First 1
  return $null -ne $conn
}

function Wait-Port {
  param(
    [int]$Port,
    [int]$Seconds = 60
  )
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Port $Port) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Wait-Http {
  param(
    [string]$Url,
    [int]$Seconds = 30
  )
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return $true
      }
    } catch {
      Start-Sleep -Milliseconds 500
      continue
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Start-LoggedProcess {
  param(
    [string]$Name,
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory,
    [hashtable]$Environment = @{}
  )

  $stdout = Join-Path $logDir "$Name.out.log"
  $stderr = Join-Path $logDir "$Name.err.log"

  $previous = @{}
  foreach ($key in $Environment.Keys) {
    $previous[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
    [Environment]::SetEnvironmentVariable($key, [string]$Environment[$key], "Process")
  }

  try {
    $process = Start-Process `
      -FilePath $FilePath `
      -ArgumentList $Arguments `
      -WorkingDirectory $WorkingDirectory `
      -WindowStyle Hidden `
      -RedirectStandardOutput $stdout `
      -RedirectStandardError $stderr `
      -PassThru
  } finally {
    foreach ($key in $Environment.Keys) {
      [Environment]::SetEnvironmentVariable($key, $previous[$key], "Process")
    }
  }

  Write-Ok "$Name started pid=$($process.Id) logs=$stdout"
  return $process
}

function Ensure-Docker {
  if ($NoDocker) {
    return $false
  }

  $docker = Require-Command "docker.exe"
  try {
    & $docker version --format "{{.Server.Version}}" | Out-Null
    return $true
  } catch {
    $dockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerDesktop) {
      Write-Step "starting Docker Desktop"
      Start-Process -FilePath $dockerDesktop -WindowStyle Hidden | Out-Null
    }
  }

  $deadline = (Get-Date).AddSeconds($DockerWaitSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      & $docker version --format "{{.Server.Version}}" | Out-Null
      return $true
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  Write-Warn "Docker daemon is not available; controlplane will be skipped"
  return $false
}

function Ensure-DevPostgres {
  $docker = Require-Command "docker.exe"
  $name = "picoclaw-dev-postgres"

  if ($ResetPostgres) {
    Write-Step "resetting Docker container $name"
    & $docker rm -f $name 2>$null | Out-Null
  }

  $existing = & $docker ps -a --filter "name=^/$name$" --format "{{.Names}}"
  if ($existing -eq $name) {
    & $docker start $name | Out-Null
  } else {
    Write-Step "creating Docker container $name on 127.0.0.1:15432"
    & $docker run -d `
      --name $name `
      -e POSTGRES_USER=picoclaw `
      -e POSTGRES_PASSWORD=picoclaw-dev `
      -e POSTGRES_DB=picoclaw_control `
      -p 127.0.0.1:15432:5432 `
      postgres:16-alpine | Out-Null
  }

  if (-not (Wait-Port 15432 60)) {
    throw "Postgres did not open 127.0.0.1:15432"
  }
  Write-Ok "postgres ready on 127.0.0.1:15432"
}

function Ensure-GatewayBinary {
  $binary = Join-Path $repoRoot "build\picoclaw.exe"
  if (Test-Path $binary) {
    return $binary
  }

  $make = Require-Command "make.exe"
  Write-Step "building build\picoclaw.exe for launcher gateway"
  & $make -C web build-dev-picoclaw
  if (-not (Test-Path $binary)) {
    throw "Expected binary was not created: $binary"
  }
  return $binary
}

$pnpm = Require-Command "pnpm.cmd"
$go = Require-Command "go.exe"

if (-not $NoFrontend) {
  if (Test-Port 5173) {
    Write-Ok "frontend already listening on http://127.0.0.1:5173/"
  } else {
    Write-Step "starting frontend on http://127.0.0.1:5173/"
    Start-LoggedProcess `
      -Name "frontend-vite" `
      -FilePath $pnpm `
      -Arguments @("--dir", "web/frontend", "exec", "vite", "--host", "127.0.0.1", "--port", "5173") `
      -WorkingDirectory $repoRoot | Out-Null
    Wait-Port 5173 60 | Out-Null
  }
}

if (-not $NoLauncher) {
  if (Test-Port 18800) {
    Write-Ok "launcher backend already listening on http://127.0.0.1:18800/"
  } else {
    $gatewayBinary = Ensure-GatewayBinary
    Write-Step "starting launcher backend on http://127.0.0.1:18800/"
    Start-LoggedProcess `
      -Name "launcher-backend" `
      -FilePath $go `
      -Arguments @("run", "-tags", "goolm,stdjson,whatsapp_native", ".", "-console", "-no-browser", "-d") `
      -WorkingDirectory (Join-Path $repoRoot "web\backend") `
      -Environment @{ PICOCLAW_BINARY = $gatewayBinary } | Out-Null
    Wait-Port 18800 90 | Out-Null
  }
}

$dockerReady = $false
if (-not $NoControlplane) {
  $dockerReady = Ensure-Docker
}

if (-not $NoControlplane) {
  if (Test-Port 18801) {
    Write-Ok "controlplane already listening on http://127.0.0.1:18801/"
  } elseif ($dockerReady) {
    Ensure-DevPostgres
    Write-Step "starting controlplane on http://127.0.0.1:18801/"
    Start-LoggedProcess `
      -Name "controlplane" `
      -FilePath $go `
      -Arguments @("run", "-tags", "goolm,stdjson", "./cmd/picoclaw-saas") `
      -WorkingDirectory $repoRoot `
      -Environment @{
        LISTEN_ADDR = "127.0.0.1:18801"
        PG_DSN = "postgres://picoclaw:picoclaw-dev@127.0.0.1:15432/picoclaw_control?sslmode=disable"
        JWT_SECRET = "dev-jwt-secret-32-chars-local-only"
        PICOCLAW_SAAS_GATEWAY_SECRET = "dev-gateway-secret-32-chars-local"
        DOCKER_HOST = "npipe:////./pipe/dockerDesktopLinuxEngine"
        TENANT_BASE_DOMAIN = "127.0.0.1.nip.io"
        TENANT_HOST_DATA_DIR = $tenantDir
        PICOCLAW_WORKSPACE_DIR = $workspaceDir
        TENANT_IMAGE = "picoclaw-launcher:latest"
        COOKIE_DOMAIN = ""
        COOKIE_SECURE = "false"
        OPENCRM_URL = ""
        LITELLM_URL = ""
        LITELLM_MASTER_KEY = ""
      } | Out-Null
    Wait-Port 18801 120 | Out-Null
  }
}

if (-not $NoAdmin) {
  if (Test-Port 5174) {
    Write-Ok "admin UI already listening on http://127.0.0.1:5174/"
  } else {
    Write-Step "starting admin UI on http://127.0.0.1:5174/"
    Start-LoggedProcess `
      -Name "saas-admin-vite" `
      -FilePath $pnpm `
      -Arguments @("--dir", "web/saas-admin", "exec", "vite", "--host", "127.0.0.1", "--port", "5174") `
      -WorkingDirectory $repoRoot `
      -Environment @{ VITE_SAAS_API_TARGET = "http://127.0.0.1:18801" } | Out-Null
    Wait-Port 5174 60 | Out-Null
  }
}

$checks = @(
  @{ Name = "frontend"; Url = "http://127.0.0.1:5173/" },
  @{ Name = "admin"; Url = "http://127.0.0.1:5174/" },
  @{ Name = "launcher"; Url = "http://127.0.0.1:18800/api/auth/status" },
  @{ Name = "controlplane"; Url = "http://127.0.0.1:18801/healthz" }
)

Write-Host ""
Write-Step "health checks"
foreach ($check in $checks) {
  if (Wait-Http $check.Url 5) {
    Write-Ok "$($check.Name) $($check.Url)"
  } else {
    Write-Warn "$($check.Name) unavailable at $($check.Url)"
  }
}

Write-Host ""
Write-Ok "dev mode ready"
Write-Host "  frontend:     http://127.0.0.1:5173/"
Write-Host "  admin:        http://127.0.0.1:5174/"
Write-Host "  launcher API: http://127.0.0.1:18800/"
Write-Host "  controlplane: http://127.0.0.1:18801/"
Write-Host "  logs:         $logDir"
