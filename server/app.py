from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from server.crawler import hashtag as hashtag_crawler
from server.crawler import comments as comments_crawler

DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
WEB_DIR = Path(os.environ.get("WEB_DIR", "web"))
WEB_DATA_DIR = Path(os.environ.get("WEB_DATA_DIR", WEB_DIR / "data"))
DEFAULT_HASHTAG_PATH = WEB_DATA_DIR / "contents.json"
DEFAULT_COMMENTS_PATH = WEB_DATA_DIR / "comments.json"
DEFAULT_COMMENT_POST_ID = os.environ.get("DEFAULT_COMMENT_POST_ID")

app = FastAPI(title="GJW Aggregator API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ALLOW_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


class HashtagFetchPayload(BaseModel):
    hashtag: str = Field(..., description="例如 #善念點亮台灣")
    content_type: str = "all"
    lang: str = "zh-TW"
    page_size: int = 100
    delay: float = 0.3
    query: str = hashtag_crawler.DEFAULT_QUERY
    hide_by_owner: bool = False
    save_snapshot: bool = True


class CommentFetchPayload(BaseModel):
    post_id: Optional[str] = None
    lang: str = "zh-TW"
    limit: int = comments_crawler.DEFAULT_LIMIT
    delay: float = 0.2
    hide_by_owner: bool = True
    save_snapshot: bool = True


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/hashtag/data")
def get_hashtag_data(lang: str = "zh-TW"):
    path = WEB_DATA_DIR / f"contents_{lang}.json"
    if not path.exists():
        path = DEFAULT_HASHTAG_PATH
    if not path.exists():
        raise HTTPException(status_code=404, detail="尚未產生資料")
    return FileResponse(path)


@app.post("/api/hashtag/fetch")
def fetch_hashtag(payload: HashtagFetchPayload):
    result = hashtag_crawler.fetch_hashtag_contents(
        payload.hashtag,
        content_type=payload.content_type,
        page_size=payload.page_size,
        delay=payload.delay,
        query=payload.query,
        lang=payload.lang,
        hide_by_owner=payload.hide_by_owner,
    )

    if payload.save_snapshot:
        target = WEB_DATA_DIR / f"contents_{payload.lang}.json"
        hashtag_crawler.save_json(result, target)
        if payload.lang == "zh-TW":
            hashtag_crawler.save_json(result, DEFAULT_HASHTAG_PATH)

    return JSONResponse(
        {
            "generated_at_iso": result.generated_at.isoformat().replace("+00:00", "Z"),
            "item_count": len(result.rows),
        }
    )


@app.get("/api/comments/data")
def get_default_comments():
    path = DEFAULT_COMMENTS_PATH
    if DEFAULT_COMMENT_POST_ID:
        candidate = WEB_DATA_DIR / f"comments_{DEFAULT_COMMENT_POST_ID}.json"
        if candidate.exists():
            path = candidate
    if not path.exists():
        raise HTTPException(status_code=404, detail="尚未產生留言資料")
    return FileResponse(path)


@app.get("/api/posts/{post_id}/comments")
def get_comments(post_id: str):
    path = WEB_DATA_DIR / f"comments_{post_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="尚未找到指定貼文的留言資料")
    return FileResponse(path)


@app.post("/api/posts/{post_id}/comments/fetch")
def fetch_comments(post_id: str, payload: CommentFetchPayload):
    target_post_id = payload.post_id or post_id
    result = comments_crawler.fetch_comments(
        target_post_id,
        lang=payload.lang,
        limit=payload.limit,
        delay=payload.delay,
        hide_by_owner=payload.hide_by_owner,
    )

    if payload.save_snapshot:
        target = WEB_DATA_DIR / f"comments_{target_post_id}.json"
        comments_crawler.save_json(result, target)
        comments_crawler.save_json(result, DEFAULT_COMMENTS_PATH)

    return JSONResponse(
        {
            "generated_at_iso": result.generated_at.isoformat().replace("+00:00", "Z"),
            "comment_count": len(result.comments),
            "total_count": result.total_count,
        }
    )


# Mount static front-end
if WEB_DIR.exists():
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="static")
