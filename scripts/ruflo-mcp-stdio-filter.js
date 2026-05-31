#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const packageSpec = process.argv[2] || process.env.RUFLO_NPM_PACKAGE || 'ruflo@3.10.5';
if (!/^[a-zA-Z0-9@._/-]+$/.test(packageSpec)) {
  process.stderr.write(`[ruflo-mcp-stdio-filter] invalid Ruflo package spec: ${packageSpec}\n`);
  process.exit(1);
}

const child = spawn('npx', ['--yes', '--package', packageSpec, 'ruflo', 'mcp', 'start'], {
  env: {
    ...process.env,
    npm_config_update_notifier: process.env.npm_config_update_notifier || 'false',
  },
  shell: process.platform === 'win32',
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdoutBuffer = '';

process.stdin.pipe(child.stdin);
child.stderr.pipe(process.stderr);

child.stdin.on('error', () => {});

child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  stdoutBuffer += chunk;
  flushStdoutLines(false);
});
child.stdout.on('end', () => flushStdoutLines(true));

child.on('error', (error) => {
  process.stderr.write(`[ruflo-mcp-stdio-filter] failed to start Ruflo MCP: ${error.message}\n`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  flushStdoutLines(true);
  if (signal) {
    process.stderr.write(`[ruflo-mcp-stdio-filter] Ruflo MCP exited by signal ${signal}\n`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}

function flushStdoutLines(force) {
  let newlineIndex;
  while ((newlineIndex = stdoutBuffer.indexOf('\n')) >= 0) {
    const line = stdoutBuffer.slice(0, newlineIndex + 1);
    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
    routeStdoutLine(line);
  }

  if (force && stdoutBuffer.length > 0) {
    routeStdoutLine(stdoutBuffer);
    stdoutBuffer = '';
  }
}

function routeStdoutLine(line) {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return;
  }

  // Ruflo can print diagnostics to stdout during tool calls. MCP stdio clients
  // require stdout to contain protocol messages only, so diagnostics go to stderr.
  if (isProtocolMessage(trimmed)) {
    process.stdout.write(line.endsWith('\n') ? line : `${line}\n`);
    return;
  }

  process.stderr.write(line.endsWith('\n') ? line : `${line}\n`);
}

function isProtocolMessage(value) {
  try {
    const message = JSON.parse(value);
    return (
      message &&
      typeof message === 'object' &&
      (message.jsonrpc === '2.0' ||
        Object.prototype.hasOwnProperty.call(message, 'id') ||
        Object.prototype.hasOwnProperty.call(message, 'method'))
    );
  } catch {
    return false;
  }
}
