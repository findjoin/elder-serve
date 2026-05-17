import base64
import json
import mimetypes
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Literal

from mcp.server.fastmcp import FastMCP


MAX_BYTES = int(os.environ.get("SILICONFLOW_VISION_MAX_BYTES", "15728640"))

mcp = FastMCP(
    "siliconflow-vision",
    instructions=(
        "Analyze local image files by sending them to SiliconFlow vision models. "
        "Use this when the model backend has no native multimodal support.\n\n"
        "MULTI-IMAGE: Both tools support analyzing multiple images in one call. "
        "For analyze_image, pass extra paths via `extra_image_paths` list. "
        "For analyze_latest_chat_image, set `count` to the number of recent "
        "chat images to analyze together.\n\n"
        "MODEL BEHAVIOR: The default model Qwen/Qwen3.6-35B-A3B is a thinking model. "
        "It may put its analysis in `reasoning_content` while leaving `content` empty. "
        "This tool automatically falls back to `reasoning_content` when `content` is "
        "empty or whitespace-only. If both are empty, the raw API response is returned.\n\n"
        f"IMAGE SIZE LIMIT: Maximum {MAX_BYTES} bytes (~15MB). "
        "Large images may cause timeouts; resize before analysis if needed."
    ),
)

DEFAULT_VISION_MODEL = "Qwen/Qwen3.6-35B-A3B"


def _image_data_url(image_path: str) -> str:
    path = Path(image_path).expanduser().resolve()
    if not path.is_file():
        raise ValueError(f"Image file does not exist: {path}")

    size = path.stat().st_size
    if size > MAX_BYTES:
        raise ValueError(
            f"Image is too large: {size} bytes. Limit is {MAX_BYTES} bytes. "
            "Resize or compress it before analysis."
        )

    mime_type = mimetypes.guess_type(path.name)[0] or "image/png"
    with path.open("rb") as image_file:
        encoded = base64.b64encode(image_file.read()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def _latest_chat_image_data_urls(count: int) -> list[str]:
    """Return the N most recent image data URLs from chat transcripts.

    Only searches the current session's JSONL (most recently modified).
    Validates freshness: images must be within the last 20% of the file
    to avoid returning stale images from compacted history.
    """
    projects_dir = Path.home() / ".claude" / "projects"
    if not projects_dir.exists():
        raise ValueError(f"Claude projects directory does not exist: {projects_dir}")

    jsonl_files = [
        path
        for path in projects_dir.rglob("*.jsonl")
        if "subagents" not in {part.lower() for part in path.parts}
    ]
    jsonl_files.sort(key=lambda path: path.stat().st_mtime, reverse=True)

    found = []
    # Only search the most recent file (current session) for correctness.
    # Searching older files risks returning images from past conversations.
    for jsonl_file in jsonl_files[:3]:
        try:
            lines = jsonl_file.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue

        total = len(lines)
        # Only accept images from the tail of the file (last 20% of lines).
        # Images from earlier in the file belong to compacted history
        # and do not represent the current conversation turn.
        freshness_cutoff = max(0, total - max(int(total * 0.2), 500))

        for line_idx in range(total - 1, -1, -1):
            line = lines[line_idx]
            if line_idx < freshness_cutoff:
                # Reached stale history — stop searching this file
                break
            if '"type":"image"' not in line and '"type": "image"' not in line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            message = entry.get("message") or {}
            content = message.get("content") or []
            if not isinstance(content, list):
                continue
            for item in content:
                if not isinstance(item, dict) or item.get("type") != "image":
                    continue
                source = item.get("source") or {}
                if source.get("type") != "base64":
                    continue
                media_type = source.get("media_type") or "image/png"
                data = source.get("data")
                if data:
                    found.append(f"data:{media_type};base64,{data}")
                    if len(found) >= count:
                        # Reverse so earliest is first, latest is last
                        found.reverse()
                        return found

        if found:
            # Found images but not enough — they're all from the same file,
            # so they should be consistent (same conversation turn).
            found.reverse()
            return found

    if not found:
        raise ValueError(
            "No recent chat image found in current session transcripts. "
            "If your model backend does not support multimodal (e.g., DeepSeek), "
            "images are not stored in transcripts — save the image to a local file "
            "and use analyze_image(image_path=...) instead."
        )

    found.reverse()
    return found


def _post_chat_completion(payload: dict) -> dict:
    api_key = os.environ.get("SILICONFLOW_API_KEY")
    if not api_key and os.name == "nt":
        try:
            import winreg

            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
                api_key = winreg.QueryValueEx(key, "SILICONFLOW_API_KEY")[0]
        except OSError:
            api_key = None

    if not api_key:
        raise RuntimeError(
            "SILICONFLOW_API_KEY is not set. The MCP process could not read it "
            "from its environment or from the Windows user environment registry."
        )

    base_url = os.environ.get("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1")
    url = base_url.rstrip("/") + "/chat/completions"
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"SiliconFlow API HTTP {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"SiliconFlow API request failed: {exc}") from exc


def _extract_response_text(data: dict) -> str:
    """Extract text from API response, falling back to reasoning_content."""
    choices = data.get("choices") or []
    if not choices:
        return json.dumps(data, ensure_ascii=False, indent=2)

    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str) and content.strip():
        return content
    reasoning = message.get("reasoning_content")
    if isinstance(reasoning, str) and reasoning.strip():
        return reasoning
    return json.dumps(content if content is not None else data, ensure_ascii=False, indent=2)


