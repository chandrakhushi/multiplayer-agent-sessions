import { participants, TOOL_MARKER, type ToolCall } from '../shared/session.js';

export interface ToolContext {
  ticketId: string;
  title: string;
}

interface Customer {
  contact: string;
  email: string;
  account: string;
  deal: string;
}

const customers: Record<string, Customer> = {
  'ticket-42': {
    contact: 'Dana Whitfield',
    email: 'dana.whitfield@acmecorp.com',
    account: 'Acme Corp',
    deal: '$48,000 ARR',
  },
  'ticket-43': {
    contact: 'Marcus Oyelaran',
    email: 'm.oyelaran@brightpath.io',
    account: 'BrightPath Health',
    deal: '$112,500 ARR',
  },
  'ticket-44': {
    contact: 'Ines Carvalho',
    email: 'ines.carvalho@nordlys.eu',
    account: 'Nordlys Logistics',
    deal: '€31,200 ARR',
  },
};

const fallback: Customer = {
  contact: 'Priya Raman',
  email: 'priya.raman@globex.com',
  account: 'Globex Industries',
  deal: '$76,000 ARR',
};

function emit(tool: string, output: string): void {
  const owner =
    participants.find((p) => p.ownedTools.includes(tool))?.id ?? 'unknown';
  const call: ToolCall = { tool, owner, output };
  process.stdout.write(`${TOOL_MARKER}${JSON.stringify(call)}\r\n`);
}

export function sendEmail({ ticketId, title }: ToolContext): void {
  const c = customers[ticketId] ?? fallback;
  emit(
    'send_email',
    [
      'From: alice@ourcompany.com',
      `To: ${c.contact} <${c.email}>`,
      `Subject: Re: ${title} [${ticketId}]`,
      '',
      `Hi ${c.contact.split(' ')[0]},`,
      '',
      `Thanks for your patience on "${title}". I've looked into it and`,
      "we've applied a fix on our side. You should see the change within",
      'the next hour. Reply here if anything still looks off.',
      '',
      'Best,',
      'Alice',
      'Status: SENT',
    ].join('\n'),
  );
}

export function updateCrm({ ticketId, title }: ToolContext): void {
  const c = customers[ticketId] ?? fallback;
  emit(
    'update_crm',
    [
      `CRM record: ${c.account} (owner: bob@ourcompany.com)`,
      `  contact:      ${c.contact} <${c.email}>`,
      `  deal value:   ${c.deal}`,
      '- health:       at risk',
      '+ health:       healthy',
      `+ last touch:   ${ticketId} "${title}"`,
      '+ notes:        issue resolved by support agent; renewal call Q4',
      'Status: SAVED',
    ].join('\n'),
  );
}

export const tools: Partial<Record<string, (ctx: ToolContext) => void>> = {
  send_email: sendEmail,
  update_crm: updateCrm,
};
