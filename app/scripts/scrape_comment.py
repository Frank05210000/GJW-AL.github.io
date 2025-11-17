import argparse
import html
import json
import time
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager

OUTPUT_ROOT = Path(".").resolve()


def ensure_dirs(data_path: Path, screenshot_dir: Path, web_dir: Path):
    data_path.parent.mkdir(parents=True, exist_ok=True)
    screenshot_dir.mkdir(parents=True, exist_ok=True)
    web_dir.mkdir(parents=True, exist_ok=True)
    old_single = OUTPUT_ROOT / "assets" / "comment-block.png"
    if old_single.exists():
        old_single.unlink()
    for png in screenshot_dir.glob("*.png"):
        png.unlink()


def build_driver():
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--window-size=1440,2500")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--no-sandbox")
    driver = webdriver.Chrome(
        service=Service(ChromeDriverManager().install()),
        options=chrome_options,
    )
    driver.execute_cdp_cmd(
        "Emulation.setDeviceMetricsOverride",
        {
            "mobile": False,
            "width": 1440,
            "height": 2500,
            "deviceScaleFactor": 1,
        },
    )
    return driver


def load_all_comments(driver, wait):
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".Comments_comment_item__SbV_0")))
    last_count = 0
    for _ in range(25):
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(1.5)
        items = driver.find_elements(By.CSS_SELECTOR, ".Comments_comment_item__SbV_0")
        if len(items) == last_count:
            break
        last_count = len(items)
    # final slight pause to allow lazy assets to load
    time.sleep(1)
    return driver.find_elements(By.CSS_SELECTOR, ".Comments_comment_item__SbV_0")


def absolute_url(base_url: str, href: str) -> str:
    if not href:
        return ""
    return href if href.startswith("http") else urljoin(base_url, href)


def clean_comment_html(base_url: str, content_html: str) -> str:
    if not content_html:
        return ""
    content_html = content_html.replace('href="/', f'href="{base_url}/')
    content_html = content_html.replace("href='/", f"href='{base_url}/")
    return content_html


def extract_comment(driver, element, index: int, base_url: str, post_url: str, screenshot_dir: Path):
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", element)
    time.sleep(0.2)
    title_el = element.find_element(By.CSS_SELECTOR, ".Comments_comment_item_title__eqMfZ")
    link_el = element.find_element(By.CSS_SELECTOR, ".Comments_comment_item_title_container__Bqjbo a")
    avatar_candidates = element.find_elements(By.CSS_SELECTOR, "img.rounded-full")
    if avatar_candidates:
        avatar_el = avatar_candidates[-1]
    else:
        avatar_el = element.find_element(By.CSS_SELECTOR, "img")
    content_el = element.find_element(By.CSS_SELECTOR, ".Comments_comment_item_content__t_a2M")

    channel_name = title_el.text.strip() or "(未命名頻道)"
    channel_url = absolute_url(base_url, link_el.get_attribute("href"))
    raw_avatar = avatar_el.get_attribute("src")
    avatar_url = raw_avatar if raw_avatar.startswith("data:") else absolute_url(base_url, raw_avatar)
    comment_text = content_el.text.strip()
    comment_html = clean_comment_html(base_url, content_el.get_attribute("innerHTML"))

    screenshot_name = f"comment-{index:03d}.png"
    screenshot_path = screenshot_dir / screenshot_name
    element.screenshot(str(screenshot_path))
    captured_at = time.strftime("%Y-%m-%dT%H:%M:%S")

    return {
        "channel_name": channel_name,
        "channel_url": channel_url,
        "avatar_url": avatar_url,
        "comment_text": comment_text,
        "comment_html": comment_html,
        "screenshot": f"assets/comments/{screenshot_name}",
        "source_url": post_url,
        "captured_at": captured_at,
        "order": index,
    }


