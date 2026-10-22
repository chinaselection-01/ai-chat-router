/* ============================================================
   智能路由聊天 · Smart Chat Router
   纯前端，免费模型，自动按任务类型选择模型。
   Key 仅存浏览器本地，请求直连厂商（Gemini / OpenRouter / Groq）。
   ============================================================ */

// 免费模型清单（只用各厂商的免费层，无需信用卡）
const MODELS = {
  gemini: { flash: 'gemini-2.5-flash', pro: 'gemini-2.5-pro' },
  openrouter: {
    flash: 'google/gemini-2.5-flash:free',
    coder: 'qwen/qwen3-coder:free',
    longctx: 'meta-llama/llama-4-scout:free', // 1000万上下文
    chat: 'meta-llama/llama-3.3-7b-instruct:free',
  },
  groq: { fast: 'llama-3.1-8b-instant', smart: 'llama-3.3-70b-versatile' },
};

const KEYS = { gemini: '', openrouter: '', groq: '' };
const pendingFiles = []; // {name, ext, isImage, text, dataUrl}

function loadKeys() {
  try { Object.assign(KEYS, JSON.parse(localStorage.getItem('acr_keys') || '{}')); } catch (e) {}
}
function saveKeys() {
  KEYS.gemini = document.getElementById('keyGemini').value.trim();
  KEYS.openrouter = document.getElementById('keyOpenrouter').value.trim();
  KEYS.groq = document.getElementById('keyGroq').value.trim();
  localStorage.setItem('acr_keys', JSON.stringify(KEYS));
  const s = document.getElementById('saveStatus');
  s.textContent = '已保存 ✓';
  setTimeout(() => (s.textContent = ''), 2000);
}

/* ---------------- 文件读取 ---------------- */
const CODE_EXT = ['js','ts','jsx','tsx','py','java','go','c','cpp','cs','php','rb','rs','sql'];

async function readFile(file) {
  const name = file.name;
  const ext = (name.split('.').pop() || '').toLowerCase();
  const isImage = file.type.startsWith('image/');
  const item = { name, ext, isImage, text: '', dataUrl: '' };

  if (isImage) {
    item.dataUrl = await fileToDataURL(file);
    return item;
  }
  if (['txt','md','markdown','json','csv','log'].includes(ext) || CODE_EXT.includes(ext)) {
    item.text = await file.text();
    return item;
  }
  if (ext === 'pdf') {
    item.text = await readPdf(file);
    return item;
  }
  if (ext === 'docx') {
    item.text = await readDocx(file);
    return item;
  }
  // 兜底：当文本读
  try { item.text = await file.text(); } catch (e) { item.text = '[无法读取该文件内容]'; }
  return item;
}

function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function readPdf(file) {
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(' ') + '\n';
    }
    return text || '[PDF 未提取到文字]';
  } catch (e) { return '[PDF 读取失败：' + e.message + ']'; }
}

async function readDocx(file) {
  try {
    const buf = await file.arrayBuffer();
    const res = await mammoth.convertToHtml({ arrayBuffer: buf });
    const tmp = document.createElement('div');
    tmp.innerHTML = res.value;
    return tmp.textContent || tmp.innerText || '[DOCX 未提取到文字]';
  } catch (e) { return '[DOCX 读取失败：' + e.message + ']'; }
}

/* ---------------- 自动路由 ---------------- */
// 画图意图检测（生成图/画一张/draw 等）
const IMGGEN_RE1 = /(生成|画|绘制|渲染|create|generate|draw|paint|make)\s*(一)?(张|幅|个)?\s*(图|图片|图像|画|海报|logo|图标|插画|image|picture|photo|illustration|poster)/i;
const IMGGEN_RE2 = /(画一张|画个|画一幅|来一张图|生成图片|生成图像|生成一张|image generation|text-to-image)/i;
function isImgGen(m) { return IMGGEN_RE1.test(m) || IMGGEN_RE2.test(m); }

