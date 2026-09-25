import { participants, tickets } from '../shared/session.js';
import { integrations, tools, type ToolContext } from './mock-tools.js';

const PREFIX = '\x1b[36m●\x1b[0m \x1b[2magent\x1b[0m';

// Raw mode turns off onlcr, so every line ends in an explicit \r\n.
function say(text: string): void {
  process.stdout.write(`${PREFIX} ${text}\r\n`);
}

function pause(): Promise<void> {
  const ms = 300 + Math.floor(Math.random() * 600);
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function startup(): Promise<void> {
  say('Hi team, support agent online.');
  await pause();
  /* eslint-disable no-await-in-loop */
  for (const p of participants) {
    for (const tool of p.ownedTools) {
      say(`Connected to ${p.name}'s ${integrations[tool] ?? tool} (${tool}).`);
      await pause();
    }
    if (p.ownedTools.length === 0) {
      say(`${p.name} (${p.role}) has no connected integrations.`);
      await pause();
    }
  }
  /* eslint-enable no-await-in-loop */
  say('Running a warm-up triage pass over the inbox…');
  await pause();
  const triage: ToolContext = {
    ticketId: 'triage',
    title: 'We received your support request',
  };
  say('Drafting an acknowledgement to the newest customer.');
  await pause();
  tools.send_email?.(triage);
  await pause();
  say('Logging the triage pass in the CRM.');
  await pause();
  tools.update_crm?.(triage);
  await pause();
  say(`Triage done. ${String(tickets.length)} open tickets in the queue.`);
  say('Waiting for someone to pick up a ticket…');
}

async function handle(line: string): Promise<void> {
  const [cmd, ticketId, participantId, ...rest] = line.trim().split(/\s+/);
  const ticket = tickets.find((t) => t.id === ticketId);
  const who = participants.find((p) => p.id === participantId);
  if (cmd !== 'resolve' || !ticket || !who || rest.length > 0) {
    say(`Ignored unrecognised command: ${JSON.stringify(line.trim())}`);
    return;
  }
  say(`Picking up ${ticket.id} (${ticket.title}) for ${who.name}…`);
  if (who.ownedTools.length === 0) {
    await pause();
    say(
      `${who.name} has no connected integrations, so I can only summarise ${ticket.id}, not act on it.`,
    );
    await pause();
    say(`${ticket.id} summarised for ${who.name}: "${ticket.title}".`);
    return;
  }
  // Steps run one after another on purpose so the narration reads in order.
  /* eslint-disable no-await-in-loop */
  for (const tool of who.ownedTools) {
    await pause();
    say(`Using ${who.name}'s ${integrations[tool] ?? tool} (${tool}).`);
    await pause();
    tools[tool]?.({ ticketId: ticket.id, title: ticket.title });
  }
  /* eslint-enable no-await-in-loop */
  await pause();
  say(`${ticket.id} resolved for ${who.name}.`);
}

let queue = startup();
function enqueue(line: string): void {
  if (!line.trim()) return;
  queue = queue.then(() => handle(line));
}

if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');

let buffer = '';
process.stdin.on('data', (chunk: string) => {
  if (chunk.includes('\x03')) process.exit(0);
  buffer += chunk;
  const lines = buffer.split(/\r?\n|\r/);
  buffer = lines.pop() ?? '';
  lines.forEach(enqueue);
});
process.stdin.on('end', () => {
  enqueue(buffer);
});