def render_html(comments: list[dict], post_url: str, html_path: Path):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    cards = []
    for item in comments:
        rich = item["comment_html"] or html.escape(item["comment_text"])
        card = f"""
        <article class=\"card\" data-channel-name=\"{html.escape(item['channel_name'])}\" data-comment-text=\"{html.escape(item['comment_text'])}\" data-captured-at=\"{item['captured_at']}\">
          <div class=\"comment-preview\">
            <img class=\"avatar\" src=\"{item['avatar_url']}\" alt=\"{html.escape(item['channel_name'])}\" />
            <div class=\"content\">
              <a class=\"channel\" href=\"{item['channel_url']}\" target=\"_blank\" rel=\"noopener noreferrer\">{html.escape(item['channel_name'])}</a>
              <div class=\"rich-text\">{rich}</div>
            </div>
          </div>
          <div class=\"screenshot\">
            <img src=\"../{item['screenshot']}\" alt=\"{html.escape(item['channel_name'])} 留言截圖\" />
          </div>
        </article>
        """
        cards.append(card)

    cards_html = "\n".join(cards)
    comment_json = json.dumps(comments, ensure_ascii=False)
    html_doc = f"""<!DOCTYPE html>
<html lang=\"zh-Hant\">
  <head>
    <meta charset=\"UTF-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
    <title>留言資料整理 — 共 {len(comments)} 筆</title>
    <link rel=\"stylesheet\" href=\"styles.css\" />
  </head>
  <body>
    <div class=\"wrapper\">
      <header>
        <p class=\"source\">來源貼文：<a href=\"{post_url}\" target=\"_blank\" rel=\"noopener noreferrer\">{post_url}</a></p>
        <h1>乾淨世界留言彙整</h1>
        <p class=\"summary\">共擷取 {len(comments)} 則留言，產出時間 {timestamp}</p>
      </header>
      <section class=\"controls\">
        <div class=\"control-group\">
          <label for=\"searchInput\">搜尋留言 / 頻道</label>
          <input id=\"searchInput\" type=\"text\" placeholder=\"輸入關鍵字...\" />
        </div>
        <div class=\"control-group\">
          <label for=\"startDate\">開始日期</label>
          <input id=\"startDate\" type=\"date\" />
        </div>
        <div class=\"control-group\">
          <label for=\"endDate\">結束日期</label>
          <input id=\"endDate\" type=\"date\" />
        </div>
        <div class=\"control-group\">
          <label for=\"raffleCount\">抽獎人數</label>
          <input id=\"raffleCount\" type=\"number\" min=\"1\" value=\"1\" />
        </div>
        <div class=\"control-buttons\">
          <button id=\"applyFilters\">套用篩選</button>
          <button id=\"clearFilters\">清除條件</button>
          <button id=\"raffleButton\">抽獎</button>
        </div>
        <p id=\"resultCount\"></p>
        <div id=\"raffleResult\"></div>
      </section>
      <main class=\"cards-grid\">
{cards_html}
      </main>
      <footer>
        <small>由 Selenium 自動化擷取，最後更新：{timestamp}</small>
      </footer>
    </div>
    <script id=\"comment-data\" type=\"application/json\">{comment_json}</script>
    <script>
      const cards = Array.from(document.querySelectorAll('.card'));
      const searchInput = document.getElementById('searchInput');
      const startInput = document.getElementById('startDate');
      const endInput = document.getElementById('endDate');
      const resultCount = document.getElementById('resultCount');
      const raffleResult = document.getElementById('raffleResult');
      const raffleCountInput = document.getElementById('raffleCount');

      function parseDate(value) {{
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
      }}

      function applyFilters() {{
        const keyword = (searchInput.value || '').trim().toLowerCase();
        const startDateValue = parseDate(startInput.value);
        const endDateValue = parseDate(endInput.value);
        let startDate = null;
        let endDate = null;
        if (startDateValue) {{
          startDate = new Date(startDateValue);
          startDate.setHours(0, 0, 0, 0);
        }}
        if (endDateValue) {{
          endDate = new Date(endDateValue);
          endDate.setHours(23, 59, 59, 999);
        }}
        let visible = 0;
        cards.forEach(card => {{
          const text = card.dataset.commentText.toLowerCase();
          const channel = card.dataset.channelName.toLowerCase();
          const capturedAt = new Date(card.dataset.capturedAt.replace(' ', 'T'));
          let isVisible = true;
          if (keyword && !(text.includes(keyword) || channel.includes(keyword))) {{
            isVisible = false;
          }}
          if (isVisible && startDate && capturedAt < startDate) {{
            isVisible = false;
          }}
          if (isVisible && endDate && capturedAt > endDate) {{
            isVisible = false;
          }}
          card.style.display = isVisible ? '' : 'none';
          if (isVisible) visible += 1;
          card.classList.remove('winner');
        }});
        resultCount.textContent = '目前顯示 ' + visible + ' 則留言';
      }}

      function clearFilters() {{
        searchInput.value = '';
        startInput.value = '';
        endInput.value = '';
        cards.forEach(card => {{
          card.style.display = '';
          card.classList.remove('winner');
        }});
        resultCount.textContent = '目前顯示 ' + cards.length + ' 則留言';
        raffleResult.textContent = '';
      }}

      function raffle() {{
        const pool = cards.filter(card => card.style.display !== 'none');
        if (!pool.length) {{
          raffleResult.textContent = '沒有符合條件的留言可抽獎。';
          return;
        }}
        let count = parseInt(raffleCountInput.value || '1', 10);
        if (isNaN(count) || count < 1) count = 1;
        count = Math.min(count, pool.length);
        cards.forEach(c => c.classList.remove('winner'));
        const poolCopy = [...pool];
        const winners = [];
        for (let i = 0; i < count; i += 1) {{
          const idx = Math.floor(Math.random() * poolCopy.length);
          winners.push(poolCopy.splice(idx, 1)[0]);
        }}
        winners.forEach(card => card.classList.add('winner'));
        raffleResult.textContent = '恭喜 ' + winners.map(w => w.dataset.channelName).join('、') + '！';
        winners[0].scrollIntoView({{ behavior: 'smooth', block: 'center' }});
      }}

      document.getElementById('applyFilters').addEventListener('click', applyFilters);
      document.getElementById('clearFilters').addEventListener('click', clearFilters);
      document.getElementById('raffleButton').addEventListener('click', raffle);
      searchInput.addEventListener('input', applyFilters);
      window.addEventListener('load', () => {{
        clearFilters();
      }});
    </script>
  </body>
</html>
"""
    html_path.write_text(html_doc, encoding="utf-8")