function route(message, files) {
  const hasImage = files.some((f) => f.isImage);
  const hasCodeFile = files.some((f) => CODE_EXT.includes(f.ext));
  const longText = message.length > 2000;
  const codeKw = /代码|写(个|一段|个)?(函数|脚本|程序)|bug|编程|python|javascript|java\b|报错|调试|正则|sql/i.test(message);
  const longKw = /总结|概括|长文|分析(文档|这篇)|翻译|提取|整理|归纳/i.test(message);

  // 画图任务：Pollinations 完全免费、无需 Key、浏览器可直接访问
  if (!hasImage && isImgGen(message)) {
    return { provider: 'pollinations', model: 'flux', reason: '画图任务 → 图像生成模型 (Flux · 免费·无需Key)' };
  }
  if (hasImage) {
    if (KEYS.gemini) return { provider: 'gemini', model: MODELS.gemini.flash, reason: '检测到图片 → 视觉理解模型' };
    if (KEYS.openrouter) return { provider: 'openrouter', model: MODELS.openrouter.flash, reason: '检测到图片 → 视觉模型' };
    return { error: '处理图片需要 Gemini 或 OpenRouter 的 Key（设置里填一个）' };
  }
  if (hasCodeFile || codeKw) {
    if (KEYS.openrouter) return { provider: 'openrouter', model: MODELS.openrouter.coder, reason: '检测到代码 → 代码模型 (Qwen3-Coder)' };
    if (KEYS.gemini) return { provider: 'gemini', model: MODELS.gemini.flash, reason: '代码任务 → Gemini' };
    return { error: '代码任务需要 OpenRouter 或 Gemini 的 Key' };
  }
  if (longText || longKw) {
    if (KEYS.gemini) return { provider: 'gemini', model: MODELS.gemini.flash, reason: '长文本/理解任务 → 长上下文模型 (1M)' };
    if (KEYS.openrouter) return { provider: 'openrouter', model: MODELS.openrouter.longctx, reason: '长文本 → 超长上下文 (10M)' };
    return { error: '长文本任务需要 Gemini 或 OpenRouter 的 Key' };
  }
  // 默认：常规对话（Groq 浏览器直连常被跨域拦截，放最后兜底）
  if (KEYS.gemini) return { provider: 'gemini', model: MODELS.gemini.flash, reason: '常规对话 → Gemini' };
  if (KEYS.openrouter) return { provider: 'openrouter', model: MODELS.openrouter.chat, reason: '常规对话 → 免费模型' };
  if (KEYS.groq) return { provider: 'groq', model: MODELS.groq.fast, reason: '常规对话 → 高速模型 (Groq·可能被浏览器跨域拦截)' };
  return { error: '请先在右上角「设置」里填入至少一个免费 API Key' };
}

// 降级链：主路由失败（网络/跨域/限流）时按可用 Key 依次换厂商重试
function fallbackChain(rt, message, files) {
  const hasImage = files.some((f) => f.isImage);
  const chain = [];
  if (KEYS.gemini) chain.push({ provider: 'gemini', model: MODELS.gemini.flash, reason: '降级 → Gemini' });
  if (KEYS.openrouter) chain.push({ provider: 'openrouter', model: hasImage ? MODELS.openrouter.flash : MODELS.openrouter.chat, reason: '降级 → OpenRouter' });
  if (KEYS.groq && !hasImage) chain.push({ provider: 'groq', model: MODELS.groq.fast, reason: '降级 → Groq' });
  return chain.filter((r) => !(r.provider === rt.provider && r.model === rt.model));
}

/* ---------------- 厂商调用（流式） ---------------- */
function buildUserContent(message, files) {
  // 文本 + 附件文字合并
  let text = message;
  const fileTexts = files.filter((f) => f.text).map((f) => `【文件：${f.name}】\n${f.text.slice(0, 60000)}`);
  if (fileTexts.length) text += '\n\n' + fileTexts.join('\n\n');
  return text;
}

async function callModel(rt, message, files, onToken, onDone) {
  const content = buildUserContent(message, files);
  const images = files.filter((f) => f.isImage);
  if (rt.provider === 'gemini') return await gemini(rt.model, content, images, onToken, onDone);
  if (rt.provider === 'openrouter') return await openrouter(rt.model, content, images, onToken, onDone);
  if (rt.provider === 'groq') return await groq(rt.model, content, onToken, onDone);
  throw new Error('未知厂商: ' + rt.provider);
}

