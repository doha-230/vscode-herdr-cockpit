// SSH host editor. The extension owns validation, storage and all network operations.
// @ts-check
(function () {
  // @ts-ignore provided by VS Code
  const vscode = acquireVsCodeApi();
  const form = /** @type {HTMLFormElement} */ (document.getElementById('hostForm'));
  const saved = /** @type {HTMLSelectElement} */ (document.getElementById('savedHosts'));
  const result = /** @type {HTMLElement} */ (document.getElementById('result'));
  /** @type {Record<string, any>[]} */
  let hosts = [];
  /** @type {string|undefined} */
  let originalHost;

  const input = (/** @type {string} */ name) => /** @type {HTMLInputElement} */ (form.elements.namedItem(name));
  const fields = ['host', 'label', 'user', 'port', 'identityFile', 'binaryPath', 'socketPath'];
  function values() {
    return Object.fromEntries(fields.map((name) => [name, input(name).value.trim()]));
  }
  function fill(/** @type {Record<string, any>|undefined} */ config) {
    for (const name of fields) input(name).value = String(config?.[name] ?? '');
    originalHost = config?.host;
    saved.value = originalHost || '';
    /** @type {HTMLButtonElement} */ (document.getElementById('removeHost')).disabled = !originalHost;
    result.textContent = '';
    result.className = '';
  }
  function showResult(/** @type {boolean} */ ok, /** @type {string} */ detail) {
    result.textContent = detail;
    result.className = ok ? 'ok' : 'error';
  }
  function busy(/** @type {boolean} */ on, /** @type {string} */ detail = '') {
    for (const button of /** @type {NodeListOf<HTMLButtonElement>} */ (form.querySelectorAll('button'))) button.disabled = on;
    if (!on) /** @type {HTMLButtonElement} */ (document.getElementById('removeHost')).disabled = !originalHost;
    if (on) { result.textContent = detail; result.className = 'pending'; }
  }
  saved.addEventListener('change', () => fill(hosts.find((h) => h.host === saved.value)));
  document.getElementById('newHost')?.addEventListener('click', () => { fill(undefined); input('host').focus(); });
  document.getElementById('pickKey')?.addEventListener('click', () => vscode.postMessage({ type: 'pickKey' }));
  document.getElementById('testHost')?.addEventListener('click', () => {
    busy(true, 'Testing SSH and Herdr…');
    vscode.postMessage({ type: 'test', config: values() });
  });
  document.getElementById('removeHost')?.addEventListener('click', () => {
    if (originalHost) vscode.postMessage({ type: 'remove', host: originalHost });
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    busy(true, 'Saving SSH host…');
    vscode.postMessage({ type: 'save', config: values(), originalHost });
  });
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message?.type === 'hosts') {
      hosts = Array.isArray(message.hosts) ? message.hosts : [];
      saved.replaceChildren();
      const empty = document.createElement('option');
      empty.value = ''; empty.textContent = 'New host';
      saved.append(empty);
      for (const host of hosts) {
        const option = document.createElement('option');
        option.value = host.host;
        option.textContent = host.label ? `${host.label} (${host.host})` : host.host;
        saved.append(option);
      }
      const chosen = message.selected !== undefined ? message.selected : originalHost;
      fill(hosts.find((h) => h.host === chosen));
    } else if (message?.type === 'key' && typeof message.path === 'string') {
      input('identityFile').value = message.path;
    } else if (message?.type === 'result') {
      busy(false);
      showResult(!!message.ok, String(message.detail || ''));
    }
  });
  vscode.postMessage({ type: 'ready' });
})();