def _build_multi_image_payload(
    image_urls: list[str],
    prompt: str,
    detail: str,
    model: str,
    max_tokens: int,
) -> dict:
    """Build a chat completion payload with multiple images."""
    content_blocks = []
    for idx, url in enumerate(image_urls):
        content_blocks.append({
            "type": "image_url",
            "image_url": {"url": url, "detail": detail},
        })
    content_blocks.append({"type": "text", "text": prompt})

    return {
        "model": model,
        "messages": [{"role": "user", "content": content_blocks}],
        "max_tokens": max_tokens,
    }


@mcp.tool()
def analyze_image(
    image_path: str,
    extra_image_paths: list[str] | None = None,
    prompt: str = "Describe this image and extract any visible text.",
    detail: Literal["low", "high", "auto"] = "auto",
    model: str | None = None,
    max_tokens: int = 1200,
) -> str:
    """Analyze one or more local image files with a SiliconFlow vision model.

    Set extra_image_paths to analyze multiple images together in one request.
    """
    selected_model = model or os.environ.get(
        "SILICONFLOW_VISION_MODEL", DEFAULT_VISION_MODEL
    )
    urls = [_image_data_url(image_path)]
    if extra_image_paths:
        for extra in extra_image_paths:
            urls.append(_image_data_url(extra))

    payload = _build_multi_image_payload(urls, prompt, detail, selected_model, max_tokens)
    return _extract_response_text(_post_chat_completion(payload))


@mcp.tool()
def analyze_latest_chat_image(
    prompt: str = "Describe this image and extract any visible text.",
    detail: Literal["low", "high", "auto"] = "auto",
    model: str | None = None,
    max_tokens: int = 1200,
    count: int = 1,
) -> str:
    """Analyze the most recent image(s) uploaded in Claude Code chat.

    Set count > 1 to analyze multiple recent images together.
    """
    selected_model = model or os.environ.get(
        "SILICONFLOW_VISION_MODEL", DEFAULT_VISION_MODEL
    )
    urls = _latest_chat_image_data_urls(max(count, 1))
    payload = _build_multi_image_payload(urls, prompt, detail, selected_model, max_tokens)
    return _extract_response_text(_post_chat_completion(payload))


@mcp.tool()
def diagnose_siliconflow_config() -> str:
    """Report whether SiliconFlow config is visible to this MCP process."""
    process_has_key = bool(os.environ.get("SILICONFLOW_API_KEY"))
    registry_has_key = False
    registry_error = None
    if os.name == "nt":
        try:
            import winreg

            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
                registry_has_key = bool(winreg.QueryValueEx(key, "SILICONFLOW_API_KEY")[0])
        except OSError as exc:
            registry_error = str(exc)

    return json.dumps(
        {
            "process_has_siliconflow_api_key": process_has_key,
            "windows_user_registry_has_siliconflow_api_key": registry_has_key,
            "windows_user_registry_error": registry_error,
            "base_url": os.environ.get("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1"),
            "vision_model": os.environ.get("SILICONFLOW_VISION_MODEL", DEFAULT_VISION_MODEL),
            "os_name": os.name,
        },
        ensure_ascii=False,
        indent=2,
    )


if __name__ == "__main__":
    mcp.run()
