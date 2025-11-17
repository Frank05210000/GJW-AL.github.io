# GJW 留言爬蟲工具

這是一個以 Selenium 自動化爬取乾淨世界（GanJing World）貼文留言的工具，包含：

- GUI 操作介面 (`run_gui.py`)，可以輸入貼文網址、執行爬蟲、管理歷史紀錄
- 命令列爬蟲 (`scripts/scrape_comment.py`)，會產出留言資料 (`data/comments.json`) 及展示頁 (`web/index.html`)
- 自動生成的網頁支援搜尋、日期篩選、抽獎與貼圖限制等功能

## 安裝環境

1. 推薦使用 Python 3.10 以上
2. 安裝依賴：
   ```bash
   python -m pip install --upgrade pip
   python -m pip install -r requirements.txt
   ```
   若沒有 `requirements.txt` 可直接：
   ```bash
   python -m pip install selenium webdriver-manager tkinterdnd2
   ```
   （macOS 內建 `tkinter`，Windows 需確認 Python 安裝時有附 GUI 支援。）

## 使用方式

### GUI 操作

1. 執行 `python run_gui.py`
2. 在輸入框貼上乾淨世界貼文網址（例如 `https://www.ganjingworld.com/s/xrykkmBoA7?lang=zh-TW`）
3. 按「開始爬蟲」，等待進度完成
4. 完成後會詢問是否開啟成果頁，並將紀錄寫入 `data/scrape_history.json`
5. 下方的「爬蟲歷史」區塊可以再次開啟或刪除既有紀錄

### 命令列

```bash
python scripts/scrape_comment.py https://www.ganjingworld.com/s/xrykkmBoA7?lang=zh-TW
```
若未傳參數，預設抓取內建的貼文網址。

執行後會輸出：
- `data/comments.json`：留言結構化資料
- `assets/comments/*.png`：每則留言的截圖
- `web/index.html`：可觀看的成果頁

可以直接於瀏覽器開啟 `web/index.html` 檢視結果。

## 成果頁功能

- 搜尋框：即時過濾留言內容與頻道名稱
- 日期篩選：選擇開始/結束日期，僅顯示該區間留言
- 抽獎：從目前顯示的留言中抽出指定人數，並高亮顯示卡片
- 留言貼圖會自動縮放，避免遮蔽畫面

## 注意事項

- Selenium 需要 Google Chrome / Chromium，腳本會透過 webdriver-manager 自動下載對應版本的 ChromeDriver
- 若留言大量，爬蟲會多次往下捲動，請確保網路穩定
- 若未來要打包成執行檔，可參考 PyInstaller 指令（Windows/macOS 需各自打包）

## 授權

僅供內部或個人使用，請遵守乾淨世界的使用條款。
