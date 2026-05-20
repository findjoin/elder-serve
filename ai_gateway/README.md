# Elder AI Gateway

院长端 AI 的独立低成本网关。它保留人格、用户/页面/机构摘要和心跳，不内置技能包，不直接访问数据库，不保存 OpenClaw key。

## 默认模型

默认模型选择 `deepseek-ai/DeepSeek-V3.2`：

- 已通过当前 OpenClaw 网关 `/v1/responses` 白名单验证。
- 本项目默认只传压缩上下文，不再让模型读取整院长上下文。
- 失败时仍回退同一模型；如果模型输出工具痕迹，网关会拦截并返回低置信度提示。

## 环境变量

- `OPENCLAW_GATEWAY_URL` / `OPENCLAW_AUTH_TOKEN`：复用现有 OpenClaw 上游配置。
- `ELDER_AI_DEFAULT_MODEL`：默认 `deepseek-ai/DeepSeek-V3.2`。
- `ELDER_AI_FALLBACK_MODEL`：默认 `deepseek-ai/DeepSeek-V3.2`。
- `ELDER_AI_HEARTBEAT_PATH`：默认 `/var/lib/elder_ai_gateway/heartbeat.json`。

## 接口

- `GET /healthz`
- `GET /heartbeat`
- `POST /v1/director-assistant`

默认监听 `127.0.0.1:18891`，避免和现有 OpenClaw 网关端口冲突。
