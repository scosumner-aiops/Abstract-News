import React from 'react';

export const ArticleSkeleton: React.FC = () => {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className="bg-slate-800/40 border border-slate-800 rounded-2xl p-5 space-y-3 animate-pulse"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-12 h-5 bg-slate-700/60 rounded-md"></div>
              <div className="w-20 h-5 bg-slate-700/60 rounded-md"></div>
            </div>
            <div className="w-16 h-4 bg-slate-700/50 rounded"></div>
          </div>
          <div className="w-3/4 h-6 bg-slate-700/80 rounded-lg"></div>
          <div className="w-full h-44 bg-slate-700/40 rounded-xl"></div>
          <div className="space-y-2">
            <div className="w-full h-4 bg-slate-700/60 rounded"></div>
            <div className="w-5/6 h-4 bg-slate-700/60 rounded"></div>
            <div className="w-2/3 h-4 bg-slate-700/60 rounded"></div>
          </div>
        </div>
      ))}
    </div>
  );
};
