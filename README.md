# GJW-聚合頁爬蟲抽獎

這個專案會抓取乾淨世界（Gan Jing World）的聚合頁與留言資料，提供 FastAPI API + 前端儀表板（搜尋、抽籤、留言切換）。前後端會打包在同一個容器，方便部署到 GCP（例如 Cloud Run）。

## 功能特色
- FastAPI 後端：提供貼文與留言 API，並允許使用者在前端「重新抓取」最新資料。
- 前端儀表板：貼文 / 留言模式切換、時間篩選、抽籤、留言貼圖預覽，全都顯示資料生成時間。
- CLI 備援：`fetch_hashtag_contents.py`、`fetch_post_comments.py` 仍可離線輸出 CSV/JSON。
- 打包部署：單一 Docker 映像即可同時提供 API 與靜態資源，適合部署在 GCP。

## 技術規格
- Python 3.10+：`requests` 撈取資料，FastAPI + Uvicorn 提供 API。
- 前端：純 HTML / CSS / JavaScript，直接向 `/api/...` 取得資料。
- 部署：Docker + Cloud Run（或任何容器環境）；本機可 `uvicorn server.app:app --reload` 測試。


## 專案結構

```
.
├── fetch_hashtag_contents.py   # CLI：抓取 hashtag
├── fetch_post_comments.py      # CLI：抓取留言
├── server/
│   ├── app.py                  # FastAPI 入口
│   └── crawler/                # 共享爬蟲模組
├── web/                        # 前端靜態檔
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── data/                       # 匯出的 CSV/JSON（本機）
├── Dockerfile
└── requirements.txt
```

## 安裝環境

```bash
python -m venv .venv
source .venv/bin/activate  # Windows 使用 .venv\Scripts\activate
pip install -r requirements.txt
```

## 抓取資料

```bash
python fetch_hashtag_contents.py \
  --hashtag "#你想抓的聚合頁" \
  --output data/latest.csv \
  --json-output web/data/contents.json
```

如需調整語系、類型或頁數，請參考腳本內的其他參數。預設輸出會寫入 `data/latest.csv` 與 `web/data/contents.json`，也可以改用 `--output` / `--json-output` 指定其他路徑。若要排除被頻道隱藏的貼文，可額外加上 `--hide-by-owner`。

## 啟動 API + 前端

```bash
uvicorn server.app:app --reload --port 8000
```

瀏覽 `http://localhost:8000/` 就能看到最新資料；所有請求都會經過 `/api/...`。若要用 Docker：

```bash
docker build -t gjw-aggregator .
docker run -p 8080:8080 gjw-aggregator
```

部署 Cloud Run 範例：

```bash
gcloud builds submit --tag gcr.io/<project-id>/gjw-aggregator
gcloud run deploy gjw-aggregator \
  --image gcr.io/<project-id>/gjw-aggregator \
  --platform managed --region asia-east1 \
  --allow-unauthenticated
```

## 後續規劃

- 以 Cloud Scheduler 或 workflow 觸發 `/api/hashtag/fetch` / `/api/posts/.../comments/fetch`，自動留存快照。
- 提供追蹤清單、抓取歷史、Webhook/Scheduler hook，方便一次管理多個 hashtag 或貼文。

## GitHub Actions 使用方式
1. 推送後到 GitHub **Actions** 頁籤，選擇 `Update Hashtag Data (manual)`。
2. `hashtag`：輸入要抓的聚合頁名稱（含 #）。
3. `lang`：可留空（預設 zh-TW），或輸入逗號分隔的語系，例如 `zh-TW,en-US`。
4. `skip_fetch`：只想測試流程可勾選，流程將不抓資料。
5. 送出後 workflow 會在 `data/` 與 `web/data/` 產生對應檔案，單一語系會同步覆蓋 `latest.csv` 與 `contents.json`。

### JSON 結構
`web/data/contents.json` 帶有額外的時間戳記：
```json
{
  "generated_at_iso": "2025-10-20T07:20:13Z",
  "generated_at_epoch": 1697786413,
  "item_count": 5829,
  "items": [ ... ]
}
```
前端會以 `generated_at_*` 作為“數據最後更新”時間。

## 留言資料
- 使用 `fetch_post_comments.py <post_id>` 抓取指定貼文的所有留言（預設排除被頻道隱藏的留言，可加 `--no-hide-by-owner` 顯示全部）。
- 程式會輸出 `data/comments.csv` 與 `web/data/comments.json`；前端頁面可透過頁面上方的「貼文 / 留言」按鈕切換檢視。
