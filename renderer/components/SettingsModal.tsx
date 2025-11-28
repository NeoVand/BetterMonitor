"use client";

import { useState, useEffect } from 'react';
import { X, Key, Bot, Thermometer, Check, AlertCircle, Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AIModel {
  id: string;
  name: string;
  free?: boolean;
  dimensions?: number;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [chatModel, setChatModel] = useState('mistralai/mistral-small-3.1-24b-instruct:free');
  const [embeddingModel, setEmbeddingModel] = useState('openai/text-embedding-3-small');
  const [temperature, setTemperature] = useState(0.3);
  
  const [chatModels, setChatModels] = useState<AIModel[]>([]);
  const [embeddingModels, setEmbeddingModels] = useState<AIModel[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Load settings on mount
  useEffect(() => {
    if (!isOpen) return;
    
    const loadSettings = async () => {
      if (!window.electron) return;
      
      setIsLoading(true);
      try {
        const [settings, models] = await Promise.all([
          window.electron.getAISettings(),
          window.electron.getAIModels(),
        ]);
        
        setApiKey(settings.apiKey || '');
        setChatModel(settings.chatModel || 'mistralai/mistral-small-3.1-24b-instruct:free');
        setEmbeddingModel(settings.embeddingModel || 'openai/text-embedding-3-small');
        setTemperature(settings.temperature || 0.3);
        
        setChatModels(models.chatModels);
        setEmbeddingModels(models.embeddingModels);
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadSettings();
  }, [isOpen]);

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      setTestResult({ success: false, error: 'Please enter an API key' });
      return;
    }
    
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const result = await window.electron.testAIConnection(apiKey);
      setTestResult(result);
    } catch (error) {
      setTestResult({ success: false, error: String(error) });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    
    try {
      await window.electron.saveAISettings({
        apiKey,
        chatModel,
        embeddingModel,
        temperature,
      });
      
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveStatus('idle');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-[#0A0A0A] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Bot size={20} className="text-blue-400" />
            AI Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={32} className="text-blue-400 animate-spin" />
            </div>
          ) : (
            <>
              {/* API Key */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Key size={14} />
                  OpenRouter API Key
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-or-v1-..."
                    className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 font-mono text-sm"
                  />
                  <button
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className={clsx(
                      "px-4 py-2.5 rounded-lg font-medium text-sm transition-all",
                      isTesting
                        ? "bg-white/5 text-gray-500 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-500 text-white"
                    )}
                  >
                    {isTesting ? <Loader2 size={16} className="animate-spin" /> : 'Test'}
                  </button>
                </div>
                
                {testResult && (
                  <div className={clsx(
                    "flex items-center gap-2 text-sm px-3 py-2 rounded-lg",
                    testResult.success
                      ? "bg-green-500/10 text-green-400"
                      : "bg-red-500/10 text-red-400"
                  )}>
                    {testResult.success ? (
                      <>
                        <Check size={14} />
                        Connection successful!
                      </>
                    ) : (
                      <>
                        <AlertCircle size={14} />
                        {testResult.error || 'Connection failed'}
                      </>
                    )}
                  </div>
                )}
                
                <p className="text-xs text-gray-500">
                  Get your API key from{' '}
                  <a 
                    href="https://openrouter.ai/keys" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    openrouter.ai/keys
                  </a>
                </p>
              </div>
              
              {/* Chat Model */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Bot size={14} />
                  Chat Model
                </label>
                <select
                  value={chatModel}
                  onChange={(e) => setChatModel(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 text-sm"
                >
                  {chatModels.map((model) => (
                    <option key={model.id} value={model.id} className="bg-[#1a1a1a]">
                      {model.name} {model.free && '✨'}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500">
                  Models marked with ✨ are free to use
                </p>
              </div>
              
              {/* Embedding Model */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  Embedding Model
                </label>
                <select
                  value={embeddingModel}
                  onChange={(e) => setEmbeddingModel(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 text-sm"
                >
                  {embeddingModels.map((model) => (
                    <option key={model.id} value={model.id} className="bg-[#1a1a1a]">
                      {model.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500">
                  Used for semantic clustering of processes
                </p>
              </div>
              
              {/* Temperature */}
              <div className="space-y-2">
                <label className="flex items-center justify-between text-sm font-medium text-gray-300">
                  <span className="flex items-center gap-2">
                    <Thermometer size={14} />
                    Temperature
                  </span>
                  <span className="text-blue-400 font-mono">{temperature.toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Precise</span>
                  <span>Creative</span>
                </div>
              </div>
            </>
          )}
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-white/[0.02]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className={clsx(
              "px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
              saveStatus === 'saved'
                ? "bg-green-600 text-white"
                : saveStatus === 'saving'
                ? "bg-blue-600/50 text-white/50 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-500 text-white"
            )}
          >
            {saveStatus === 'saving' && <Loader2 size={14} className="animate-spin" />}
            {saveStatus === 'saved' && <Check size={14} />}
            {saveStatus === 'saved' ? 'Saved!' : saveStatus === 'saving' ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

