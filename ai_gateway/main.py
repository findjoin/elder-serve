from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


APP_DIR = Path(__file__).resolve().parent
PERSONA_PATH = Path(env("ELDER_AI_PERSONA_PATH", str(APP_DIR / "persona.md")))
HEARTBEAT_PATH = Path(env("ELDER_AI_HEARTBEAT_PATH", "/var/lib/elder_ai_gateway/heartbeat.json"))

UPSTREAM_URL = env("ELDER_AI_UPSTREAM_URL") or env("OPENCLAW_GATEWAY_URL", "http://127.0.0.1:18789")
UPSTREAM_TOKEN = env("ELDER_AI_UPSTREAM_TOKEN") or env("OPENCLAW_AUTH_TOKEN", "")
DEFAULT_MODEL = env("ELDER_AI_DEFAULT_MODEL", "deepseek-ai/DeepSeek-V3.2")
FALLBACK_MODEL = env("ELDER_AI_FALLBACK_MODEL", "deepseek-ai/DeepSeek-V3.2")
RESCUE_MODEL = env("ELDER_AI_RESCUE_MODEL", "siliconflow/Qwen/Qwen2-VL-72B-Instruct")
TIMEOUT_SECONDS = float(env("ELDER_AI_TIMEOUT_SECONDS", "45"))

app = FastAPI(title="Elder AI Gateway", version="0.1.0")


class DirectorAssistantPayload(BaseModel):
    message: str = ""
    user: dict[str, Any] = Field(default_factory=dict)
    institution: dict[str, Any] = Field(default_factory=dict)
    page: dict[str, Any] = Field(default_factory=dict)
    summary: dict[str, Any] = Field(default_factory=dict)
    alerts: list[str] = Field(default_factory=list)
    history: list[dict[str, str]] = Field(default_factory=list)
    model: str = ""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_persona() -> str:
    try:
        return PERSONA_PATH.read_text(encoding="utf-8").strip()
    except OSError:
        return "你是养老院院长端 AI 助手。必须输出严格 JSON。"


def write_heartbeat(status: str, extra: dict[str, Any] | None = None) -> None:
    payload = {
        "status": status,
        "updatedAt": now_iso(),
        "upstreamUrl": UPSTREAM_URL,
        "defaultModel": DEFAULT_MODEL,
        "fallbackModel": FALLBACK_MODEL,
        "rescueModel": RESCUE_MODEL,
        **(extra or {}),
    }
    try:
        HEARTBEAT_PATH.parent.mkdir(parents=True, exist_ok=True)
        HEARTBEAT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        pass


def extract_json_object(text: str) -> dict[str, Any]:
    if contains_tool_trace(text):
        raise ValueError("model returned tool trace instead of assistant JSON")
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("model response does not contain a JSON object")
    parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise ValueError("model response JSON is not an object")
    return parsed


def contains_tool_trace(text: str) -> bool:
    return "functions." in text or "/root/.openclaw" in text or "memory/*.md" in text or "sessions_history" in text


def build_prompt(payload: DirectorAssistantPayload) -> str:
    context = {
        "user": payload.user,
        "institution": payload.institution,
        "page": payload.page,
        "summary": payload.summary,
        "alerts": payload.alerts[:8],
        "history": payload.history[-6:],
    }
    return (
        f"{load_persona()}\n\n"
        "JSON schema:\n"
        "{\n"
        '  "reply": "给院长看的中文回答",\n'
        '  "suggestedActions": [\n'
        '    {"type": "open_page", "label": "打开任务管理", "route": "director-care-plans", "requiresConfirmation": false}\n'
        "  ],\n"
        '  "warnings": ["需要提醒院长的风险"],\n'
        '  "confidence": "low|medium|high"\n'
        "}\n\n"
        f"当前压缩上下文 JSON:\n{json.dumps(context, ensure_ascii=False)}\n\n"
        f"院长问题: {payload.message}\n"
    )


