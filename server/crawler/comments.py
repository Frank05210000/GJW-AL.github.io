"""Reusable helpers for fetching Gan Jing World post comments."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

import csv
import json
import time

import requests

API_URL = "https://gw.ganjingworld.com/v1.0c/comment"
CHANNEL_BASE = "https://www.ganjingworld.com/channel"
DEFAULT_LIMIT = 100


@dataclass
class Comment:
    id: str
    author_id: str
    author_name: str
    channel_name: str
    channel_url: str
    content: str
    sticker_url: str
    like_count: int
    comment_count: int
    created_at_iso: str


@dataclass
class CommentResult:
    post_id: str
    lang: str
    generated_at: datetime
    comments: List[Comment]
    total_count: Optional[int]


def _to_iso(timestamp_ms: Optional[int]) -> str:
    if not timestamp_ms:
        return ""
    try:
        dt = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)
        return dt.isoformat().replace("+00:00", "Z")
    except Exception:
        return ""


def _normalise_comment(item: Dict) -> Comment:
    author_id = str(item.get("author_id", "") or "")
    user = item.get("user") or {}
    author_name = str(user.get("name", "") or "")
    channel_name = author_name or ""
    channel_url = f"{CHANNEL_BASE}/{author_id}" if author_id else ""
    return Comment(
        id=str(item.get("id", "")),
        author_id=author_id,
        author_name=author_name,
        channel_name=channel_name,
        channel_url=channel_url,
        content=str(item.get("content", "") or "").strip(),
        sticker_url=str(item.get("sticker_url", "") or ""),
        like_count=int(item.get("like_count", 0) or 0),
        comment_count=int(item.get("comment_count", 0) or 0),
        created_at_iso=_to_iso(item.get("time_scheduled")),
    )


def fetch_comments(
    post_id: str,
    *,
    lang: str = "zh-TW",
    limit: int = DEFAULT_LIMIT,
    delay: float = 0.2,
    hide_by_owner: bool = True,
) -> CommentResult:
    params = {
        "_startKey": "",
        "_limit": str(limit),
        "_order": "time_scheduled,desc",
        "_getCount": "1",
        "lan": lang,
        "parent_id": post_id,
        "flag": "approved",
        "hide_by_owner": str(bool(hide_by_owner)).lower(),
    }
    session = requests.Session()
    comments: List[Comment] = []
    total_count: Optional[int] = None

    while True:
        response = session.get(API_URL, params=params, timeout=15)
        response.raise_for_status()
        payload = response.json()
        data = payload.get("data") or {}
        items = data.get("list") or []
        if total_count is None:
            try:
                total_count = int(data.get("totalCount"))
            except (TypeError, ValueError):
                total_count = None
        comments.extend(_normalise_comment(item) for item in items)
        start_key = data.get("startKey") or ""
        if not start_key:
            break
        params["_startKey"] = start_key
        if delay:
            time.sleep(delay)

    return CommentResult(
        post_id=post_id,
        lang=lang,
        generated_at=datetime.now(timezone.utc),
        comments=comments,
        total_count=total_count,
    )


def save_json(result: CommentResult, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at_iso": result.generated_at.isoformat().replace("+00:00", "Z"),
        "generated_at_epoch": int(result.generated_at.timestamp()),
        "post_id": result.post_id,
        "lang": result.lang,
        "total_count": result.total_count,
        "items": [comment.__dict__ for comment in result.comments],
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def save_csv(result: CommentResult, path: Path, *, encoding: str = "utf-8-sig") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "id",
        "author_name",
        "author_id",
        "channel_name",
        "channel_url",
        "content",
        "sticker_url",
        "like_count",
        "comment_count",
        "created_at_iso",
    ]
    with path.open("w", newline="", encoding=encoding) as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        for comment in result.comments:
            writer.writerow(comment.__dict__)
