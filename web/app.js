import { App } from '@modelcontextprotocol/ext-apps';

const app = new App({ name: 'Grill 问卷', version: '0.3.0' }, { availableDisplayModes: ['inline'] });
const root = document.getElementById('app');
let current = null, selected = [], rating, dragId, submitting = false, sent = false, refreshing = false;
const $ = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

function render(result) {
  if (!result?.question) return;
  const q = result.question;
  if (current?.questionId !== q.questionId) { selected = q.kind === 'ranking' ? q.options.map(o => o.id) : []; rating = undefined; submitting = false; sent = false; }
  current = q;
  root.replaceChildren();
  const eyebrow = $('div', 'eyebrow'); eyebrow.append($('span', 'dot'), $('span', '', '问卷 · 每次一道'));
  root.append(eyebrow, $('h1', '', q.title));
  if (q.description) root.append($('p', 'description', q.description));
  if (result.status !== 'pending') { showSummary(result); return; }
  const controls = $('div', 'controls'); root.append(controls);
  if (q.kind === 'ranking') renderRanking(controls);
  else if (q.kind === 'rating') {
    const group = $('div', 'rating'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', '选择评分');
    for (let n = q.ratingMin; n <= q.ratingMax; n++) {
      const b = $('button', '', n); b.type = 'button'; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', `${n} 分`);
      b.onclick = () => { rating = n; for (const x of group.children) x.setAttribute('aria-pressed', String(x === b)); refreshSubmit(); };
      group.append(b);
    }
    controls.append(group);
    if (q.ratingLabels) { const labels = $('div', 'range-labels'); labels.append($('span', '', q.ratingLabels.low), $('span', '', q.ratingLabels.high)); controls.append(labels); }
  } else if (q.kind === 'text') {
    const t = $('textarea', 'text-answer'); t.id = 'answer-text'; t.placeholder = '写下你的回答…'; t.setAttribute('aria-label', q.title); t.oninput = refreshSubmit; controls.append(t);
  } else renderOptions(controls);
  const noteLabel = $('label', 'note-label', '补充说明（可选）'); noteLabel.htmlFor = 'note';
  const note = $('textarea'); note.id = 'note'; note.placeholder = '你的原因、顾虑或其他想法…'; note.maxLength = 4000; root.append(noteLabel, note);
  const actions = $('div', 'actions'); const submit = $('button', 'primary', '提交答案'); submit.id = 'submit'; submit.type = 'button'; submit.onclick = () => submitAnswer(false);
  const skip = $('button', 'secondary', '暂时跳过'); skip.id = 'skip'; skip.onclick = () => submitAnswer(true);
  actions.append(submit, skip, $('span', 'status', '提交后继续追问')); root.append(actions, $('p', 'error')); refreshSubmit();
}

function renderOptions(container) {
  const q = current, multi = q.kind === 'multi' || (q.kind === 'image' && q.multiple);
  container.className = q.kind === 'image' ? 'image-grid' : '';
  container.setAttribute('role', multi ? 'group' : 'radiogroup'); container.setAttribute('aria-label', q.title);
  for (const o of q.options) {
    const b = $('button', `option${multi ? ' multi' : ''}`); b.type = 'button'; b.dataset.id = o.id; b.setAttribute('role', multi ? 'checkbox' : 'radio'); b.setAttribute('aria-checked', 'false');
    if (o.image) { const img = $('img'); img.src = o.image; img.alt = o.label; b.append(img); }
    const line = $('div', o.image ? 'image-label' : 'option-main'); const marker = $('span', 'indicator'); marker.setAttribute('aria-hidden', 'true');
    const main = $('div', 'option-main'); const label = $('span', 'label', o.label); if (q.recommended === o.id) label.append($('span', 'badge', '推荐')); main.append(label); if (o.description) main.append($('span', 'sub', o.description));
    if (o.image) { line.append(marker, main); b.append(line); } else b.append(marker, main);
    b.onclick = () => {
      if (multi) {
        if (selected.includes(o.id)) selected = selected.filter(id => id !== o.id);
        else if (selected.length < (q.maxSelections || q.options.length)) selected.push(o.id);
      } else selected = [o.id];
      for (const x of container.querySelectorAll('.option')) { const checked = selected.includes(x.dataset.id); x.setAttribute('aria-checked', String(checked)); x.querySelector('.indicator').textContent = checked ? '✓' : ''; }
      refreshSubmit();
    };
    container.append(b);
  }
  if (multi) root.append($('p', 'hint', `可选择 ${q.minSelections}–${q.maxSelections || q.options.length} 项`));
}

function renderRanking(container) {
  container.replaceChildren();
  container.setAttribute('aria-label', '优先级排序');
  selected.forEach((id, i) => {
    const option = current.options.find(o => o.id === id); const row = $('div', 'rank-row'); row.dataset.id = id;
    const handle = $('span', '', '⠿'); handle.setAttribute('aria-hidden', 'true'); handle.style.cssText = 'cursor:grab;touch-action:none;user-select:none;padding:5px';
    row.append(handle, $('span', 'number', `${i + 1}`), $('span', 'rank-label', option.label));
    for (const [delta, symbol, label] of [[-1, '↑', '上移'], [1, '↓', '下移']]) {
      const b = $('button', '', symbol); b.type = 'button'; b.setAttribute('aria-label', `${label} ${option.label}`); b.disabled = i + delta < 0 || i + delta >= selected.length;
      b.onclick = () => { [selected[i], selected[i + delta]] = [selected[i + delta], selected[i]]; renderRanking(container); };
      row.append(b);
    }
    let startY = 0;
    handle.onpointerdown = e => { if (e.button !== 0) return; e.preventDefault(); dragId = id; startY = e.clientY; handle.setPointerCapture(e.pointerId); row.style.position = 'relative'; row.style.zIndex = '2'; row.style.boxShadow = '0 5px 15px #0002'; };
    handle.onpointermove = e => { if (dragId === id) row.style.transform = `translateY(${e.clientY - startY}px)`; };
    const stop = e => {
      if (dragId !== id) return;
      row.style.transform = ''; row.style.zIndex = ''; row.style.boxShadow = '';
      const rows = [...container.querySelectorAll('.rank-row')];
      const bounds = container.getBoundingClientRect();
      if (e.type !== 'pointercancel' && e.clientY >= bounds.top - 15 && e.clientY <= bounds.bottom + 15) {
        const target = rows.reduce((best, candidate) => { const r = candidate.getBoundingClientRect(), b = best.getBoundingClientRect(); return Math.abs(e.clientY - r.top - r.height / 2) < Math.abs(e.clientY - b.top - b.height / 2) ? candidate : best; }, rows[0]);
        const from = selected.indexOf(id), to = selected.indexOf(target.dataset.id);
        if (from !== to) { selected.splice(from, 1); selected.splice(to, 0, id); }
      }
      dragId = undefined; renderRanking(container);
    };
    handle.onpointerup = stop; handle.onpointercancel = stop;
    container.append(row);
  });
  container.append($('p', 'hint', '拖拽调整顺序，也可以使用上移 / 下移按钮。'));
}

function refreshSubmit() {
  const button = document.getElementById('submit'); if (!button || !current) return;
  let valid = selected.length >= current.minSelections;
  if (current.kind === 'rating') valid = rating !== undefined;
  if (current.kind === 'text') valid = !!document.getElementById('answer-text')?.value.trim();
  button.disabled = submitting || refreshing || !valid;
}

function showSummary(result) {
  const a = result.answer; const text = a?.skip ? '已跳过这道问题' : a?.labels ? (current.kind === 'ranking' ? a.labels.map((l, i) => `${i + 1}. ${l}`).join('\n') : a.labels.join('、')) : a?.rating !== undefined ? `${a.rating} 分` : a?.text || '';
  root.append($('div', 'summary', `${a?.skip ? '' : '已提交：'}${text}${a?.note ? '\n补充：' + a.note : ''}`));
}

async function submitAnswer(skip) {
  if (submitting || sent || refreshing || !current) return;
  submitting = true; refreshSubmit(); document.getElementById('skip').disabled = true; root.querySelector('.error').textContent = '';
  const args = { questionId: current.questionId, selected, rating, text: document.getElementById('answer-text')?.value, note: document.getElementById('note').value, skip };
  try {
    const result = await app.callServerTool({ name: 'submit_answer', arguments: JSON.parse(JSON.stringify(args)) });
    if (result.isError) throw new Error(result.content?.find(c => c.type === 'text')?.text || '提交失败');
    const state = result.structuredContent;
    if (!state?.answer || state.status === 'pending') throw new Error('未确认保存成功，请重试提交。');
    render(state); sent = true;
  } catch (e) {
    submitting = false; const error = root.querySelector('.error'); if (error) error.textContent = e.message; document.getElementById('skip').disabled = false; refreshSubmit();
  }
}

app.ontoolresult = async result => {
  const state = result._meta?.question ? { ...result.structuredContent, question: result._meta.question } : result.structuredContent;
  if (!state?.question) return;
  render(state);
  const id = state.question.questionId;
  refreshing = true; refreshSubmit(); const skip = document.getElementById('skip'); if (skip) skip.disabled = true;
  // A reopened card may still carry its original pending tool result. Confirm
  // persisted state before enabling another submission or showing stale status.
  try {
    const fresh = await app.callServerTool({ name: 'get_answer', arguments: { questionId: id } });
    if (fresh.isError) throw new Error('无法恢复这道题的保存记录。请让 Codex 重新提问。');
    if (!fresh.structuredContent?.status) throw new Error('无法确认这道题的保存状态，请重新加载卡片。');
    if (current?.questionId !== id) return;
    refreshing = false;
    if (current?.questionId === id && fresh.structuredContent?.answer) {
      render({ ...fresh.structuredContent, question: state.question }); sent = true;
    } else { refreshSubmit(); const skip = document.getElementById('skip'); if (skip) skip.disabled = false; }
  } catch (error) {
    if (current?.questionId === id) {
      const message = root.querySelector('.error'); if (message) message.textContent = error.message;
    }
  }
};
app.ontoolcancelled = () => { root.replaceChildren($('p', 'description', '这次提问已取消。')); };
app.onhostcontextchanged = context => { if (context.theme) document.documentElement.style.colorScheme = context.theme; };
await app.connect();
