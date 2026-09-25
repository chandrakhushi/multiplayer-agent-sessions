import 'mocha';
import { expect } from 'chai';
import { TOOL_MARKER, participants } from '../shared/session';
import { tryClaim } from './claims';
import { createParser, filterForClient } from './session-broker';

const [alice, bob] = participants;
const call = { tool: 'send_email', owner: 'alice', output: 'To: acme\nHi' };
const line = `${TOOL_MARKER}${JSON.stringify(call)}\r\n`;

describe('Session broker', () => {
  it('forwards narration immediately and parses a marker split mid-marker', () => {
    const parse = createParser();
    expect(parse('hello')).to.deep.equal([{ text: 'hello' }]);
    expect(parse(' world\r\n##TOOL')).to.deep.equal([{ text: ' world\r\n' }]);
    expect(parse(line.slice(6, 30))).to.deep.equal([]);
    expect(parse(`${line.slice(30)}after`)).to.deep.equal([
      { call },
      { text: 'after' },
    ]);
  });

  it('drops malformed marker lines instead of leaking them', () => {
    const parse = createParser();
    expect(parse(`${TOOL_MARKER}{bad\r\nok\r\n`)).to.deep.equal([
      { text: 'ok\r\n' },
    ]);
    expect(parse(`${TOOL_MARKER}{"tool":1}\r\n`)).to.deep.equal([]);
  });

  it('shows owners the call, redacts it for others, passes narration through', () => {
    expect(filterForClient({ text: 'narration' }, bob)).to.equal('narration');
    const owned = filterForClient({ call }, alice);
    expect(owned).to.include('send_email · your integration');
    expect(owned).to.include('\x1b[36m│\x1b[0m To: acme\r\n');
    expect(owned).to.include('\x1b[36m│\x1b[0m Hi\r\n');
    const redacted = filterForClient({ call }, bob);
    expect(redacted).to.include('redacted: send_email');
    expect(redacted).not.to.include('acme');
  });

  it('rejects a second participant claiming the same resource', () => {
    expect(tryClaim('spec-ticket', 'alice')).to.equal(null);
    expect(tryClaim('spec-ticket', 'alice')).to.equal(null);
    expect(tryClaim('spec-ticket', 'bob')?.claimedBy).to.equal('alice');
  });
});
