import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { RemoteHost, remoteEnvPrefix, remoteHerdrCommand, remoteQuote, sshConnectionArgs, validHost, validateRemoteConfig } from '../remote';

async function main() {
  assert.ok(validHost('build-server_1.example'));
  assert.ok(!validHost('-oProxyCommand=bad'));
  assert.ok(!validHost('user@host'));
  assert.strictEqual(validateRemoteConfig({ host: 'vm-linux', port: 70000 }), 'Port must be 1–65535.');
  assert.strictEqual(validateRemoteConfig({ host: 'vm-linux', user: 'ubuntu', port: 2222 }), undefined);
  assert.deepStrictEqual(sshConnectionArgs({ host: 'vm-linux', user: 'ubuntu', port: 2222, identityFile: '/tmp/key' }),
    ['-l', 'ubuntu', '-p', '2222', '-i', '/tmp/key', '-o', 'IdentitiesOnly=yes']);
  assert.strictEqual(remoteQuote("a'b"), "'a'\\''b'");
  assert.strictEqual(remoteEnvPrefix('/home/me/.config/herdr/sessions/work/herdr.sock'),
    "HERDR_SOCKET_PATH='/home/me/.config/herdr/sessions/work/herdr.sock' HERDR_SESSION='work' ");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-remote-'));
  if (process.platform !== 'win32') {
    const localBin = path.join(dir, '.local', 'bin');
    fs.mkdirSync(localBin, { recursive: true });
    const herdr = path.join(localBin, 'herdr');
    fs.writeFileSync(herdr, '#!/bin/sh\nprintf "%s|%s|%s" "$1" "$2" "$3"\n', { mode: 0o755 });
    const output = execFileSync('sh', ['-c', remoteHerdrCommand({ host: 'vm-linux' }, ['status', 'server', '--json'])],
      { env: { ...process.env, HOME: dir, PATH: '/usr/bin:/bin' }, encoding: 'utf8' });
    assert.strictEqual(output, 'status|server|--json');
  }
  const ssh = path.join(dir, 'fake-ssh.js');
  fs.writeFileSync(ssh, `
const net = require('net');
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_SSH_ARGS_LOG, JSON.stringify(args) + '\\n');
if (process.env.FAKE_SSH_AUTH_FAIL === '1') { process.stderr.write('Permission denied (publickey).'); process.exit(255); }
if (args.includes('-L') && process.env.FAKE_SSH_TUNNEL_FAIL === '1') { process.stderr.write('administratively prohibited'); process.exit(255); }
if (!args.includes('-L')) {
  process.stdout.write(JSON.stringify({ running: process.env.FAKE_HERDR_DOWN !== '1', socket: '/tmp/herdr-test.sock', protocol: 22 }));
} else {
  const port = Number(args[args.indexOf('-L') + 1].split(':')[1]);
  const response = JSON.parse(fs.readFileSync(process.env.FAKE_HERDR_FIXTURE, 'utf8')).result;
  net.createServer((socket) => {
    let buffer = '';
    socket.on('data', (data) => {
      buffer += data.toString();
      let end;
      while ((end = buffer.indexOf('\\n')) >= 0) {
        const request = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        socket.write(JSON.stringify({ id: request.id, result: request.method === 'session.snapshot' ? response : {} }) + '\\n');
      }
    });
  }).listen(port, '127.0.0.1');
}
`);
  const fakeSsh = { file: process.execPath, args: [ssh] };
  const argsLog = path.join(dir, 'args.log');
  process.env.FAKE_SSH_ARGS_LOG = argsLog;
  process.env.FAKE_HERDR_FIXTURE = path.resolve(__dirname, '../../test/fixtures/snapshot-herdr-0.9.1.json');
  try {
    const host = new RemoteHost({ host: 'build-server', user: 'ubuntu', port: 2222, identityFile: '/tmp/key' }, () => {}, fakeSsh);
    try {
      await host.refresh();
      assert.strictEqual(host.error, undefined);
      assert.ok(host.model?.spaces.length);
      await host.client.request('workspace.focus', { workspace_id: host.model!.spaces[0].id });
    } finally { host.dispose(); }
    const invocations = fs.readFileSync(argsLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as string[]);
    assert.strictEqual(invocations.length, 2);
    for (const args of invocations) {
      assert.ok(args.includes('ubuntu'));
      assert.ok(args.includes('2222'));
      assert.ok(args.includes('/tmp/key'));
    }

    process.env.FAKE_HERDR_DOWN = '1';
    const down = new RemoteHost({ host: 'build-server' }, () => {}, fakeSsh);
    try {
      await down.refresh();
      assert.match(down.error || '', /not running/);
      assert.strictEqual(down.model, undefined);
    } finally { down.dispose(); }

    process.env.FAKE_SSH_AUTH_FAIL = '1';
    const denied = new RemoteHost({ host: 'build-server' }, () => {}, fakeSsh);
    try {
      await denied.refresh();
      assert.match(denied.error || '', /Permission denied \(publickey\)/);
    } finally { denied.dispose(); }
    delete process.env.FAKE_SSH_AUTH_FAIL;
    delete process.env.FAKE_HERDR_DOWN;

    process.env.FAKE_SSH_TUNNEL_FAIL = '1';
    const failedTunnel = new RemoteHost({ host: 'build-server' }, () => {}, fakeSsh);
    try {
      await failedTunnel.refresh();
      assert.match(failedTunnel.error || '', /administratively prohibited/);
    } finally { failedTunnel.dispose(); }
  } finally {
    delete process.env.FAKE_HERDR_FIXTURE;
    delete process.env.FAKE_HERDR_DOWN;
    delete process.env.FAKE_SSH_AUTH_FAIL;
    delete process.env.FAKE_SSH_TUNNEL_FAIL;
    delete process.env.FAKE_SSH_ARGS_LOG;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log('remote SSH status, tunnel, snapshot and request passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
