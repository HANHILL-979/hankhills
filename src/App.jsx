import React, { useState, useEffect } from 'react';
import { BookOpen, List as ListIcon, MessageCircle, Play, Volume2, ArrowLeft, Clock, BarChart } from 'lucide-react';

/* global puter */

// ================= API Configuration =================
const API_CONFIGS = {
  // Google AI Studio (Gemini) - Free tier: 5-15 RPM, 250K TPM
  gemini: {
    name: "Google Gemini (Free)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    models: {
      pro: "gemini-2.5-pro",
      flash: "gemini-2.5-flash",
      lite: "gemini-2.5-flash-lite"
    },
    defaultModel: "flash",
    headers: () => ({
      "Content-Type": "application/json"
    }),
    formatRequest: (prompt, model, stream = false) => ({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048
      },
      ...(stream && { stream: true })
    }),
    parseResponse: (data) => data.candidates[0].content.parts[0].text,
    streamSupported: true
  },
  
  // Groq - Free tier: 30 RPM, 1K req/day for 70B models
  groq: {
    name: "Groq (Free, Fast)",
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    models: {
      "llama-70b": "llama-3.3-70b-versatile",
      "llama-8b": "llama-3.1-8b-instant",
      "qwen-32b": "qwen/qwen3-32b",
      "mixtral": "mixtral-8x7b-32768"
    },
    defaultModel: "llama-70b",
    headers: (apiKey) => ({
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    }),
    formatRequest: (prompt, model, stream = false) => ({
      model: model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 2048,
      stream: stream
    }),
    parseResponse: (data) => data.choices[0].message.content,
    streamSupported: true
  },
  
  // OpenRouter - Free tier: 20 RPM, 50 req/day
  openrouter: {
    name: "OpenRouter (Free)",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    models: {
      "llama-70b": "meta-llama/llama-3.3-70b-instruct:free",
      "deepseek-r1": "deepseek/deepseek-r1:free",
      "qwen-235b": "qwen/qwen3-235b-a22b:free",
      "mistral-7b": "mistralai/mistral-7b-instruct:free"
    },
    defaultModel: "llama-70b",
    headers: (apiKey) => ({
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": window.location.href,
      "X-Title": "Global News Reader"
    }),
    formatRequest: (prompt, model, stream = false) => ({
      model: model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 2048,
      stream: stream
    }),
    parseResponse: (data) => data.choices[0].message.content,
    streamSupported: true
  },
  
  // Puter.js (Mistral) - Free, no API key needed
  puter: {
    name: "Puter.js (Free, No Key)",
    baseUrl: null, // Uses puter.js SDK
    models: {
      "mistral-large": "mistralai/mistral-large-2512",
      "mistral-small": "mistralai/mistral-small-2603",
      "codestral": "mistralai/codestral-2508"
    },
    defaultModel: "mistral-large",
    headers: () => ({}),
    formatRequest: (prompt, model, stream = false) => ({
      prompt: prompt,
      model: model,
      stream: stream
    }),
    parseResponse: (response) => response.message?.content || response,
    streamSupported: true,
    useSDK: true
  }
};

// Default configuration
const DEFAULT_API = "groq";
const DEFAULT_MODEL = "llama-70b";

// RSS Feed configuration
const RSS_FEED_URL = "http://feeds.bbci.co.uk/news/world/rss.xml";
const RSS_API_URL = `https://api.rss2json.com/v1/api.json?rss_url=${RSS_FEED_URL}`;
// ====================================================

