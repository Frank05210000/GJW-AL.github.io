#!/usr/bin/env python3
"""CLI helper for fetching Gan Jing World hashtag contents."""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import List

from server.crawler import hashtag as hashtag_crawler

DEFAULT_FIELDS: List[str] = [
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


def parse_args(argv: List[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hashtag", default="#善念點亮台灣", help="Hashtag 字串（需包含 #）")
    parser.add_argument("--type", default="all", help="內容類別，例如 all、Video、Shorts 等")
    parser.add_argument("--page-size", type=int, default=100, help="每次請求筆數（最大約 100）")
    parser.add_argument("--delay", type=float, default=0.3, help="請求之間的等待秒數")
    parser.add_argument("--lang", default="zh-TW", help="API 語系參數")
    parser.add_argument("--query", default=hashtag_crawler.DEFAULT_QUERY, help="API 查詢欄位")
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
        help="包含被頻道隱藏的內容",
    )
    parser.add_argument("--output", default="data/latest.csv", help="CSV 檔案路徑（預設 data/latest.csv）")
    parser.add_argument("--json-output", default="web/data/contents.json", help="JSON 檔案路徑（預設 web/data/contents.json）")
    parser.add_argument("--fields", nargs="*", default=DEFAULT_FIELDS, help="CSV 欄位順序")
    parser.add_argument("--encoding", default="utf-8-sig", help="CSV 編碼，預設 utf-8-sig 以利 Excel 顯示")
    return parser.parse_args(argv)


def main(argv: List[str] | None = None) -> int:
    args = parse_args(argv)
    result = hashtag_crawler.fetch_hashtag_contents(
        args.hashtag,
        content_type=args.type,
        page_size=args.page_size,
        delay=args.delay,
        query=args.query,
        lang=args.lang,
        hide_by_owner=args.hide_by_owner,
    )

    outputs: list[str] = []
    if args.output:
        hashtag_crawler.save_csv(result, Path(args.output), fieldnames=args.fields, encoding=args.encoding)
        outputs.append(f"CSV→{args.output}")
    if args.json_output:
        hashtag_crawler.save_json(result, Path(args.json_output))
        outputs.append(f"JSON→{args.json_output}")

    summary = ", ".join(outputs) if outputs else "未產出檔案"
    print(
        f"Fetched {len(result.rows)} items at "
        f"{result.generated_at.isoformat().replace('+00:00', 'Z')}. {summary}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
