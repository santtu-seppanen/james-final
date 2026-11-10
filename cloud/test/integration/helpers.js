// Starts `wrangler dev` against a fresh local D1 (in a temp dir) so the
// integration tests hit the real Worker + real SQLite, not mocks.

import {spawn, execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WRANGLER = path.join(ROOT, 'node_modules', '.bin', 'wrangler');

export const DEVICE_TOKEN = 'test-device-token';
export const ADMIN_TOKEN = 'test-admin-token';

export async function startWorker({port = 8790 + Math.floor(Math.random() * 1000)} = {}) {
  const persist = mkdtempSync(path.join(tmpdir(), 'james-cloud-test-'));

  execFileSync(WRANGLER, ['d1', 'migrations', 'apply', 'james-cloud', '--local', '--persist-to', persist], {
    cwd: ROOT,
    stdio: 'pipe',
    env: {...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1'},
  });

  const child = spawn(
    WRANGLER,
    [
      'dev',
      '--local',
      '--port',
      String(port),
      '--inspector-port',
      '0',
      '--persist-to',
      persist,
      '--var',
      `DEVICE_TOKEN:${DEVICE_TOKEN}`,
      '--var',
      `ADMIN_TOKEN:${ADMIN_TOKEN}`,
      '--show-interactive-dev-session=false',
    ],
    {cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1'}},
  );
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('wrangler dev exited:\n' + output);
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) break;
    } catch (e) {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (Date.now() >= deadline) {
    child.kill('SIGKILL');
    throw new Error('wrangler dev did not come up:\n' + output);
  }

  return {
    base,
    output: () => output,
    async stop() {
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 500));
      if (child.exitCode === null) child.kill('SIGKILL');
      rmSync(persist, {recursive: true, force: true});
    },
  };
}

export function client(base, token) {
  return async function call(method, path, body, headers = {}) {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(token ? {authorization: `Bearer ${token}`} : {}),
        ...(body !== undefined ? {'content-type': 'application/json'} : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (e) {
      // not json
    }
    return {status: res.status, headers: res.headers, body: json, text};
  };
}

export function sampleConfig() {
  return {
    schemaVersion: 1,
    availableBottles: ['vodka', 'tonic', 'cranberry', 'empty'],
    bottles: [
      {name: 'vodka', serving: 25, capacity: 700},
      {name: 'tonic', serving: 50, capacity: 1000},
    ],
    recipes: {
      vodkatonic: {friendlyname: 'Vodka & Tonic', ingredients: [{name: 'vodka', serving: 50}, {name: 'tonic', serving: 100}], imageUrl: 'gin_tonic'},
    },
    settings: {led: {brightness: 60}},
  };
}
