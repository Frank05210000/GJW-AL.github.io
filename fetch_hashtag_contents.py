"""Download Gan Jing World hashtag contents and export to CSV/JSON for presentation."""
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import requests

API_URL = "https://gw.ganjingworld.com/v1.0c/hashtag/get-contents"
CONTENT_BASE = "https://www.ganjingworld.com"
TYPE_PATHS = {
    "Video": "video",
    "Shorts": "shorts",
    "News": "news",
    "Post": "post",  # social posts
    "Article": "article",
    "Live": "live",
    "Audio": "audio",
}
DEFAULT_FIELDS = [
    "id",
    "type",
    "title",
    "owner_name",
    "channel_name",
    "channel_url",
    "created_at_iso",
    "like_count",
    "share_count",
    "lang",
    "hashtags",
    "post_url",
    "poster_url",
]


def build_post_url(item: Dict) -> str:
    """Return a human-facing URL for the content item."""
    content_type = item.get("type", "")
    slug_type = TYPE_PATHS.get(content_type)
    content_id = item.get("id", "")
    if slug_type and content_id:
        return f"{CONTENT_BASE}/zh-TW/{slug_type}/{content_id}"
    slug = item.get("slug")
    if slug:
        return f"{CONTENT_BASE}/zh-TW/s/{slug}"
    return f"{CONTENT_BASE}/zh-TW/s/{content_id}" if content_id else ""


def build_channel_info(item: Dict) -> Tuple[str, str]:
    """Return (channel_name, channel_url)."""
    channel = item.get("channel") or {}
    owner = item.get("owner") or {}
    channel_name = channel.get("name") or owner.get("name") or ""
    channel_id = channel.get("id") or owner.get("id") or ""
    channel_url = f"{CONTENT_BASE}/channel/{channel_id}" if channel_id else ""
    return channel_name, channel_url


def to_iso(timestamp_ms: Optional[int]) -> str:
    if not timestamp_ms:
        return ""
    try:
        dt = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)
        return dt.isoformat().replace("+00:00", "Z")
    except Exception:
        return ""


def serialize_hashtags(tags: Optional[Iterable[str]]) -> str:
    return ";".join(tags) if tags else ""


def fetch_all_contents(
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
        "hide_by_owner": str(hide_by_owner).lower(),
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


def normalise_item(item: Dict) -> Dict[str, object]:
    channel_name, channel_url = build_channel_info(item)
    row: Dict[str, object] = {
        "id": item.get("id", ""),
        "type": item.get("type", ""),
        "title": (item.get("title") or "").replace("\r", "").strip(),
        "owner_name": (item.get("owner") or {}).get("name", ""),
        "channel_name": channel_name,
        "channel_url": channel_url,
        "created_at_iso": to_iso(item.get("created_at")),
        "like_count": item.get("like_count", 0),
        "share_count": item.get("share_count", 0),
        "lang": item.get("lang", ""),
        "hashtags": serialize_hashtags(item.get("hashtags")),
        "post_url": build_post_url(item),
        "poster_url": item.get("poster_url") or item.get("image_auto_url", ""),
    }
    return row


def write_csv(rows: List[Dict[str, object]], output_path: Path, fieldnames: List[str], encoding: str) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding=encoding) as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def write_json(rows: List[Dict[str, object]], output_path: Path, generated_at: datetime) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at_iso": generated_at.isoformat().replace("+00:00", "Z"),
        "generated_at_epoch": int(generated_at.timestamp()),
        "item_count": len(rows),
        "items": rows,
    }
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hashtag", default="#善念點亮台灣", help="Hashtag 字串（需包含 #）")
    parser.add_argument("--type", default="all", help="內容類別，例如 all、Video、Shorts 等")
    parser.add_argument("--page-size", type=int, default=100, help="每次請求筆數（最大約 100）")
    parser.add_argument("--delay", type=float, default=0.3, help="請求之間的等待秒數")
    parser.add_argument("--lang", default="zh-TW", help="API 語系參數")
    parser.add_argument(
        "--query",
        default="basic,post,like,is_liked,share,owner,popular_comments",
        help="API 查詢欄位",
    )
    parser.add_argument(
        "--hide-by-owner",
        dest="hide_by_owner",
        action="store_true",
        default=False,
        help="排除被頻道隱藏的內容（預設關閉）",
    )
    parser.add_argument(
        "--no-hide-by-owner",
        dest="hide_by_owner",
        action="store_false",
        help="包含被頻道隱藏的內容（與 --hide-by-owner 相同，預設即為顯示全部）",
    )
    parser.add_argument("--output", default="data/latest.csv", help="CSV 檔案路徑（預設 data/latest.csv，可留空略過）")
    parser.add_argument("--json-output", default="web/data/contents.json", help="JSON 檔案路徑（預設 web/data/contents.json，可留空略過）")
    parser.add_argument("--fields", nargs="*", default=DEFAULT_FIELDS, help="CSV 欄位順序")
    parser.add_argument("--encoding", default="utf-8-sig", help="CSV 編碼，預設為 utf-8-sig 以利 Excel 顯示")
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    rows_raw = fetch_all_contents(
        args.hashtag,
        content_type=args.type,
        page_size=args.page_size,
        delay=args.delay,
        query=args.query,
        lang=args.lang,
        hide_by_owner=args.hide_by_owner,
    )
    rows = [normalise_item(item) for item in rows_raw]
    generated_at = datetime.now(timezone.utc)

    outputs: List[str] = []
    if args.output:
        write_csv(rows, Path(args.output), args.fields, args.encoding)
        outputs.append(f"CSV→{args.output} ({args.encoding})")
    if args.json_output:
        write_json(rows, Path(args.json_output), generated_at)
        outputs.append(f"JSON→{args.json_output}")

    summary = ", ".join(outputs) if outputs else "未產出檔案"
    print(f"Fetched {len(rows)} items at {generated_at.isoformat().replace('+00:00', 'Z')}. {summary}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