def scrape(post_url: str, output_root: Path | None = None):
    output_root = Path(output_root or OUTPUT_ROOT)
    data_path = output_root / "data" / "comments.json"
    screenshot_dir = output_root / "assets" / "comments"
    web_dir = output_root / "web"
    html_path = web_dir / "index.html"

    ensure_dirs(data_path, screenshot_dir, web_dir)

    base_parts = urlsplit(post_url)
    base_url = f"{base_parts.scheme}://{base_parts.netloc}"

    driver = build_driver()
    wait = WebDriverWait(driver, 25)
    try:
        driver.get(post_url)
        wait.until(lambda d: d.execute_script("return document.readyState") == "complete")
        items = load_all_comments(driver, wait)
        comments = []
        for idx, element in enumerate(items, start=1):
            try:
                comment = extract_comment(driver, element, idx, base_url, post_url, screenshot_dir)
                comments.append(comment)
            except Exception as exc:
                print(f"Skipping comment #{idx} due to error: {exc}")
        if not comments:
            raise RuntimeError("No comments were captured")
        data_path.write_text(json.dumps(comments, ensure_ascii=False, indent=2), encoding="utf-8")
        render_html(comments, post_url, html_path)
        print(f"Captured {len(comments)} comments. Data saved to {data_path}")
        return {
            "count": len(comments),
            "data_path": str(data_path.resolve()),
            "html_path": str(html_path.resolve()),
            "url": post_url,
        }
    finally:
        driver.quit()


def main():
    parser = argparse.ArgumentParser(description="Scrape GanJingWorld comments")
    parser.add_argument("url", nargs="?", default="https://www.ganjingworld.com/s/xrykkmBoA7?lang=zh-TW", help="貼文網址")
    args = parser.parse_args()
    scrape(args.url)


if __name__ == "__main__":
    main()
