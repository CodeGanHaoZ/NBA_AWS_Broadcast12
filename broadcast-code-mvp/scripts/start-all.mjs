#!/usr/bin/env node
/**
 * start-all.mjs — One-click launcher for Broadcast Code MVP (demo mode)
 *
 * What it does:
 *   1. Starts the Express backend  (server/src/app.js)          -> http://localhost:3000
 *   2. Builds the web bundle if web/dist is missing             (vite build)
 *   3. Starts the Vite preview server for the built bundle      -> http://localhost:<auto>
 *
 * Port note:
 *   Vite preview defaults to 4173 but auto-selects the next free port when it is
 *   already taken (4173/4174 are occupied on this machine). This script parses
 *   Vite's stdout to discover the ACTUAL port and prints it in a big banner.
 *
 * Usage:
 *   node scripts/start-all.mjs
 *
 * Stop:
 *   Press Ctrl+C — both child processes are terminated (no orphans left behind).
 *
 * Requirements:
 *   - Node.js >= 20
 *   - server/node_modules and web/node_modules must exist
 *     (run "npm install" in both folders first, or restore from release/offline-kit)
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');
const WEB_DIR = path.join(ROOT, 'web');
const DIST_INDEX = path.join(WEB_DIR, 'dist', 'index.html');
const VITE_BIN = path.join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js');
const BACKEND_PORT = 3000;
const NODE = process.execPath; // same node binary that runs this script

const children = [];
let shuttingDown = false;
let previewUrl = null;

function log(tag, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${tag}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Pre-flight checks
// ---------------------------------------------------------------------------

function preflight() {
  const problems = [];
  if (!existsSync(path.join(SERVER_DIR, 'node_modules'))) {
    problems.push(`missing dependencies: ${path.relative(ROOT, SERVER_DIR)}${path.sep}node_modules — run "npm install" inside server/`);
  }
  if (!existsSync(path.join(WEB_DIR, 'node_modules'))) {
    problems.push(`missing dependencies: ${path.relative(ROOT, WEB_DIR)}${path.sep}node_modules — run "npm install" inside web/`);
  }
  if (!existsSync(path.join(SERVER_DIR, 'src', 'app.js'))) {
    problems.push('missing file: server/src/app.js');
  }
  if (!existsSync(VITE_BIN)) {
    problems.push('missing file: web/node_modules/vite/bin/vite.js');
  }
  if (problems.length > 0) {
    console.error('\n[pre-flight] Cannot start, fix the issues below first:\n');
    for (const p of problems) console.error('  - ' + p);
    console.error('\nHint: offline restore packages are in release/offline-kit/.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Build step (only when dist is missing)
// ---------------------------------------------------------------------------

function buildWebIfNeeded() {
  if (existsSync(DIST_INDEX)) {
    log('build', 'web/dist already exists, skipping build');
    return;
  }
  log('build', 'web/dist not found, running vite build ...');
  const res = spawnSync(NODE, [VITE_BIN, 'build'], { cwd: WEB_DIR, stdio: 'inherit' });
  if (res.status !== 0) {
    console.error('[build] vite build FAILED (exit ' + res.status + ')');
    process.exit(1);
  }
  log('build', 'vite build finished');
}

// ---------------------------------------------------------------------------
// Child process management
// ---------------------------------------------------------------------------

function startChild(tag, cmd, args, cwd, onOutput) {
  const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push({ tag, child });

  const lineBuf = { out: '', err: '' };
  child.stdout.on('data', (chunk) => handleChunk(tag, chunk, 'out', lineBuf, onOutput));
  child.stderr.on('data', (chunk) => handleChunk(tag, chunk, 'err', lineBuf, onOutput));

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    log(tag, `process exited unexpectedly (code=${code} signal=${signal}) — shutting down`);
    shutdown(1);
  });
  return child;
}

// Split streamed output into lines, forward them, and hand each line to the
// optional callback so the caller can parse Vite's output for the real port.
function handleChunk(tag, chunk, stream, lineBuf, onLine) {
  const text = chunk.toString();
  process.stdout.write(`[${tag}] ${text}`);
  if (!onLine) return;
  lineBuf[stream] += text;
  const lines = lineBuf[stream].split('\n');
  lineBuf[stream] = lines.pop(); // keep incomplete tail
  for (const line of lines) {
    if (line.trim()) onLine(line);
  }
}

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('');
  log('main', 'shutting down child processes ...');
  for (const { tag, child } of children) {
    if (child.exitCode === null && !child.killed) {
      try {
        child.kill('SIGTERM');
      } catch (e) {
        log(tag, 'kill failed: ' + e.message);
      }
    }
  }
  // Give children a moment to exit, then force-kill leftovers.
  const forceTimer = setTimeout(() => {
    for (const { tag, child } of children) {
      if (child.exitCode === null) {
        log(tag, 'force kill');
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
      }
    }
    process.exit(exitCode);
  }, 2000);
  forceTimer.unref();

  const waiters = children.map(
    ({ child }) => new Promise((resolve) => (child.exitCode !== null ? resolve() : child.once('exit', resolve)))
  );
  Promise.all(waiters).then(() => {
    clearTimeout(forceTimer);
    log('main', 'all child processes stopped, bye');
    process.exit(exitCode);
  });
}

process.on('SIGINT', () => {
  log('main', 'SIGINT received (Ctrl+C)');
  shutdown(0);
});
process.on('SIGTERM', () => shutdown(0));
process.on('SIGHUP', () => shutdown(0));

// ---------------------------------------------------------------------------
// Readiness probing + banner
// ---------------------------------------------------------------------------

async function waitFor(url, { timeoutMs = 20000, intervalMs = 400 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return { ok: true, status: res.status };
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await sleep(intervalMs);
  }
  return { ok: false, error: String(lastErr) };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function printBanner(backendOk, frontendOk) {
  const line = '='.repeat(64);
  console.log('');
  console.log(line);
  console.log('  BROADCAST CODE MVP — DEMO IS RUNNING');
  console.log(line);
  console.log(`  Backend  (Express API) : http://localhost:${BACKEND_PORT}`);
  console.log(`                            /health ${backendOk.ok ? 'OK (' + backendOk.status + ')' : 'FAILED: ' + backendOk.error}`);
  if (previewUrl) {
    console.log(`  Frontend (Vite preview): ${previewUrl}`);
    console.log(`                            page    ${frontendOk && frontendOk.ok ? 'OK (' + frontendOk.status + ')' : 'FAILED: ' + (frontendOk && frontendOk.error)}`);
  } else {
    console.log('  Frontend (Vite preview): port not detected yet, watch [web] logs above');
  }
  console.log('');
  console.log('  Press Ctrl+C in this terminal to stop BOTH servers.');
  console.log(line);
  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  preflight();
  buildWebIfNeeded();

  log('main', `starting backend  -> node src/app.js (port ${BACKEND_PORT})`);
  startChild('server', NODE, ['src/app.js'], SERVER_DIR);

  log('main', 'starting frontend -> vite preview (auto port, base 4173)');
  const web = startChild('web', NODE, [VITE_BIN, 'preview'], WEB_DIR, (line) => {
    // Vite prints (possibly ANSI-colored): "  Local:   http://localhost:4175/"
    // Strip ANSI escape sequences first, then look for the Local URL.
    const clean = line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
    const m = clean.match(/Local:\s+(https?:\/\/\S+)/);
    if (m && !previewUrl) {
      previewUrl = m[1].replace(/\/+$/, ''); // drop trailing slash
      log('main', `detected preview URL: ${previewUrl}`);
    }
  });

  // Probe backend health first (it must be up for the preview proxy to work).
  const backendOk = await waitFor(`http://localhost:${BACKEND_PORT}/health`);
  log('main', backendOk.ok ? `backend /health OK (${backendOk.status})` : `backend /health FAILED: ${backendOk.error}`);

  // Wait until Vite reports its local URL (usually instant).
  const urlDeadline = Date.now() + 15000;
  while (!previewUrl && Date.now() < urlDeadline) {
    await sleep(200);
    if (web.exitCode !== null) break;
  }

  let frontendOk = null;
  if (previewUrl) {
    frontendOk = await waitFor(previewUrl);
    log('main', frontendOk.ok ? `frontend page OK (${frontendOk.status})` : `frontend page FAILED: ${frontendOk.error}`);
  }

  printBanner(backendOk, frontendOk);

  if (!backendOk.ok || (previewUrl && frontendOk && !frontendOk.ok)) {
    log('main', 'WARNING: at least one readiness check failed. See statuses above; keeping processes alive for debugging.');
  }
}

main().catch((e) => {
  console.error('[main] fatal: ' + (e && e.stack ? e.stack : e));
  shutdown(1);
});
