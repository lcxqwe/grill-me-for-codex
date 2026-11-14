import test from 'node:test';
import assert from 'node:assert/strict';
import { QuestionStore } from '../questions.mjs';

const options = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }];
const create = (kind, extra = {}) => { const store = new QuestionStore(); return { store, q: store.create({ title: '测试问题', kind, options, ...extra }) }; };

test('asking a question does not accept a recommendation', () => {
  const { store, q } = create('single', { recommended: 'b' });
  assert.equal(store.get(q.questionId).status, 'pending');
  assert.equal(store.get(q.questionId).answer, null);
});
test('multi-select enforces bounds, membership and uniqueness', () => {
  const { store, q } = create('multi', { minSelections: 2, maxSelections: 2 });
  for (const selected of [['a'], ['a', 'a'], ['a', 'z'], ['a', 'b', 'c']]) assert.throws(() => store.submit({ questionId: q.questionId, selected }));
  const result = store.submit({ questionId: q.questionId, selected: ['a', 'c'], note: '  原因  ' });
  assert.deepEqual(result.answer.labels, ['A', 'C']); assert.equal(result.answer.note, '原因');
});
test('single selection requires exactly one explicit choice', () => {
  const { store, q } = create('single');
  assert.throws(() => store.submit({ questionId: q.questionId, selected: [] }));
  assert.throws(() => store.submit({ questionId: q.questionId, selected: ['a', 'b'] }));
  assert.equal(store.submit({ questionId: q.questionId, selected: ['b'] }).answer.labels[0], 'B');
});
test('ranking is a complete permutation and preserves the chosen order', () => {
  const { store, q } = create('ranking');
  assert.throws(() => store.submit({ questionId: q.questionId, selected: ['a', 'b'] }));
  assert.throws(() => store.submit({ questionId: q.questionId, selected: ['a', 'b', 'b'] }));
  assert.deepEqual(store.submit({ questionId: q.questionId, selected: ['c', 'a', 'b'] }).answer.labels, ['C', 'A', 'B']);
});
test('rating rejects missing, fractional and out-of-range values', () => {
  const { store, q } = create('rating');
  for (const rating of [undefined, 0, 6, 1.5]) assert.throws(() => store.submit({ questionId: q.questionId, rating }));
  assert.equal(store.submit({ questionId: q.questionId, rating: 4 }).answer.rating, 4);
});
test('text must be nonempty and preserves user text as data', () => {
  const { store, q } = create('text');
  assert.throws(() => store.submit({ questionId: q.questionId, text: '  ' }));
  assert.equal(store.submit({ questionId: q.questionId, text: '<script>user text</script>' }).answer.text, '<script>user text</script>');
});
test('image question requires data images and excludes external URLs', () => {
  const store = new QuestionStore();
  assert.throws(() => store.create({ title: '图', kind: 'image', options }));
  assert.throws(() => store.create({ title: '图', kind: 'image', options: options.map(o => ({ ...o, image: 'https://example.com/picture.png' })) }));
});
test('skip is distinguishable from acceptance; duplicate submission is idempotent', () => {
  const { store, q } = create('single');
  const input = { questionId: q.questionId, skip: true, selected: ['a'] };
  assert.equal(store.submit(input).status, 'skipped');
  assert.equal(store.submit(input).answer.selected, undefined);
  assert.throws(() => store.submit({ questionId: q.questionId, selected: ['b'] }));
});
test('unknown question IDs and invalid question definitions are rejected', () => {
  const store = new QuestionStore();
  assert.throws(() => store.get('00000000-0000-4000-8000-000000000000'));
  assert.throws(() => store.create({ title: 'Q', kind: 'single', options: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] }));
  assert.throws(() => store.create({ title: 'Q', kind: 'multi', options, minSelections: 3, maxSelections: 2 }));
});

test('waiting after submission returns the verified answer immediately', async () => {
  const { store, q } = create('single');
  store.submit({ questionId: q.questionId, selected: ['b'] });
  assert.deepEqual((await store.wait(q.questionId)).answer.labels, ['B']);
  assert.equal(store.waiters.size, 0);
});
test('valid submission wakes all waiters; invalid submission leaves them pending', async () => {
  const { store, q } = create('single');
  const waits = [store.wait(q.questionId), store.wait(q.questionId)];
  assert.throws(() => store.submit({ questionId: q.questionId, selected: ['z'] }));
  assert.equal(store.waiters.get(q.questionId).size, 2);
  const input = { questionId: q.questionId, selected: ['a'] };
  store.submit(input);
  const states = await Promise.all(waits);
  for (const state of states) assert.deepEqual(state.answer.selected, ['a']);
  assert.equal(store.waiters.size, 0);
  assert.deepEqual(store.submit(input), states[0]);
});
test('bounded timeout never accepts a recommendation; a later wait still works', async () => {
  const { store, q } = create('single', { recommended: 'b' });
  const state = await store.wait(q.questionId, { timeoutMs: 10 });
  assert.equal(state.status, 'pending'); assert.equal(state.answer, null);
  assert.equal(store.waiters.size, 0);
  const next = store.wait(q.questionId);
  store.submit({ questionId: q.questionId, skip: true });
  assert.equal((await next).status, 'skipped');
});
test('cancellation cleans up only the wait; the question remains answerable', async () => {
  const { store, q } = create('text');
  const controller = new AbortController();
  const wait = store.wait(q.questionId, { signal: controller.signal });
  controller.abort(new Error('User stopped waiting'));
  await assert.rejects(wait, /User stopped waiting/);
  assert.equal(store.waiters.size, 0);
  assert.equal(store.get(q.questionId).status, 'pending');
  store.submit({ questionId: q.questionId, text: 'still answerable' });
  assert.equal((await store.wait(q.questionId)).answer.text, 'still answerable');
  await assert.rejects(store.wait(q.questionId, { signal: controller.signal }), /User stopped waiting/);
});
test('expiration rejects and cleans up a pending wait without an unhandled timer error', async () => {
  const { store, q } = create('single');
  const wait = store.wait(q.questionId);
  store.items.get(q.questionId).created -= 31 * 24 * 60 * 60 * 1000;
  store.create({ title: 'New', kind: 'text' });
  await assert.rejects(wait, /expired/);
  assert.equal(store.waiters.size, 0);
});
