#!/usr/bin/env python3
"""Switch Codex config between the default provider and a goainexus gateway.

This script only edits ~/.codex/config.toml. It does not read or write auth.json
and it does not store API keys. Put the gateway key in OPENAI_API_KEY yourself.
"""

from __future__ import annotations

import argparse
import shutil
from datetime import datetime
from pathlib import Path


MANAGED_TOP_KEYS = {
    "model_provider",
    "model",
    "review_model",
    "disable_response_storage",
    "network_access",
    "windows_wsl_setup_acknowledged",
    "model_context_window",
    "model_auto_compact_token_limit",
}


def default_config_path() -> Path:
    return Path.home() / ".codex" / "config.toml"


def make_backup(config_path: Path) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = config_path.with_name(f"{config_path.name}.backup-{timestamp}")
    shutil.copy2(config_path, backup_path)
    return backup_path


def section_name(line: str) -> str | None:
    stripped = line.strip()
    if stripped.startswith("[") and stripped.endswith("]"):
      return stripped.strip("[]").strip()
    return None


def remove_managed_provider_config(lines: list[str]) -> list[str]:
    result: list[str] = []
    skip_section = False

    for line in lines:
        current_section = section_name(line)
        if current_section is not None:
            skip_section = current_section in {"model_providers.goainexus", "model_providers.OpenAI"}
            if skip_section:
                continue

        if skip_section:
            continue

        key = line.split("=", 1)[0].strip() if "=" in line and not line.lstrip().startswith("[") else ""
        if key in MANAGED_TOP_KEYS:
            continue

        result.append(line)

    return trim_extra_blank_lines(result)


def trim_extra_blank_lines(lines: list[str]) -> list[str]:
    result: list[str] = []
    previous_blank = False
    for line in lines:
        blank = not line.strip()
        if blank and previous_blank:
            continue
        result.append(line)
        previous_blank = blank
    while result and not result[-1].strip():
        result.pop()
    return result


def set_reasoning_effort(lines: list[str], value: str) -> list[str]:
    updated = False
    result: list[str] = []
    for line in lines:
        key = line.split("=", 1)[0].strip() if "=" in line and not line.lstrip().startswith("[") else ""
        if key == "model_reasoning_effort":
            result.append(f'model_reasoning_effort = "{value}"\n')
            updated = True
        else:
            result.append(line)
    if not updated:
        result.insert(0, f'model_reasoning_effort = "{value}"\n')
    return result


def switch_to_official(config_path: Path, backup: bool) -> Path | None:
    if not config_path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}")

    backup_path = make_backup(config_path) if backup else None
    lines = config_path.read_text(encoding="utf-8-sig").splitlines(keepends=True)
    lines = remove_managed_provider_config(lines)
    lines = set_reasoning_effort(lines, "medium")
    config_path.write_text("".join(lines) + "\n", encoding="utf-8")
    return backup_path


def switch_to_goainexus(
    config_path: Path,
    backup: bool,
    model: str,
    review_model: str,
    reasoning: str,
    base_url: str,
) -> Path | None:
    if not config_path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}")

    backup_path = make_backup(config_path) if backup else None
    lines = config_path.read_text(encoding="utf-8-sig").splitlines(keepends=True)
    lines = remove_managed_provider_config(lines)
    lines = set_reasoning_effort(lines, reasoning)

    header = [
        'model_provider = "OpenAI"\n',
        f'model = "{model}"\n',
        f'review_model = "{review_model}"\n',
        'disable_response_storage = true\n',
        'network_access = "enabled"\n',
        'windows_wsl_setup_acknowledged = true\n',
        'model_context_window = 1000000\n',
        'model_auto_compact_token_limit = 900000\n',
    ]
    body = "".join(header + lines).rstrip()
    provider_block = f"""

[model_providers.OpenAI]
name = "OpenAI"
base_url = "{base_url.rstrip("/")}"
wire_api = "responses"
requires_openai_auth = true
"""
    config_path.write_text(body + provider_block + "\n", encoding="utf-8")
    return backup_path


def show_status(config_path: Path) -> None:
    if not config_path.exists():
        print(f"Config not found: {config_path}")
        return
    text = config_path.read_text(encoding="utf-8-sig")
    provider = "default/official"
    model = ""
    base_url = ""
    in_managed_provider = False
    for raw_line in text.splitlines():
        line = raw_line.strip()
        current_section = section_name(line)
        if current_section is not None:
            in_managed_provider = current_section in {"model_providers.goainexus", "model_providers.OpenAI"}
            continue
        if line.startswith("model_provider"):
            provider = line.split("=", 1)[1].strip().strip('"')
        elif line.startswith("model ="):
            model = line.split("=", 1)[1].strip().strip('"')
        elif in_managed_provider and line.startswith("base_url"):
            base_url = line.split("=", 1)[1].strip().strip('"')

    print(f"config: {config_path}")
    print(f"provider: {provider}")
    if model:
        print(f"model: {model}")
    if base_url:
        print(f"base_url: {base_url}")
    print("auth.json: unchanged by this script")
    print("api key: use OPENAI_API_KEY environment variable")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Switch Codex provider config safely.")
    parser.add_argument("mode", choices=["goainexus", "official", "status"])
    parser.add_argument("--config", type=Path, default=default_config_path())
    parser.add_argument("--model", default="gpt-5.4")
    parser.add_argument("--review-model", default="gpt-5.4")
    parser.add_argument("--reasoning", default="xhigh")
    parser.add_argument("--base-url", default="https://api.goainexus.xyz")
    parser.add_argument("--no-backup", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config_path = args.config.expanduser()

    if args.mode == "status":
        show_status(config_path)
        return 0

    backup = not args.no_backup
    if args.mode == "official":
        backup_path = switch_to_official(config_path, backup)
        print("Switched Codex config to default/official provider.")
    else:
        backup_path = switch_to_goainexus(
            config_path=config_path,
            backup=backup,
            model=args.model,
            review_model=args.review_model,
            reasoning=args.reasoning,
            base_url=args.base_url,
        )
        print("Switched Codex config to goainexus provider.")
        print("Set OPENAI_API_KEY separately, then restart Codex.")

    if backup_path:
        print(f"Backup: {backup_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
