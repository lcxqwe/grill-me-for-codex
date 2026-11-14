import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DiskStorage } from './storage.mjs';

export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const image = z.string().max(2_000_000).refine(s => /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(s), 'Use a base64 image data URI.');
const option = z.object({ id: z.string().min(1).max(100), label: z.string().min(1).max(240), description: z.string().max(800).optional(), image: image.optional() });
export const questionSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2500).optional(),
  kind: z.enum(['single', 'multi', 'image', 'rating', 'ranking', 'text']),
  options: z.array(option).min(2).max(20).optional(),
  recommended: z.string().max(100).optional(),
  multiple: z.boolean().default(false),
  minSelections: z.number().int().min(1).max(20).default(1),
  maxSelections: z.number().int().min(1).max(20).optional(),
  ratingMin: z.number().int().min(0).max(10).default(1),
  ratingMax: z.number().int().min(1).max(10).default(5),
  ratingLabels: z.object({ low: z.string().max(100), high: z.string().max(100) }).optional(),
}).superRefine((q, ctx) => {
  const fail = message => ctx.addIssue({ code: 'custom', message });
  if (['single', 'multi', 'image', 'ranking'].includes(q.kind) && !q.options) fail('This question requires options.');
  if (q.options && new Set(q.options.map(o => o.id)).size !== q.options.length) fail('Option IDs must be unique.');
  if (q.recommended && !q.options?.some(o => o.id === q.recommended)) fail('Recommendation must name a valid option.');
  if (q.kind === 'image' && q.options?.some(o => !o.image)) fail('Image questions require an image for every option.');
  if (q.ratingMax <= q.ratingMin) fail('Maximum rating must exceed minimum.');
  const count = q.options?.length || 0;
  if ((q.kind === 'multi' || (q.kind === 'image' && q.multiple)) &&
      (q.minSelections > count || (q.maxSelections && (q.maxSelections < q.minSelections || q.maxSelections > count)))) fail('Invalid selection bounds.');
});

export const answerSchema = z.object({
  questionId: z.string().uuid(),
  selected: z.array(z.string()).max(20).optional(),
  rating: z.number().int().optional(),
  text: z.string().max(8000).optional(),
  note: z.string().max(4000).optional(),
  skip: z.boolean().default(false),
});

function verifiedAnswer(q, input) {
  const a = answerSchema.parse(input);
  if (!a.skip) {
    if (['single', 'multi', 'image', 'ranking'].includes(q.kind)) {
      const ids = q.options.map(o => o.id), selected = a.selected || [];
      if (new Set(selected).size !== selected.length || selected.some(id => !ids.includes(id))) throw new Error('Invalid option selection.');
      if (q.kind === 'ranking' && (selected.length !== ids.length || ids.some(id => !selected.includes(id)))) throw new Error('Ranking must contain every option exactly once.');
      if ((q.kind === 'single' || (q.kind === 'image' && !q.multiple)) && selected.length !== 1) throw new Error('Choose one option.');
      if ((q.kind === 'multi' || (q.kind === 'image' && q.multiple)) && (selected.length < q.minSelections || selected.length > (q.maxSelections || ids.length))) throw new Error('Selection count is outside the allowed range.');
    }
    if (q.kind === 'rating' && (a.rating === undefined || a.rating < q.ratingMin || a.rating > q.ratingMax)) throw new Error('Choose a rating within the allowed range.');
    if (q.kind === 'text' && !a.text?.trim()) throw new Error('Enter an answer.');
  }
  const answer = { questionId: q.questionId, kind: q.kind, skip: a.skip, note: a.note?.trim() || '' };
  if (!a.skip) {
    if (['single', 'multi', 'image', 'ranking'].includes(q.kind)) {
      answer.selected = [...a.selected];
      answer.labels = a.selected.map(id => q.options.find(o => o.id === id).label);
    }
    if (q.kind === 'rating') answer.rating = a.rating;
    if (q.kind === 'text') answer.text = a.text.trim();
  }
  return answer;
}

