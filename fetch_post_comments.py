#!/usr/bin/env python3
"""CLI helper for fetching Gan Jing World post comments."""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import List

from server.crawler import comments as comments_crawler


def parse_args(argv: List[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("post_id", help="Gan Jing World 貼文 ID（URL 結尾的那串）")
    parser.add_argument("--lang", default="zh-TW", help="語系參數，預設 zh-TW")
    parser.add_argument("--limit", type=int, default=comments_crawler.DEFAULT_LIMIT, help="每次請求留言數上限")
    parser.add_argument("--delay", type=float, default=0.2, help="每次請求間隔秒數")
    parser.add_argument(
        "--hide-by-owner",
        dest="hide_by_owner",
        action="store_true",
        default=True,
        help="排除被頻道隱藏的留言（預設開啟）",
    )
    parser.add_argument(
        "--no-hide-by-owner",
        dest="hide_by_owner",
        action="store_false",
        help="包含被頻道隱藏的留言",
    )
    parser.add_argument("--csv", default="data/comments.csv", help="輸出 CSV 路徑")
    parser.add_argument("--json", default="web/data/comments.json", help="輸出 JSON 路徑")
    parser.add_argument("--encoding", default="utf-8-sig", help="CSV 編碼，預設 utf-8-sig")
    return parser.parse_args(argv)


def main(argv: List[str] | None = None) -> int:
    args = parse_args(argv)
    result = comments_crawler.fetch_comments(
        args.post_id,
        lang=args.lang,
        limit=args.limit,
        delay=args.delay,
        hide_by_owner=args.hide_by_owner,
    )

    if args.csv:
        comments_crawler.save_csv(result, Path(args.csv), encoding=args.encoding)
    if args.json:
        comments_crawler.save_json(result, Path(args.json))

    total_text = f" (reported total: {result.total_count})" if result.total_count is not None else ""
    print(
        f"Fetched {len(result.comments)} comments{total_text} at "
        f"{result.generated_at.isoformat().replace('+00:00', 'Z')}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
