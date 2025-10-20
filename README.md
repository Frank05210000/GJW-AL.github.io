# GJW-聚合頁爬蟲抽獎

這個專案會抓取乾淨世界（Gan Jing World）任一聚合頁的內容，整理成 CSV 與 JSON，並在 `web/` 下提供可以搜尋、篩選與抽籤的視覺化頁面。

## 功能特色
- 手動或 GitHub Actions 自動抓取聚合頁資料，輸出 CSV 與 JSON
- 靜態網頁支援關鍵字搜尋、類型/語系/頻道篩選與分頁瀏覽
- 內建抽籤工具，可依目前篩選結果隨機挑選貼文
- 易於部署至 GitHub Pages，方便分享最新內容

## 技術規格
- Python 3.10+：以 `requests` 直接呼叫 GJW API
- 前端：純 HTML / CSS / JavaScript，讀取 `web/data/contents.json`
- 自動化：GitHub Actions 範例 workflow，可依輸入 hashtag 重新抓取資料


## 專案結構

```
.
├── fetch_hashtag_contents.py   # 抓取 API 並輸出 CSV/JSON
├── requirements.txt            # Python 相依套件
├── data/                       # 匯出用的 CSV/JSON 成果
├── web/                        # 靜態網站 (可部署在 GitHub Pages)
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── data/
│       └── contents.json       # 由腳本產生，供前端讀取
└── .github/workflows/          # (未來) GitHub Actions 設定
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

如需調整語系、類型或頁數，請參考腳本內的其他參數。

## 本機預覽網站

```bash
cd web
python -m http.server 3000
```

瀏覽 `http://localhost:3000/` 就能看到搜尋、篩選、抽籤以及跳轉原始貼文的介面。

**線上預覽**
- GitHub Pages：<https://frank05210000.github.io/GJW-AL.github.io/web/?v=timestamp>（加上 `?v=timestamp` 可確保讀到最新資料）
- 歡迎 Fork 這個專案後依需求調整 hashtag 或 UI，並部署成自己的抽籤聚合頁。

## 後續規劃

- 在 `.github/workflows/` 建立 GitHub Actions，自動抓取資料並 commit（workflow 支援多語系輸入、手動跳過抓取）。
- 啟用 GitHub Pages 指向 `web/` 目錄，即可在 GitHub.io 上分享成果。

## GitHub Actions 使用方式
1. 推送後到 GitHub **Actions** 頁籤，選擇 `Update Hashtag Data (manual)`。
2. `hashtag`：輸入要抓的聚合頁名稱（含 #）。
3. `lang`：可留空（預設 zh-TW），或輸入逗號分隔的語系，例如 `zh-TW,en-US`。
4. `skip_fetch`：只想測試流程可勾選，流程將不抓資料。
5. 送出後 workflow 會在 `data/` 與 `web/data/` 產生對應檔案，單一語系會同步覆蓋 `latest.csv` 與 `contents.json`。
