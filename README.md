# 智能路由聊天 · Smart Chat Router

一个**纯前端、零后端**的聊天网页：你发消息，它**自动选模型**——

- 📄 **长文本 / 文档** → 长上下文理解模型（Gemini 1M / Llama-4-Scout 10M）
- 🖼️ **图片** → 视觉模型
- 💻 **代码** → 代码专用模型（Qwen3-Coder）
- 💬 **普通对话** → 高速模型（Groq）

全程只用各厂商的**免费额度（无需信用卡）**。Key 只存在你浏览器本地，请求直连厂商 API，没有任何中间服务器，所以**别人也能直接用这个网址、用自己的 Key**。

## 在线使用
部署后会给一个 `https://<用户名>.github.io/ai-chat-router/` 的网址，打开即用。

## 获取免费 Key（都不需要信用卡）
| 厂商 | 用途 | 获取地址 |
|---|---|---|
| **Gemini**（Google AI Studio） | 长文本 + 图片视觉，推荐首选 | https://aistudio.google.com/apikey |
| **OpenRouter** | 一个 Key 用几十个免费模型（含代码/超长上下文） | https://openrouter.ai/keys |
| **Groq** | 最快，免费 14400 次/天，仅需邮箱 | https://console.groq.com/keys |

打开网页右上角「⚙️ 设置」，把 Key 粘进去保存即可。至少填一个就能用。

## 自己部署 / 分叉（给别人用）
1. 点 GitHub 右上角 Fork 这个仓库；
2. 仓库 **Settings → Pages → Source 选 `main` 分支 / root → Save**；
3. 几分钟後访问 `https://<你的用户名>.github.io/ai-chat-router/`。

或者本地预览：`python3 -m http.server` 然后开 `http://localhost:8000`。

## 文件结构
- `index.html` — 页面与设置面板
- `styles.css` — 样式
- `app.js` — 文件读取 + 自动路由 + 三厂商流式调用

## 说明
- 免费层有速率限制（Gemini 1500 次/天、Groq 14400 次/天等），个人使用足够，不适合拿来商业化转卖。
- 视觉任务依赖 Gemini / OpenRouter 的 Key；若只填了 Groq，则图片任务会提示需要补充 Key。
