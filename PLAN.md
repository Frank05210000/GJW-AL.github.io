### Plan / Progress

1. **Refactor Crawlers** ✅
   - 共用邏輯已抽出到 `server/crawler/hashtag.py` 與 `server/crawler/comments.py`，CLI 仍可直接呼叫。

2. **Create FastAPI Backend** ✅
   - `server/app.py` 已掛 FastAPI，提供貼文/留言 API 以及重新抓取 endpoint，並服務前端靜態檔。

3. **Update Front-end to Call API** ✅
   - `web/app.js` 現在從 `/api/...` 取得資料，新增模式切換、重新抓取按鈕與留言展示。

4. **Docker & Deployment Prep** ✅
   - 新增 `Dockerfile`、README 補上 Cloud Run 部署指引，可 `uvicorn` 或 `docker run` 直接啟動。

5. **Next**
   - 規劃 target/history API 以及 Scheduler hook，方便自動化抓取多個 hashtag/post。
