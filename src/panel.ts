// The "Spaces & Agents" sidebar: a webview view that renders a ViewState (src/viewState.ts)
// with media/panel.js + media/panel.css. User actions come back as Herdr commands.
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import type { ViewState } from './viewState';

export interface PanelAction {
  command: string;
  hostId?: string;
  spaceId?: string;
  paneId?: string;
}

export interface PanelUiState {
  open: Record<string, boolean>;
  shellsOpen: Record<string, boolean>;
  expanded: Record<string, boolean>;
  usageOpen?: boolean;
}

export class HerdrPanel implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = 'herdr.spaces';
  private view?: vscode.WebviewView;
  private state?: ViewState;
  private sent?: string;
  private subs: vscode.Disposable[] = [];
  private visibility = new vscode.EventEmitter<boolean>();
  readonly onDidChangeVisibility = this.visibility.event;

  constructor(
    private extensionUri: vscode.Uri,
    private onAction: (a: PanelAction) => void,
    private uiState: PanelUiState,
    private onUiState: (state: PanelUiState) => void,
  ) {}

  get visible(): boolean {
    return !!this.view?.visible;
  }

  set badge(b: vscode.ViewBadge | undefined) {
    if (this.view) this.view.badge = b;
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    this.sent = undefined;
    const media = vscode.Uri.joinPath(this.extensionUri, 'media');
    view.webview.options = { enableScripts: true, localResourceRoots: [media] };
    view.webview.html = this.html(view.webview, media);
    this.subs.push(
      view.webview.onDidReceiveMessage((m) => {
        if (m?.type === 'ready') {
          view.webview.postMessage({ type: 'uiState', state: this.uiState });
          this.flush(true);
        }
        else if (m?.type === 'uiState' && this.validUiState(m.state)) {
          this.uiState = m.state;
          this.onUiState(this.uiState);
        }
        else if (m?.type === 'cmd' && typeof m.command === 'string')
          this.onAction({ command: m.command, hostId: m.hostId, spaceId: m.spaceId, paneId: m.paneId });
      }),
      view.onDidChangeVisibility(() => {
        if (view.visible) this.flush(true);
        this.visibility.fire(view.visible);
      }),
      view.onDidDispose(() => {
        this.view = undefined;
        this.visibility.fire(false);
      }),
    );
    this.visibility.fire(view.visible);
  }

  private validUiState(state: unknown): state is PanelUiState {
    if (!state || typeof state !== 'object') return false;
    const s = state as Record<string, unknown>;
    const validMap = (map: unknown) => !!map && typeof map === 'object' &&
      Object.entries(map).length <= 2000 && Object.values(map).every((value) => typeof value === 'boolean');
    return validMap(s.open) && validMap(s.shellsOpen) && validMap(s.expanded) &&
      (s.usageOpen === undefined || typeof s.usageOpen === 'boolean');
  }

  update(state: ViewState) {
    this.state = state;
    this.flush(false);
  }

  /** Post the latest state unless the webview already has it. */
  private flush(force: boolean) {
    if (!this.view || !this.state) return;
    const json = JSON.stringify(this.state);
    if (!force && json === this.sent) return;
    this.sent = json;
    this.view.webview.postMessage({ type: 'state', state: this.state });
  }

  private html(webview: vscode.Webview, media: vscode.Uri): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const uri = (...p: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(media, ...p));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${uri('codicons', 'codicon.css')}" rel="stylesheet">
<link href="${uri('panel.css')}" rel="stylesheet">
<title>Herdr</title>
</head>
<body>
<main id="app" aria-label="Herdr spaces and agents"></main>
<script nonce="${nonce}" src="${uri('agent-icons.js')}"></script>
<script nonce="${nonce}" src="${uri('panel.js')}"></script>
</body>
</html>`;
  }

  dispose() {
    for (const s of this.subs) s.dispose();
    this.visibility.dispose();
  }
}
