#!/usr/bin/env python3
"""Smoke-test an OpenAI-compatible API gateway without printing the API key."""

from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
import urllib.error
import urllib.request


def request_json(
    method: str,
    url: str,
    api_key: str,
    payload: dict | None = None,
    user_agent: str = "Codex CLI",
) -> tuple[int, dict | str]:
    data = None
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": user_agent,
    }
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read().decode("utf-8", errors="replace")
            try:
                return response.status, json.loads(body)
            except json.JSONDecodeError:
                return response.status, body[:1000]
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        try:
            return error.code, json.loads(body)
        except json.JSONDecodeError:
            return error.code, body[:1000]
    except urllib.error.URLError as error:
        return 0, f"Network error: {error.reason}"


def summarize_response(body: dict | str) -> str:
    if isinstance(body, str):
        return body
    if "error" in body:
        return json.dumps(body["error"], ensure_ascii=False)
    if "data" in body and isinstance(body["data"], list):
        ids = [str(item.get("id", "")) for item in body["data"][:8] if isinstance(item, dict)]
        return "models: " + ", ".join(ids)
    output_text = body.get("output_text")
    if output_text:
        return str(output_text)[:500]
    if "output" in body:
        return json.dumps(body["output"], ensure_ascii=False)[:500]
    return json.dumps(body, ensure_ascii=False)[:500]


def main() -> int:
    parser = argparse.ArgumentParser(description="Test OpenAI-compatible gateway connectivity.")
    parser.add_argument("--base-url", default=os.environ.get("OPENAI_BASE_URL") or "https://api.goainexus.xyz")
    parser.add_argument(
        "--api-prefix",
        choices=["none", "v1"],
        default="none",
        help="Path prefix appended to base URL. The goainexus Codex config uses no /v1 prefix.",
    )
    parser.add_argument("--model", default="gpt-5.4")
    parser.add_argument(
        "--user-agent",
        default="Codex CLI",
        help="User-Agent header for gateways that block Python's default user agent.",
    )
    parser.add_argument("--skip-response", action="store_true", help="Only test /v1/models.")
    parser.add_argument("--skip-models", action="store_true", help="Skip /v1/models and test generation only.")
    parser.add_argument(
        "--endpoint",
        choices=["all", "responses", "chat"],
        default="all",
        help="Generation endpoint to test after /v1/models.",
    )
    args = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY") or getpass.getpass("API key (hidden): ")
    if not api_key.strip():
        print("Missing API key.", file=sys.stderr)
        return 2

    base_url = args.base_url.rstrip("/")
    if args.api_prefix == "v1" and not base_url.endswith("/v1"):
        base_url = base_url + "/v1"

    print(f"Testing base URL: {base_url}")
    print("API key: loaded, not displayed")

    failures = 0

    if not args.skip_models:
        status, body = request_json("GET", f"{base_url}/models", api_key, user_agent=args.user_agent)
        print(f"\nGET /models -> HTTP {status}")
        print(summarize_response(body))
        if status < 200 or status >= 300:
            failures += 1

    if args.skip_response:
        return 0 if failures == 0 else 1

    generation_ok = False

    if args.endpoint in {"all", "responses"}:
        payload = {
            "model": args.model,
            "input": "Reply with exactly: ok",
            "max_output_tokens": 16,
        }
        status, body = request_json("POST", f"{base_url}/responses", api_key, payload, user_agent=args.user_agent)
        print(f"\nPOST /responses model={args.model} -> HTTP {status}")
        print(summarize_response(body))
        generation_ok = generation_ok or (200 <= status < 300)

    if args.endpoint in {"all", "chat"}:
        payload = {
            "model": args.model,
            "messages": [{"role": "user", "content": "Reply with exactly: ok"}],
            "max_tokens": 16,
        }
        status, body = request_json("POST", f"{base_url}/chat/completions", api_key, payload, user_agent=args.user_agent)
        print(f"\nPOST /chat/completions model={args.model} -> HTTP {status}")
        print(summarize_response(body))
        generation_ok = generation_ok or (200 <= status < 300)

    return 0 if generation_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
