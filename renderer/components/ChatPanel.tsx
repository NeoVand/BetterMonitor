"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Trash2, Bot, User } from 'lucide-react';
import { useProcessStore } from '@/lib/store';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';

// Markdown components for styling
const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-gray-200">{children}</em>
  ),
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isInline = !className;
    return isInline ? (
      <code className="px-1 py-0.5 bg-white/10 rounded text-[10px] font-mono text-blue-300">
        {children}
      </code>
    ) : (
      <code className="block p-2 my-2 bg-black/40 rounded-lg text-[10px] font-mono text-gray-300 overflow-x-auto">
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="my-2 overflow-x-auto">{children}</pre>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-gray-300">{children}</li>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-sm font-bold text-white mb-2">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-xs font-bold text-white mb-1.5">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-xs font-semibold text-white mb-1">{children}</h3>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-[10px] border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-2 py-1 bg-white/10 text-left font-semibold text-gray-300 border border-white/10">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-2 py-1 border border-white/10 text-gray-400">{children}</td>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-blue-500/50 pl-2 my-2 text-gray-400 italic">
      {children}
    </blockquote>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

export function ChatPanel() {
  const { 
    chatMessages, 
    isChatLoading, 
    addChatMessage, 
    setChatLoading, 
    setChatMessages,
    clearChat 
  } = useProcessStore();
  
  const [input, setInput] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load chat history on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron) return;
    
    window.electron.getChatHistory().then(history => {
      if (history && history.length > 0) {
        setChatMessages(history);
      }
    });
  }, [setChatMessages]);

  // Scroll to bottom when messages change or streaming
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, streamingContent]);

  // Handle streaming updates
  const handleStreamChunk = useCallback((chunk: string) => {
    setStreamingContent(prev => prev + chunk);
  }, []);

  // Set up streaming listener
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron) return;
    
    const cleanup = window.electron.onChatStream?.(handleStreamChunk);
    return () => cleanup?.();
  }, [handleStreamChunk]);

  const handleSend = async () => {
    if (!input.trim() || isChatLoading) return;
    if (!window.electron) return;

    const userMessage = input.trim();
    setInput('');
    setStreamingContent('');
    
    // Add user message immediately
    addChatMessage({ role: 'user', content: userMessage });
    setChatLoading(true);

    try {
      const result = await window.electron.sendChatMessage(userMessage);
      
      // Clear streaming content and add final message
      setStreamingContent('');
      
      if (result.success && result.response) {
        addChatMessage({ role: 'assistant', content: result.response });
      } else {
        addChatMessage({ 
          role: 'assistant', 
          content: `Sorry, I encountered an error: ${result.error || 'Unknown error'}` 
        });
      }
    } catch (error) {
      setStreamingContent('');
      addChatMessage({ 
        role: 'assistant', 
        content: `Sorry, something went wrong: ${String(error)}` 
      });
    } finally {
      setChatLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = async () => {
    if (!window.electron) return;
    await window.electron.clearChatHistory();
    clearChat();
  };

  return (
    <div className="flex flex-col h-full bg-black/20 rounded-xl border border-white/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-blue-400" />
          <span className="text-xs font-medium text-gray-400">AI Assistant</span>
        </div>
        <button
          onClick={handleClear}
          className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
          title="Clear chat"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {chatMessages.length === 0 && !streamingContent ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Bot size={32} className="text-gray-700 mb-3" />
            <p className="text-xs text-gray-600 mb-2">Ask me about your processes</p>
            <div className="space-y-1">
              <p className="text-[10px] text-gray-700">"What's using the most CPU?"</p>
              <p className="text-[10px] text-gray-700">"Tell me about Chrome processes"</p>
              <p className="text-[10px] text-gray-700">"Are there any suspicious processes?"</p>
            </div>
          </div>
        ) : (
          <>
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={clsx(
                  "flex gap-2",
                  msg.role === 'user' ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot size={12} className="text-blue-400" />
                  </div>
                )}
                <div
                  className={clsx(
                    "max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed",
                    msg.role === 'user'
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-white/5 text-gray-300 rounded-bl-sm"
                  )}
                >
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-gray-600/50 flex items-center justify-center shrink-0 mt-0.5">
                    <User size={12} className="text-gray-400" />
                  </div>
                )}
              </div>
            ))}
            
            {/* Streaming message */}
            {streamingContent && (
              <div className="flex gap-2 justify-start">
                <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={12} className="text-blue-400" />
                </div>
                <div className="max-w-[85%] px-3 py-2 rounded-xl rounded-bl-sm bg-white/5 text-gray-300 text-xs leading-relaxed">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {streamingContent}
                  </ReactMarkdown>
                  <span className="inline-block w-1.5 h-3 bg-blue-400 animate-pulse ml-0.5" />
                </div>
              </div>
            )}
            
            {/* Loading indicator (only show if loading but not streaming) */}
            {isChatLoading && !streamingContent && (
              <div className="flex gap-2 justify-start">
                <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                  <Bot size={12} className="text-blue-400" />
                </div>
                <div className="bg-white/5 px-3 py-2 rounded-xl rounded-bl-sm flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-white/5 bg-white/[0.02]">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about processes..."
            disabled={isChatLoading}
            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isChatLoading}
            className={clsx(
              "px-3 py-2 rounded-lg transition-all",
              input.trim() && !isChatLoading
                ? "bg-blue-600 hover:bg-blue-500 text-white"
                : "bg-white/5 text-gray-600 cursor-not-allowed"
            )}
          >
            {isChatLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
