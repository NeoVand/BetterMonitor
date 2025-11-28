"use client";

import { useState } from 'react';
import { Key, Loader2, Check, AlertCircle, ExternalLink, Sparkles } from 'lucide-react';
import clsx from 'clsx';

interface APIKeySetupProps {
  onComplete: () => void;
}

export function APIKeySetup({ onComplete }: APIKeySetupProps) {
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!apiKey.trim()) {
      setError('Please enter your API key');
      return;
    }

    if (!apiKey.startsWith('sk-or-')) {
      setError('Invalid key format. OpenRouter keys start with "sk-or-"');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Test the connection
      const testResult = await window.electron.testAIConnection(apiKey);
      
      if (!testResult.success) {
        setError(testResult.error || 'Failed to connect. Please check your API key.');
        setIsLoading(false);
        return;
      }

      // Save the key
      await window.electron.saveAISettings({ apiKey });
      
      setIsSuccess(true);
      
      // Brief delay to show success state
      setTimeout(() => {
        onComplete();
      }, 800);
    } catch (err) {
      setError(String(err));
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-md mx-4">
        {/* Card */}
        <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="px-8 pt-8 pb-4 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-white/10">
              <Sparkles size={32} className="text-blue-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Enable AI Features</h2>
            <p className="text-sm text-gray-400">
              Connect your OpenRouter API key to unlock intelligent process clustering and AI chat.
            </p>
          </div>

          {/* Content */}
          <div className="px-8 pb-8 space-y-4">
            {/* API Key Input */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-gray-400">
                <Key size={12} />
                OpenRouter API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder="sk-or-v1-..."
                disabled={isLoading || isSuccess}
                className={clsx(
                  "w-full px-4 py-3 bg-white/5 border rounded-xl text-white placeholder-gray-600 font-mono text-sm transition-all",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500/50",
                  error ? "border-red-500/50" : "border-white/10",
                  (isLoading || isSuccess) && "opacity-50 cursor-not-allowed"
                )}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            {/* Success Message */}
            {isSuccess && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                <Check size={14} className="text-green-400" />
                <p className="text-xs text-green-400">Connected successfully!</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={isLoading || isSuccess || !apiKey.trim()}
              className={clsx(
                "w-full py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2",
                isSuccess
                  ? "bg-green-600 text-white"
                  : isLoading
                  ? "bg-blue-600/50 text-white/50 cursor-not-allowed"
                  : apiKey.trim()
                  ? "bg-blue-600 hover:bg-blue-500 text-white"
                  : "bg-white/5 text-gray-600 cursor-not-allowed"
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Connecting...
                </>
              ) : isSuccess ? (
                <>
                  <Check size={16} />
                  Connected!
                </>
              ) : (
                'Connect'
              )}
            </button>

            {/* Help Link */}
            <div className="text-center pt-2">
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-400 transition-colors"
              >
                Get your free API key
                <ExternalLink size={10} />
              </a>
            </div>

            {/* Features Preview */}
            <div className="pt-4 border-t border-white/5">
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-3 text-center">What you'll unlock</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="px-3 py-2 bg-white/[0.02] rounded-lg border border-white/5">
                  <p className="text-[10px] font-medium text-gray-400">Smart Clustering</p>
                  <p className="text-[9px] text-gray-600">AI groups related processes</p>
                </div>
                <div className="px-3 py-2 bg-white/[0.02] rounded-lg border border-white/5">
                  <p className="text-[10px] font-medium text-gray-400">AI Assistant</p>
                  <p className="text-[9px] text-gray-600">Ask about your system</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Skip option */}
        <p className="text-center mt-4 text-xs text-gray-600">
          AI features are optional. The monitor works without them.
        </p>
      </div>
    </div>
  );
}