export default function App() {
  const [view, setView] = useState('list');
  const [activeTab, setActiveTab] = useState('article');
  const [playingWord, setPlayingWord] = useState(null);
  
  const [newsList, setNewsList] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  
  // API Configuration state
  const [selectedApi, setSelectedApi] = useState('groq');
  const [selectedModel, setSelectedModel] = useState('llama-70b');
  const [apiKey, setApiKey] = useState('');
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  
  // Loading states
  const [isStreaming, setIsStreaming] = useState(false);
  const [isVocabLoading, setIsVocabLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");

  useEffect(() => {
    fetchRSSNews();
    // Load saved API key from localStorage
    const savedKey = localStorage.getItem(`apiKey_${selectedApi}`);
    if (savedKey) {
      setApiKey(savedKey);
      setApiKeySaved(true);
    }
  }, [selectedApi]);

  const getCurrentApiConfig = () => API_CONFIGS[selectedApi];
  
  const saveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem(`apiKey_${selectedApi}`, apiKey.trim());
      setApiKeySaved(true);
    }
  };
  
  const clearApiKey = () => {
    localStorage.removeItem(`apiKey_${selectedApi}`);
    setApiKey('');
    setApiKeySaved(false);
  };

  // Article cache functions
  const getArticleCache = (articleId) => {
    const cache = localStorage.getItem(`article_cache_${articleId}`);
    return cache ? JSON.parse(cache) : null;
  };
  
  const setArticleCache = (articleId, content, vocabulary, questions) => {
    const cacheData = { content, vocabulary, questions, timestamp: Date.now() };
    localStorage.setItem(`article_cache_${articleId}`, JSON.stringify(cacheData));
  };

  const fetchRSSNews = async () => {
    setListLoading(true);
    try {
      const response = await fetch(RSS_API_URL);
      const data = await response.json();
      
      if (data.status === 'ok') {
        const formattedNews = data.items.map((item, index) => {
          const plainTextSummary = item.content.replace(/<[^>]+>/g, '').trim() || item.description.replace(/<[^>]+>/g, '').trim();
          
          // Check if article is cached
          const cachedData = getArticleCache(index);
          
          return {
            id: index,
            title: item.title,
            image: item.thumbnail || `https://picsum.photos/seed/${index + 100}/800/400`,
            date: item.pubDate.split(' ')[0],
            summary: plainTextSummary,
            category: "World News",
            isExpanded: !!cachedData,
            content: cachedData ? cachedData.content : [],
            vocabulary: cachedData ? cachedData.vocabulary : null,
            questions: cachedData ? cachedData.questions : null
          };
        });
        setNewsList(formattedNews);
      }
    } catch (error) {
      console.error("RSS error:", error);
    } finally {
      setListLoading(false);
    }
  };

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
          { "word": "word1", "ipa": "/phonetics/", "pos": "adj.", "cn": "中文释义", "en_ex": "Sentence from the article or a good example.", "cn_ex": "中文翻译." }
        ],
        "questions": [
          "Discussion question 1 related to the article?",
          "Discussion question 2 related to the article?"
        ]
      }`;

      const apiConfig = getCurrentApiConfig();
      let generatedData;
      
      if (apiConfig.useSDK) {
        // Use Puter.js SDK
        if (typeof puter !== 'undefined') {
          const response = await puter.ai.chat(systemPrompt, {
            model: apiConfig.models[selectedModel]
          });
          generatedData = apiConfig.parseResponse(response);
        } else {
          throw new Error("Puter.js SDK not loaded");
        }
      } else {
        // Use REST API
        if (!apiKeySaved) {
          alert("Please save your API key first");
          return;
        }
        
        const response = await fetch(apiConfig.baseUrl, {
          method: "POST",
          headers: apiConfig.headers(apiKey),
          body: JSON.stringify(apiConfig.formatRequest(systemPrompt, apiConfig.models[selectedModel], false))
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();
        generatedData = apiConfig.parseResponse(result);
      }
      
      // Clean up JSON response
      generatedData = generatedData.replace(/```json\n?|\n?```/g, '').trim();
      const parsedData = JSON.parse(generatedData);

      setNewsList(prevList => prevList.map(item => {
        if (item.id === articleId) {
          const updatedItem = { ...item, vocabulary: parsedData.vocabulary, questions: parsedData.questions };
          if (selectedArticle && selectedArticle.id === articleId) {
            setSelectedArticle(updatedItem);
          }
          
          // Update cache with vocabulary and questions
          const cachedData = getArticleCache(articleId);
          if (cachedData) {
            setArticleCache(articleId, cachedData.content, parsedData.vocabulary, parsedData.questions);
          }
          
          return updatedItem;
        }
        return item;
      }));

    } catch (error) {
      console.error("Vocabulary generation error:", error);
    } finally {
      setIsVocabLoading(false);
    }
  };

  const handleArticleClick = async (article) => {
    setSelectedArticle(article);
    setView('detail');
    setActiveTab('article');

    // Check if article is already expanded
    if (article.isExpanded) return;

    // Check cache first
    const cachedData = getArticleCache(article.id);
    if (cachedData) {
      const cachedArticle = {
        ...article,
        content: cachedData.content,
        vocabulary: cachedData.vocabulary,
        questions: cachedData.questions,
        isExpanded: true
      };
      setSelectedArticle(cachedArticle);
      setNewsList(prevList => prevList.map(item => 
        item.id === article.id ? cachedArticle : item
      ));
      return;
    }

    const apiConfig = getCurrentApiConfig();
    
    // Check if API key is needed and saved
    if (!apiConfig.useSDK && !apiKeySaved) {
      setShowApiConfig(true);
      return;
    }

    setIsStreaming(true);
    setStreamingText(""); 
    
    const tempArticle = { ...article, isExpanded: true };
    setSelectedArticle(tempArticle);

    let accumulatedText = "";

    try {
      const systemPrompt = `You are an expert English teacher. Expand the following news summary into a comprehensive news article. 
      
      CRITICAL VOCABULARY RULE: 
      - Strictly restrict your vocabulary to the Chinese University CET-6 syllabus. 
      - DO NOT use overly obscure, archaic, or GRE/SAT level words. 
      - The language should be natural, professional, and accessible to a college student passing CET-6.
      - Utilize complex grammar appropriately (e.g., noun clauses, inverted sentences, non-finite verbs).
      
      OUTPUT ONLY THE ARTICLE TEXT. Do not use markdown tags. Separate paragraphs with double newlines.
      
      Original Title: ${article.title}
      Summary: ${article.summary}`;

      if (apiConfig.useSDK) {
        // Use Puter.js SDK with streaming
        if (typeof puter !== 'undefined') {
          const response = await puter.ai.chat(systemPrompt, {
            model: apiConfig.models[selectedModel],
            stream: true
          });
          
          for await (const part of response) {
            if (part?.text) {
              accumulatedText += part.text;
              setStreamingText(accumulatedText);
            }
          }
        } else {
          throw new Error("Puter.js SDK not loaded");
        }
      } else {
        // Use REST API with streaming
        const response = await fetch(apiConfig.baseUrl, {
          method: "POST",
          headers: apiConfig.headers(apiKey),
          body: JSON.stringify(apiConfig.formatRequest(systemPrompt, apiConfig.models[selectedModel], true))
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

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
                const delta = data.choices?.[0]?.delta?.content;
                if (delta) {
                  accumulatedText += delta;
                  setStreamingText(accumulatedText); 
                }
              } catch {
                // Ignore parsing errors for non-JSON lines
              }
            }
          }
        }
      }

      const finalContentArray = accumulatedText.split('\n\n').filter(p => p.trim() !== "");
      const finalArticle = { ...article, content: finalContentArray, isExpanded: true };
      
      setSelectedArticle(finalArticle);
      setNewsList(prevList => prevList.map(item => item.id === article.id ? finalArticle : item));

      // Save to cache (without vocabulary and questions initially)
      setArticleCache(article.id, finalContentArray, null, null);

      generateVocabAndQuestions(article.id, accumulatedText);

    } catch (error) {
      console.error("AI generation error:", error);
      alert(`Error: ${error.message}`);
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

  const ApiConfigPanel = () => {
    const apiConfig = getCurrentApiConfig();
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">API Configuration</h2>
            <button 
              onClick={() => setShowApiConfig(false)}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select API Provider
              </label>
              <select
                value={selectedApi}
                onChange={(e) => setSelectedApi(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {Object.entries(API_CONFIGS).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {Object.entries(apiConfig.models).map(([key, model]) => (
                  <option key={key} value={key}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
            
            {!apiConfig.useSDK && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Key
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={`Enter your ${apiConfig.name} API key`}
                    className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={saveApiKey}
                    className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    Save
                  </button>
                </div>
                {apiKeySaved && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-green-600 text-sm">✓ Key saved</span>
                    <button
                      onClick={clearApiKey}
                      className="text-red-500 text-sm hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            )}
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-800 mb-2">About {apiConfig.name}</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Free tier available</li>
                <li>• Supports streaming responses</li>
                {apiConfig.useSDK ? (
                  <li>• No API key required</li>
                ) : (
                  <li>• Requires free API key</li>
                )}
              </ul>
            </div>
            
            <div className="bg-yellow-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-800 mb-2">Cache Management</h4>
              <p className="text-sm text-gray-600 mb-3">
                Generated articles are cached locally to reduce API usage.
              </p>
              <button
                onClick={() => {
                  if (confirm('Clear all cached articles? This will require regenerating content.')) {
                    // Clear all article caches
                    Object.keys(localStorage).forEach(key => {
                      if (key.startsWith('article_cache_')) {
                        localStorage.removeItem(key);
                      }
                    });
                    // Refresh the news list to update isExpanded status
                    fetchRSSNews();
                    alert('Cache cleared successfully!');
                  }
                }}
                className="w-full py-2 px-4 bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 transition-colors"
              >
                Clear Article Cache
              </button>
            </div>
            
            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setShowApiConfig(false)}
                className="flex-1 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowApiConfig(false);
                  if (selectedArticle) {
                    handleArticleClick(selectedArticle);
                  }
                }}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
              >
                Apply & Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const ListView = () => (
    <div className="max-w-4xl mx-auto p-4">
      <header className="flex justify-between items-center mb-8 pt-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Global News Reader</h1>
          <p className="text-gray-500">Fast Streaming & Smart Extraction</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowApiConfig(true)}
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            API Config
          </button>
          <button 
            onClick={fetchRSSNews}
            disabled={listLoading}
            className="bg-gray-800 hover:bg-gray-900 text-white px-6 py-2 rounded-lg font-bold transition-all disabled:bg-gray-400"
          >
            {listLoading ? "Syncing..." : "Refresh Feed"}
          </button>
        </div>
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
                    {article.isExpanded && <span className="text-xs text-green-600 font-semibold flex items-center gap-1">?? AI Expanded</span>}
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
                      <p>AI ????????????????????...</p>
                    </div>
                  ) : !selectedArticle.vocabulary ? (
                    <div className="text-center py-20 text-gray-500">??????????????????????</div>
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
                      <p>AI ???????????...</p>
                    </div>
                  ) : !selectedArticle.questions ? (
                     <div className="text-center py-20 text-gray-500">??????????????????????</div>
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
      {showApiConfig && <ApiConfigPanel />}
      {view === 'list' ? <ListView /> : <DetailView />}
    </div>
  );
}