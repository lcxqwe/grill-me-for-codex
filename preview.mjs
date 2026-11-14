import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { QuestionStore } from './questions.mjs';

const store = new QuestionStore(), token = randomBytes(24).toString('hex'), port = Number(process.env.GRILL_PREVIEW_PORT || 43127);
const svg = (bg, accent, title) => 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220"><rect width="400" height="220" fill="${bg}"/><rect x="28" y="25" width="85" height="15" rx="5" fill="${accent}"/><rect x="28" y="65" width="240" height="20" rx="5" fill="${accent}" opacity=".4"/><rect x="28" y="102" width="155" height="80" rx="10" fill="${accent}" opacity=".13"/><rect x="195" y="102" width="177" height="80" rx="10" fill="${accent}" opacity=".22"/><text x="28" y="205" font-family="sans-serif" font-size="15" fill="${accent}">${title}</text></svg>`).toString('base64');
const examples = {
  multi: { title: '这次方案最应该优先解决哪些问题？', description: '可以同时选择多个目标。你的选择会影响下一轮追问的重点。', kind: 'multi', recommended: 'clarity', maxSelections: 3, options: [{ id: 'clarity', label: '澄清需求', description: '先明确目标、边界与验收标准。' }, { id: 'risk', label: '发现隐藏风险', description: '检查容易被忽略的限制和失败条件。' }, { id: 'speed', label: '缩短实施时间', description: '先收敛为可以快速验证的小范围方案。' }] },
  image: { title: '哪一种视觉方向更接近你的预期？', description: '先选择一个方向，再补充你喜欢或想调整的地方。', kind: 'image', recommended: 'clean', options: [{ id: 'clean', label: '简洁明亮', description: '留白更多，信息清晰。', image: svg('#f5f7f5', '#286344', 'Clean and focused') }, { id: 'warm', label: '温暖柔和', description: '柔和色彩，稍强的视觉层次。', image: svg('#f8eee3', '#996035', 'Warm and inviting') }] },
  rating: { title: '你对当前方案的把握有多大？', description: '这个评分帮助决定是否继续挖掘关键假设。', kind: 'rating', ratingLabels: { low: '1 · 还有很多疑问', high: '5 · 已经很明确' } },
  ranking: { title: '请按优先级排列这三个目标。', description: '最重要的放在最上面。', kind: 'ranking', options: [{ id: 'clarity', label: '需求清晰' }, { id: 'quality', label: '交付质量' }, { id: 'speed', label: '实施速度' }] },
  single: { title: '首版应该采用哪一种推进方式？', kind: 'single', recommended: 'small', options: [{ id: 'small', label: '先做小范围验证', description: '尽早看到效果，再决定是否扩展。' }, { id: 'full', label: '一次完成完整方案', description: '需要先明确更多细节。' }] },
  text: { title: '有哪些条件是你最不希望妥协的？', description: '可以写下具体场景，或你想避免的结果。', kind: 'text' },
};

