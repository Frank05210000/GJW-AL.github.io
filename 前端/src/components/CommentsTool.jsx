import React, { useState } from 'react';
import './CommentsTool.css';
import { withBase } from '../utils/apiBase';

const CommentsTool = ({ onBack }) => {
  const [postUrl, setPostUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!postUrl.trim()) {
      setError('貼文網址不能為空');
      return;
    }

    let extractedPostId;
    try {
      // Basic check if it's a valid URL structure, then extract the last part.
      const url = new URL(postUrl.trim());
      const pathParts = url.pathname.split('/').filter(part => part);
      extractedPostId = pathParts[pathParts.length - 1];
      
      if (!extractedPostId) {
        throw new Error(); // Will be caught and show the generic error
      }
    } catch (e) {
      setError('請輸入有效的貼文網址，無法從中解析出貼文 ID');
      return;
    }

    setError(null);
    setResult(null);
    setIsLoading(true);
    try {
      const endpoint = `/api/posts/${encodeURIComponent(extractedPostId)}/comments/fetch`;
      const response = await fetch(withBase(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: extractedPostId }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `API 回傳錯誤 (${response.status})`);
      }

      const data = await response.json();
      setResult({
        generatedAt: data.generated_at_iso,
        count: data.total_count,
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
        <h2>貼文留言爬蟲工具</h2>
        <p>輸入一個貼文網址，點擊「開始抓取」來獲取所有留言。</p>
      </header>
      <form className="form-container" onSubmit={handleSubmit}>
        <div className="input-group">
          <label htmlFor="post-url-input">貼文網址</label>
          <input
            id="post-url-input"
            type="text"
            value={postUrl}
            onChange={(e) => setPostUrl(e.target.value)}
            placeholder="例如：https://ganjingworld.com/post/1i21p7qk"
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

export default CommentsTool;
