import base64
import json
import mimetypes
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Literal

from mcp.server.fastmcp import FastMCP


mcp = FastMCP(
    "siliconflow-vision",
    instructions=(
        "Analyze local image files by sending them to SiliconFlow vision models. "
        "Use this when the model backend has no native multimodal support."
    ),
)

DEFAULT_VISION_MODEL = "Qwen/Qwen3.6-35B-A3B"


def _image_data_url(image_path: str) -> str:
    path = Path(image_path).expanduser().resolve()
    if not path.is_file():
        raise ValueError(f"Image file does not exist: {path}")

    max_bytes = int(os.environ.get("SILICONFLOW_VISION_MAX_BYTES", "15728640"))
    size = path.stat().st_size
    if size > max_bytes:
        raise ValueError(
            f"Image is too large: {size} bytes. Limit is {max_bytes} bytes. "
            "Resize or compress it before analysis."
        )

    mime_type = mimetypes.guess_type(path.name)[0] or "image/png"
    with path.open("rb") as image_file:
        encoded = base64.b64encode(image_file.read()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def _latest_chat_image_data_url() -> str:
    projects_dir = Path.home() / ".claude" / "projects"
    if not projects_dir.exists():
        raise ValueError(f"Claude projects directory does not exist: {projects_dir}")

    jsonl_files = [
        path
        for path in projects_dir.rglob("*.jsonl")
        if "subagents" not in {part.lower() for part in path.parts}
    ]
    jsonl_files.sort(key=lambda path: path.stat().st_mtime, reverse=True)

    for jsonl_file in jsonl_files[:20]:
        try:
            lines = jsonl_file.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue

        for line in reversed(lines):
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
                    return f"data:{media_type};base64,{data}"

    raise ValueError(
        "No recent chat image found in transcripts. "
        "If your model backend does not support multimodal (e.g., DeepSeek), "
        "images are not stored in transcripts — save the image to a local file "
        "and use analyze_image(image_path=...) instead."
    )


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


@mcp.tool()
def analyze_image(
    image_path: str,
    prompt: str = "Describe this image and extract any visible text.",
    detail: Literal["low", "high", "auto"] = "auto",
    model: str | None = None,
    max_tokens: int = 1200,
) -> str:
    """Analyze a local image file with a SiliconFlow vision model."""
    selected_model = model or os.environ.get(
        "SILICONFLOW_VISION_MODEL", DEFAULT_VISION_MODEL
    )
    payload = {
        "model": selected_model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": _image_data_url(image_path),
                            "detail": detail,
                        },
                    },
                    {
                        "type": "text",
                        "text": prompt,
                    },
                ],
            }
        ],
        "max_tokens": max_tokens,
    }
    data = _post_chat_completion(payload)
    choices = data.get("choices") or []
    if not choices:
        return json.dumps(data, ensure_ascii=False, indent=2)

    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content
    return json.dumps(content if content is not None else data, ensure_ascii=False, indent=2)


@mcp.tool()
def analyze_latest_chat_image(
    prompt: str = "Describe this image and extract any visible text.",
    detail: Literal["low", "high", "auto"] = "auto",
    model: str | None = None,
    max_tokens: int = 1200,
) -> str:
    """Analyze the most recent image uploaded in Claude Code chat."""
    selected_model = model or os.environ.get(
        "SILICONFLOW_VISION_MODEL", DEFAULT_VISION_MODEL
    )
    payload = {
        "model": selected_model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": _latest_chat_image_data_url(),
                            "detail": detail,
                        },
                    },
                    {
                        "type": "text",
                        "text": prompt,
                    },
                ],
            }
        ],
        "max_tokens": max_tokens,
    }
    data = _post_chat_completion(payload)
    choices = data.get("choices") or []
    if not choices:
        return json.dumps(data, ensure_ascii=False, indent=2)

    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content
    return json.dumps(content if content is not None else data, ensure_ascii=False, indent=2)


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
