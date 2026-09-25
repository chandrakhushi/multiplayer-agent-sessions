import pty from 'node-pty';
import { logger as getLogger } from '../shared/logger.js';
import {
  TOOL_MARKER,
  participants,
  tickets,
  type Participant,
  type ToolCall,
} from '../shared/session.js';
import { listClaims, tryClaim } from './claims.js';
import { xterm } from './shared/xterm.js';
import type { IPty } from 'node-pty';
import type SocketIO from 'socket.io';

export type TaggedChunk = { text: string } | { call: ToolCall };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

function parseToolCall(line: string): ToolCall | undefined {
  try {
    const v: unknown = JSON.parse(line.slice(TOOL_MARKER.length));
    if (
      isObject(v) &&
      typeof v.tool === 'string' &&
      typeof v.owner === 'string' &&
      typeof v.output === 'string'
    ) {
      return { tool: v.tool, owner: v.owner, output: v.output };
    }
  } catch {
    // fall through: malformed marker lines are dropped, never forwarded
  }
  return undefined;
}

/**
 * Stateful parser for raw pty output. Narration is forwarded as soon as it
 * arrives; only a trailing partial line that could still become a marker is
 * held back, so marker text is never leaked to any client.
 */
export function createParser(): (data: string) => TaggedChunk[] {
  let pending = '';
  return (data) => {
    const lines = (pending + data).split('\n');
    const tail = lines.pop() ?? '';
    const out: TaggedChunk[] = [];
    let text = '';
    for (const line of lines) {
      if (line.startsWith(TOOL_MARKER)) {
        if (text) out.push({ text });
        text = '';
        const call = parseToolCall(line);
        if (call) out.push({ call });
        else getLogger().warn('Dropping malformed tool call line');
      } else {
        text += `${line}\n`;
      }
    }
    const couldBeMarker =
      TOOL_MARKER.startsWith(tail) || tail.startsWith(TOOL_MARKER);
    pending = couldBeMarker ? tail : '';
    if (!couldBeMarker) text += tail;
    if (text) out.push({ text });
    return out;
  };
}

const CYAN = '\x1b[36m';
const DIM = '\x1b[90m';
const RESET = '\x1b[0m';

export function filterForClient(
  chunk: TaggedChunk,
  participant: Participant,
): string {
  if ('text' in chunk) return chunk.text;
  const { tool, output } = chunk.call;
  // Ownership comes from the permission map, not the agent-supplied owner field.
  if (!participant.ownedTools.includes(tool)) {
    return `${DIM}│ 🔒 [redacted: ${tool} call using another participant's integration]${RESET}\r\n`;
  }
  const body = output
    .split(/\r?\n/)
    .map((l) => `${CYAN}│${RESET} ${l}\r\n`)
    .join('');
  return `${CYAN}┌─ ${tool} · your integration${RESET}\r\n${body}${CYAN}└─${RESET}\r\n`;
}

/** One shared agent pty, many sockets. Returns the per-connection handler. */
export function createBroker(
  stubPath: string,
): (socket: SocketIO.Socket) => void {
  const logger = getLogger();
  const joined = new Map<SocketIO.Socket, Participant>();
  // ponytail: unbounded in-memory history, cap or persist if sessions get long
  const history: TaggedChunk[] = [];
  const parse = createParser();
  let term: IPty | undefined;
  let exited = false;

  const connected = (): Participant[] => [
    ...new Map([...joined.values()].map((p) => [p.id, p])).values(),
  ];
  const broadcast = (event: string, payload?: unknown): void => {
    for (const s of joined.keys()) s.emit(event, payload);
  };

  function start(): IPty {
    const t = pty.spawn(process.execPath, [stubPath], xterm);
    logger.info('Agent stub started', { pid: t.pid, stubPath });
    // ponytail: no per-socket flow control on the shared pty; one slow client
    // can't pause it. Add wetty's FlowControlServer per socket if output gets heavy.
    t.onData((data) => {
      for (const chunk of parse(data)) {
        history.push(chunk);
        for (const [s, p] of joined) s.emit('data', filterForClient(chunk, p));
      }
    });
    t.onExit(({ exitCode }) => {
      logger.info('Agent stub exited', { exitCode, pid: t.pid });
      exited = true;
      broadcast('logout');
    });
    return t;
  }

  return (socket) => {
    term ??= start();

    // No 'input'/'resize' listeners: the terminal is read-only for v1. Clients
    // steer the agent only through 'claim', so every stdin write is claim-checked.
    socket.on('join', (payload: unknown) => {
      if (joined.has(socket) || !isObject(payload)) return;
      const you = participants.find((p) => p.id === payload.participantId);
      if (!you) return;
      joined.set(socket, you);
      logger.info('Participant joined', { participant: you.id });
      socket.emit('joined', {
        you,
        participants: connected(),
        tickets,
        claims: listClaims(),
      });
      socket.emit('data', history.map((c) => filterForClient(c, you)).join(''));
      if (exited) socket.emit('logout');
      broadcast('presence', connected());
    });

    socket.on('claim', (payload: unknown) => {
      const you = joined.get(socket);
      if (!you || !isObject(payload)) return;
      const { resourceId } = payload;
      if (typeof resourceId !== 'string') return;
      if (!tickets.some((t) => t.id === resourceId)) return;
      if (
        listClaims().some(
          (c) => c.resourceId === resourceId && c.claimedBy === you.id,
        )
      ) {
        return;
      }
      const existing = tryClaim(resourceId, you.id);
      if (existing) {
        const claimedBy = participants.find((p) => p.id === existing.claimedBy);
        if (claimedBy) socket.emit('claim-rejected', { resourceId, claimedBy });
        return;
      }
      logger.info('Claim granted', { resourceId, participant: you.id });
      broadcast('claims', listClaims());
      if (!exited) term?.write(`resolve ${resourceId} ${you.id}\n`);
    });

    socket.on('disconnect', () => {
      if (joined.delete(socket)) broadcast('presence', connected());
    });
  };
}