// Pollinations 图像生成（完全免费、无需 Key、浏览器可直连）
async function pollinationsImg(message, bubble) {
  // 去掉"生成一张图，"这类指令前缀，把剩余部分当画面描述
  const prompt = message
    .replace(/^\s*(请|帮我|帮我请)?\s*(生成|画|绘制|渲染|create|generate|draw|paint|make)\s*(一)?(张|幅|个)?\s*(图|图片|图像|画|海报|插画)?\s*[，,。:：、\s]*/i, '')
    .trim() || message;
  const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt)
    + '?width=1024&height=768&nologo=true&seed=' + Math.floor(Math.random() * 999999);
  bubble.textContent = '🖼️ 正在生成图片…（Flux 模型，约 10~30 秒）';
  const img = new Image();
  img.src = url;
  img.style.maxWidth = '100%';
  img.style.borderRadius = '10px';
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error('图片生成失败/超时，点下面的链接重试'));
  });
  bubble.textContent = '';
  bubble.appendChild(img);
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  a.textContent = '🔍 查看原图 · 再点一次换一张（随机种子）';
  a.style.cssText = 'display:block;margin-top:6px;font-size:13px;';
  bubble.appendChild(a);
}

// Gemini（支持图片 inline + 长文本 + 流式 SSE）
async function gemini(model, text, images, onToken, onDone) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${KEYS.gemini}`;
  const parts = [{ text }];
  for (const img of images) {
    const comma = img.dataUrl.indexOf(',');
    const mime = img.dataUrl.slice(5, comma).split(';')[0];
    const data = img.dataUrl.slice(comma + 1);
    parts.push({ inline_data: { mime_type: mime, data } });
  }
  const body = { contents: [{ role: 'user', parts }] };
  const resp = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!resp.ok) { const t = await resp.text(); throw new Error('HTTP ' + resp.status + ' ' + t.slice(0, 200)); }
  await consumeSSE(resp, (obj) => {
    const cand = obj.candidates && obj.candidates[0];
    const pt = cand && cand.content && cand.content.parts && cand.content.parts[0];
    if (pt && pt.text) onToken(pt.text);
  }, onDone);
}

// OpenRouter（OpenAI 兼容，支持图片 image_url，流式 SSE）
async function openrouter(model, text, images, onToken, onDone) {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const content = [{ type: 'text', text }];
  for (const img of images) content.push({ type: 'image_url', image_url: { url: img.dataUrl } });
  const body = {
    model, stream: true,
    messages: [{ role: 'user', content: images.length ? content : text }],
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KEYS.openrouter, 'Content-Type': 'application/json',
      'HTTP-Referer': location.href, 'X-Title': 'Smart Chat Router' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) { const t = await resp.text(); throw new Error('HTTP ' + resp.status + ' ' + t.slice(0, 200)); }
  await consumeSSE(resp, (obj) => {
    const delta = obj.choices && obj.choices[0] && obj.choices[0].delta;
    if (delta && delta.content) onToken(delta.content);
  }, onDone);
}

// Groq（OpenAI 兼容，无视觉；流式 SSE）
async function groq(model, text, onToken, onDone) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const body = { model, stream: true, messages: [{ role: 'user', content: text }] };
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KEYS.groq, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) { const t = await resp.text(); throw new Error('HTTP ' + resp.status + ' ' + t.slice(0, 200)); }
  await consumeSSE(resp, (obj) => {
    const delta = obj.choices && obj.choices[0] && obj.choices[0].delta;
    if (delta && delta.content) onToken(delta.content);
  }, onDone);
}

// 通用 SSE 解析
async function consumeSSE(resp, onObj, onDone) {
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const data = s.slice(5).trim();
      if (data === '[DONE]') { onDone(full); return; }
      try {
        const obj = JSON.parse(data);
        // Gemini SSE 是裸 JSON 对象；OpenRouter 是 {choices:[...]}
        if (obj.candidates) { /* gemini */ }
        onObj(obj);
      } catch (e) { /* 忽略非 JSON 行 */ }
    }
  }
  onDone(full);
}

/* ---------------- UI ---------------- */
const chatEl = document.getElementById('chat');
function addMsg(role, text) {
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + role;
  const av = document.createElement('div');
  av.className = 'avatar';
  av.textContent = role === 'user' ? '🧑' : '🤖';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text || '';
  wrap.appendChild(av); wrap.appendChild(bubble);
  chatEl.appendChild(wrap);
  chatEl.scrollTop = chatEl.scrollHeight;
  return bubble;
}
function escapeHtml(s){return s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function renderMarkdownPlain(bubble, text){
  // 轻量渲染：代码块着色 + 行内 code
  const esc = escapeHtml(text);
  bubble.innerHTML = esc
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function showRouteInfo(rt) {
  const el = document.getElementById('routeInfo');
  if (rt.error) { el.textContent = '⚠️ ' + rt.error; return; }
  el.textContent = `🤖 路由 → ${rt.provider.toUpperCase()} / ${rt.model} · ${rt.reason}`;
}

async function send() {
  const input = document.getElementById('input');
  const message = input.value.trim();
  if (!message && pendingFiles.length === 0) return;

  // 显示用户消息
  let userText = message || '[附件]';
  if (pendingFiles.length) userText += '\n📎 ' + pendingFiles.map((f) => f.name).join(', ');
  addMsg('user', userText);

  const rt = route(message, pendingFiles);
  if (rt.error) { showRouteInfo(rt); addMsg('bot', rt.error); clearAttachments(); input.value = ''; return; }

  const botBubble = addMsg('bot', '');
  const badge = document.createElement('div');
  badge.className = 'badge';
  botBubble.parentNode.insertBefore(badge, botBubble);

  if (rt.provider === 'pollinations') {
    badge.textContent = 'POLLINATIONS · flux';
    showRouteInfo(rt);
    try {
      await pollinationsImg(message, botBubble);
    } catch (e) {
      botBubble.textContent = '调用出错：' + e.message;
    }
  } else {
    // 主路由 + 降级链：网络/跨域/限流失败自动换下一家
    const chain = [rt, ...fallbackChain(rt, message, pendingFiles)];
    let lastErr = '';
    let ok = false;
    for (const r of chain) {
      badge.textContent = `${r.provider.toUpperCase()} · ${r.model}`;
      showRouteInfo(r);
      let acc = '';
      try {
        await callModel(r, message, pendingFiles, (t) => {
          acc += t;
          botBubble.textContent = acc;
          chatEl.scrollTop = chatEl.scrollHeight;
        }, (final) => {
          renderMarkdownPlain(botBubble, final || acc);
        });
        ok = true;
        break;
      } catch (e) {
        lastErr = e.message;
        if (chain.indexOf(r) < chain.length - 1) {
          botBubble.textContent = `⚠️ ${r.provider.toUpperCase()} 调用失败（${lastErr.slice(0, 80)}），自动换下一家…`;
        }
      }
    }
    if (!ok) {
      renderMarkdownPlain(botBubble,
        '调用出错：' + lastErr +
        '\n\n💡 提示：Groq 的接口在浏览器里常被跨域拦截（CORS），建议在「设置」里填 Gemini 或 OpenRouter 的免费 Key（都不用信用卡）。画图任务无需任何 Key。');
    }
  }
  chatEl.scrollTop = chatEl.scrollHeight;

  clearAttachments();
  input.value = '';
}

/* ---------------- 附件 UI ---------------- */
function renderAttachments() {
  const box = document.getElementById('attachments');
  box.innerHTML = '';
  pendingFiles.forEach((f, i) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    if (f.isImage) {
      const im = document.createElement('img'); im.src = f.dataUrl; chip.appendChild(im);
    }
    chip.appendChild(document.createTextNode(f.name));
    const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕';
    x.onclick = () => { pendingFiles.splice(i, 1); renderAttachments(); };
    chip.appendChild(x);
    box.appendChild(chip);
  });
}
function clearAttachments() { pendingFiles.length = 0; renderAttachments(); }

/* ---------------- 事件绑定 ---------------- */
function init() {
  loadKeys();
  document.getElementById('keyGemini').value = KEYS.gemini;
  document.getElementById('keyOpenrouter').value = KEYS.openrouter;
  document.getElementById('keyGroq').value = KEYS.groq;

  const tip = document.createElement('div');
  tip.className = 'empty-tip';
  tip.innerHTML = '填入免费 Key 后即可聊天（推荐 Gemini，免信用卡）。<br>🖼️ <b>画图任务无需任何 Key</b>：直接说"生成一张图：悬崖边的树拴着船"即可。<br>发消息自动路由：长文本→理解模型 / 图片→视觉模型 / 代码→代码模型 / 画图→Flux。';
  chatEl.appendChild(tip);

  document.getElementById('settingsBtn').onclick = () =>
    document.getElementById('settingsPanel').classList.toggle('hidden');
  document.getElementById('closeSettings').onclick = () =>
    document.getElementById('settingsPanel').classList.add('hidden');
  document.getElementById('saveKeys').onclick = saveKeys;

  document.getElementById('attachBtn').onclick = () => document.getElementById('fileInput').click();
  document.getElementById('fileInput').onchange = async (e) => {
    for (const file of e.target.files) {
      const item = await readFile(file);
      pendingFiles.push(item);
    }
    renderAttachments();
    e.target.value = '';
  };

  document.getElementById('sendBtn').onclick = send;
  document.getElementById('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
}
init();
