'use strict';
if (window.gestorDesktop) {
  const bridge = window.gestorDesktop;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (url, options = {}) => {
    if (!['/api/auth.js', '/api/state.js'].includes(url)) return originalFetch(url, options);
    const result = await bridge.request(url, { method: options.method || 'GET', body: options.body });
    return new Response(JSON.stringify(result.data), { status: result.status, headers: { 'Content-Type': 'application/json' } });
  };
  const field = document.createElement('label');
  field.className = 'field'; field.textContent = 'Servidor HTTPS de sincronização';
  const input = document.createElement('input'); input.name = 'server'; input.type = 'url'; input.placeholder = 'https://seu-servidor-de-teste.vercel.app'; input.required = true;
  field.append(input); document.querySelector('#loginForm').prepend(field);
  const bar = document.createElement('section'); bar.className = 'desktop-status'; bar.setAttribute('aria-label', 'Sincronização desktop');
  bar.innerHTML = '<span id="desktopConnection" role="status" aria-live="polite"></span><button type="button" class="button small" id="desktopRetry">Sincronizar</button><button type="button" class="button small" id="desktopReview" hidden>Revisar versões</button><button type="button" class="button small" id="desktopImport">Importar dados web</button><button type="button" class="button small" id="desktopBackup">Backup SQLite</button>';
  document.querySelector('main').prepend(bar);
  const dialog = document.createElement('dialog'); dialog.id = 'desktopConflict'; dialog.setAttribute('aria-labelledby', 'desktopConflictTitle'); document.body.append(dialog);
  let status;
  const update = value => {
    status = value;
    const names = { online: 'Online', offline: 'Offline', syncing: 'Sincronizando', expired: 'Sessão expirada' };
    document.querySelector('#desktopConnection').textContent = `${value.conflict ? 'Conflito · ' : ''}${names[value.connection] || 'Offline'} · ${value.pending} envio pendente · última sincronização: ${value.lastSync ? new Date(value.lastSync).toLocaleString('pt-BR') : 'nenhuma'}${value.error ? ' · ' + value.error : ''}`;
    document.querySelector('#desktopReview').hidden = !value.conflict;
    document.body.dataset.syncConflict = value.conflict ? 'true' : 'false';
  };
  bridge.onStatus(update);
  bridge.status().then(value => { input.value = value.server || ''; update(value); });
  document.querySelector('#desktopRetry').onclick = () => bridge.retry().then(update);
  document.querySelector('#desktopImport').onclick = async () => { if(!confirm('Importar uma cópia dos dados web para o espaço desktop vazio? A versão web será apenas lida.'))return;try{await window.desktopFlush();await bridge.importWeb();location.reload();}catch(error){alert(error.message);}};
  document.querySelector('#desktopBackup').onclick = () => bridge.backup().catch(error => alert(error.message));
  document.querySelector('#desktopReview').onclick = async () => {
    const current = await bridge.status();
    if (!current.conflict) return;
    const localResponse = await window.fetch('/api/state.js');
    if (!localResponse.ok) { alert('Entre novamente para revisar dados.'); return; }
    const local = await localResponse.json();
    dialog.replaceChildren();
    const title = document.createElement('h2'); title.id = 'desktopConflictTitle'; title.textContent = 'Revisão obrigatória de versões'; dialog.append(title);
    const note = document.createElement('p'); note.textContent = 'Duas versões do planejamento foram preservadas. Compare os dados completos abaixo. A escolha vale para todo o espaço de trabalho. As duas versões serão arquivadas no SQLite; exporte um backup antes de continuar.'; dialog.append(note);
    for (const [label, data] of [['Neste computador', local], ['No servidor · revisão ' + current.conflict.revision, current.conflict.state]]) {
      const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = label; const pre = document.createElement('pre'); pre.textContent = JSON.stringify(data, null, 2); details.append(summary, pre); dialog.append(details);
    }
    for (const [choice, label] of [['remote', 'Usar versão do servidor'], ['local', 'Enviar versão deste computador']]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'button'; button.textContent = label;
      button.onclick = async () => {
        if (!confirm('Confirma a escolha para TODO o planejamento? As versões anteriores ficarão no backup local.')) return;
        button.disabled = true;
        try { await window.desktopFlush(); await bridge.resolve(choice, current.conflict.revision); location.reload(); } catch (error) { alert(error.message); button.disabled = false; }
      }; dialog.append(button);
    }
    const close = document.createElement('button'); close.className = 'button'; close.textContent = 'Decidir depois'; close.onclick = () => dialog.close(); dialog.append(close); dialog.showModal();
  };
}
