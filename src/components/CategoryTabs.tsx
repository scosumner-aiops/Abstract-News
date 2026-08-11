import React from 'react';
import { Tag, Globe, Cpu, Briefcase, Flame, Layers } from 'lucide-react';

interface CategoryTabsProps {
  tags: string[];
  activeTab: string;
  onSelectTab: (tag: string) => void;
  sourceCountsByTag: Record<string, number>;
}

export const CategoryTabs: React.FC<CategoryTabsProps> = ({
  tags,
  activeTab,
  onSelectTab,
  sourceCountsByTag,
}) => {
  if (tags.length === 0) return null;

  // Icon mapping helper for common tags
  const getTabIcon = (tag: string) => {
    const lower = tag.toLowerCase();
    if (lower === 'all') return <Layers className="w-3.5 h-3.5" />;
    if (lower.includes('head') || lower.includes('top')) return <Flame className="w-3.5 h-3.5" />;
    if (lower.includes('tech')) return <Cpu className="w-3.5 h-3.5" />;
    if (lower.includes('world') || lower.includes('global') || lower.includes('intl')) return <Globe className="w-3.5 h-3.5" />;
    if (lower.includes('biz') || lower.includes('business') || lower.includes('finance')) return <Briefcase className="w-3.5 h-3.5" />;
    return <Tag className="w-3.5 h-3.5" />;
  };

  return (
    <div className="w-full mb-5 overflow-x-auto no-scrollbar">
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 min-w-max">
        {tags.map((tag) => {
          const isActive = activeTab === tag;
          const count = sourceCountsByTag[tag];

          return (
            <button
              key={tag}
              onClick={() => onSelectTab(tag)}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer active:scale-95 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40 border border-indigo-500'
                  : 'bg-slate-800/80 hover:bg-slate-750 text-slate-300 border border-slate-700/80 hover:text-white'
              }`}
            >
              <span className={isActive ? 'text-indigo-200' : 'text-slate-400'}>
                {getTabIcon(tag)}
              </span>
              <span>{tag}</span>
              {count !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive
                      ? 'bg-indigo-700/80 text-indigo-100'
                      : 'bg-slate-900/80 text-slate-400 border border-slate-800'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
