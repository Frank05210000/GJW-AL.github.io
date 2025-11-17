import json
import threading
import time
import tkinter as tk
from tkinter import messagebox
import webbrowser
from pathlib import Path

from scripts.scrape_comment import scrape

DATA_DIR = Path("data")
HISTORY_PATH = DATA_DIR / "scrape_history.json"


class ScraperGUI(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("留言爬蟲工具")
        self.geometry("560x420")
        self.resizable(False, False)

        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.history = self.load_history()
        self.history_index_map = []

        tk.Label(self, text="貼文網址：").pack(anchor="w", padx=20, pady=(20, 4))
        self.url_var = tk.StringVar(value="https://www.ganjingworld.com/s/xrykkmBoA7?lang=zh-TW")
        self.url_entry = tk.Entry(self, textvariable=self.url_var, width=70)
        self.url_entry.pack(padx=20)

        self.status_var = tk.StringVar(value="輸入網址後按下開始")
        tk.Label(self, textvariable=self.status_var, fg="#555").pack(anchor="w", padx=20, pady=10)

        self.start_button = tk.Button(self, text="開始爬蟲", command=self.start_scrape)
        self.start_button.pack(pady=10)

        self.history_frame = tk.LabelFrame(self, text="爬蟲歷史")
        self.history_frame.pack(fill="both", expand=True, padx=20, pady=10)

        self.history_list = tk.Listbox(self.history_frame, height=8)
        self.history_list.pack(fill="both", expand=True, padx=10, pady=10)

        btn_frame = tk.Frame(self.history_frame)
        btn_frame.pack(pady=(0, 10))
        tk.Button(btn_frame, text="開啟成果頁", command=self.open_history_entry).pack(side="left", padx=5)
        tk.Button(btn_frame, text="刪除紀錄", command=self.delete_history_entry).pack(side="left", padx=5)

        self.refresh_history_list()

    def load_history(self):
        if HISTORY_PATH.exists():
            try:
                return json.loads(HISTORY_PATH.read_text(encoding="utf-8"))
            except Exception:
                return []
        return []

    def save_history(self):
        HISTORY_PATH.write_text(json.dumps(self.history, ensure_ascii=False, indent=2), encoding="utf-8")

    def refresh_history_list(self):
        self.history_list.delete(0, tk.END)
        self.history_index_map = []
        for idx, entry in enumerate(reversed(self.history)):
            label = f"{entry['timestamp']} | {entry['count']}筆 | {entry['url']}"
            self.history_list.insert(tk.END, label)
            self.history_index_map.append(len(self.history) - 1 - idx)

    def get_selected_history_index(self):
        selection = self.history_list.curselection()
        if not selection:
            return None
        mapped_idx = self.history_index_map[selection[0]]
        return mapped_idx

    def open_history_entry(self):
        idx = self.get_selected_history_index()
        if idx is None:
            messagebox.showinfo("提示", "請先選擇一筆紀錄")
            return
        path = self.history[idx].get("html_path")
        if path and Path(path).exists():
            webbrowser.open(Path(path).as_uri())
        else:
            messagebox.showerror("錯誤", "檔案不存在或已移除")

    def delete_history_entry(self):
        idx = self.get_selected_history_index()
        if idx is None:
            messagebox.showinfo("提示", "請先選擇要刪除的紀錄")
            return
        if not messagebox.askyesno("確認", "確定刪除此筆紀錄嗎？"):
            return
        self.history.pop(idx)
        self.save_history()
        self.refresh_history_list()

    def start_scrape(self):
        url = self.url_var.get().strip()
        if not url:
            messagebox.showerror("錯誤", "請輸入網址")
            return
        self.start_button.config(state="disabled")
        self.status_var.set("處理中，請稍候...")
        threading.Thread(target=self.run_scrape, args=(url,), daemon=True).start()

    def run_scrape(self, url):
        try:
            result = scrape(url)
        except Exception as exc:
            self.after(0, self.on_failure, exc)
            return
        self.after(0, self.on_success, result)

    def on_success(self, result):
        self.start_button.config(state="normal")
        self.status_var.set(f"完成，共擷取 {result['count']} 則留言")
        entry = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "url": result.get("url", self.url_var.get()),
            "count": result["count"],
            "html_path": result["html_path"],
        }
        self.history.append(entry)
        self.save_history()
        self.refresh_history_list()

        if messagebox.askyesno("完成", "抓取完成，是否要開啟成果頁？"):
            html_path = Path(result["html_path"])
            if html_path.exists():
                webbrowser.open(html_path.as_uri())
            else:
                messagebox.showerror("錯誤", "找不到成果頁面檔案")

    def on_failure(self, exc):
        self.start_button.config(state="normal")
        self.status_var.set("發生錯誤，請再試一次")
        messagebox.showerror("錯誤", f"無法完成爬蟲：{exc}")


def main():
    app = ScraperGUI()
    app.mainloop()


if __name__ == "__main__":
    main()
