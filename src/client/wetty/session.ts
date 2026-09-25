import Toastify from 'toastify-js';

import { participants, tickets as defaultTickets } from '../../shared/session';
import type {
  Claim,
  ClaimRejected,
  Participant,
  SessionState,
  Ticket,
} from '../../shared/session';
import type { Socket } from 'socket.io-client';

const STORAGE_KEY = 'agent-session:participant';

let you: Participant | undefined;
let present: Participant[] = [];
let tickets: Ticket[] = defaultTickets;
let claims: Claim[] = [];

const byId = (id: string): HTMLElement | null => document.getElementById(id);

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const nameOf = (id: string): string =>
  participants.find((p) => p.id === id)?.name ?? id;

function stored(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function remember(id: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage blocked: the picker just shows again on reload
  }
}

function renderPicker(socket: Socket): void {
  const options = byId('picker-options');
  if (options === null) return;
  options.replaceChildren(
    ...participants.map((p) => {
      const button = el('button', 'picker-option');
      button.setAttribute('type', 'button');
      button.append(
        el('span', 'picker-name', p.name),
        el('span', 'picker-role', p.role),
        el(
          'span',
          'picker-tools',
          p.ownedTools.length > 0
            ? `owns: ${p.ownedTools.join(', ')}`
            : 'no integrations',
        ),
      );
      button.addEventListener('click', () => {
        remember(p.id);
        socket.emit('join', { participantId: p.id });
      });
      return button;
    }),
  );
}

function renderYou(): void {
  const name = byId('you-name');
  const tools = byId('you-tools');
  if (name === null || tools === null || you === undefined) return;
  name.textContent = `You are ${you.name} · ${you.role}`;
  tools.replaceChildren(...you.ownedTools.map((t) => el('li', 'chip', t)));
}

function renderPresence(): void {
  const list = byId('presence');
  if (list === null) return;
  list.replaceChildren(
    ...present.map((p) => {
      const li = el('li', 'presence-item');
      li.append(el('span', 'dot'), el('span', '', `${p.name} · ${p.role}`));
      if (p.id === you?.id) li.append(el('span', 'you-marker', '(you)'));
      return li;
    }),
  );
}

function renderTickets(socket: Socket): void {
  const list = byId('tickets');
  if (list === null) return;
  list.replaceChildren(
    ...tickets.map((t) => {
      const claim = claims.find((c) => c.resourceId === t.id);
      const mine = claim !== undefined && claim.claimedBy === you?.id;
      const li = el(
        'li',
        `ticket${claim ? ' claimed' : ''}${mine ? ' mine' : ''}`,
      );
      let status = 'Open';
      if (mine) status = "You're handling this";
      else if (claim) status = `${nameOf(claim.claimedBy)} is handling this`;
      const head = el('div', 'ticket-head');
      head.append(el('span', 'ticket-id', t.id));
      head.append(el('span', 'ticket-status', status));
      li.append(head, el('div', 'ticket-title', t.title));
      if (!mine) {
        const button = el('button', 'resolve') as HTMLButtonElement;
        button.type = 'button';
        button.textContent = 'Resolve';
        button.setAttribute('aria-label', `Resolve ${t.id}: ${t.title}`);
        button.disabled = claim !== undefined;
        button.addEventListener('click', () => {
          socket.emit('claim', { resourceId: t.id });
        });
        li.append(button);
      }
      return li;
    }),
  );
}

/** Call on every socket 'connect': auto-join the remembered pick, else ask. */
export function pickOrJoin(socket: Socket): void {
  const picker = byId('picker') as HTMLDialogElement | null;
  const id = stored();
  if (id !== null && participants.some((p) => p.id === id)) {
    socket.emit('join', { participantId: id });
  } else if (picker !== null && !picker.open) {
    picker.showModal();
  }
}

/** Register the session UI's socket handlers once. */
export function session(socket: Socket, onJoined: () => void): void {
  const picker = byId('picker') as HTMLDialogElement | null;
  // Picking a name is required; don't let Escape dismiss the modal.
  picker?.addEventListener('cancel', (e) => {
    e.preventDefault();
  });
  renderPicker(socket);

  socket
    .on('joined', (state: SessionState) => {
      you = state.you;
      present = state.participants;
      tickets = state.tickets;
      claims = state.claims;
      picker?.close();
      renderYou();
      renderPresence();
      renderTickets(socket);
      onJoined();
    })
    .on('presence', (list: Participant[]) => {
      present = list;
      renderPresence();
    })
    .on('claims', (list: Claim[]) => {
      claims = list;
      renderTickets(socket);
    })
    .on('claim-rejected', ({ resourceId, claimedBy }: ClaimRejected) => {
      Toastify({
        text: `${claimedBy.name} is already handling ${resourceId}`,
        className: 'toast-warning',
        duration: 4000,
        gravity: 'bottom',
        position: 'left',
      }).showToast();
      claims = [
        ...claims.filter((c) => c.resourceId !== resourceId),
        { resourceId, claimedBy: claimedBy.id, claimedAt: Date.now() },
      ];
      renderTickets(socket);
    })
    .on('disconnect', () => picker?.close())
    .on('logout', () => picker?.close());
}
