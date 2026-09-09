import React, { useState } from 'react';
import { Newspaper, RefreshCw, Settings, Clock, Image as ImageIcon, ImageOff, LogIn, LogOut, Check, User as UserIcon, Square, Cpu, Sparkles } from 'lucide-react';
import { UserProfile } from '../types';

interface HeaderProps {
  onRefresh: () => void;
  isRefreshing: boolean;
  onStopSync?: () => void;
  onOpenConfig: () => void;
  timeframeValue: string;
  onTimeframeChange: (value: string) => void;
  showImages: boolean;
  onToggleShowImages: () => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  user: UserProfile | null;
  onLogin: () => void;
  onLogout: () => void;
  isSyncingSettings: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onRefresh,
  isRefreshing,
  onStopSync,
  onOpenConfig,
  timeframeValue,
  onTimeframeChange,
  showImages,
  onToggleShowImages,
  selectedModel,
  onModelChange,
  user,
  onLogin,
  onLogout,
  isSyncingSettings,
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-3 py-2.5 sm:px-6 shadow-lg">
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
        
        {/* Brand Title (Hidden on narrow screens to save space) */}
        <div className="hidden sm:flex items-center space-x-2.5 flex-shrink-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-md shadow-indigo-900/40">
            <Newspaper className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-white leading-none">AbstractNews</h1>
            {user ? (
              <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 mt-1 leading-none">
                <Check className="w-2.5 h-2.5" />
                Settings Synced ({user.name.split(' ')[0]})
              </span>
            ) : (
              <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1 mt-1 leading-none">
                AI synthesis active
              </span>
            )}
          </div>
        </div>

        {/* Controls Group (Wraps as required on narrow screens) */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-1.5 sm:gap-2 text-sm w-full sm:w-auto">
          
          {/* Model Selector Dropdown in Top Bar */}
          <div className="flex items-center space-x-1 bg-slate-800/80 border border-indigo-900/60 hover:border-indigo-700/80 rounded-xl px-2 py-1.5 text-indigo-200 transition flex-shrink-0 shadow-xs">
            <Cpu className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <select
              value={selectedModel === 'gemini-3.5-lite' ? 'gemini-3.5-flash-lite' : selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer pr-0.5"
              title="Select Gemini AI Model for processing news streams"
              aria-label="Select Gemini AI Model"
            >
              <option value="gemini-3.5-flash-lite" className="bg-slate-900 text-slate-100">
                Gemini 3.5 Lite (Default)
              </option>
              <option value="gemini-2.5-flash" className="bg-slate-900 text-slate-100">
                Gemini 2.5 Flash
              </option>
              <option value="gemini-2.5-flash-lite" className="bg-slate-900 text-slate-100">
                Gemini 2.5 Flash Lite
              </option>
            </select>
          </div>

          {/* Image Toggle Button (Icon Only) */}
          <button
            onClick={onToggleShowImages}
            className={`p-2 rounded-xl border transition cursor-pointer active:scale-95 flex-shrink-0 ${
              showImages
                ? 'bg-indigo-950/90 text-indigo-300 border-indigo-700/80 shadow-xs'
                : 'bg-slate-800/80 hover:bg-slate-750 text-slate-400 border-slate-700'
            }`}
            title={showImages ? 'Turn Images Off' : 'Turn Images On'}
            aria-label="Toggle images"
          >
            {showImages ? <ImageIcon className="w-4 h-4 text-indigo-400" /> : <ImageOff className="w-4 h-4 text-slate-500" />}
          </button>

          {/* Timeframe Selector (Icon + Select) */}
          <div className="flex items-center space-x-1 bg-slate-800/80 border border-slate-700/80 rounded-xl px-2 py-1.5 text-slate-300 hover:border-slate-600 transition flex-shrink-0">
            <Clock className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <select
              value={timeframeValue}
              onChange={(e) => onTimeframeChange(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer pr-0.5"
              title="Select timeframe"
            >
              <option value="today" className="bg-slate-900 text-slate-100">Today</option>
              <option value="24" className="bg-slate-900 text-slate-100">Last 24 Hours</option>
              <option value="72" className="bg-slate-900 text-slate-100">Last 3 Days</option>
              <option value="168" className="bg-slate-900 text-slate-100">Last 7 Days</option>
            </select>
          </div>

          {/* Refresh / Stop Button */}
          {isRefreshing ? (
            <button
              onClick={onStopSync}
              className="p-2 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white transition shadow-md shadow-red-950/30 cursor-pointer flex-shrink-0 flex items-center gap-1.5"
              title="Stop synchronization"
              aria-label="Stop synchronization"
            >
              <Square className="w-4 h-4 fill-white text-white" />
              <span className="text-xs font-bold hidden sm:inline">Stop</span>
            </button>
          ) : (
            <button
              onClick={onRefresh}
              className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white transition shadow-md shadow-indigo-950/30 cursor-pointer flex-shrink-0"
              title="Refresh feed"
              aria-label="Refresh news"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          {/* Config Settings Button (Icon Only) */}
          <button
            onClick={onOpenConfig}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700 cursor-pointer active:scale-95 flex-shrink-0"
            title="Open configuration"
            aria-label="Open settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Google User Login / Profile Section */}
          {user ? (
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowUserMenu((prev) => !prev)}
                className="p-1 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition cursor-pointer active:scale-95 flex items-center justify-center"
                title={`Signed in as ${user.name}`}
                aria-label={`User menu for ${user.name}`}
              >
                {user.picture ? (
                  <img src={user.picture} alt={user.name} className="w-7 h-7 rounded-full ring-1 ring-indigo-500/60 object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </button>

              {/* User Dropdown */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-3 z-50 text-slate-200">
                  <div className="flex items-center space-x-2.5 pb-2.5 mb-2 border-b border-slate-800">
                    {user.picture ? (
                      <img src={user.picture} alt={user.name} className="w-9 h-9 rounded-full ring-2 ring-indigo-500/50" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="overflow-hidden">
                      <p className="text-xs font-bold text-white truncate">{user.name}</p>
                      <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                    </div>
                  </div>

                  <p className="text-[11px] text-indigo-300 bg-indigo-950/60 p-2 rounded-xl mb-2.5 border border-indigo-800/50 leading-snug">
                    Your custom sources, replacement rules, and timeframe are saved under your Google account.
                  </p>

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onLogout();
                    }}
                    className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-red-950/50 hover:text-red-300 hover:border-red-800/60 text-slate-300 border border-slate-700 text-xs font-semibold transition cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onLogin}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-400 hover:text-indigo-300 transition border border-slate-700 cursor-pointer active:scale-95 flex-shrink-0"
              title="Sign in with Google"
              aria-label="Sign in with Google"
            >
              <LogIn className="w-4 h-4" />
            </button>
          )}

        </div>

      </div>
    </header>
  );
};

