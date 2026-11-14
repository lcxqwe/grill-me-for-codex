import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { QuestionStore } from '../questions.mjs';
import { testDirectory } from './helpers.mjs';

const question = { title: '可以在重启后恢复吗？', kind: 'single', recommended: 'a', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] };

test('new store restores unanswered questions and committed answers including images', t => {
  const directory = testDirectory(t);
  let store = new QuestionStore({ directory });
  const image = 'data:image/png;base64,YQ==';
  const q = store.create({ ...question, kind: 'image', options: question.options.map(o => ({ ...o, image })) });
  store = new QuestionStore({ directory });
  const restored = store.get(q.questionId);
  assert.equal(restored.status, 'pending'); assert.equal(restored.answer, null);
  assert.equal(restored.question.options[0].image, image);
  store.submit({ questionId: q.questionId, selected: ['b'], note: '说明' });
  const restarted = new QuestionStore({ directory });
  assert.deepEqual(restarted.get(q.questionId).answer.labels, ['B']);
  assert.equal(restarted.get(q.questionId).answer.note, '说明');
});
test('separate stores share exact IDs and a submission completes another store’s wait', async t => {
  const directory = testDirectory(t), a = new QuestionStore({ directory }), b = new QuestionStore({ directory });
  const qa = a.create(question), qb = b.create({ ...question, title: '另一聊天' });
  const waiting = a.wait(qa.questionId, { timeoutMs: 2000 });
  b.submit({ questionId: qa.questionId, selected: ['a'] });
  assert.equal((await waiting).status, 'answered');
  assert.equal(a.get(qb.questionId).status, 'pending');
});
test('retry after lost confirmation is idempotent; conflicting second answer cannot overwrite', t => {
  const directory = testDirectory(t), a = new QuestionStore({ directory });
  const q = a.create(question), input = { questionId: q.questionId, selected: ['a'] };
  a.submit(input);
  const restarted = new QuestionStore({ directory });
  assert.deepEqual(restarted.submit(input).answer.selected, ['a']);
  const before = readFileSync(path.join(directory, `${q.questionId}.answer.json`));
  assert.throws(() => restarted.submit({ questionId: q.questionId, selected: ['b'] }), /already submitted/);
  assert.deepEqual(readFileSync(path.join(directory, `${q.questionId}.answer.json`)), before);
});
test('partial crash files are ignored; corrupted committed data is preserved and rejected', t => {
  const directory = testDirectory(t), a = new QuestionStore({ directory }), q = a.create(question);
  writeFileSync(path.join(directory, `${q.questionId}.answer.json.999.crash.tmp`), '{"part');
  const b = new QuestionStore({ directory });
  assert.equal(b.get(q.questionId).status, 'pending');
  const target = path.join(directory, `${q.questionId}.answer.json`);
  writeFileSync(target, '{bad JSON');
  assert.throws(() => b.get(q.questionId), /preserved/);
  assert.equal(readFileSync(target, 'utf8'), '{bad JSON');
});
test('corrupted valid JSON cannot invent an out-of-range answer', t => {
  const directory = testDirectory(t), a = new QuestionStore({ directory }), q = a.create(question);
  writeFileSync(path.join(directory, `${q.questionId}.answer.json`), JSON.stringify({ questionId: q.questionId, kind: 'single', skip: false, selected: ['invalid'], labels: ['Fake'], note: '' }));
  assert.throws(() => new QuestionStore({ directory }).get(q.questionId), /Invalid option/);
});
test('expired question cannot be answered and cleanup preserves recent records', t => {
  const directory = testDirectory(t), store = new QuestionStore({ directory, retentionMs: 1000 }), q = store.create(question);
  const file = path.join(directory, `${q.questionId}.question.json`);
  const saved = JSON.parse(readFileSync(file)); saved.created -= 2000; writeFileSync(file, JSON.stringify(saved));
  const restarted = new QuestionStore({ directory, retentionMs: 1000 });
  assert.throws(() => restarted.get(q.questionId), /expired/);
  assert.throws(() => restarted.submit({ questionId: q.questionId, selected: ['a'] }), /expired/);
  const recent = restarted.create(question);
  assert.equal(restarted.get(recent.questionId).status, 'pending');
  assert.equal(readdirSync(directory).includes(`${q.questionId}.question.json`), false);
});
test('question IDs cannot escape the persistence directory', t => {
  const store = new QuestionStore({ directory: testDirectory(t) });
  for (const id of ['../outside', 'C:\\outside', '..\\outside']) assert.throws(() => store.get(id), /Invalid question ID/);
});

test('failed disk commit does not report or retain an accepted answer', t => {
  const store = new QuestionStore({ directory: testDirectory(t) }), q = store.create(question);
  const publish = store.disk.publish.bind(store.disk);
  store.disk.publish = () => { throw new Error('Disk full'); };
  assert.throws(() => store.submit({ questionId: q.questionId, selected: ['a'] }), /Disk full/);
  assert.equal(store.get(q.questionId).status, 'pending');
  assert.equal(store.get(q.questionId).answer, null);
  store.disk.publish = publish;
  assert.equal(store.submit({ questionId: q.questionId, selected: ['b'] }).status, 'answered');
});
