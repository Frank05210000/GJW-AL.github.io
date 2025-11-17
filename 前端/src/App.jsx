import { useState } from 'react';
import './App.css';
import HashtagTool from './components/HashtagTool';
import CommentsTool from './components/CommentsTool';


function App() {
  const [selectedTool, setSelectedTool] = useState(null);

  const renderContent = () => {
    if (selectedTool === 'hashtag') {
      return <HashtagTool onBack={() => setSelectedTool(null)} />;
    }
    if (selectedTool === 'comments') {
      return <CommentsTool onBack={() => setSelectedTool(null)} />;
    }
    return (
      <>
        <header className="app-header">
          <h1>GJW 爬蟲工具</h1>
          <p>請選擇您要使用的工具，以開始抓取「乾淨世界」的公開資料。</p>
        </header>
        <div className="tool-selection">
          <div className="tool-card" onClick={() => setSelectedTool('hashtag')}>
            <h2>聚合頁爬蟲</h2>
            <p>依據指定的 Hashtag (例如 #善念點亮台灣) 抓取所有相關貼文。</p>
          </div>
          <div className="tool-card" onClick={() => setSelectedTool('comments')}>
            <h2>貼文留言爬蟲</h2>
            <p>依據指定的貼文 ID，抓取該貼文底下的所有留言與回覆。</p>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="app-container">
      {renderContent()}
    </div>
  );
}

export default App;
