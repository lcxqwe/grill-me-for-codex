import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { testDirectory } from './helpers.mjs';

const serverPath = process.env.GRILL_TEST_SERVER || fileURLToPath(new URL('../dist/server.mjs', import.meta.url));

test('real MCP stdio exposes inline UI and round-trips a human answer', async t => {
  const client = new Client({ name: 'grill-ui-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath], env: { ...process.env, GRILL_UI_STATE_DIR: testDirectory(t) } });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const ask = tools.find(t => t.name === 'ask_question');
    assert.equal(ask._meta.ui.resourceUri, 'ui://grill-ui/questionnaire.html');
    assert.deepEqual(tools.find(t => t.name === 'submit_answer')._meta.ui.visibility, ['app']);
    const resource = await client.readResource({ uri: ask._meta.ui.resourceUri });
    assert.equal(resource.contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.deepEqual(resource.contents[0]._meta['openai/ui'].availableDisplayModes, ['inline']);
    assert.ok(resource.contents[0].text.includes('问卷卡片'));
    const result = await client.callTool({ name: 'ask_question', arguments: { title: '选择目标', kind: 'multi', options: [{ id: 'fast', label: '速度' }, { id: 'clear', label: '清晰' }] } });
    assert.equal(result.structuredContent.status, 'pending');
    const questionId = result.structuredContent.question.questionId;
    assert.equal((await client.callTool({ name: 'get_answer', arguments: { questionId } })).structuredContent.answer, null);
    const invalid = await client.callTool({ name: 'submit_answer', arguments: { questionId, selected: ['invalid'] } });
    assert.equal(invalid.isError, true);
    const waiting = client.callTool({ name: 'wait_for_answer', arguments: { questionId, timeoutSeconds: 5 } });
    const accepted = await client.callTool({ name: 'submit_answer', arguments: { questionId, selected: ['fast', 'clear'] } });
    assert.deepEqual(accepted.structuredContent.answer.labels, ['速度', '清晰']);
    const completed = await waiting;
    assert.equal(completed.structuredContent.status, 'answered');
    assert.deepEqual(completed.structuredContent.answer, accepted.structuredContent.answer);
    assert.deepEqual((await client.callTool({ name: 'wait_for_answer', arguments: { questionId } })).structuredContent.answer, accepted.structuredContent.answer);
    const read = await client.callTool({ name: 'get_answer', arguments: { questionId } });
    assert.equal(read.structuredContent.status, 'answered');
    assert.deepEqual(read.structuredContent.answer.selected, ['fast', 'clear']);
  } finally { await client.close(); }
});

test('real MCP wait stays pending through invalid submission and survives its interval', async t => {
  const client = new Client({ name: 'grill-wait-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath], env: { ...process.env, GRILL_UI_STATE_DIR: testDirectory(t) } });
  try {
    await client.connect(transport);
    const ask = await client.callTool({ name: 'ask_question', arguments: { title: 'Pick one', kind: 'single', recommended: 'a', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] } });
    const questionId = ask.structuredContent.question.questionId;
    let settled = false;
    const waiting = client.callTool({ name: 'wait_for_answer', arguments: { questionId, timeoutSeconds: 1 } }).then(result => { settled = true; return result; });
    const invalid = await client.callTool({ name: 'submit_answer', arguments: { questionId, selected: [] } });
    assert.equal(invalid.isError, true);
    assert.equal(settled, false);
    const timedOut = await waiting;
    assert.equal(timedOut.structuredContent.status, 'pending');
    assert.equal(timedOut.structuredContent.answer, null);
    const resumed = client.callTool({ name: 'wait_for_answer', arguments: { questionId, timeoutSeconds: 5 } });
    await client.callTool({ name: 'submit_answer', arguments: { questionId, skip: true } });
    assert.equal((await resumed).structuredContent.status, 'skipped');
  } finally { await client.close(); }
});

test('server negotiates the earlier MCP version used by compatible clients', async t => {
  const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, GRILL_UI_STATE_DIR: testDirectory(t) } });
  const lines = createInterface({ input: child.stdout });
  try {
    const answer = once(lines, 'line', { signal: AbortSignal.timeout(5000) });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'compatibility-test', version: '1.0.0' } } }) + '\n');
    const [line] = await answer;
    const response = JSON.parse(line);
    assert.equal(response.result.protocolVersion, '2025-11-25');
    assert.ok(response.result.capabilities.tools);
  } finally { lines.close(); child.kill(); }
});

test('real server restart restores pending card and previously committed answer', async t => {
  const directory = testDirectory(t);
  const connect = async () => {
    const client = new Client({ name: 'restart-test', version: '1.0.0' });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [serverPath], env: { ...process.env, GRILL_UI_STATE_DIR: directory } }));
    return client;
  };
  let client = await connect();
  try {
    const ask = await client.callTool({ name: 'ask_question', arguments: { title: 'Persistent question', kind: 'text' } });
    const questionId = ask.structuredContent.question.questionId;
    await client.close(); client = await connect();
    const resumed = await client.callTool({ name: 'resume_question', arguments: { questionId } });
    assert.equal(resumed.structuredContent.status, 'pending');
    assert.equal(resumed._meta.question.questionId, questionId);
    await client.callTool({ name: 'submit_answer', arguments: { questionId, text: 'human response' } });
    await client.close(); client = await connect();
    const answered = await client.callTool({ name: 'resume_question', arguments: { questionId } });
    assert.equal(answered.structuredContent.status, 'answered');
    assert.equal(answered.structuredContent.answer.text, 'human response');
  } finally { await client.close(); }
});

test('separate MCP processes preserve the first answer under simultaneous conflicting submissions', async t => {
  const directory = testDirectory(t), clients = [];
  try {
    for (let i = 0; i < 2; i++) {
      const client = new Client({ name: 'race-test', version: '1.0.0' });
      await client.connect(new StdioClientTransport({ command: process.execPath, args: [serverPath], env: { ...process.env, GRILL_UI_STATE_DIR: directory } })); clients.push(client);
    }
    const ask = await clients[0].callTool({ name: 'ask_question', arguments: { title: 'Race', kind: 'text' } });
    const questionId = ask.structuredContent.question.questionId;
    const waiting = clients[0].callTool({ name: 'wait_for_answer', arguments: { questionId, timeoutSeconds: 5 } });
    const results = await Promise.all(clients.map((client, i) => client.callTool({ name: 'submit_answer', arguments: { questionId, text: `answer ${i}` } })));
    assert.equal(results.filter(r => r.isError).length, 1);
    const accepted = results.find(r => !r.isError).structuredContent.answer;
    assert.deepEqual((await waiting).structuredContent.answer, accepted);
    for (const client of clients) assert.deepEqual((await client.callTool({ name: 'get_answer', arguments: { questionId } })).structuredContent.answer, accepted);
  } finally { await Promise.all(clients.map(client => client.close())); }
});