const host = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f7f7f7;color:#292929;font:14px/1.6 "Segoe UI","Microsoft YaHei",sans-serif}.wrap{max-width:830px;margin:32px auto;padding:0 20px}header{display:flex;justify-content:space-between;gap:15px;align-items:center;margin:0 0 22px}h2{font-size:16px;margin:0}p{color:#777;font-size:12px;margin:4px 0}select{padding:8px;border:1px solid #ddd;border-radius:8px;background:#fff;font:inherit}iframe{display:block;border:0;width:100%;min-height:650px;background:transparent}pre{white-space:pre-wrap;word-break:break-word;font:12px/1.7 monospace;padding:16px;background:#fff;border:1px solid #e5e5e5;border-radius:12px}#log:empty{display:none}</style><div class="wrap"><header><div><h2>问卷卡片 · 本地预览</h2><p>演示各类交互；这里提交的示例答案不会发送到你的聊天。</p></div><select id="example" aria-label="切换题型"><option value="multi">多选题</option><option value="image">图片选项</option><option value="rating">评分</option><option value="ranking">拖拽排序</option><option value="single">单选题</option><option value="text">自由回答</option></select></header><iframe id="frame" src="/card" title="问卷卡片"></iframe><pre id="log"></pre></div><script>
const TOKEN=${JSON.stringify(token)}, frame=document.getElementById('frame'), log=document.getElementById('log'); let ready=false, generation=0;
const post=m=>frame.contentWindow.postMessage({jsonrpc:'2.0',...m},location.origin);
async function api(path,data){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json','x-grill-preview-token':TOKEN},body:JSON.stringify(data)});const x=await r.json();if(!r.ok)throw Error(x.error);return x}
async function waitForAnswer(id,epoch){while(epoch===generation){const state=await api('/api/wait',{questionId:id});if(epoch!==generation)return;if(state.status!=='pending'){log.textContent='等待工具已直接收到答案；没有新增聊天消息或上下文附件。\\n'+JSON.stringify(state.answer,null,2);return}}}
async function question(){const epoch=++generation;log.textContent='等待你提交答案…';const q=await api('/api/ask',{kind:document.getElementById('example').value});if(epoch!==generation)return;post({method:'ui/notifications/tool-result',params:{content:[],structuredContent:{question:q,status:'pending'}}});waitForAnswer(q.questionId,epoch).catch(err=>{if(epoch===generation)log.textContent='等待失败：'+err.message})}
window.addEventListener('message',async e=>{if(e.source!==frame.contentWindow||e.origin!==location.origin)return;const m=e.data;if(!m||m.jsonrpc!=='2.0')return;const reply=x=>post({id:m.id,result:x});try{
if(m.method==='ui/initialize'){reply({protocolVersion:'2026-01-26',hostInfo:{name:'grill-preview',version:'0.3.0'},hostCapabilities:{serverTools:{},message:{text:{}},updateModelContext:{text:{}}},hostContext:{theme:'light',displayMode:'inline'}})}
else if(m.method==='ui/notifications/initialized'){ready=true;await question()}
else if(m.method==='tools/call'){const path=m.params.name==='submit_answer'?'/api/submit':m.params.name==='get_answer'?'/api/get':null;if(!path)throw Error('Unsupported preview tool');const state=await api(path,m.params.arguments);reply({content:[{type:'text',text:JSON.stringify(state.answer)}],structuredContent:state})}
else if(m.method==='ui/update-model-context'||m.method==='ui/message'){log.textContent='验证失败：卡片请求了额外聊天消息或上下文附件。';throw Error('Extra chat messages and context updates are forbidden in this preview')}
else if(m.method==='ui/notifications/size-changed'){if(m.params.height)frame.style.height=Math.min(1600,m.params.height+20)+'px'}
else if(m.id!==undefined)reply({});
}catch(err){post({id:m.id,error:{code:-32603,message:err.message}})}});
document.getElementById('example').onchange=()=>{if(ready)question()};
</script></html>`;

const server = http.createServer(async (req, res) => {
  const send = (code, content, type='application/json') => { res.writeHead(code, { 'Content-Type': type + ';charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(content); };
  try {
    if (req.method === 'GET' && req.url === '/') return send(200, host, 'text/html');
    if (req.method === 'GET' && req.url === '/card') return send(200, await readFile(new URL('./dist/questionnaire.html', import.meta.url), 'utf8'), 'text/html');
    if (req.method !== 'POST' || req.headers['x-grill-preview-token'] !== token || (req.headers.origin && req.headers.origin !== 'http://127.0.0.1:' + port)) return send(403, JSON.stringify({ error: 'Forbidden' }));
    let body=''; for await (const chunk of req) { body += chunk; if (body.length > 3_000_000) throw new Error('Request too large'); }
    const input=JSON.parse(body);
    if (req.url === '/api/ask') { if (!Object.hasOwn(examples,input.kind)) throw new Error('Unknown example'); return send(200,JSON.stringify(store.create(examples[input.kind]))); }
    if (req.url === '/api/submit') return send(200,JSON.stringify(store.submit(input)));
    if (req.url === '/api/get') return send(200,JSON.stringify(store.get(input.questionId)));
    if (req.url === '/api/wait') return send(200,JSON.stringify(await store.wait(input.questionId, { timeoutMs: 5000 })));
    send(404,JSON.stringify({error:'Not found'}));
  } catch(e) { send(400,JSON.stringify({error:e.message})); }
});
server.listen(port,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:' + port));
