// Connect to Herdr on an SSH host through OpenSSH's local TCP to remote Unix socket forwarding.
// No remote listener is exposed and SSH config handles identity, port and jump hosts.
import { execFile, spawn, ChildProcess } from 'child_process';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { HerdrClient } from './herdrClient';
import { Model, normalize } from './model';
import type { SessionSnapshotResult } from './herdrTypes';
import { HERDR_PROTOCOL } from './herdrTypes';
import { sessionOfSocket } from './connection';

export interface RemoteHostConfig {
  /** SSH config alias, hostname or IP address. */
  host: string;
  label?: string;
  user?: string;
  port?: number;
  identityFile?: string;
  binaryPath?: string;
  socketPath?: string;
}

export interface SshCommand {
  file: string;
  args: string[];
}

export const validHost = (host: string): boolean => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(host);
export function validateRemoteConfig(config: RemoteHostConfig): string | undefined {
  if (!validHost(config.host)) return 'Enter an SSH hostname, IP address, or config alias.';
  if (config.user && !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(config.user)) return 'Enter a valid SSH user name.';
  if (config.port !== undefined && (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535)) return 'Port must be 1–65535.';
  if (config.identityFile && /[\r\n\0]/.test(config.identityFile)) return 'Invalid private key path.';
  if (config.binaryPath && !config.binaryPath.startsWith('/')) return 'Herdr executable must be an absolute Linux/macOS path.';
  if (config.socketPath && !config.socketPath.startsWith('/')) return 'Herdr socket must be an absolute Linux/macOS path.';
}
export function sshConnectionArgs(config: RemoteHostConfig): string[] {
  const args: string[] = [];
  if (config.user) args.push('-l', config.user);
  if (config.port) args.push('-p', String(config.port));
  if (config.identityFile) {
    const key = config.identityFile.startsWith('~/') || config.identityFile.startsWith('~\\')
      ? path.join(os.homedir(), config.identityFile.slice(2)) : config.identityFile;
    args.push('-i', key, '-o', 'IdentitiesOnly=yes');
  }
  return args;
}
export const remoteQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;
export function remoteEnvPrefix(socket?: string): string {
  if (!socket) return '';
  const session = sessionOfSocket(socket);
  return `HERDR_SOCKET_PATH=${remoteQuote(socket)} ${session ? `HERDR_SESSION=${remoteQuote(session)} ` : ''}`;
}

export interface RemoteState {
  config: RemoteHostConfig;
  model?: Model;
  error?: string;
  connecting: boolean;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => address && typeof address !== 'string' ? resolve(address.port) : reject(new Error('No TCP port available')));
    });
  });
}

function sshStatus(config: RemoteHostConfig, ssh: SshCommand): Promise<{ running: boolean; socket?: string; compatible?: boolean; protocol?: number }> {
  const bin = config.binaryPath || 'herdr';
  const command = `${remoteEnvPrefix(config.socketPath)}${remoteQuote(bin)} status server --json`;
  return new Promise((resolve, reject) => {
    execFile(ssh.file, [...ssh.args, ...sshConnectionArgs(config), '-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', config.host, command],
      { timeout: 10000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) return reject(new Error(`SSH/Herdr status failed: ${stderr.trim() || error.message}`));
        try {
          const status = JSON.parse(stdout);
          if (typeof status?.running !== 'boolean') throw new Error('Invalid Herdr status');
          resolve(status);
        } catch (e) { reject(new Error(`Herdr status returned invalid JSON: ${e instanceof Error ? e.message : e}`)); }
      });
  });
}

async function waitForForward(proc: ChildProcess, port: number, sshError: () => string): Promise<void> {
  let spawnError: Error | undefined;
  proc.once('error', (error) => { spawnError = error; });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (proc.exitCode !== null || proc.signalCode !== null || proc.killed) throw new Error(`SSH tunnel exited${sshError() ? `: ${sshError()}` : ''}`);
    const ready = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`SSH tunnel did not start${sshError() ? `: ${sshError()}` : ''}`);
}

export class RemoteHost {
  readonly client: HerdrClient;
  model?: Model;
  error?: string;
  connecting = false;
  private tunnel?: ChildProcess;
  private port?: number;
  socketPath?: string;
  private pending?: Promise<void>;
  private disposed = false;

  constructor(readonly config: RemoteHostConfig, private changed: () => void,
    private ssh: SshCommand = { file: 'ssh', args: [] }) {
    this.client = new HerdrClient(() => ({ host: '127.0.0.1', port: this.port || 0 }));
  }

  get state(): RemoteState { return { config: this.config, model: this.model, error: this.error, connecting: this.connecting }; }

  refresh(): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = this.doRefresh().finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private async doRefresh(): Promise<void> {
    if (this.disposed) return;
    this.connecting = !this.model;
    this.changed();
    try {
      if (!this.tunnel || this.tunnel.exitCode !== null || this.tunnel.signalCode !== null || !this.port) await this.openTunnel();
      const response = await this.client.request<SessionSnapshotResult>('session.snapshot');
      if (this.disposed) return;
      this.model = normalize(response);
      this.error = undefined;
    } catch (e) {
      if (this.disposed) return;
      this.closeTunnel();
      this.model = undefined;
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.connecting = false;
      if (!this.disposed) this.changed();
    }
  }

  private async openTunnel(): Promise<void> {
    this.closeTunnel();
    const status = await sshStatus(this.config, this.ssh);
    if (!status.running) throw new Error('Herdr server is not running on this host');
    if (status.compatible === false || (status.protocol !== undefined && status.protocol !== HERDR_PROTOCOL))
      throw new Error(`Herdr protocol ${status.protocol ?? '?'} is incompatible`);
    const socket = this.config.socketPath || status.socket;
    if (!socket || !socket.startsWith('/')) throw new Error('Herdr did not report an absolute Unix socket path');
    this.socketPath = socket;
    const port = await freePort();
    if (this.disposed) return;
    const tunnel = spawn(this.ssh.file, [...this.ssh.args, ...sshConnectionArgs(this.config), '-N', '-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', '-o', 'ExitOnForwardFailure=yes',
      '-L', `127.0.0.1:${port}:${socket}`, this.config.host], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    tunnel.stderr?.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    this.tunnel = tunnel;
    this.port = port;
    try { await waitForForward(tunnel, port, () => stderr.trim()); }
    catch (e) { this.closeTunnel(); throw e; }
  }

  private closeTunnel() {
    this.tunnel?.kill();
    this.tunnel = undefined;
    this.port = undefined;
  }

  dispose() { this.disposed = true; this.closeTunnel(); }
}
