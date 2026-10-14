import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RemoteHost, remoteEnvPrefix, remoteQuote, validHost } from '../remote';

async function main() {
  assert.ok(validHost('build-server_1.example'));
  assert.ok(!validHost('-oProxyCommand=bad'));
  assert.ok(!validHost('user@host'));
  assert.strictEqual(remoteQuote("a'b"), "'a'\\''b'");
  assert.strictEqual(remoteEnvPrefix('/home/me/.config/herdr/sessions/work/herdr.sock'),
    "HERDR_SOCKET_PATH='/home/me/.config/herdr/sessions/work/herdr.sock' HERDR_SESSION='work' ");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-remote-'));
  const ssh = path.join(dir, 'fake-ssh.js');
  fs.writeFileSync(ssh, `
const net = require('net');
const fs = require('fs');
const args = process.argv.slice(2);
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
  process.env.FAKE_HERDR_FIXTURE = path.resolve(__dirname, '../../test/fixtures/snapshot-herdr-0.9.1.json');
  try {
    const host = new RemoteHost({ host: 'build-server' }, () => {}, fakeSsh);
    try {
      await host.refresh();
      assert.strictEqual(host.error, undefined);
      assert.ok(host.model?.spaces.length);
      await host.client.request('workspace.focus', { workspace_id: host.model!.spaces[0].id });
    } finally { host.dispose(); }

    process.env.FAKE_HERDR_DOWN = '1';
    const down = new RemoteHost({ host: 'build-server' }, () => {}, fakeSsh);
    try {
      await down.refresh();
      assert.match(down.error || '', /not running/);
      assert.strictEqual(down.model, undefined);
    } finally { down.dispose(); }
  } finally {
    delete process.env.FAKE_HERDR_FIXTURE;
    delete process.env.FAKE_HERDR_DOWN;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log('remote SSH status, tunnel, snapshot and request passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
