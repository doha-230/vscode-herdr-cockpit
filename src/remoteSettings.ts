import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { RemoteHostConfig, validateRemoteConfig } from './remote';

export interface RemoteSettingsActions {
  hosts(): RemoteHostConfig[];
  save(config: RemoteHostConfig, originalHost?: string): Promise<{ connected: boolean; detail: string }>;
  remove(host: string): Promise<boolean>;
  test(config: RemoteHostConfig): Promise<string>;
}

/** A local, machine-scoped editor for SSH hosts. No password or private key content enters the webview. */
export class RemoteSettingsPanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private selected?: string;

  constructor(private extensionUri: vscode.Uri, private actions: RemoteSettingsActions) {}

  show(selected?: string) {
    this.selected = selected ?? '';
    if (this.panel) {
      this.panel.reveal();
      this.update(this.selected);
      return;
    }
    const panel = vscode.window.createWebviewPanel('herdr.remoteSettings', 'Herdr Cockpit · SSH Hosts', vscode.ViewColumn.Active,
      { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')] });
    this.panel = panel;
    panel.webview.onDidReceiveMessage((message: unknown) => { void this.handle(message); });
    panel.onDidDispose(() => { this.panel = undefined; });
    panel.webview.html = this.html(panel.webview);
  }

  update(selected = this.selected) {
    if (!this.panel) return;
    this.selected = selected;
    void this.panel.webview.postMessage({ type: 'hosts', hosts: this.actions.hosts(), selected });
  }

  private parseConfig(value: unknown): RemoteHostConfig {
    const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const field = (name: string) => typeof raw[name] === 'string' ? (raw[name] as string).trim() : '';
    const portText = field('port');
    return {
      host: field('host'),
      ...(field('label') ? { label: field('label') } : {}),
      ...(field('user') ? { user: field('user') } : {}),
      ...(portText ? { port: Number(portText) } : {}),
      ...(field('identityFile') ? { identityFile: field('identityFile') } : {}),
      ...(field('binaryPath') ? { binaryPath: field('binaryPath') } : {}),
      ...(field('socketPath') ? { socketPath: field('socketPath') } : {}),
    };
  }

  private async handle(value: unknown) {
    if (!value || typeof value !== 'object') return;
    const message = value as Record<string, unknown>;
    if (message.type === 'ready') return this.update();
    const result = (action: string, ok: boolean, detail: string) =>
      void this.panel?.webview.postMessage({ type: 'result', action, ok, detail });
    try {
      if (message.type === 'pickKey') {
        const picked = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
          openLabel: 'Use this SSH private key', title: 'Choose SSH private key' });
        if (picked?.[0]) void this.panel?.webview.postMessage({ type: 'key', path: picked[0].fsPath });
        return;
      }
      if (message.type === 'remove') {
        const host = typeof message.host === 'string' ? message.host : '';
        if (host && await this.actions.remove(host)) { this.selected = undefined; this.update(); result('remove', true, 'SSH host removed.'); }
        return;
      }
      if (message.type !== 'save' && message.type !== 'test') return;
      const config = this.parseConfig(message.config);
      const validation = validateRemoteConfig(config);
      if (validation) return result(String(message.type), false, validation);
      if (message.type === 'test') return result('test', true, await this.actions.test(config));
      const original = typeof message.originalHost === 'string' ? message.originalHost : undefined;
      const outcome = await this.actions.save(config, original);
      this.selected = config.host;
      this.update(config.host);
      result('save', outcome.connected, outcome.detail);
    } catch (error) {
      result(String(message.type), false, error instanceof Error ? error.message : String(error));
    }
  }

  private html(webview: vscode.Webview): string {
    const media = vscode.Uri.joinPath(this.extensionUri, 'media');
    const uri = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(media, file));
    const nonce = crypto.randomBytes(16).toString('base64');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${uri('remote-settings.css')}"><title>SSH Hosts</title></head><body>
<main><header><div><p class="eyebrow">Herdr Cockpit</p><h1>SSH hosts</h1><p>Save a Linux/macOS host and test its Herdr connection. These settings stay on this machine.</p></div></header>
<div class="layout"><aside><label for="savedHosts">Saved hosts</label><select id="savedHosts" size="8" aria-label="Saved SSH hosts"></select><button id="newHost" type="button">+ New host</button></aside>
<form id="hostForm"><div class="fields">
<label>SSH host or alias <span>Required</span><input name="host" autocomplete="off" placeholder="192.168.56.10 or vm-linux" required></label>
<label>Display name<input name="label" autocomplete="off" placeholder="Development VM"></label>
<label>SSH user<input name="user" autocomplete="username" placeholder="ubuntu"></label>
<label>SSH port<input name="port" type="number" min="1" max="65535" placeholder="22"></label>
<label class="full">Private key file <span>Path only; key contents are never stored here</span><div class="key-row"><input name="identityFile" autocomplete="off" placeholder="C:\\Users\\me\\.ssh\\id_ed25519"><button id="pickKey" type="button">Browse…</button></div></label>
<label class="full">Herdr executable on the remote host <span>Optional</span><input name="binaryPath" autocomplete="off" placeholder="/home/ubuntu/.local/bin/herdr"></label>
<label class="full">Herdr Unix socket on the remote host <span>Optional</span><input name="socketPath" autocomplete="off" placeholder="/home/ubuntu/.config/herdr/herdr.sock"></label>
</div><div class="actions"><button class="primary" type="submit">Save and connect</button><button id="testHost" type="button">Test SSH + Herdr</button><button id="removeHost" type="button">Remove host</button></div>
<div id="result" role="status" aria-live="polite"></div>
<p class="hint">SSH keys must work without a password prompt. Passphrase protected keys should be loaded in ssh-agent. For a new server, connect once in a terminal to verify and save its host fingerprint. <strong>Open folder</strong> through VS Code Remote-SSH also needs a matching entry in your SSH config when you use custom user, port or key fields here.</p>
</form></div></main><script nonce="${nonce}" src="${uri('remote-settings.js')}"></script></body></html>`;
  }

  dispose() { this.panel?.dispose(); }
}
