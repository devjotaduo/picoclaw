#!/usr/bin/env node
import { spawn } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const frontendDir = resolve(scriptDir, "..")
const webDir = resolve(frontendDir, "..")

const isWindows = process.platform === "win32"
const makeCommand = isWindows ? "make.exe" : "make"
const pnpmCommand = isWindows ? "pnpm.cmd" : "pnpm"
const rawFrontendArgs = process.argv.slice(2)
const frontendArgs =
  rawFrontendArgs[0] === "--" ? rawFrontendArgs.slice(1) : rawFrontendArgs
const backendArgs = (
  process.env.PICOCLAW_WEB_BACKEND_ARGS || "-console -no-browser -d"
)
  .split(/\s+/)
  .filter(Boolean)

const colors = {
  api: "\x1b[36m",
  vite: "\x1b[35m",
  build: "\x1b[33m",
  reset: "\x1b[0m",
}

const children = new Set()
let shuttingDown = false

function prefixStream(stream, label, color) {
  let buffer = ""
  stream.on("data", (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (line.length > 0) {
        console.log(`${color}[${label}]${colors.reset} ${line}`)
      }
    }
  })
  stream.on("end", () => {
    if (buffer.length > 0) {
      console.log(`${color}[${label}]${colors.reset} ${buffer}`)
      buffer = ""
    }
  })
}

function spawnProcess(label, color, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    detached: !isWindows,
    stdio: ["ignore", "pipe", "pipe"],
  })
  children.add(child)

  prefixStream(child.stdout, label, color)
  prefixStream(child.stderr, label, color)

  child.on("exit", () => {
    children.delete(child)
  })

  child.on("error", (error) => {
    console.error(`${color}[${label}]${colors.reset} ${error.message}`)
  })

  return child
}

function runOnce(label, color, command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawnProcess(label, color, command, args, options)
    child.on("error", rejectRun)
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolveRun()
        return
      }
      rejectRun(
        new Error(
          `${label} exited with ${code === null ? `signal ${signal}` : `code ${code}`}`,
        ),
      )
    })
  })
}

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }
  if (isWindows) {
    child.kill("SIGTERM")
    return
  }
  try {
    process.kill(-child.pid, "SIGTERM")
  } catch {
    child.kill("SIGTERM")
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  for (const child of children) {
    stopChild(child)
  }
  setTimeout(() => process.exit(exitCode), 300).unref()
}

process.on("SIGINT", () => shutdown(130))
process.on("SIGTERM", () => shutdown(143))

try {
  console.log(
    `${colors.build}[dev]${colors.reset} building picoclaw for the launcher API...`,
  )
  await runOnce("build", colors.build, makeCommand, ["build-dev-picoclaw"], {
    cwd: webDir,
  })

  console.log(
    `${colors.build}[dev]${colors.reset} starting API on http://localhost:18800`,
  )
  const api = spawnProcess(
    "api",
    colors.api,
    makeCommand,
    ["dev-backend", `BACKEND_ARGS=${backendArgs.join(" ")}`],
    { cwd: webDir },
  )

  console.log(
    `${colors.build}[dev]${colors.reset} starting Vite on http://localhost:5173`,
  )
  const vite = spawnProcess(
    "vite",
    colors.vite,
    pnpmCommand,
    ["exec", "vite", ...frontendArgs],
    { cwd: frontendDir },
  )

  const exitCode = await new Promise((resolveExit) => {
    const finish = (code) => resolveExit(code ?? 1)
    api.on("exit", finish)
    vite.on("exit", finish)
  })
  shutdown(exitCode)
} catch (error) {
  console.error(`${colors.build}[dev]${colors.reset} ${error.message}`)
  shutdown(1)
}
