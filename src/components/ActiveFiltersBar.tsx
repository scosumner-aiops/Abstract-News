import React from 'react';
import { ShieldCheck, Plus, X } from 'lucide-react';
import { ReplacementRule } from '../types';

interface ActiveFiltersBarProps {
  rules: ReplacementRule[];
  onOpenConfig: () => void;
  onRemoveRule: (id: string) => void;
}

export const ActiveFiltersBar: React.FC<ActiveFiltersBarProps> = ({
  rules,
  onOpenConfig,
  onRemoveRule,
}) => {
  const activeRules = rules.filter((r) => r.enabled);

  return (
    <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-3 mb-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Active Citation Filters ({activeRules.length})</span>
        </div>

        <button
          onClick={onOpenConfig}
          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center space-x-1 cursor-pointer transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add / Manage Rules</span>
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2 items-center">
        {activeRules.length === 0 ? (
          <p className="text-xs text-slate-500 italic">
            No citation replacement filters active. All terms and names will be cited directly.
          </p>
        ) : (
          activeRules.map((rule) => (
            <div
              key={rule.id}
              className="group inline-flex items-center space-x-1.5 bg-indigo-950/60 border border-indigo-800/60 text-indigo-200 px-2.5 py-1 rounded-lg text-xs font-mono shadow-sm transition hover:border-indigo-600"
            >
              <span className="font-semibold text-white">{rule.term}</span>
              <span className="text-indigo-400 text-[10px]">&rarr;</span>
              <span className="text-indigo-300 truncate max-w-[150px]">
                {rule.replacement || '(omitted)'}
              </span>
              <button
                onClick={() => onRemoveRule(rule.id)}
                className="text-indigo-400 hover:text-red-400 ml-1 p-0.5 rounded transition cursor-pointer"
                title={`Remove filter for "${rule.term}"`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
