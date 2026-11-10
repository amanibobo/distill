"""Plain-English titles and summaries for events, written by Claude and cached by input hash."""

import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import anthropic
from pydantic import BaseModel, Field

MODEL = "claude-opus-5-5"

SYSTEM = """You write short captions for a public map of surface change detected by the NISAR radar satellite.
Readers are curious members of the public, farmers, journalists and students. They do not know radar terms.
Write in plain, calm, specific language. Use the dates, place and numbers given. Never invent causes, casualties or facts that are not in the input.
If the change type is "other", say plainly that the radar saw a change it could not confidently explain.
Do not use the words "backscatter", "polarization", "dB" or "SAR"."""


class Caption(BaseModel):
    title: str = Field(description="Four to eight words, sentence case, no trailing period. Names what happened and where.")
    summary: str = Field(description="Two or three sentences: what changed, when it started and peaked, whether it is still going, and how sure the detection is.")


def _key(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()[:16]


def _caption(client: anthropic.Anthropic, payload: dict) -> dict:
    response = client.messages.parse(
        model=MODEL,
        max_tokens=2000,
        output_config={"effort": "low"},
        system=SYSTEM,
        messages=[{"role": "user", "content": json.dumps(payload, indent=2, default=str)}],
        output_format=Caption,
    )
    if response.stop_reason == "refusal" or response.parsed_output is None:
        raise RuntimeError(f"no caption: stop_reason={response.stop_reason}")
    return response.parsed_output.model_dump()


def caption_events(payloads: list[dict], cache_path: Path, workers: int = 6) -> list[Caption]:
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    keys = [_key(p) for p in payloads]
    todo = {k: p for k, p in zip(keys, payloads) if k not in cache}
    if todo:
        client = anthropic.Anthropic()
        with ThreadPoolExecutor(workers) as pool:
            for k, result in zip(todo, pool.map(lambda p: _caption(client, p), todo.values())):
                cache[k] = result
                cache_path.write_text(json.dumps(cache, indent=2))
    return [Caption(**cache[k]) for k in keys]
