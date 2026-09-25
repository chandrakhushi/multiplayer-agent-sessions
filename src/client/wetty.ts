import { dom, library } from '@fortawesome/fontawesome-svg-core';
import { faCogs, faKeyboard } from '@fortawesome/free-solid-svg-icons';

import '../assets/scss/styles.scss';

import { disconnect } from './wetty/disconnect';
import { overlay } from './wetty/disconnect/elements';
import { pickOrJoin, session } from './wetty/session';
import { socket } from './wetty/socket';
import { terminal, Term } from './wetty/term';

if ('serviceWorker' in navigator) {
  const scripts = Array.from(document.getElementsByTagName('script'));
  const own = scripts.find((s) => s.src.endsWith('/wetty.js'));
  if (own) {
    const base = own.src.replace(/\/client\/wetty\.js$/, '');
    void navigator.serviceWorker.register(`${base}/sw.js`, {
      scope: `${base}/`,
    });
  }
}

// Setup for fontawesome
library.add(faCogs);
library.add(faKeyboard);
dom.watch();

function onResize(term: Term): () => void {
  return function resize() {
    term.resizeTerm();
  };
}

function setup(term: Term): void {
  window.addEventListener('resize', onResize(term), false);
  term.resizeTerm();
  // Read-only view: v1 input goes through claim buttons so the broker can
  // enforce locks, so xterm onData is not forwarded to 'input'.
  term.options.disableStdin = true;

  term.onResize((size: { cols: number; rows: number }) => {
    socket.emit('resize', size);
  });
  socket
    .on('data', (data: string) => {
      term.write(data);
    })
    .on('login', () => {
      term.writeln('');
      term.resizeTerm();
    })
    .on('logout', disconnect)
    .on('disconnect', disconnect)
    .on('error', (err: string | null) => {
      if (err) disconnect(err);
    });

  session(socket, () => {
    // Server (re)sends this viewer's redacted stream after 'joined'.
    term.reset();
    term.resizeTerm();
  });
}

let term: Term | undefined;

socket.on('connect', () => {
  if (overlay !== null) overlay.style.display = 'none';
  if (term === undefined) {
    term = terminal(socket);
    if (term === undefined) return;
    setup(term);
  }
  pickOrJoin(socket);
});
