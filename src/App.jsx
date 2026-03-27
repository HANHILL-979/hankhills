import React, { useState, useEffect } from 'react';
import { BookOpen, List as ListIcon, MessageCircle, Play, Volume2, ArrowLeft, Clock, BarChart } from 'lucide-react';

// ================= 配置区域 =================
// 改成这样，它会自动去 Vercel 的保险箱里找 Key
const LLM_API_KEY = import.meta.env.VITE_LLM_API_KEY;// 你的 DeepSeek API Key
const LLM_API_URL = "/api/llm/chat/completions";
const RSS_FEED_URL = "http://feeds.bbci.co.uk/news/world/rss.xml";
const RSS_API_URL = `https://api.rss2json.com/v1/api.json?rss_url=${RSS_FEED_URL}`;
// ============================================

export default function App() {
  const [view, setView] = useState('list');
  const [activeTab, setActiveTab] = useState('article');
  const [playingWord, setPlayingWord] = useState(null);
  
  const [newsList, setNewsList] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  
  // 两个独立的加载状态
  const [isStreaming, setIsStreaming] = useState(false); // 文章流式输出状态
  const [isVocabLoading, setIsVocabLoading] = useState(false); // 词汇/讨论后台分析状态
  
  const [streamingText, setStreamingText] = useState("");

  useEffect(() => {
    fetchRSSNews();
  }, []);

  const fetchRSSNews = async () => {
    setListLoading(true);
    try {
      const response = await fetch(RSS_API_URL);
      const data = await response.json();
      
      if (data.status === 'ok') {
        const formattedNews = data.items.map((item, index) => {
          const plainTextSummary = item.content.replace(/<[^>]+>/g, '').trim() || item.description.replace(/<[^>]+>/g, '').trim();
          return {
            id: index,
            title: item.title,
            image: item.thumbnail || `https://picsum.photos/seed/${index + 100}/800/400`,
            date: item.pubDate.split(' ')[0],
            summary: plainTextSummary,
            category: "World News",
            isExpanded: false,
            content: [], 
            vocabulary: null, // 初始为 null，代表未提取
            questions: null
          };
        });
        setNewsList(formattedNews);
      }
    } catch (error) {
      console.error("RSS 获取失败:", error);
    } finally {
      setListLoading(false);
    }
  };

  // 第二线程：专门用来分析生成好的文章，提取词汇和问题
  const generateVocabAndQuestions = async (articleId, fullText) => {
    setIsVocabLoading(true);
    try {
      const systemPrompt = `You are an expert English teacher. Analyze the following CET-6 level article.
      Extract 3 to 5 advanced vocabulary words, and generate 2 discussion questions.
      
      Article Text:
      ${fullText}

      Respond STRICTLY with a valid JSON object:
      {
        "vocabulary": [
          { "word": "word1", "ipa": "/phonetics/", "pos": "adj.", "cn": "中文含义", "en_ex": "Sentence from the article or a good example.", "cn_ex": "中文翻译." }
        ],
        "questions": [
          "Discussion question 1 related to the article?",
          "Discussion question 2 related to the article?"
        ]
      }`;

      const response = await fetch(LLM_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LLM_API_KEY}`
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "system", content: systemPrompt }],
          temperature: 0.3, // 提取任务不需要太高创造性，降低温度以保证 JSON 稳定
          response_format: { type: "json_object" }
        })
      });

      const result = await response.json();
      let generatedData = result.choices[0].message.content;
      generatedData = generatedData.replace(/```json\n?|\n?```/g, '').trim();
      const parsedData = JSON.parse(generatedData);

      // 更新列表和当前选中的文章
      setNewsList(prevList => prevList.map(item => {
        if (item.id === articleId) {
          const updatedItem = { ...item, vocabulary: parsedData.vocabulary, questions: parsedData.questions };
          // 如果用户还在看这篇新闻，同步更新详情页状态
          if (selectedArticle && selectedArticle.id === articleId) {
            setSelectedArticle(updatedItem);
          }
          return updatedItem;
        }
        return item;
      }));

    } catch (error) {
      console.error("词汇提取失败:", error);
    } finally {
      setIsVocabLoading(false);
    }
  };

  // 第一线程：处理文章点击和流式生成
  const handleArticleClick = async (article) => {
    setSelectedArticle(article);
    setView('detail');
    setActiveTab('article');

    if (article.isExpanded) return;

    if (!LLM_API_KEY || LLM_API_KEY.includes("在此处填入")) {
      alert("请先配置 LLM_API_KEY");
      return;
    }

    setIsStreaming(true);
    setStreamingText(""); 
    
    const tempArticle = { ...article, isExpanded: true };
    setSelectedArticle(tempArticle);

    let accumulatedText = "";

    try {const systemPrompt = `You are an expert English teacher. Expand the following news summary into a comprehensive news article. 
      
      CRITICAL VOCABULARY RULE: 
      - Strictly restrict your vocabulary to the Chinese University CET-6 syllabus. 
      - DO NOT use overly obscure, archaic, or GRE/SAT level words. 
      - The language should be natural, professional, and accessible to a college student passing CET-6.
      - Utilize complex grammar appropriately (e.g., noun clauses, inverted sentences, non-finite verbs).
      
      OUTPUT ONLY THE ARTICLE TEXT. Do not use markdown tags. Separate paragraphs with double newlines.
      
      Original Title: ${article.title}
      Summary: ${article.summary}`;

      const response = await fetch(LLM_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LLM_API_KEY}`
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "system", content: systemPrompt }],
          temperature: 0.7,
          stream: true 
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(line => line.trim() !== "");

        for (const line of lines) {
          if (line.includes("[DONE]")) continue;
          if (line.startsWith("data:")) {
            try {
              const data = JSON.parse(line.replace("data:", ""));
              const delta = data.choices[0].delta.content;
              if (delta) {
                accumulatedText += delta;
                setStreamingText(accumulatedText); 
              }
            } catch (e) {
              // Ignore
            }
          }
        }
      }

      const finalContentArray = accumulatedText.split('\n\n').filter(p => p.trim() !== "");
      const finalArticle = { ...article, content: finalContentArray, isExpanded: true };
      
      setSelectedArticle(finalArticle);
      setNewsList(prevList => prevList.map(item => item.id === article.id ? finalArticle : item));

      // 核心改动：文章一写完，立刻在后台静默触发第二次请求提取词汇
      generateVocabAndQuestions(article.id, accumulatedText);

    } catch (error) {
      console.error("AI 流式生成失败:", error);
    } finally {
      setIsStreaming(false);
      setStreamingText(""); 
    }
  };

  const speakText = (text, id = null) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      
      if (id) {
        setPlayingWord(id);
        utterance.onend = () => setPlayingWord(null);
        utterance.onerror = () => setPlayingWord(null);
      }
      window.speechSynthesis.speak(utterance);
    }
  };

  const ListView = () => (
    <div className="max-w-4xl mx-auto p-4">
      <header className="flex justify-between items-center mb-8 pt-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Global News Reader</h1>
          <p className="text-gray-500">Fast Streaming & Smart Extraction</p>
        </div>
        <button 
          onClick={fetchRSSNews}
          disabled={listLoading}
          className="bg-gray-800 hover:bg-gray-900 text-white px-6 py-2 rounded-lg font-bold transition-all disabled:bg-gray-400"
        >
          {listLoading ? "Syncing..." : "Refresh Feed"}
        </button>
      </header>
      
      {listLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800"></div>
        </div>
      ) : (
        <div className="grid gap-6">
          {newsList.map((article) => (
            <div 
              key={article.id}
              onClick={() => handleArticleClick(article)}
              className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer overflow-hidden flex flex-col sm:flex-row border border-gray-100"
            >
              <img src={article.image} alt="Thumbnail" className="w-full sm:w-48 h-48 sm:h-auto object-cover" />
              <div className="p-5 flex flex-col justify-between flex-1">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded">{article.category}</span>
                    <span className="text-sm text-gray-500 flex items-center gap-1"><Clock size={14} /> {article.date}</span>
                    {article.isExpanded && <span className="text-xs text-green-600 font-semibold flex items-center gap-1">✨ AI Expanded</span>}
                  </div>
                  <h2 className="text-xl font-bold text-gray-800 mb-2 line-clamp-2">{article.title}</h2>
                  <p className="text-gray-600 line-clamp-2 text-sm">{article.summary}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const DetailView = () => (
    <div className="max-w-5xl mx-auto p-4 bg-gray-50 min-h-screen">
      <button onClick={() => setView('list')} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 font-medium transition-colors">
        <ArrowLeft size={20} /> Back to List
      </button>

      {selectedArticle && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 md:p-8 border-b border-gray-100 relative">
            <h1 className="text-2xl md:text-4xl font-bold text-gray-900 leading-tight mb-4">{selectedArticle.title}</h1>
            <button onClick={() => speakText(selectedArticle.title)} className="flex items-center gap-2 text-blue-600 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg font-medium transition-colors">
              <Volume2 size={18} /> Listen to Title
            </button>
          </div>

          <div className="grid md:grid-cols-12 gap-0 min-h-[500px]">
            <div className="md:col-span-3 border-r border-gray-100 bg-gray-50/50 p-4">
              <nav className="flex md:flex-col gap-2 overflow-x-auto pb-2 md:pb-0">
                <button onClick={() => setActiveTab('article')} className={`flex items-center gap-3 p-3 rounded-xl font-medium ${activeTab === 'article' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}><BookOpen size={20} /> Article</button>
                <button onClick={() => setActiveTab('vocab')} className={`flex items-center gap-3 p-3 rounded-xl font-medium ${activeTab === 'vocab' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}>
                  <ListIcon size={20} /> Vocabulary
                  {isVocabLoading && activeTab !== 'vocab' && <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse ml-auto"></div>}
                </button>
                <button onClick={() => setActiveTab('discussion')} className={`flex items-center gap-3 p-3 rounded-xl font-medium ${activeTab === 'discussion' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}>
                  <MessageCircle size={20} /> Discussion
                  {isVocabLoading && activeTab !== 'discussion' && <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse ml-auto"></div>}
                </button>
              </nav>
            </div>

            <div className="md:col-span-9 p-6 md:p-8">
              {activeTab === 'article' && (
                <div>
                  <img src={selectedArticle.image} alt="Article" className="w-full h-64 object-cover rounded-xl mb-8 shadow-sm" />
                  
                  {isStreaming && (
                    <div className="mb-6 inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full text-sm font-semibold">
                      <div className="animate-pulse w-2 h-2 bg-blue-600 rounded-full"></div>
                      AI is writing...
                    </div>
                  )}

                  <div className="text-lg text-gray-800 leading-relaxed font-serif">
                    {isStreaming ? (
                      <div className="whitespace-pre-wrap">{streamingText}</div>
                    ) : (
                      <div className="space-y-6">
                        {selectedArticle.content.map((paragraph, index) => (
                          <div key={index} className="group relative">
                            <p className="pr-12">{paragraph}</p>
                            {paragraph.length > 5 && (
                              <button onClick={() => speakText(paragraph)} className="absolute right-0 top-1 p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors opacity-50 group-hover:opacity-100">
                                <Play size={18} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'vocab' && (
                <div>
                  <h2 className="text-2xl font-bold mb-6 text-gray-900 border-b pb-4">Core Vocabulary</h2>
                  
                  {isVocabLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                      <p>AI 正在分析文章并提取核心词汇...</p>
                    </div>
                  ) : !selectedArticle.vocabulary ? (
                    <div className="text-center py-20 text-gray-500">等待文章生成完毕后开始提取。</div>
                  ) : (
                    <div className="grid gap-6">
                      {selectedArticle.vocabulary.map((v, index) => (
                        <div key={index} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <h3 className="text-xl font-bold text-blue-700 flex items-center gap-2">{v.word} <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">{v.pos}</span></h3>
                              <p className="text-gray-500 font-mono text-sm mt-1">{v.ipa}</p>
                            </div>
                            <button onClick={() => speakText(v.word, v.word)} className={`p-2 rounded-full transition-colors ${playingWord === v.word ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-blue-100'}`}><Volume2 size={20} /></button>
                          </div>
                          <div className="mb-3"><span className="inline-block bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-sm font-medium mb-2">{v.cn}</span></div>
                          <div className="bg-gray-50 p-4 rounded-lg border-l-4 border-l-blue-400">
                            <p className="text-gray-800 font-medium mb-1">"{v.en_ex}"</p>
                            <p className="text-gray-500 text-sm">{v.cn_ex}</p>
                            <button onClick={() => speakText(v.en_ex)} className="mt-2 text-xs text-blue-600 font-medium flex items-center gap-1 hover:underline"><Play size={12} /> Listen</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'discussion' && (
                <div>
                  <h2 className="text-2xl font-bold mb-6 text-gray-900 border-b pb-4">Discussion Questions</h2>
                  
                  {isVocabLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                      <p>AI 正在思考讨论题...</p>
                    </div>
                  ) : !selectedArticle.questions ? (
                     <div className="text-center py-20 text-gray-500">等待文章生成完毕后开始提取。</div>
                  ) : (
                    <div className="space-y-4">
                      {selectedArticle.questions.map((q, index) => (
                        <div key={index} className="flex gap-4 p-5 bg-blue-50/50 rounded-xl border border-blue-100">
                          <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">{index + 1}</div>
                          <p className="text-lg text-gray-800 font-medium">{q}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {view === 'list' ? <ListView /> : <DetailView />}
    </div>
  );
}
