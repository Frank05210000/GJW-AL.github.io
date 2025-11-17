import React, { useState } from 'react';
import './HashtagTool.css';
import { withBase } from '../utils/apiBase';

const HashtagTool = ({ onBack }) => {
  const [hashtag, setHashtag] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!hashtag.trim()) {
      setError('Hashtag 不能為空');
      return;
    }
    if (!hashtag.startsWith('#')) {
      setError('Hashtag 必須以 # 開頭');
      return;
    }

    setError(null);
    setResult(null);
    setIsLoading(true);
    try {
      const response = await fetch(withBase('/api/hashtag/fetch'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hashtag: hashtag.trim(),
          lang: 'zh-TW',
          content_type: 'all',
          save_snapshot: true,
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `API 回傳錯誤 (${response.status})`);
      }

      const data = await response.json();
      setResult({
        generatedAt: data.generated_at_iso,
        count: data.item_count,
      });
    } catch (apiError) {
      setError(apiError.message || '抓取失敗，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="tool-content">
      <header className="tool-header">
        <h2>聚合頁爬蟲工具</h2>
        <p>輸入一個 Hashtag，點擊「開始抓取」來獲取相關貼文。</p>
      </header>
      <form className="form-container" onSubmit={handleSubmit}>
        <div className="input-group">
          <label htmlFor="hashtag-input">Hashtag</label>
          <input
            id="hashtag-input"
            type="text"
            value={hashtag}
            onChange={(e) => setHashtag(e.target.value)}
            placeholder="例如：#善念點亮台灣"
            disabled={isLoading}
          />
        </div>
        {error && <p className="error-message">{error}</p>}
        {result && (
          <p className="success-message">
            抓取完成：{result.count?.toLocaleString?.() || result.count || '—'} 筆，時間 {result.generatedAt || ''}
          </p>
        )}
        <button type="submit" className="submit-button" disabled={isLoading}>
          {isLoading ? '抓取中...' : '開始抓取'}
        </button>
      </form>
      <button onClick={onBack} className="back-button" disabled={isLoading}>
        返回選擇
      </button>
    </div>
  );
};

export default HashtagTool;
