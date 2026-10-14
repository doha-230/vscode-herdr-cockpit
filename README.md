# Herdr Cockpit — Local and SSH Hosts

English first · [한국어 안내](#한국어)

Manage Herdr spaces, agents and terminals in VS Code, including local and configured SSH hosts in one sidebar. This fork of [the original Herdr Cockpit](https://github.com/sriharirao92/vscode-herdr-cockpit) also fixes **Windows connections that failed even while the Herdr server was running**.

[**Download v0.3.0 VSIX**](https://github.com/doha-230/vscode-herdr-cockpit/releases/download/v0.3.0/herdr-cockpit-0.3.0.vsix) · [한국어 HTML 매뉴얼](https://github.com/doha-230/vscode-herdr-cockpit/releases/download/v0.3.0/herdr-cockpit-manual-ko.html) · [Releases](https://github.com/doha-230/vscode-herdr-cockpit/releases).

## What we fixed

The Windows Herdr 0.9.3 server was running, and the CLI could query both server status and the session snapshot. The VS Code extension still reported:

```text
Herdr isn't answering
connect ENOTSOCK ...\herdr\herdr.sock
```

| Problem | Cause | Fix and scope |
| --- | --- | --- |
| Extension cannot connect to a running Windows server | The client opened the logical socket path as a Unix socket. Windows Herdr communicates through a named pipe; the disk file at that path is not the transport socket. | Added Windows transport-path conversion in `src/herdrClient.ts` for both API requests and live event subscriptions. Included in source and the v0.2.2 VSIX. |
| Default Windows socket path cannot be found | The client defaulted to the macOS/Linux path, `~/.config/herdr/herdr.sock`. | Use `%APPDATA%/herdr/herdr.sock` on Windows, including the corresponding path for named sessions. Included in source and the VSIX. |
| Executable and socket settings are incorrect | On the affected PC, `herdr.binaryPath` pointed to a directory rather than the executable, and the socket path contained excessive backslashes. | Corrected that PC's settings to point to `herdr.exe` and the logical socket path. **Machine-specific paths are not bundled in the VSIX.** |
| Sidebar appears on the left instead of the screenshot's right side | This is VS Code's saved layout, separate from server connectivity. | Right-click the Herdr activity-bar icon → **Move To → Secondary Side Bar**. No automatic relocation code was added. |

On Windows, the transport combines the `\\.\pipe\` prefix with the normalized logical socket path. Already-prefixed named-pipe paths are left unchanged. macOS/Linux retain Unix socket connections, and CLI environment variables continue to use the logical socket path.

We first patched the installed extension's JavaScript and verified the live connection, then applied the same fix to TypeScript source and built and released v0.2.2 from that source.

## Windows installation and settings

1. Download this fork's VSIX using the link above. The upstream Marketplace version may not include this fork's fix.
2. In VS Code, choose **Extensions → ⋯ → Install from VSIX…**.
3. Run the Herdr server and configure its paths if needed.
4. Run **Developer: Reload Window**.

The original extension ID, `sriharirao.herdr-cockpit`, is retained so this VSIX upgrades an existing installation. This fork is distributed through GitHub releases; it does not publish to the original author's Marketplace or Open VSX listing. Installing a later upstream version may replace this fork.

Set `herdr.binaryPath` to the **full executable path**, including `herdr.exe`:

```json
{
  "herdr.binaryPath": "C:/Tools/herdr/herdr.exe",
  "herdr.socketPath": ""
}
```

Replace the example executable path with your own installation location. With an empty `herdr.socketPath`, `HERDR_SOCKET_PATH` takes priority; otherwise the default is `%APPDATA%/herdr/herdr.sock`. Named sessions use `%APPDATA%/herdr/sessions/<name>/herdr.sock`.

For a custom socket setting, enter the **logical socket file path**, without the `\\.\pipe\` prefix. In JSON, escape backslashes as `\\`, or use forward slashes as in the example.

## Validation and limitations

- Verified against a real Windows Herdr **0.9.3 / protocol 22** server: session snapshots, event subscriptions, and spaces and shells shown in the VS Code sidebar.
- `src/test/transportTest.ts` covers Windows pipe conversion, duplicate-prefix prevention, default and named-session paths, and actual request/subscription exchanges with a test server.
- TypeScript compilation, lint and the Windows transport regression test passed. Linux/macOS full test suites and the GitHub release build also passed.
- Not every agent-launch or usage-reporting feature has been validated on Windows. The POSIX shell-based companion plugin is not fully validated on Windows either.

## Build and release

```sh
npm ci
npm run compile
npm run lint
node out/test/transportTest.js
npm run package
```

The package is written to `herdr-cockpit-<version>.vsix`. The full `npm test` suite includes Unix executable and shell fixtures and is validated in Linux/macOS CI.

A `package.json` version change pushed to `main`, or a matching version tag, triggers the Release workflow. It tests, packages and creates a GitHub release with a versioned VSIX, the stable filename `herdr-cockpit.vsix`, and the standalone Korean HTML manual. Forks must enable **GitHub Actions** first.

## Repository summary / 저장소 설명

Herdr Cockpit in VS Code with local and SSH host management, Windows named pipe fixes and VSIX builds. | 로컬·SSH 서버 동시 관리, Windows named pipe 연결 수정, VSIX 빌드.

## Upstream features and usage

The following describes the upstream project's features. Windows support in this fork is limited to the validation scope above.

Run your [Herdr](https://herdr.dev) agents and do everything around them in **one VS Code window**.

Herdr keeps your coding agents (Claude Code, Codex, Kiro, Cursor Agent, Copilot, Gemini and more) running in its terminal multiplexer. Herdr Cockpit brings its spaces, agents and shells into VS Code, so the editor around them is the real one.

![Herdr Cockpit: a Herdr space in VS Code, with its agents as terminal tabs, the files they changed, and the Herdr Cockpit sidebar on the right](docs/images/vscode.png)

## Why Herdr Cockpit

- **One window instead of a stack of plugins and windows.** No need to add separate Herdr plugins for a file explorer, a web UI or a git reviewer, or to juggle a terminal and several VS Code windows. Switch a space and its folder, files, Source Control, diffs and every agent and shell (as terminal tabs) are right there.
- **Everything VS Code can do, next to your agents.** Your extensions, language servers, debuggers, notebooks, Markdown preview, image and PDF viewers, and side-by-side diffs work on the files your agents are changing.
- **Agent usage in one place.** Plan limits for Claude Code, Codex and Kiro side by side: 5-hour and weekly windows with reset times, tokens in the current session, and Kiro credits.
- **Terminal tabs that behave like Herdr.** Drag to select and copy, scroll Herdr's scrollback, and keep tabs and Herdr in sync: **+** and **Split** create panes, renames go both ways, and closing a tab closes it in Herdr (it asks first for agents).

**From Herdr's terminal to VS Code in one keystroke.** The companion [Herdr plugin](#the-herdr-plugin) opens the space you're on, with its folder and every agent and shell as a tab:

![The same Herdr space, in Herdr's terminal and in VS Code. The Herdr Cockpit plugin's Open in editor key (ctrl+b, then shift+E) takes you from one to the other](docs/images/terminal-to-vscode.png)

**The sidebar** shows what every agent is doing, what each agent's plan has left, who is waiting for you, and each space's git state:

![The Herdr Cockpit sidebar: agent counters, usage for Claude Code, Codex and Kiro, a Needs you list with the end of each agent's screen, and spaces with their branch and changes](docs/images/sidebar.png)

<sub>Images from a demo session (`docs/screenshots`): real Herdr and the real sidebar, with made-up repos, agent screens and usage numbers.</sub>

The upstream extension works in **VS Code, Cursor, Kiro and Positron** on **macOS and Linux**. This fork additionally fixes Windows connections in VS Code, within the validation scope above. A community project, not affiliated with Herdr.

## Features

- **Spaces & Agents sidebar**, live from Herdr: each space is a card with its branch and changes; agents show a colored status (working, blocked, done, idle), time in state and a one-line summary of what they last said. **Needs you** lists blocked and done agents with a preview of their screen. **Shells** show what is running, or the last command and its output.
- **Switch spaces**: click one to swap its folder into the window (Explorer, Search and Source Control follow) and open its agents and shells as tabs, most urgent first. Put agents and shells side by side with `herdr.terminalLocation` = `editorSplit`.
- **Create from the editor**: new spaces (a folder or a new git worktree), new tabs with a shell or an agent; the terminal **+** creates Herdr tabs in the Cockpit window. Rename and close in Herdr.
- **Usage**: Claude Code, Codex and Kiro plan limits (5-hour and weekly windows, reset times, Kiro credits) while their agents run.
- **Review changes**: an agent's diffs, offered when it finishes.
- **Follow mode**: switch spaces in Herdr's terminal and the Cockpit window follows.
- **When Herdr isn't running**: says why (not installed, not running, crashed, incompatible), starts it in the background on request, and reconnects when it's back.

## Requirements

- Herdr 0.9 (socket protocol 22; tested with 0.9.1) on the extension host and on each configured SSH host. A newer protocol needs a Cockpit update. In a Remote-SSH window, the extension host is the server; use a local VS Code window to aggregate your desktop and SSH hosts.
- macOS or Linux for the upstream feature set; Windows connection support in this fork is described above.

## Get started

1. Install **Herdr Cockpit** from the Extensions view (VS Code Marketplace; Open VSX for Cursor, Kiro and Positron), or download the `.vsix` from [Releases](https://github.com/doha-230/vscode-herdr-cockpit/releases) and run `code --install-extension herdr-cockpit.vsix` (or `cursor`, `kiro`, `positron`).
2. Run Herdr as usual, or click **Start Herdr** in the sidebar.
3. Run **Herdr Cockpit: Set Up Cockpit Window**. The Cockpit window's first folder (`~/.herdr-cockpit`) never changes, so switching spaces never restarts your extensions.
4. Click a space.

The **Get started with Herdr Cockpit** walkthrough covers the same steps (Command Palette: **Welcome: Open Walkthrough…**).

**Can't see the sidebar?** In Cursor the activity bar is a row of icons across the top of the sidebar, and Herdr Cockpit may be behind the **⌄** arrow at its end. The Command Palette always works: **Herdr Cockpit: Focus on Spaces & Agents View**.

## The Herdr plugin

Working in Herdr's terminal? The companion plugin jumps from Herdr to the editor:

```bash
herdr plugin install sriharirao92/vscode-herdr-cockpit/plugin
```

- **Open in editor**: the space and pane you're on, in the Cockpit window.
- **Open selected file in editor**: select `src/app.ts:42:7` (or `app.py", line 12`, `file.ts(42,7)`, `file.ts#L42`) in any pane.
- **Review changes in editor**, **Status**, and **Set up editor** (finds your editors, installs the extension, offers keybindings).

See [plugin/README.md](plugin/README.md).

## Settings

### Local and SSH hosts in one sidebar

Run **Herdr Cockpit: Add SSH Host…** or use **Add SSH host…** at the bottom of the sidebar. Remove a host with its **×** button or **Herdr Cockpit: Remove SSH Host…**. Enter an alias from your `~/.ssh/config`. SSH key authentication must work without a prompt (`ssh -o BatchMode=yes my-server`), and Herdr must already be running on the remote Linux/macOS host. OpenSSH, including your configured port, identity and jump host, is used for a local TCP tunnel to the remote Unix socket. The remote Herdr socket is never exposed on a public network interface.

For more control, set the machine setting directly:

```json
"herdr.remoteHosts": [
  { "host": "my-server", "label": "Build server" },
  { "host": "lab", "binaryPath": "/home/me/.local/bin/herdr", "socketPath": "/home/me/.config/herdr/herdr.sock" }
]
```

The sidebar groups spaces by machine and includes remote agents in the totals and **Needs you** list. Click a remote space to focus it in Herdr and open its panes as SSH terminal tabs. You can create tabs and spaces, start agents, rename and close remote items in the same sidebar. **Open folder** uses the VS Code Remote-SSH extension to open the remote path in another window for Explorer, Git and diffs. Remote usage and Git data are shown in that Remote-SSH window, not in the aggregated local sidebar. SSH hosts require Unix sockets; Windows remote hosts are not supported by this tunnel.

Expanded spaces, shell groups, agent details and the Usage section are saved per workspace and restored when the same workspace is reopened. The SSH tunnel test runs on Linux with a simulated SSH server; a live Windows SSH client to Linux/macOS host has not yet been validated.

All settings start with `herdr.`; the guide (`?` in the sidebar) lists them. Most used:

| Setting | |
|---|---|
| `herdr.terminalLocation` | `editor`, `editorSplit` (agents left, shells right) or `panel` |
| `herdr.autoAttachShells` | Also open plain shells when switching spaces |
| `herdr.closeTabInHerdr` | Closing a tab's X closes it in Herdr: `ask` (idle shells close at once; agents and busy shells ask), `always`, `never` |
| `herdr.offerHubOnStartup` | Offer to open Herdr Cockpit when a window opens: `emptyWindows` (default), `allWindows`, `never` |
| `herdr.startServer` | Start Herdr when the Cockpit window opens: `ask`, `always`, `never` |
| `herdr.binaryPath`, `herdr.socketPath` | A herdr binary or socket (named session) Herdr Cockpit doesn't find itself |

## Privacy and security

By default, Herdr Cockpit talks only to your local Herdr server. Configured SSH hosts are contacted through OpenSSH, which carries Herdr requests over an encrypted tunnel. The extension runs read-only git in trusted windows and reads usage from agents' local files (never credentials). See [SECURITY.md](SECURITY.md).

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). `npm test` needs no editor.

## License

[MIT](LICENSE). Agent logos: see [media/THIRD_PARTY_NOTICES.md](media/THIRD_PARTY_NOTICES.md).


---

## 한국어

Herdr의 작업 공간과 에이전트, 터미널을 VS Code에서 사용하는 확장 프로그램입니다. 이 저장소는 [원본 Herdr Cockpit](https://github.com/sriharirao92/vscode-herdr-cockpit)을 기반으로, **Windows에서 서버가 실행 중인데도 확장이 연결되지 않던 문제**를 수정한 포크입니다.

[**v0.3.0 VSIX 다운로드**](https://github.com/doha-230/vscode-herdr-cockpit/releases/download/v0.3.0/herdr-cockpit-0.3.0.vsix) · [HTML 사용 설명서](https://github.com/doha-230/vscode-herdr-cockpit/releases/download/v0.3.0/herdr-cockpit-manual-ko.html) · [릴리즈](https://github.com/doha-230/vscode-herdr-cockpit/releases).

### 로컬과 SSH 서버를 한 화면에서 관리

명령 팔레트에서 **Herdr Cockpit: Add SSH Host…**를 실행하고 `~/.ssh/config`의 호스트 별칭을 입력합니다. 원격 Linux/macOS 서버에서 Herdr가 실행 중이어야 하며, `ssh -o BatchMode=yes 호스트별칭`이 암호 입력 없이 연결되어야 합니다. 사이드바에 로컬과 각 원격 서버의 공간·에이전트 상태가 함께 표시됩니다. 원격 공간과 탭 열기, 에이전트 시작, 이름 변경, 종료, 새 공간 만들기를 사이드바에서 조작할 수 있습니다. **Open folder**는 파일 탐색·Git·diff를 위해 별도의 VS Code Remote-SSH 창을 엽니다.

설정에서 별칭과 원격 실행 파일·소켓 경로를 직접 지정할 수도 있습니다:

```json
"herdr.remoteHosts": [
  { "host": "my-server", "label": "작업 서버" },
  { "host": "lab", "binaryPath": "/home/me/.local/bin/herdr" }
]
```

로컬 VS Code 창에서 확장을 실행해야 데스크톱과 SSH 서버가 함께 보입니다. Remote-SSH 창에서 확장이 실행되면 그 서버가 로컬로 간주됩니다. 원격 사용량과 Git 정보는 해당 Remote-SSH 창에서 확인합니다. 원격 연결에는 Unix 소켓을 사용하므로 Windows 원격 서버는 현재 지원하지 않습니다.

공간·셸 그룹·에이전트 상세 정보·사용량 영역의 접기 상태는 작업 공간별로 저장되어 같은 작업 공간을 다시 열면 복원됩니다. SSH 터널은 Linux에서 모의 SSH 서버로 테스트했으며, Windows SSH 클라이언트에서 실제 원격 서버까지 연결하는 검증은 아직 하지 않았습니다.

### 우리가 해결한 문제

Windows에서 Herdr 0.9.3 서버는 정상 실행 중이었고 CLI의 서버 상태 조회와 세션 조회도 성공했습니다. 하지만 VS Code 확장에는 다음 오류가 표시됐습니다.

```text
Herdr isn't answering
connect ENOTSOCK ...\herdr\herdr.sock
```

| 문제 | 원인 | 해결 및 반영 위치 |
| --- | --- | --- |
| 서버가 실행 중인데 확장 연결 실패 | 확장이 논리적 소켓 경로를 Unix 소켓처럼 직접 열었습니다. Windows Herdr는 named pipe로 통신하며, 같은 이름의 디스크 파일은 통신 소켓이 아닙니다. | `src/herdrClient.ts`에 Windows 전송 경로 변환을 추가했습니다. 일반 API 요청과 실시간 이벤트 구독 모두 사용합니다. 소스와 v0.2.2 VSIX에 포함됩니다. |
| Windows 기본 소켓 위치를 찾지 못함 | 기본 경로가 macOS/Linux의 `~/.config/herdr/herdr.sock`으로 고정돼 있었습니다. | Windows 기본 경로를 `%APPDATA%/herdr/herdr.sock`으로 변경했습니다. 이름 있는 세션 경로도 같은 기준을 사용합니다. 소스와 VSIX에 포함됩니다. |
| 실행 파일과 소켓 경로 설정 오류 | 실제 PC의 `herdr.binaryPath`에 실행 파일 대신 폴더가 지정됐고, 소켓 경로에 역슬래시가 과도하게 들어 있었습니다. | 해당 PC의 VS Code 설정을 실제 `herdr.exe`와 올바른 논리적 소켓 경로로 수정했습니다. **개인 PC의 경로 설정은 VSIX에 포함되지 않습니다.** |
| 설명 이미지와 달리 패널이 왼쪽에 표시됨 | VS Code의 기본 사이드바 배치 차이입니다. 연결 오류와 별개입니다. | Herdr 아이콘 우클릭 → **Move To → Secondary Side Bar**로 오른쪽에 배치할 수 있습니다. 자동 배치 코드를 추가한 것은 아닙니다. |

Windows 전송 경로는 `\\.\pipe\` 접두사와 정규화한 논리적 소켓 경로를 조합합니다. 이미 named-pipe 경로인 경우 접두사를 중복해서 붙이지 않습니다. macOS/Linux의 Unix 소켓 연결 방식은 유지합니다. CLI 환경 변수에는 논리적 소켓 경로를 전달합니다.

설치된 확장의 JavaScript를 먼저 수정해 실제 연결을 확인한 뒤, 같은 수정을 TypeScript 소스에 반영하고 소스에서 v0.2.2 VSIX를 빌드·릴리즈했습니다.

### Windows 설치 및 설정

1. 위 링크에서 이 포크의 VSIX를 다운로드합니다. 원본 Marketplace 버전에는 이 포크의 수정이 들어 있지 않을 수 있습니다.
2. VS Code의 **Extensions → ⋯ → Install from VSIX…**에서 설치합니다.
3. Herdr 서버를 실행하고 필요한 경로를 설정합니다.
4. **Developer: Reload Window**를 실행합니다.

기존 설치를 업데이트할 수 있도록 확장 ID `sriharirao.herdr-cockpit`을 유지했습니다. 이 포크는 GitHub VSIX로 배포하며, 원작자의 Marketplace/Open VSX에 게시하지 않습니다. 원본 버전으로 업데이트하면 이 수정판이 교체될 수 있습니다.

`herdr.binaryPath`는 **폴더가 아니라 실행 파일 전체 경로**여야 합니다. 예:

```json
{
  "herdr.binaryPath": "C:/Tools/herdr/herdr.exe",
  "herdr.socketPath": ""
}
```

위 실행 파일 경로는 예시이므로 자신의 설치 위치로 바꾸세요. `herdr.socketPath`가 비어 있으면 `HERDR_SOCKET_PATH` 환경 변수가 우선하며, 없으면 기본 경로를 사용합니다. 기본 세션은 `%APPDATA%/herdr/herdr.sock`, 이름 있는 세션은 `%APPDATA%/herdr/sessions/<name>/herdr.sock`입니다.

소켓 경로를 직접 지정할 때도 **논리적 소켓 파일 경로**를 입력하세요. `\\.\pipe\` 접두사는 설정에 넣지 않습니다. JSON에서 역슬래시는 `\\`로 이스케이프하거나, 위 예시처럼 슬래시를 사용할 수 있습니다.

### 검증 범위

- 실제 Windows PC의 Herdr **0.9.3 / 프로토콜 22**에 연결해 세션 조회, 이벤트 구독과 VS Code 사이드바의 작업 공간·셸 표시를 확인했습니다.
- `src/test/transportTest.ts`로 Windows named-pipe 변환, 접두사 중복 방지, 기본·이름 있는 세션 경로, 실제 테스트 서버의 요청·구독 응답을 검증합니다.
- TypeScript 컴파일과 린트, Windows 전송 회귀 테스트가 통과했습니다. GitHub Actions의 Linux·macOS 전체 테스트와 릴리즈 빌드도 통과했습니다.
- 모든 에이전트 실행·사용량 표시 기능을 Windows에서 검증한 것은 아닙니다. POSIX 셸 기반의 companion plugin도 Windows에서 완전히 검증되지 않았습니다.

### 빌드 및 릴리즈

```sh
npm ci
npm run compile
npm run lint
node out/test/transportTest.js
npm run package
```

VSIX는 `herdr-cockpit-<version>.vsix`로 생성됩니다. 전체 `npm test`에는 Unix 실행 파일·셸을 사용하는 테스트가 있으므로 Linux/macOS CI에서 검증합니다.

`main`에 `package.json` 버전 변경을 푸시하거나 일치하는 버전 태그를 푸시하면 Release workflow가 테스트·패키징 후 GitHub 릴리즈를 만듭니다. 포크에서는 먼저 **Actions 활성화**가 필요합니다. 릴리즈에는 버전별 파일과 고정 이름 `herdr-cockpit.vsix`를 첨부합니다.

원본 프로젝트의 기능과 사용 안내는 위의 영어 섹션을 참고하세요. Windows 검증 범위는 이 섹션의 내용을 참고하세요.

