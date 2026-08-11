import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Header } from './components/Header';
import { CategoryTabs } from './components/CategoryTabs';
import { ArticleCard } from './components/ArticleCard';
import { ArticleSkeleton } from './components/ArticleSkeleton';
import { ConfigModal } from './components/ConfigModal';
import { NewsSource, ReplacementRule, SynthesizedArticle, RawNewsItem, UserProfile } from './types';
import { synthesizeLocalFallback, hasSufficientArticleDetails, cleanMediaAudioVideoJunk, stripHtml } from './utils/rss';
import { AlertCircle, RefreshCw, Sliders, ChevronDown, Square, Newspaper, Anchor } from 'lucide-react';

interface SyncProgress {
  percent: number;
  stage: 'idle' | 'fetching' | 'parsing' | 'synthesizing' | 'complete';
  message: string;
  sourcesCount: number;
  articlesParsed: number;
  synthesesCreated: number;
}

export default function App() {
  // User Authentication State
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('an_user_v1');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isSyncingSettings, setIsSyncingSettings] = useState<boolean>(false);

  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    percent: 0,
    stage: 'idle',
    message: '',
    sourcesCount: 0,
    articlesParsed: 0,
    synthesesCreated: 0,
  });

  // Helper to build auth headers
  const getAuthHeaders = useCallback((u?: UserProfile | null) => {
    const targetUser = u !== undefined ? u : user;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (targetUser?.token) {
      headers['Authorization'] = `Bearer ${targetUser.token}`;
    }
    if (targetUser?.email) {
      headers['X-User-Email'] = targetUser.email;
    }
    return headers;
  }, [user]);

  // Pagination / Load More state
  const [visibleCount, setVisibleCount] = useState<number>(5);

  // Persistent state in localStorage & user server account
  const [sources, setSources] = useState<NewsSource[]>(() => {
    try {
      const saved = localStorage.getItem('an_sources_v5') || localStorage.getItem('an_sources_v2');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [rules, setRules] = useState<ReplacementRule[]>(() => {
    try {
      const saved = localStorage.getItem('an_rules_v2') || localStorage.getItem('an_rules_v1') || localStorage.getItem('an_rules');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [timeframeValue, setTimeframeValue] = useState<string>(() => {
    return localStorage.getItem('an_timeframe_v2') || '24';
  });

  const [activeTab, setActiveTab] = useState<string>('Headlines');

  const [articles, setArticles] = useState<SynthesizedArticle[]>(() => {
    try {
      const saved = localStorage.getItem('an_articles_cache_v3');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed)
          ? parsed.filter((art: SynthesizedArticle) => hasSufficientArticleDetails(art.fullDetails, art.title, art.summary))
          : [];
      }
      return [];
    } catch {
      return [];
    }
  });

  const [showImages, setShowImages] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('an_show_images');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('an_selected_model') || 'gemini-3.5-lite';
  });

  const [primarySourceId, setPrimarySourceId] = useState<string>(() => {
    return localStorage.getItem('an_primary_source_id') || 'none';
  });

  const [isAI, setIsAI] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string | undefined>(() => {
    return localStorage.getItem('an_last_updated') || undefined;
  });
  const [error, setError] = useState<string | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);

  const [hasOauth, setHasOauth] = useState<boolean>(false);
  const [showOauthGuide, setShowOauthGuide] = useState<boolean>(false);
  const [isSettingsLoadedFromServer, setIsSettingsLoadedFromServer] = useState<boolean>(false);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const loadedUserEmailRef = useRef<string | null>(null);

  // Sync sources, rules, timeframe, showImages, and selectedModel to localStorage immediately
  useEffect(() => {
    try {
      localStorage.setItem('an_sources_v5', JSON.stringify(sources));
    } catch {}
  }, [sources]);

  useEffect(() => {
    try {
      localStorage.setItem('an_rules_v2', JSON.stringify(rules));
    } catch {}
  }, [rules]);

  useEffect(() => {
    try {
      localStorage.setItem('an_timeframe_v2', timeframeValue);
    } catch {}
  }, [timeframeValue]);

  useEffect(() => {
    try {
      localStorage.setItem('an_show_images', JSON.stringify(showImages));
    } catch {}
  }, [showImages]);

  useEffect(() => {
    try {
      localStorage.setItem('an_selected_model', selectedModel);
    } catch {}
  }, [selectedModel]);

  useEffect(() => {
    try {
      localStorage.setItem('an_primary_source_id', primarySourceId);
    } catch {}
  }, [primarySourceId]);

  // Helper to re-check authentication status with backend
  const checkAuth = useCallback(() => {
    fetch('/api/auth/me', { headers: getAuthHeaders() })
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((data) => {
        if (data && data.user) {
          setUser((prev) => {
            if (prev && prev.email === data.user.email && prev.token === data.user.token) {
              return prev;
            }
            return data.user;
          });
          try {
            localStorage.setItem('an_user_v1', JSON.stringify(data.user));
          } catch {}
        }
      })
      .catch((err) => {
        console.log('Auth status check error:', err);
      })
      .finally(() => {
        setIsAuthChecking(false);
      });
  }, [getAuthHeaders]);

  // Check auth & health status on mount
  useEffect(() => {
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: any) => {
        if (data && data.hasOauth) setHasOauth(true);
      })
      .catch(() => {});

    checkAuth();

    if (window.location.search.includes('error=oauth_unconfigured')) {
      setShowOauthGuide(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [checkAuth]);

  // Listen for OAuth popup postMessage and window focus events
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        event.data &&
        (event.data.type === 'OAUTH_SUCCESS' || event.data.type === 'OAUTH_AUTH_SUCCESS')
      ) {
        if (event.data.user) {
          setUser(event.data.user);
          try {
            localStorage.setItem('an_user_v1', JSON.stringify(event.data.user));
          } catch {}
        }
        checkAuth();
      }
    };

    const handleFocus = () => {
      checkAuth();
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkAuth]);

  // Load user settings from server (Preloaded automatically for first-time Google logins)
  const loadUserSettings = useCallback(async (forced = false) => {
    if (!user || !user.email) return;
    const userEmail = user.email.toLowerCase();
    if (!forced && loadedUserEmailRef.current === userEmail) {
      return;
    }
    try {
      const res = await fetch('/api/user/settings', { headers: getAuthHeaders(user) });
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          if (Array.isArray(data.settings.sources)) {
            setSources(data.settings.sources);
          }
          if (Array.isArray(data.settings.rules)) {
            setRules(data.settings.rules);
          }
          if (data.settings.timeframeValue) {
            setTimeframeValue(data.settings.timeframeValue);
          }
          if (typeof data.settings.showImages === 'boolean') {
            setShowImages(data.settings.showImages);
          }
          if (data.settings.selectedModel) {
            setSelectedModel(data.settings.selectedModel);
          }
          if (data.settings.primarySourceId) {
            setPrimarySourceId(data.settings.primarySourceId);
          } else {
            setPrimarySourceId('none');
          }
        }
        loadedUserEmailRef.current = userEmail;
      }
    } catch (err) {
      console.error('Error loading settings from server:', err);
    } finally {
      setIsSettingsLoadedFromServer(true);
    }
  }, [user, getAuthHeaders]);

  useEffect(() => {
    if (user && user.email) {
      const userEmail = user.email.toLowerCase();
      if (loadedUserEmailRef.current !== userEmail) {
        setIsSettingsLoadedFromServer(false);
        loadUserSettings(true);
      }
    } else {
      loadedUserEmailRef.current = null;
      setIsSettingsLoadedFromServer(true);
    }
  }, [user, loadUserSettings]);

  // Save user settings to server whenever sources, rules, timeframe, showImages, or selectedModel change
  const saveUserSettings = useCallback(
    async (
      currentSources: NewsSource[],
      currentRules: ReplacementRule[],
      currentTf: string,
      currentImg: boolean,
      currentModel: string,
      currentPrimarySourceId: string
    ) => {
      if (!isSettingsLoadedFromServer || !user) return;
      setIsSyncingSettings(true);
      try {
        await fetch('/api/user/settings', {
          method: 'POST',
          headers: getAuthHeaders(user),
          body: JSON.stringify({
            settings: {
              sources: currentSources,
              rules: currentRules,
              timeframeValue: currentTf,
              showImages: currentImg,
              selectedModel: currentModel,
              primarySourceId: currentPrimarySourceId,
            },
          }),
        });
      } catch (err) {
        console.error('Error auto-saving user settings:', err);
      } finally {
        setIsSyncingSettings(false);
      }
    },
    [isSettingsLoadedFromServer, user, getAuthHeaders]
  );

  useEffect(() => {
    if (!isSettingsLoadedFromServer || !user) return;
    const timer = setTimeout(() => {
      saveUserSettings(sources, rules, timeframeValue, showImages, selectedModel, primarySourceId);
    }, 400);
    return () => clearTimeout(timer);
  }, [sources, rules, timeframeValue, showImages, selectedModel, primarySourceId, saveUserSettings, isSettingsLoadedFromServer, user]);

  const handleLogin = useCallback(async () => {
    if (!hasOauth) {
      setShowOauthGuide(true);
      return;
    }
    try {
      const res = await fetch('/api/auth/url?popup=true');
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          const popup = window.open(data.url, 'google_oauth', 'width=550,height=680');
          if (popup) return;
        }
      }
    } catch (e) {
      console.error('Error fetching auth URL:', e);
    }
    const popup = window.open('/auth/google?popup=true', 'google_oauth', 'width=550,height=680');
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      window.location.href = '/auth/google';
    }
  }, [hasOauth]);

  const handleLogout = useCallback(async () => {
    try {
      localStorage.removeItem('an_user_v1');
      await fetch('/api/auth/logout', { method: 'POST', headers: getAuthHeaders() });
    } catch (err) {
      console.error('Error signing out:', err);
    }
    setUser(null);
  }, [getAuthHeaders]);

  // Automatically derive category tabs from configured source tags
  const { allCategoryTags, sourceCountsByTag } = useMemo(() => {
    const counts: Record<string, number> = {};
    const tagSet = new Set<string>();

    sources.forEach((source) => {
      const tags = source.tags || [];
      tags.forEach((tag) => {
        const trimmed = tag.trim();
        if (!trimmed) return;
        tagSet.add(trimmed);
        if (source.enabled) {
          counts[trimmed] = (counts[trimmed] || 0) + 1;
        } else if (counts[trimmed] === undefined) {
          counts[trimmed] = 0;
        }
      });
    });

    const tagArray = Array.from(tagSet);
    if (!tagSet.has('Headlines')) {
      tagArray.push('Headlines');
      counts['Headlines'] = sources.filter((s) => s.enabled && (s.tags || []).some((t) => t.toLowerCase() === 'headlines')).length;
    }

    tagArray.sort((a, b) => {
      if (a.toLowerCase() === 'headlines') return -1;
      if (b.toLowerCase() === 'headlines') return 1;
      return a.localeCompare(b);
    });

    return {
      allCategoryTags: tagArray,
      sourceCountsByTag: counts,
    };
  }, [sources]);

  // Calculate dynamic timeframe in hours (e.g. since local midnight for 'today')
  const getEffectiveTimeframeHours = useCallback((tfValue: string): number => {
    if (tfValue === 'today') {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const hours = (now.getTime() - startOfToday.getTime()) / (1000 * 60 * 60);
      return Math.max(1, Math.round(hours * 10) / 10);
    }
    return Number(tfValue) || 24;
  }, []);

  // Ensure activeTab is valid and not 'All'
  useEffect(() => {
    if (activeTab === 'All' || (allCategoryTags.length > 0 && !allCategoryTags.includes(activeTab))) {
      const headlinesTab = allCategoryTags.find((t) => t.toLowerCase() === 'headlines');
      setActiveTab(headlinesTab || allCategoryTags[0] || 'Headlines');
    }
  }, [allCategoryTags, activeTab]);

  // Save changes to localStorage whenever state changes
  useEffect(() => {
    localStorage.setItem('an_sources_v2', JSON.stringify(sources));
  }, [sources]);

  useEffect(() => {
    localStorage.setItem('an_rules_v2', JSON.stringify(rules));
  }, [rules]);

  useEffect(() => {
    localStorage.setItem('an_timeframe_v2', timeframeValue);
  }, [timeframeValue]);

  useEffect(() => {
    localStorage.setItem('an_show_images', JSON.stringify(showImages));
  }, [showImages]);

  const abortControllerRef = React.useRef<AbortController | null>(null);

  const handleStopSync = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRefreshing(false);
    setSyncProgress({
      percent: 0,
      stage: 'idle',
      message: 'Feed synchronization stopped by user.',
      sourcesCount: 0,
      articlesParsed: 0,
      synthesesCreated: 0,
    });
    setError('Feed synchronization and synthesis stopped by user.');
  }, []);

  // Main fetch and synthesize action
  const fetchAndSynthesize = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsRefreshing(true);
    setError(null);

    // Filter sources by active category tab tag
    const effectiveTab = activeTab === 'All' ? 'Headlines' : activeTab;
    let targetSources = sources.filter(
      (s) =>
        s.enabled &&
        (s.tags || []).some((t) => t.toLowerCase() === effectiveTab.toLowerCase())
    );

    // Ensure the primary anchor source is included if one is selected and enabled
    if (primarySourceId && primarySourceId !== 'none') {
      const primarySource = sources.find((s) => s.id === primarySourceId && s.enabled);
      if (primarySource && !targetSources.some((s) => s.id === primarySource.id)) {
        targetSources = [...targetSources, primarySource];
      }
    }

    if (targetSources.length === 0) {
      if (sources.filter((s) => s.enabled).length === 0) {
        setError('No active news sources configured. Please add or enable sources in Config.');
      } else {
        setError(`No active sources tagged with "${activeTab}". Please tag or enable sources in Config.`);
      }
      setArticles([]);
      setIsRefreshing(false);
      abortControllerRef.current = null;
      return;
    }

    const timeframeHours = getEffectiveTimeframeHours(timeframeValue);

    // Initial stage 1: Fetching
    setSyncProgress({
      percent: 15,
      stage: 'fetching',
      message: `Connecting to ${targetSources.length} RSS feeds for "${activeTab}"...`,
      sourcesCount: targetSources.length,
      articlesParsed: 0,
      synthesesCreated: 0,
    });

    // Smooth progress timer while server fetches RSS and synthesizes
    const progressTimer = setInterval(() => {
      setSyncProgress((prev) => {
        if (prev.stage === 'fetching' && prev.percent < 45) {
          return { ...prev, percent: prev.percent + 3 };
        } else if (prev.stage === 'synthesizing' && prev.percent < 90) {
          return { ...prev, percent: prev.percent + 2 };
        }
        return prev;
      });
    }, 250);

    try {
      // 1. Fetch RSS feeds via server endpoint for target sources
      const fetchRes = await fetch('/api/rss/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: targetSources, timeframeHours }),
        signal: controller.signal,
      });

      if (!fetchRes.ok) {
        throw new Error(`Failed to fetch RSS feeds (${fetchRes.status})`);
      }

      const fetchResult = await fetchRes.json();
      const rawItems: RawNewsItem[] = fetchResult.items || [];

      if (rawItems.length === 0) {
        clearInterval(progressTimer);
        const tfLabel = timeframeValue === 'today' ? 'today' : `the last ${timeframeHours}h`;
        setError(
          `No articles found for "${activeTab}" within ${tfLabel}. Try expanding your timeframe or adding more sources under this tag.`
        );
        setArticles([]);
        setIsRefreshing(false);
        setSyncProgress((prev) => ({ ...prev, percent: 0, stage: 'idle' }));
        abortControllerRef.current = null;
        return;
      }

      // Stage 2: Parsing complete, starting AI synthesis
      setSyncProgress({
        percent: 55,
        stage: 'synthesizing',
        message: `Reviewed ${targetSources.length} sources · Parsed ${rawItems.length} news items. Synthesizing topic clusters with Gemini AI...`,
        sourcesCount: targetSources.length,
        articlesParsed: rawItems.length,
        synthesesCreated: 0,
      });

      // 2. Synthesize via server Gemini API or local engine
      const primarySource = sources.find((s) => s.id === primarySourceId);
      const primarySourceName = primarySource?.name;

      const synthRes = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: rawItems,
          rules,
          timeframeHours,
          selectedModel,
          primarySourceName: primarySourceId !== 'none' ? primarySourceName : undefined,
        }),
        signal: controller.signal,
      });

      if (!synthRes.ok) {
        throw new Error(`Synthesis request failed (${synthRes.status})`);
      }

      const synthResult = await synthRes.json();
      const rawSynth: SynthesizedArticle[] = synthResult.articles || [];

      // Clean summaries and details to remove audio/video player text
      const processedArticles = (rawSynth.length > 0
        ? rawSynth
        : synthesizeLocalFallback(rawItems, rules, timeframeHours, primarySourceId !== 'none' ? primarySourceName : undefined)
      ).map((art) => {
        const cleanSummary = cleanMediaAudioVideoJunk(stripHtml(art.summary || ''));
        const cleanDetails = art.fullDetails ? cleanMediaAudioVideoJunk(art.fullDetails) : undefined;
        return {
          ...art,
          summary: cleanSummary || art.title,
          fullDetails: cleanDetails,
        };
      });

      // Rank Option A: Primary Tier (rich multi-source breakdowns) first, followed by Secondary Tier (single-source / concise)
      processedArticles.sort((a, b) => {
        const aRich = hasSufficientArticleDetails(a.fullDetails, a.title, a.summary) ? 1 : 0;
        const bRich = hasSufficientArticleDetails(b.fullDetails, b.title, b.summary) ? 1 : 0;
        if (aRich !== bRich) return bRich - aRich;
        return (b.articleCount || 1) - (a.articleCount || 1);
      });

      clearInterval(progressTimer);

      if (processedArticles.length > 0) {
        setArticles(processedArticles);
        setIsAI(Boolean(synthResult.isAI && rawSynth.length > 0));
        setVisibleCount(5);
        const now = new Date().toISOString();
        setLastUpdated(now);
        localStorage.setItem('an_articles_cache_v3', JSON.stringify(processedArticles));
        localStorage.setItem('an_last_updated', now);

        setSyncProgress({
          percent: 100,
          stage: 'complete',
          message: `Synthesis complete! Created ${processedArticles.length} synthesized stories from ${targetSources.length} sources.`,
          sourcesCount: targetSources.length,
          articlesParsed: rawItems.length,
          synthesesCreated: processedArticles.length,
        });
      } else {
        setError('Unable to synthesize articles for the selected sources and timeframe.');
        setArticles([]);
        setSyncProgress((prev) => ({ ...prev, percent: 0, stage: 'idle' }));
      }
    } catch (err: any) {
      clearInterval(progressTimer);
      if (err.name === 'AbortError') {
        console.log('Fetch / synthesis request aborted.');
        return;
      }
      console.warn('Network error during synthesis, executing local fallback logic:', err);
      setError(`Network warning: ${err.message || err}. Using cached/local engine.`);
      setSyncProgress((prev) => ({ ...prev, percent: 0, stage: 'idle' }));
    } finally {
      clearInterval(progressTimer);
      if (abortControllerRef.current === controller) {
        setIsRefreshing(false);
        abortControllerRef.current = null;
      }
    }
  }, [sources, rules, timeframeValue, activeTab, selectedModel, getEffectiveTimeframeHours, primarySourceId]);

  // Handle Tab Switch with immediate loading feedback
  const handleSelectTab = useCallback((newTab: string) => {
    if (newTab !== activeTab) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setActiveTab(newTab);
      setArticles([]); // Clear previous tab's articles so stale content is immediately hidden
      setVisibleCount(5);
      setIsRefreshing(true); // Trigger loading animation immediately
      setError(null);
    }
  }, [activeTab]);

  // Re-run synthesis when configuration settings are loaded, or when timeframe, active tab, or primary source changes
  useEffect(() => {
    if (!isSettingsLoadedFromServer) return;
    setVisibleCount(5);
    fetchAndSynthesize();
  }, [isSettingsLoadedFromServer, timeframeValue, activeTab, primarySourceId]);

  const handleTimeframeChange = (val: string) => {
    setTimeframeValue(val);
  };

  const visibleArticles = useMemo(() => {
    return articles.slice(0, visibleCount);
  }, [articles, visibleCount]);

  const handleResetDefaults = async () => {
    try {
      await fetch('/api/user/settings', { method: 'DELETE', headers: getAuthHeaders(user) });
      loadedUserEmailRef.current = null;
      await loadUserSettings(true);
    } catch (err) {
      console.error('Failed to reset settings', err);
    }
  };

  const handleClearCache = () => {
    localStorage.removeItem('an_articles_cache_v3');
    setArticles([]);
    setLastUpdated(undefined);
    setVisibleCount(5);
  };

  const activeSourcesForTab =
    activeTab === 'All'
      ? sources.filter((s) => s.enabled)
      : sources.filter(
          (s) =>
            s.enabled &&
            (s.tags || []).some((t) => t.toLowerCase() === activeTab.toLowerCase())
        );

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans">
        <div className="flex items-center space-x-3 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
          <span className="text-sm font-medium">Checking Google Authentication...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <Header
          onRefresh={() => {}}
          isRefreshing={false}
          onOpenConfig={() => setIsConfigOpen(true)}
          timeframeValue={timeframeValue}
          onTimeframeChange={handleTimeframeChange}
          showImages={showImages}
          onToggleShowImages={() => setShowImages((prev) => !prev)}
          user={null}
          onLogin={handleLogin}
          onLogout={handleLogout}
          isSyncingSettings={false}
        />
        <main className="flex-1 max-w-xl w-full mx-auto px-4 py-16 flex flex-col items-center justify-center text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-xl shadow-indigo-950/60 ring-1 ring-white/10">
            <Newspaper className="w-8 h-8 text-white" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white tracking-tight">Sign in to AbstractNews</h2>
            <p className="text-sm text-slate-400 max-w-md">
              Please sign in with your Google account to view news feeds, customize news sources, and keep your preferences persistently synced.
            </p>
          </div>
          <button
            onClick={handleLogin}
            className="px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-95 text-white font-bold text-sm rounded-xl transition shadow-xl shadow-indigo-950/80 cursor-pointer flex items-center justify-center space-x-3 border border-indigo-500/50"
          >
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>Sign In with Google</span>
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased pb-16">
      
      {/* Sticky Header */}
      <Header
        onRefresh={fetchAndSynthesize}
        isRefreshing={isRefreshing}
        onStopSync={handleStopSync}
        onOpenConfig={() => setIsConfigOpen(true)}
        timeframeValue={timeframeValue}
        onTimeframeChange={handleTimeframeChange}
        showImages={showImages}
        onToggleShowImages={() => setShowImages((prev) => !prev)}
        selectedModel={selectedModel}
        onModelChange={(newModel) => setSelectedModel(newModel)}
        user={user}
        onLogin={handleLogin}
        onLogout={handleLogout}
        isSyncingSettings={isSyncingSettings}
      />

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-6">

        {/* Dynamically Generated Category Tabs */}
        <CategoryTabs
          tags={allCategoryTags}
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          sourceCountsByTag={sourceCountsByTag}
        />

        {/* Primary Anchor Selector Control Bar */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 mb-6 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start space-x-3">
            <div className="p-2 rounded-xl bg-indigo-950/80 border border-indigo-800/40 text-indigo-400 mt-0.5">
              <Anchor className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-200">Primary News Feed Anchor</h3>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                {primarySourceId === 'none' ? (
                  <span>Standard Multi-Feed: Generates top synthesized stories across all enabled news sources.</span>
                ) : (
                  <span>
                    Anchored Coverage: Stories are anchored in{' '}
                    <strong className="text-indigo-300 font-bold">
                      {sources.find((s) => s.id === primarySourceId)?.name || 'the selected source'}
                    </strong>
                    , blending in related details from all other sources.
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="w-full md:w-auto flex-shrink-0">
            <label htmlFor="primary-feed-select" className="sr-only">Choose Primary News Source</label>
            <div className="relative">
              <select
                id="primary-feed-select"
                value={primarySourceId}
                onChange={(e) => setPrimarySourceId(e.target.value)}
                className="w-full md:w-64 bg-slate-950 hover:bg-slate-900 text-slate-200 text-xs font-semibold px-3 py-2.5 rounded-xl border border-slate-800 hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 appearance-none cursor-pointer transition"
              >
                <option value="none">None (Synthesize All Feeds)</option>
                <optgroup label="Enabled News Feeds">
                  {sources
                    .filter((s) => s.enabled)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </optgroup>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>

        {/* Error / Warning Alert Banner */}
        {error && (
          <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs sm:text-sm mb-6 flex items-start space-x-3 shadow-lg">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <p className="font-semibold text-amber-300">Feed Status Alert</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Article Counter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 px-1">
          <div className="flex items-center space-x-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              {activeTab === 'All' ? 'Top Headline Syntheses' : `${activeTab} Syntheses`}
            </h2>
            <span className="bg-indigo-950 text-indigo-300 border border-indigo-800/60 text-xs font-mono px-2.5 py-0.5 rounded-full font-bold">
              Showing {visibleArticles.length} of {articles.length}
            </span>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Sources: {activeSourcesForTab.length > 0 ? activeSourcesForTab.map((s) => s.name).join(', ') : 'None'}
          </div>
        </div>

        {/* Feed Content */}
        {!isSettingsLoadedFromServer || isRefreshing ? (
          <div className="py-2 space-y-4">
            {!isSettingsLoadedFromServer ? (
              <div className="flex items-center space-x-2.5 p-4 bg-slate-900/90 border border-slate-800 rounded-2xl text-slate-300 text-xs font-medium shadow-lg animate-pulse">
                <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
                <span>Loading reader configuration...</span>
              </div>
            ) : (
              <div className="p-4 sm:p-5 bg-slate-900/95 border border-indigo-900/50 rounded-2xl text-slate-200 shadow-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center space-x-2.5">
                    <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin flex-shrink-0" />
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-100 flex items-center gap-2">
                        <span>Feed Synthesis in Progress</span>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800">
                          {syncProgress.percent}%
                        </span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {syncProgress.message || `Synthesizing latest stories for ${activeTab}...`}
                      </p>
                    </div>
                  </div>

                  {isRefreshing && (
                    <button
                      onClick={handleStopSync}
                      className="px-3 py-1.5 rounded-xl bg-red-950/70 hover:bg-red-900 border border-red-800/80 text-red-300 hover:text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer active:scale-95 ml-auto sm:ml-0"
                    >
                      <Square className="w-3 h-3 fill-current text-red-400" />
                      <span>Stop Sync</span>
                    </button>
                  )}
                </div>

                {/* Animated Progress Bar */}
                <div className="w-full bg-slate-800/90 rounded-full h-2 overflow-hidden border border-slate-700/50">
                  <div
                    className="bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400 h-full rounded-full transition-all duration-300 ease-out shadow-sm"
                    style={{ width: `${Math.min(100, Math.max(5, syncProgress.percent))}%` }}
                  />
                </div>

                {/* Progress Status Metric Cards */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl px-2.5 py-2 text-center">
                    <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Sources Reviewed</span>
                    <span className="text-xs sm:text-sm font-extrabold text-indigo-300 font-mono">
                      {syncProgress.sourcesCount > 0 ? syncProgress.sourcesCount : '—'}
                    </span>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl px-2.5 py-2 text-center">
                    <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Articles Parsed</span>
                    <span className="text-xs sm:text-sm font-extrabold text-indigo-300 font-mono">
                      {syncProgress.articlesParsed > 0 ? syncProgress.articlesParsed : (syncProgress.stage === 'fetching' ? '...' : 0)}
                    </span>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl px-2.5 py-2 text-center">
                    <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Stories Created</span>
                    <span className="text-xs sm:text-sm font-extrabold text-emerald-400 font-mono">
                      {syncProgress.synthesesCreated > 0 ? syncProgress.synthesesCreated : (syncProgress.stage === 'synthesizing' ? '...' : 0)}
                    </span>
                  </div>
                </div>
              </div>
            )}
            <ArticleSkeleton />
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-16 px-4 bg-slate-900/40 border border-slate-800 rounded-2xl my-6">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Sliders className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-200">No Articles Synthesized</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">
              Try adjusting your timeframe, switching category tabs, or adding/tagging sources in Reader Configuration.
            </p>
            <button
              onClick={fetchAndSynthesize}
              disabled={isRefreshing}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-xl text-xs inline-flex items-center space-x-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Fetch Feed</span>
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-5">
              {visibleArticles.map((article, index) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  index={index}
                  showImages={showImages}
                  rules={rules}
                />
              ))}
            </div>

            {/* Load More Articles Controls */}
            {visibleCount < articles.length && (
              <div className="pt-4 pb-2 text-center">
                <button
                  onClick={() => setVisibleCount((prev) => Math.min(prev + 5, articles.length))}
                  className="inline-flex items-center space-x-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-xs sm:text-sm transition shadow-lg shadow-indigo-950/60 cursor-pointer border border-indigo-500/50 hover:shadow-indigo-900/80"
                >
                  <ChevronDown className="w-4 h-4" />
                  <span>Load 5 More Articles ({articles.length - visibleCount} remaining)</span>
                </button>
              </div>
            )}

            {visibleCount >= articles.length && articles.length > 5 && (
              <div className="pt-4 pb-2 text-center text-xs text-slate-500 font-medium">
                Showing all {articles.length} synthesized stories for this timeframe.
              </div>
            )}
          </div>
        )}

      </main>

      {/* Configuration Drawer Modal */}
      <ConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        sources={sources}
        onUpdateSources={setSources}
        rules={rules}
        onUpdateRules={setRules}
        onResetDefaults={handleResetDefaults}
        onClearCache={handleClearCache}
        onTriggerResynthesize={fetchAndSynthesize}
        user={user}
        onLogin={handleLogin}
        onLogout={handleLogout}
        isRefreshing={isRefreshing}
        onStopSync={handleStopSync}
      />

      {/* OAuth Configuration Guide Modal */}
      {showOauthGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <span>Google OAuth Configuration</span>
              </h3>
              <button
                onClick={() => setShowOauthGuide(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-semibold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              To enable Google Sign-In, enter your Google OAuth 2.0 Web Client credentials in the bottom-left panel (<strong>"Enter your environment variable to continue"</strong>):
            </p>
            <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800/80 font-mono text-xs space-y-2 text-slate-200 select-all">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-sans font-bold">OAUTH_CLIENT_ID:</span>
                <span className="text-indigo-300 break-all">643837793893-l4lst125auj9323kbnb184rro3qqgevk.apps.googleusercontent.com</span>
              </div>
              <div className="pt-1 border-t border-slate-800/60">
                <span className="text-slate-500 block text-[10px] uppercase font-sans font-bold">OAUTH_CLIENT_SECRET:</span>
                <span className="text-amber-300 break-all">(Copy the secret from your Google Cloud Console)</span>
              </div>
              <div className="pt-1 border-t border-slate-800/60">
                <span className="text-slate-500 block text-[10px] uppercase font-sans font-bold">1. Authorized JavaScript origins (NO path at end):</span>
                <span className="text-sky-300 break-all">{window.location.origin}</span>
              </div>
              <div className="pt-1 border-t border-slate-800/60">
                <span className="text-slate-500 block text-[10px] uppercase font-sans font-bold">2. Authorized redirect URIs (WITH /auth/google/callback):</span>
                <span className="text-emerald-400 break-all">{window.location.origin}/auth/google/callback</span>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowOauthGuide(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold cursor-pointer transition"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