async def call_chat_completions_api(model: str, prompt: str) -> dict[str, Any]:
    if not UPSTREAM_TOKEN:
        raise HTTPException(status_code=500, detail="AI gateway upstream token is not configured")

    request_body = {
        "model": model,
        "messages": [
            {"role": "system", "content": "你是养老院院长端 AI 助手。必须只输出严格 JSON。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 1200,
    }
    headers = {
        "Authorization": f"Bearer {UPSTREAM_TOKEN}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.post(f"{UPSTREAM_URL}/v1/chat/completions", json=request_body, headers=headers)
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail={"statusCode": response.status_code, "body": response.text[:800]})

    data = response.json()
    text = ""
    choices = data.get("choices") or []
    if choices and isinstance(choices[0], dict):
        message = choices[0].get("message") or {}
        text = message.get("content") or choices[0].get("text") or ""
    return {"model": model, "raw": data, "text": str(text).strip()}


async def call_responses_api(model: str, prompt: str) -> dict[str, Any]:
    if not UPSTREAM_TOKEN:
        raise HTTPException(status_code=500, detail="AI gateway upstream token is not configured")

    request_body = {
        "model": model,
        "input": [
            {
                "type": "message",
                "role": "user",
                "content": [{"type": "input_text", "text": prompt}],
            }
        ],
    }
    headers = {
        "Authorization": f"Bearer {UPSTREAM_TOKEN}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.post(f"{UPSTREAM_URL}/v1/responses", json=request_body, headers=headers)
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail={"statusCode": response.status_code, "body": response.text[:800]})

    data = response.json()
    text_parts: list[str] = []
    for item in data.get("output", []):
        if item.get("type") != "message":
            continue
        for part in item.get("content", []):
            if part.get("type") == "output_text" and isinstance(part.get("text"), str):
                text_parts.append(part["text"])
    return {"model": model, "raw": data, "text": "\n".join(text_parts).strip()}


async def call_model(model: str, prompt: str) -> dict[str, Any]:
    try:
        return await call_chat_completions_api(model, prompt)
    except Exception:
        return await call_responses_api(model, prompt)


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "elder-ai-gateway",
        "defaultModel": DEFAULT_MODEL,
        "rescueModel": RESCUE_MODEL,
        "upstreamConfigured": bool(UPSTREAM_TOKEN and UPSTREAM_URL),
    }


@app.get("/heartbeat")
def heartbeat() -> dict[str, Any]:
    if HEARTBEAT_PATH.exists():
        try:
            return json.loads(HEARTBEAT_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"status": "unknown", "updatedAt": "", "defaultModel": DEFAULT_MODEL}


@app.post("/v1/director-assistant")
async def director_assistant(payload: DirectorAssistantPayload) -> dict[str, Any]:
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="message required")

    model = payload.model.strip() or DEFAULT_MODEL
    prompt = build_prompt(payload)
    write_heartbeat("running", {"lastRequestAt": now_iso(), "lastModel": model})
    try:
        result = await call_model(model, prompt)
    except Exception as exc:
        if model == FALLBACK_MODEL:
            write_heartbeat("error", {"lastError": str(exc), "lastModel": model})
            raise
        result = await call_model(FALLBACK_MODEL, prompt)

    raw_text = result["text"]
    if contains_tool_trace(raw_text) and RESCUE_MODEL and result["model"] != RESCUE_MODEL:
        write_heartbeat("rescuing", {
            "lastRequestAt": now_iso(),
            "lastModel": result["model"],
            "rescueModel": RESCUE_MODEL,
            "reason": "tool_trace",
        })
        result = await call_responses_api(RESCUE_MODEL, prompt)
        raw_text = result["text"]
    try:
        parsed = extract_json_object(raw_text)
    except Exception:
        if contains_tool_trace(raw_text):
            parsed = {
                "reply": "AI 网关已连接，但当前模型返回了内部工具痕迹，已被拦截。请稍后重试，或切换更适合文本对话的模型。",
                "suggestedActions": [],
                "warnings": ["当前模型不适合院长端助手输出，建议在网关配置中更换白名单内的文本模型。"],
                "confidence": "low",
            }
            raw_text = ""
        else:
            parsed = {
                "reply": raw_text[:1600] or "AI 网关暂时没有返回可读内容，请稍后重试。",
                "suggestedActions": [],
                "warnings": ["模型返回格式不是标准 JSON，本次只展示原始回答。"],
                "confidence": "low",
            }

    actions = parsed.get("suggestedActions")
    if not isinstance(actions, list):
        actions = []
    warnings = parsed.get("warnings")
    if not isinstance(warnings, list):
        warnings = []

    response = {
        "status": "success",
        "gateway": "elder-ai-gateway",
        "model": result["model"],
        "reply": str(parsed.get("reply") or "").strip() or "AI 网关没有生成回答。",
        "suggestedActions": actions[:5],
        "warnings": warnings[:8],
        "confidence": str(parsed.get("confidence") or "medium").strip(),
        "rawText": raw_text[:2000],
        "fetchedAt": now_iso(),
    }
    write_heartbeat("ok", {"lastSuccessAt": response["fetchedAt"], "lastModel": response["model"]})
    return response