export class QuestionStore {
  constructor({ directory, retentionMs = RETENTION_MS } = {}) {
    this.items = new Map(); this.waiters = new Map(); this.retentionMs = retentionMs;
    this.disk = directory ? new DiskStorage(directory) : null;
  }
  load(id) {
    let item = this.items.get(id);
    if (!item && this.disk) {
      const saved = this.disk.read(id, 'question');
      if (saved) {
        if (saved.question?.questionId !== id || !Number.isFinite(saved.created)) throw new Error('Invalid saved question. Original data has been preserved.');
        item = { question: { ...questionSchema.parse(saved.question), questionId: id }, created: saved.created, answer: null };
        this.items.set(id, item);
      }
    }
    if (!item || Date.now() - item.created > this.retentionMs) throw new Error('Question is missing or expired. Restore it from the current chat history if possible, otherwise ask it again.');
    if (this.disk) {
      const saved = this.disk.read(id, 'answer');
      if (saved) {
        if (saved.questionId !== id || saved.kind !== item.question.kind || typeof saved.skip !== 'boolean') throw new Error('Invalid saved answer. Original data has been preserved.');
        const verified = verifiedAnswer(item.question, saved);
        if (JSON.stringify(verified) !== JSON.stringify(saved)) throw new Error('Saved answer does not match its question. Original data has been preserved.');
        item.answer = verified;
      } else item.answer = null;
    }
    return item;
  }
  create(input) {
    const now = Date.now();
    if (this.disk) {
      for (const id of this.disk.ids()) {
        const saved = this.disk.read(id, 'question');
        if (saved && Number.isFinite(saved.created) && now - saved.created > this.retentionMs) this.disk.remove(id);
      }
      if (this.disk.ids().length >= 1000) throw new Error('Questionnaire storage is full. Existing answers are preserved; no new question was created.');
    }
    for (const [id, item] of this.items) if (now - item.created > this.retentionMs) {
      this.items.delete(id);
      for (const wake of [...(this.waiters.get(id) || [])]) wake();
    }
    if (this.items.size >= 1000) throw new Error('Too many active questions. Existing answers are preserved.');
    const question = { ...questionSchema.parse(input), questionId: randomUUID() };
    const item = { question, created: now, answer: null };
    if (this.disk && !this.disk.publish(question.questionId, 'question', { question, created: now })) throw new Error('Question ID collision. Ask the question again.');
    this.items.set(question.questionId, item);
    return question;
  }
  get(id) {
    const item = this.load(id);
    return { question: item.question, status: item.answer ? (item.answer.skip ? 'skipped' : 'answered') : 'pending', answer: item.answer };
  }
  wait(id, { timeoutMs = 55_000, signal } = {}) {
    const state = this.get(id);
    if (signal?.aborted) return Promise.reject(signal.reason || new Error('Waiting cancelled.'));
    if (state.answer) return Promise.resolve(state);
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 55_000) throw new Error('Invalid waiting interval.');
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (result, error) => {
        if (done) return;
        done = true; clearTimeout(timer); clearInterval(poll); signal?.removeEventListener('abort', cancel);
        const listeners = this.waiters.get(id); listeners?.delete(wake);
        if (listeners?.size === 0) this.waiters.delete(id);
        if (error) reject(error); else resolve(result);
      };
      const wake = () => { try { finish(this.get(id)); } catch (error) { finish(null, error); } };
      const cancel = () => finish(null, signal.reason || new Error('Waiting cancelled.'));
      const timer = setTimeout(wake, timeoutMs);
      // Separate MCP processes can share these immutable records. Poll only the
      // small answer file so another chat/process can complete an existing card.
      const poll = this.disk ? setInterval(() => {
        try { const result = this.get(id); if (result.answer) finish(result); }
        catch (error) { finish(null, error); }
      }, 300) : undefined;
      if (!this.waiters.has(id)) this.waiters.set(id, new Set());
      this.waiters.get(id).add(wake);
      signal?.addEventListener('abort', cancel, { once: true });
      // Close the submission/cancellation race without losing an answer.
      if (signal?.aborted) cancel();
      else if (this.get(id).answer) wake();
    });
  }
  submit(input) {
    const a = answerSchema.parse(input);
    const item = this.load(a.questionId);
    const q = item.question;
    const answer = verifiedAnswer(q, a);
    if (item.answer && JSON.stringify(item.answer) !== JSON.stringify(answer)) throw new Error('This question was already submitted. Ask a new question to revise it.');
    if (this.disk && !this.disk.publish(q.questionId, 'answer', answer)) {
      const committed = this.disk.read(q.questionId, 'answer');
      if (JSON.stringify(committed) !== JSON.stringify(answer)) throw new Error('This question was already submitted. Ask a new question to revise it.');
    }
    item.answer = answer;
    for (const wake of [...(this.waiters.get(q.questionId) || [])]) wake();
    return { question: q, status: a.skip ? 'skipped' : 'answered', answer };
  }
}

export function questionText(q) {
  const options = q.options?.map((o, i) => `${i + 1}. ${o.label}${o.id === q.recommended ? '（推荐）' : ''}${o.description ? '：' + o.description : ''}`).join('\n') || '';
  return [q.title, q.description, options].filter(Boolean).join('\n');
}
