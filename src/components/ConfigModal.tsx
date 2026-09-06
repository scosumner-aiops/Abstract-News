import React, { useState } from 'react';
import { X, Rss, ShieldAlert, Sliders, Plus, Trash2, RotateCcw, Check, Sparkles, Tag, User as UserIcon, LogOut, CheckCircle2, Upload, Download, Compass, TrendingUp, SlidersHorizontal } from 'lucide-react';
import { NewsSource, ReplacementRule, TopicPreference, TopicWeight, UserProfile } from '../types';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  sources: NewsSource[];
  onUpdateSources: (sources: NewsSource[]) => void;
  rules: ReplacementRule[];
  onUpdateRules: (rules: ReplacementRule[]) => void;
  topicPreferences: TopicPreference[];
  onUpdateTopicPreferences: (topics: TopicPreference[]) => void;
  onResetDefaults: () => void;
  onClearCache: () => void;
  onTriggerResynthesize: () => void;
  user: UserProfile | null;
  onLogin: () => void;
  onLogout: () => void;
  isRefreshing?: boolean;
  onStopSync?: () => void;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({
  isOpen,
  onClose,
  sources,
  onUpdateSources,
  rules,
  onUpdateRules,
  topicPreferences,
  onUpdateTopicPreferences,
  onResetDefaults,
  onClearCache,
  onTriggerResynthesize,
  user,
  onLogin,
  onLogout,
  isRefreshing = false,
  onStopSync,
}) => {
  const [activeTab, setActiveTab] = useState<'sources' | 'anonymizer' | 'topics' | 'settings'>('sources');

  // Form states for new source
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceTags, setNewSourceTags] = useState('Headlines');
  const [sourceAddError, setSourceAddError] = useState('');

  // Per-source tag input state
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({});

  // Form states for new replacement rule
  const [newTerm, setNewTerm] = useState('');
  const [newReplacement, setNewReplacement] = useState('');
  const [ruleAddError, setRuleAddError] = useState('');
  const [ruleAddSuccess, setRuleAddSuccess] = useState('');

  // Form states for new topic preference
  const [newTopicText, setNewTopicText] = useState('');
  const [newTopicWeight, setNewTopicWeight] = useState<TopicWeight>('more');
  const [topicAddError, setTopicAddError] = useState('');
  const [topicAddSuccess, setTopicAddSuccess] = useState('');

  const [saveDefaultSuccess, setSaveDefaultSuccess] = useState(false);

  const handleSaveAsDefaultSettings = async () => {
    try {
      const res = await fetch('/api/user/default-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            sources,
            rules,
            topicPreferences,
            timeframeValue: '24',
            showImages: true,
          },
        }),
      });
      if (res.ok) {
        setSaveDefaultSuccess(true);
        setTimeout(() => setSaveDefaultSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to update default settings:', err);
    }
  };

  if (!isOpen) return null;

  // Add tag to specific source
  const handleAddTagToSource = (sourceId: string, tagToAdd: string) => {
    const cleanTag = tagToAdd.trim();
    if (!cleanTag) return;
    onUpdateSources(
      sources.map((s) => {
        if (s.id !== sourceId) return s;
        const currentTags = s.tags || [];
        if (currentTags.some((t) => t.toLowerCase() === cleanTag.toLowerCase())) return s;
        return { ...s, tags: [...currentTags, cleanTag] };
      })
    );
    setTagInputs((prev) => ({ ...prev, [sourceId]: '' }));
  };

  // Remove tag from specific source
  const handleRemoveTagFromSource = (sourceId: string, tagToRemove: string) => {
    onUpdateSources(
      sources.map((s) => {
        if (s.id !== sourceId) return s;
        const currentTags = s.tags || [];
        return { ...s, tags: currentTags.filter((t) => t.toLowerCase() !== tagToRemove.toLowerCase()) };
      })
    );
  };

  // Add new news source
  const handleAddSource = (e: React.FormEvent) => {
    e.preventDefault();
    setSourceAddError('');

    const url = newSourceUrl.trim();
    if (!url) {
      setSourceAddError('Please enter a valid RSS feed URL');
      return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      setSourceAddError('URL must start with http:// or https://');
      return;
    }

    if (sources.some((s) => s.url.toLowerCase() === url.toLowerCase())) {
      setSourceAddError('This source URL is already in your list');
      return;
    }

    let name = newSourceName.trim();
    if (!name) {
      try {
        const hostname = new URL(url).hostname.replace('www.', '');
        name = hostname.split('.')[0].toUpperCase();
      } catch {
        name = 'News Feed';
      }
    }

    const parsedTags = newSourceTags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const newSource: NewsSource = {
      id: `source-${Date.now()}`,
      name,
      url,
      enabled: true,
      tags: parsedTags.length > 0 ? parsedTags : ['Headlines'],
    };

    onUpdateSources([...sources, newSource]);
    setNewSourceName('');
    setNewSourceUrl('');
    setNewSourceTags('Headlines');
  };

  // Toggle source enabled
  const handleToggleSource = (id: string) => {
    onUpdateSources(
      sources.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  // Remove source
  const handleRemoveSource = (id: string) => {
    onUpdateSources(sources.filter((s) => s.id !== id));
  };

  // Add new replacement rule
  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    setRuleAddError('');
    setRuleAddSuccess('');

    const term = newTerm.trim();
    const replacement = newReplacement.trim();

    if (!term) {
      setRuleAddError('Term or name to replace is required');
      return;
    }

    if (rules.some((r) => r.term.toLowerCase() === term.toLowerCase())) {
      setRuleAddError(`Filter rule for "${term}" already exists`);
      return;
    }

    const newRule: ReplacementRule = {
      id: `rule-${Date.now()}`,
      term,
      replacement,
      enabled: true,
    };

    onUpdateRules([...rules, newRule]);
    setNewTerm('');
    setNewReplacement('');
    setRuleAddSuccess(`Saved rule: "${term}" → "${replacement || '(omit)'}"`);
    setTimeout(() => setRuleAddSuccess(''), 4000);
  };

  // Toggle rule enabled
  const handleToggleRule = (id: string) => {
    onUpdateRules(
      rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
  };

  // Remove rule
  const handleRemoveRule = (id: string) => {
    onUpdateRules(rules.filter((r) => r.id !== id));
  };

  // Quick preset add
  const handleAddPreset = (term: string, replacement: string) => {
    if (!rules.some((r) => r.term.toLowerCase() === term.toLowerCase())) {
      const newRule: ReplacementRule = {
        id: `rule-${Date.now()}`,
        term,
        replacement,
        enabled: true,
      };
      onUpdateRules([...rules, newRule]);
    }
  };

  // Topic Preferences Handlers
  const handleAddTopic = (e: React.FormEvent) => {
    e.preventDefault();
    setTopicAddError('');
    setTopicAddSuccess('');

    const clean = newTopicText.trim();
    if (!clean) {
      setTopicAddError('Please enter a topic or subject name.');
      return;
    }

    if (topicPreferences.some((t) => t.topic.toLowerCase() === clean.toLowerCase())) {
      setTopicAddError(`The topic "${clean}" is already configured.`);
      return;
    }

    const newTopic: TopicPreference = {
      id: `topic-${Date.now()}`,
      topic: clean,
      weight: newTopicWeight,
      enabled: true,
    };

    onUpdateTopicPreferences([...topicPreferences, newTopic]);
    setNewTopicText('');
    setTopicAddSuccess(
      `Added "${clean}" (${newTopicWeight === 'more' ? 'See More / Following' : 'See Less / Occasional'}).`
    );
    setTimeout(() => setTopicAddSuccess(''), 3000);
  };

  const handleToggleTopic = (id: string) => {
    onUpdateTopicPreferences(
      topicPreferences.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t))
    );
  };

  const handleToggleTopicWeight = (id: string) => {
    onUpdateTopicPreferences(
      topicPreferences.map((t) =>
        t.id === id ? { ...t, weight: t.weight === 'more' ? 'less' : 'more' } : t
      )
    );
  };

  const handleRemoveTopic = (id: string) => {
    onUpdateTopicPreferences(topicPreferences.filter((t) => t.id !== id));
  };

  // Handle JSON Import
  const handleImportFeeds = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
          // Validate structure (minimal check)
          const validSources = imported.filter(s => s.url && s.name);
          onUpdateSources([...sources, ...validSources]);
          setSourceAddError('');
        } else {
          setSourceAddError('Invalid JSON format: Expected an array of sources');
        }
      } catch (err) {
        setSourceAddError('Failed to parse JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const downloadTemplate = () => {
    const template = [
      {
        id: 'example-1',
        name: 'Example News Source',
        url: 'https://example.com/rss.xml',
        enabled: true,
        tags: ['Headlines', 'Tech']
      }
    ];
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(template, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "news_feeds_template.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div
        className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <Sliders className="w-5 h-5 text-indigo-400" />
              <span>Reader Configuration</span>
            </h2>
            <p className="text-xs text-slate-400">
              Manage RSS sources, citation rules & persistent preferences
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            aria-label="Close configuration"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-5 pt-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('sources')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'sources'
                ? 'border-indigo-500 text-indigo-300 bg-indigo-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Rss className="w-4 h-4" />
            <span>News Sources ({sources.filter((s) => s.enabled).length})</span>
          </button>

          <button
            onClick={() => setActiveTab('anonymizer')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'anonymizer'
                ? 'border-indigo-500 text-indigo-300 bg-indigo-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Citation Anonymizer ({rules.filter((r) => r.enabled).length})</span>
          </button>

          <button
            onClick={() => setActiveTab('topics')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'topics'
                ? 'border-indigo-500 text-indigo-300 bg-indigo-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Topics ({topicPreferences.filter((t) => t.enabled).length})</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'settings'
                ? 'border-indigo-500 text-indigo-300 bg-indigo-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Preferences</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 bg-slate-900">
          
          {/* TAB 1: NEWS SOURCES */}
          {activeTab === 'sources' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center">
                    <Rss className="w-4 h-4 mr-1.5 text-indigo-400" />
                    Active News Sources
                  </h3>
                  <p className="text-xs text-slate-400 mb-3">
                    Specify news RSS feeds and tag them to group into custom category tabs (e.g. Headlines, Tech, Business).
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <input type="file" id="feed-import" accept=".json" className="hidden" onChange={handleImportFeeds} />
                  <label
                    htmlFor="feed-import"
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition cursor-pointer flex items-center justify-center"
                    title="Import JSON"
                  >
                    <Upload className="w-4 h-4" />
                  </label>
                  <button
                    onClick={downloadTemplate}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition cursor-pointer flex items-center justify-center"
                    title="Get Template"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>

                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {sources.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-2">No news sources added yet.</p>
                  ) : (
                    sources.map((source) => {
                      const tags = source.tags || [];
                      const tagInputValue = tagInputs[source.id] || '';

                      return (
                        <div
                          key={source.id}
                          className="bg-slate-800/80 border border-slate-750 px-3.5 py-3 rounded-xl text-xs space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={source.enabled}
                                onChange={() => handleToggleSource(source.id)}
                                className="w-4 h-4 text-indigo-600 bg-slate-900 border-slate-700 rounded focus:ring-indigo-500 cursor-pointer"
                              />
                              <div className="min-w-0 flex-1">
                                <span className="font-semibold text-slate-200 block truncate">
                                  {source.name}
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono block truncate">
                                  {source.url}
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={() => handleRemoveSource(source.id)}
                              className="text-slate-400 hover:text-red-400 ml-2 p-1 rounded-lg transition cursor-pointer"
                              title="Delete source"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Source Tags List & Add Tag Input */}
                          <div className="pt-1 flex flex-wrap items-center gap-1.5 border-t border-slate-700/50">
                            <span className="text-[10px] uppercase font-bold text-slate-400 mr-1 flex items-center">
                              <Tag className="w-3 h-3 mr-1 text-indigo-400" />
                              Tabs:
                            </span>

                            {tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 text-[11px] font-medium"
                              >
                                <span>{tag}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTagFromSource(source.id, tag)}
                                  className="text-indigo-400 hover:text-indigo-100 ml-0.5 focus:outline-none cursor-pointer"
                                  title={`Remove ${tag} tag`}
                                >
                                  &times;
                                </button>
                              </span>
                            ))}

                            {/* Add inline tag form */}
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleAddTagToSource(source.id, tagInputValue);
                              }}
                              className="inline-flex items-center"
                            >
                              <input
                                type="text"
                                placeholder="+ Tag"
                                value={tagInputValue}
                                onChange={(e) =>
                                  setTagInputs((prev) => ({
                                    ...prev,
                                    [source.id]: e.target.value,
                                  }))
                                }
                                className="w-20 bg-slate-900 border border-slate-700 rounded-md px-1.5 py-0.5 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                              />
                            </form>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

              {/* Add New Source Form */}
              <form onSubmit={handleAddSource} className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold text-slate-300">Add New RSS Feed Source</h4>
                {sourceAddError && (
                  <p className="text-xs text-red-400 font-medium">{sourceAddError}</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Source Title (e.g. TechCrunch)"
                    value={newSourceName}
                    onChange={(e) => setNewSourceName(e.target.value)}
                    className="bg-slate-900 border border-slate-750 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="url"
                    placeholder="https://example.com/rss.xml"
                    value={newSourceUrl}
                    onChange={(e) => setNewSourceUrl(e.target.value)}
                    className="sm:col-span-2 bg-slate-900 border border-slate-750 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Category Tags (comma-separated, e.g. Tech, Business)"
                    value={newSourceTags}
                    onChange={(e) => setNewSourceTags(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-750 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Sources with matching tags will automatically generate tab categories on your news board.
                  </p>
                </div>
                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-xl text-xs transition flex items-center justify-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Feed Source</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: CITATION ANONYMIZER */}
          {activeTab === 'anonymizer' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center">
                  <ShieldAlert className="w-4 h-4 mr-1.5 text-emerald-400" />
                  Citation Replacements & Anonymizer Rules
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                  Specify names or terms to eliminate from article summaries. The story will be reported naturally, but the entity name/citation will be smoothly replaced.
                </p>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {rules.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-2">No replacement rules configured.</p>
                  ) : (
                    rules.map((rule) => (
                      <div
                        key={rule.id}
                        className="flex items-center justify-between bg-slate-800/80 border border-slate-750 px-3.5 py-2.5 rounded-xl text-xs"
                      >
                        <div className="flex items-center space-x-3 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={() => handleToggleRule(rule.id)}
                            className="w-4 h-4 text-indigo-600 bg-slate-900 border-slate-700 rounded focus:ring-indigo-500 cursor-pointer"
                          />
                          <div className="min-w-0 flex-1 grid grid-cols-2 gap-2">
                            <span className="font-bold text-slate-100 truncate">
                              "{rule.term}"
                            </span>
                            <span className="text-slate-400 italic truncate">
                              &rarr; "{rule.replacement || '(omit)'}"
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleRemoveRule(rule.id)}
                          className="text-slate-400 hover:text-red-400 ml-2 p-1 rounded-lg transition cursor-pointer"
                          title="Delete rule"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Presets */}
              <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-2xl">
                <p className="text-[11px] font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                  Quick Presets
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleAddPreset('Doug Ford', 'the premier of Ontario')}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono border border-slate-700 transition cursor-pointer"
                  >
                    + Doug Ford &rarr; premier of Ontario
                  </button>
                  <button
                    onClick={() => handleAddPreset('Tesla', 'a leading U.S. electric automaker')}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono border border-slate-700 transition cursor-pointer"
                  >
                    + Tesla &rarr; electric automaker
                  </button>
                  <button
                    onClick={() => handleAddPreset('Elon Musk', 'a prominent tech mogul')}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono border border-slate-700 transition cursor-pointer"
                  >
                    + Elon Musk &rarr; tech mogul
                  </button>
                </div>
              </div>

              {/* Add Custom Replacement Rule Form */}
              <form onSubmit={handleAddRule} className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold text-slate-300">Add Replacement Rule</h4>
                {ruleAddError && (
                  <p className="text-xs text-red-400 font-medium">{ruleAddError}</p>
                )}
                {ruleAddSuccess && (
                  <p className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{ruleAddSuccess}</span>
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Term/Name to edit out (e.g. Doug Ford)"
                    value={newTerm}
                    onChange={(e) => setNewTerm(e.target.value)}
                    className="bg-slate-900 border border-slate-750 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    placeholder="Replace with (e.g. the premier of Ontario)"
                    value={newReplacement}
                    onChange={(e) => setNewReplacement(e.target.value)}
                    className="bg-slate-900 border border-slate-750 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 rounded-xl text-xs transition flex items-center justify-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Anonymizer Rule</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: TOPICS WEIGHTING (Option A - No Quick-Add Chips) */}
          {activeTab === 'topics' && (
            <div className="space-y-5">
              {/* Header Overview Card */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center">
                  <Compass className="w-4 h-4 mr-1.5 text-indigo-400" />
                  Topic Weighting & Executive Curation
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                  Configure topics you want to see more or less of during news synthesis. Rather than a hard filter, these act as editorial weights to dial coverage up or down while keeping all other news balanced.
                </p>

                {/* Legend Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                  <div className="bg-emerald-950/40 border border-emerald-850/60 p-2.5 rounded-xl flex items-start space-x-2.5">
                    <TrendingUp className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs font-semibold text-emerald-300">See More (Following)</span>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                        Actively prioritizes stories on this subject and tags synthesized articles with <strong className="text-emerald-300 font-medium">Following</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="bg-rose-950/40 border border-rose-850/60 p-2.5 rounded-xl flex items-start space-x-2.5">
                    <SlidersHorizontal className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs font-semibold text-rose-300">See Less (Occasional)</span>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                        Downweights routine coverage, selecting only landmark breaking events, and tags articles with <strong className="text-rose-300 font-medium">Occasional</strong>.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Configured Topics List */}
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {topicPreferences.length === 0 ? (
                    <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 text-center">
                      <p className="text-xs text-slate-400">
                        No topic weights configured yet. All news will be synthesized with standard balanced coverage.
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Use the form below to add a topic like <span className="text-slate-400">"UK politics"</span>, <span className="text-slate-400">"European soccer"</span>, or <span className="text-slate-400">"Quebec and Montreal"</span>.
                      </p>
                    </div>
                  ) : (
                    topicPreferences.map((topic) => (
                      <div
                        key={topic.id}
                        className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs border transition ${
                          topic.enabled
                            ? 'bg-slate-800/80 border-slate-750'
                            : 'bg-slate-900/50 border-slate-850 opacity-60'
                        }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0 flex-1 mr-2">
                          <input
                            type="checkbox"
                            checked={topic.enabled}
                            onChange={() => handleToggleTopic(topic.id)}
                            className="w-4 h-4 text-indigo-600 bg-slate-900 border-slate-700 rounded focus:ring-indigo-500 cursor-pointer"
                            title={topic.enabled ? 'Pause topic weight' : 'Enable topic weight'}
                          />

                          <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-100 truncate text-xs">
                              {topic.topic}
                            </span>

                            {topic.weight === 'more' ? (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-950/90 text-emerald-300 border border-emerald-700/80">
                                <TrendingUp className="w-2.5 h-2.5 text-emerald-400" />
                                <span>See More &bull; Following</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-950/90 text-rose-300 border border-rose-700/80">
                                <SlidersHorizontal className="w-2.5 h-2.5 text-rose-400" />
                                <span>See Less &bull; Occasional</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleToggleTopicWeight(topic.id)}
                            className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 text-[11px] rounded-lg border border-slate-700 hover:border-slate-600 transition cursor-pointer whitespace-nowrap"
                            title="Flip weight between See More and See Less"
                          >
                            Switch to {topic.weight === 'more' ? 'See Less' : 'See More'}
                          </button>

                          <button
                            onClick={() => handleRemoveTopic(topic.id)}
                            className="text-slate-400 hover:text-red-400 p-1 rounded-lg transition cursor-pointer"
                            title="Delete topic"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add New Topic Form (Option A: Explicit More / Less Toggle Buttons, No Quick-Add Chips) */}
              <form onSubmit={handleAddTopic} className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold text-slate-300">Add Topic Weight</h4>

                {topicAddError && (
                  <p className="text-xs text-red-400 font-medium">{topicAddError}</p>
                )}
                {topicAddSuccess && (
                  <p className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{topicAddSuccess}</span>
                  </p>
                )}

                <div>
                  <input
                    type="text"
                    placeholder="Topic or subject (e.g. UK politics, European soccer, Quebec and Montreal)..."
                    value={newTopicText}
                    onChange={(e) => setNewTopicText(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-750 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Editorial Weight:
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewTopicWeight('more')}
                      className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                        newTopicWeight === 'more'
                          ? 'bg-emerald-600/90 hover:bg-emerald-600 text-white border-emerald-500 shadow-sm'
                          : 'bg-slate-900 text-slate-400 border-slate-750 hover:text-slate-200 hover:bg-slate-850'
                      }`}
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>See More (Following)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewTopicWeight('less')}
                      className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                        newTopicWeight === 'less'
                          ? 'bg-rose-600/90 hover:bg-rose-600 text-white border-rose-500 shadow-sm'
                          : 'bg-slate-900 text-slate-400 border-slate-750 hover:text-slate-200 hover:bg-slate-850'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>See Less (Occasional)</span>
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-xl text-xs transition flex items-center justify-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Topic Weight</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 4: PREFERENCES */}
          {activeTab === 'settings' && (
            <div className="space-y-5 text-xs text-slate-300">
              
              {/* User Google Account Section */}
              <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-3">
                <h4 className="font-bold text-slate-200 flex items-center space-x-2">
                  <UserIcon className="w-4 h-4 text-indigo-400" />
                  <span>Google Account & User Settings Sync</span>
                </h4>

                {user ? (
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3 p-3 bg-slate-900 border border-slate-800 rounded-xl">
                      {user.picture ? (
                        <img src={user.picture} alt={user.name} className="w-10 h-10 rounded-full ring-2 ring-indigo-500/50" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-100 text-sm truncate">{user.name}</p>
                        <p className="text-slate-400 text-xs truncate">{user.email}</p>
                      </div>
                      <div className="px-2.5 py-1 bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 rounded-lg text-[11px] font-semibold flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Active</span>
                      </div>
                    </div>

                    <p className="text-slate-400 text-xs leading-relaxed">
                      Your custom news sources, replacement anonymizer rules, image toggles, and timeframe preferences are automatically saved in the app's user store for <strong className="text-indigo-300">{user.email}</strong>.
                    </p>

                    <button
                      onClick={onLogout}
                      className="px-3 py-2 bg-slate-800 hover:bg-red-950/50 hover:text-red-300 hover:border-red-800/60 text-slate-300 border border-slate-700 rounded-xl font-medium transition cursor-pointer flex items-center space-x-1.5"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out ({user.email})</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-slate-400 text-xs leading-relaxed">
                      Sign in with your Google account to retain your exact selected feeds, rules, and preferences across mobile and desktop devices.
                    </p>

                    <div>
                      <button
                        onClick={onLogin}
                        className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-95 text-white text-xs font-bold rounded-xl transition shadow-md shadow-indigo-950/40 cursor-pointer flex items-center justify-center space-x-2"
                      >
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                        </svg>
                        <span>Sign In with Google</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-3">
                <h4 className="font-bold text-slate-200 flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Server Gemini AI Synthesizer Engine</span>
                </h4>
                <p className="text-slate-400 text-xs leading-relaxed">
                  The application uses server-side Gemini models (Gemini 3.5 Lite by default, with 3.1 Flash Lite as a second choice) via <code className="text-amber-300 font-mono">@google/genai</code> to intelligently merge multiple stories covering the same topic and rephrase forbidden entity citations.
                </p>
                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex items-center space-x-2 text-emerald-400">
                  <Check className="w-4 h-4" />
                  <span>Server Gemini API Key configured in Settings &gt; Secrets</span>
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-3">
                <h4 className="font-bold text-slate-200">Data & Cache Actions</h4>
                <div className="flex flex-wrap gap-2 pt-1">
                  {isRefreshing ? (
                    <button
                      onClick={onStopSync}
                      className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl font-semibold transition cursor-pointer flex items-center space-x-1.5 animate-pulse"
                    >
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-white animate-ping mr-0.5"></span>
                      <span>Stop Active Synthesis</span>
                    </button>
                  ) : (
                    <button
                      onClick={onTriggerResynthesize}
                      className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition cursor-pointer"
                    >
                      Re-Synthesize Current Feed
                    </button>
                  )}

                  <button
                    onClick={onResetDefaults}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium border border-slate-700 flex items-center space-x-1 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Sources & Rules</span>
                  </button>

                  <button
                    onClick={handleSaveAsDefaultSettings}
                    className="px-3 py-2 bg-purple-900/60 hover:bg-purple-800/80 text-purple-200 hover:text-white rounded-xl font-medium border border-purple-700/60 transition cursor-pointer flex items-center space-x-1"
                    title="Save current news sources & rules as global default_settings in Firestore for all new users"
                  >
                    <span>{saveDefaultSuccess ? 'Saved as Global Defaults!' : 'Save as Global Defaults'}</span>
                  </button>

                  <button
                    onClick={onClearCache}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-red-300 hover:text-red-200 rounded-xl font-medium border border-slate-700 transition cursor-pointer"
                  >
                    Clear Local Storage
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <p className="text-[11px] text-slate-500">
            {user
              ? `Changes are saved automatically to your Google account (${user.email}).`
              : 'Changes are saved automatically to browser storage.'}
          </p>
          {isRefreshing ? (
            <button
              onClick={onStopSync}
              className="bg-red-600 hover:bg-red-500 text-white font-medium px-4 py-2 rounded-xl text-xs transition shadow cursor-pointer"
            >
              Stop Synthesis & Close
            </button>
          ) : (
            <button
              onClick={() => {
                onClose();
                onTriggerResynthesize();
              }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-xl text-xs transition shadow cursor-pointer"
            >
              Apply & Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
