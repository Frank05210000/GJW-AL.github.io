"""Reusable helpers for fetching Gan Jing World hashtag contents."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import csv
import json
import time

import requests

API_URL = "https://gw.ganjingworld.com/v1.0c/hashtag/get-contents"
CONTENT_BASE = "https://www.ganjingworld.com"
TYPE_PATHS = {
    "Video": "video",
    "Shorts": "shorts",
    "News": "news",
    "Post": "post",
    "Article": "article",
    "Live": "live",
    "Audio": "audio",
}
DEFAULT_QUERY = "basic,post,like,is_liked,share,owner,popular_comments"


@dataclass
class HashtagResult:
    hashtag: str
    lang: str
    content_type: str
    generated_at: datetime
    rows: List[Dict[str, object]]


def _to_iso(timestamp_ms: Optional[int]) -> str:
    if not timestamp_ms:
        return ""
    try:
        dt = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)
        return dt.isoformat().replace("+00:00", "Z")
    except Exception:
        return ""


def _serialize_hashtags(tags: Optional[Iterable[str]]) -> str:
    return ";".join(tags) if tags else ""


def _build_post_url(item: Dict) -> str:
    content_type = item.get("type", "")
    slug_type = TYPE_PATHS.get(content_type)
    content_id = item.get("id", "")
    if slug_type and content_id:
        return f"{CONTENT_BASE}/zh-TW/{slug_type}/{content_id}"
    slug = item.get("slug")
    if slug:
        return f"{CONTENT_BASE}/zh-TW/s/{slug}"
    return f"{CONTENT_BASE}/zh-TW/s/{content_id}" if content_id else ""


def _build_channel_info(item: Dict) -> Tuple[str, str]:
    channel = item.get("channel") or {}
    owner = item.get("owner") or {}
    channel_name = channel.get("name") or owner.get("name") or ""
    channel_id = channel.get("id") or owner.get("id") or ""
    channel_url = f"{CONTENT_BASE}/channel/{channel_id}" if channel_id else ""
    return channel_name, channel_url


def _fetch_all(
    hashtag: str,
    *,
    content_type: str,
    page_size: int,
    delay: float,
    query: str,
    lang: str,
    hide_by_owner: bool,
) -> List[Dict]:
    items: List[Dict] = []
    seen_ids: set[str] = set()
    start_key = ""
    session = requests.Session()
    params = {
        "hashtag": hashtag,
        "type": content_type,
        "page_size": page_size,
        "query": query,
        "hide_by_owner": str(bool(hide_by_owner)).lower(),
        "lang": lang,
        "start_key": start_key,
    }

    while True:
        params["start_key"] = start_key
        response = session.get(API_URL, params=params, timeout=15)
        response.raise_for_status()
        payload = response.json()
        data = payload.get("data") or {}
        batch = data.get("list") or []
        new_count = 0
        for item in batch:
            content_id = item.get("id")
            if content_id and content_id not in seen_ids:
                seen_ids.add(content_id)
                items.append(item)
                new_count += 1
        start_key = data.get("start_key") or ""
        if not start_key or new_count == 0:
            break
        if delay:
            time.sleep(delay)
    return items


def _normalise_item(item: Dict) -> Dict[str, object]:
    channel_name, channel_url = _build_channel_info(item)
    return {
        "id": item.get("id", ""),
        "type": item.get("type", ""),
        "title": (item.get("title") or "").replace("\r", "").strip(),
        "owner_name": (item.get("owner") or {}).get("name", ""),
        "channel_name": channel_name,
        "channel_url": channel_url,
        "created_at_iso": _to_iso(item.get("created_at")),
        "like_count": item.get("like_count", 0),
        "share_count": item.get("share_count", 0),
        "lang": item.get("lang", ""),
        "hashtags": _serialize_hashtags(item.get("hashtags")),
        "post_url": _build_post_url(item),
        "poster_url": item.get("poster_url") or item.get("image_auto_url", ""),
    }


def fetch_hashtag_contents(
    hashtag: str,
    *,
    content_type: str = "all",
    page_size: int = 100,
    delay: float = 0.3,
    query: str = DEFAULT_QUERY,
    lang: str = "zh-TW",
    hide_by_owner: bool = False,
) -> HashtagResult:
    raw_items = _fetch_all(
        hashtag,
        content_type=content_type,
        page_size=page_size,
        delay=delay,
        query=query,
        lang=lang,
        hide_by_owner=hide_by_owner,
    )
    rows = [_normalise_item(item) for item in raw_items]
    return HashtagResult(
        hashtag=hashtag,
        lang=lang,
        content_type=content_type,
        generated_at=datetime.now(timezone.utc),
        rows=rows,
    )


def save_json(result: HashtagResult, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at_iso": result.generated_at.isoformat().replace("+00:00", "Z"),
        "generated_at_epoch": int(result.generated_at.timestamp()),
        "hashtag": result.hashtag,
        "lang": result.lang,
        "content_type": result.content_type,
        "item_count": len(result.rows),
        "items": result.rows,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def save_csv(result: HashtagResult, path: Path, *, fieldnames: List[str], encoding: str = "utf-8-sig") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding=encoding) as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in result.rows:
            writer.writerow(row)
