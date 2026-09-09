import React, { useState } from 'react';
import { Layers, Clock, ExternalLink, Tag, Plus, Minus, BookOpen, TrendingUp, SlidersHorizontal } from 'lucide-react';
import { ReplacementRule, SynthesizedArticle } from '../types';
import { ImageCarousel } from './ImageCarousel';
import { stripHtml, formatConciseSummary, ensureParagraphBreaks, sanitizeArticleDetailsParagraphs, stripPublisherSuffix, stripEditorialPrefixes } from '../utils/rss';

interface ArticleCardProps {
  article: SynthesizedArticle;
  index: number;
  showImages?: boolean;
  rules?: ReplacementRule[];
}

export const ArticleCard: React.FC<ArticleCardProps> = ({
  article,
  index,
  showImages = true,
  rules = [],
}) => {
  const [showSources, setShowSources] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const getRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 5) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      return `${diffDays}d ago`;
    } catch {
      return 'Recently';
    }
  };

  const cleanTitle = stripPublisherSuffix(stripEditorialPrefixes(stripHtml(article.title)));
  const cleanSummary = formatConciseSummary(article.summary, cleanTitle);
  const rawDetails = article.fullDetails || '';
  const detailsParagraphs = sanitizeArticleDetailsParagraphs(rawDetails, cleanTitle, cleanSummary);
  const displaySummary = cleanSummary || (detailsParagraphs.length > 0 ? detailsParagraphs[0] : '');
  const displayDetails = cleanSummary ? detailsParagraphs : detailsParagraphs.slice(1);

  return (
    <article className="bg-slate-800/50 hover:bg-slate-800/70 border border-slate-800 hover:border-slate-700/80 transition-all duration-200 rounded-2xl p-5 shadow-lg flex flex-col justify-between group">
      <div>
        {/* Top Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          
          {/* Source Tags */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-indigo-400 bg-indigo-950/80 border border-indigo-800/60 px-2 py-0.5 rounded-md font-mono">
              #{index + 1}
            </span>

            {article.sources.map((source, sIdx) => (
              <span
                key={sIdx}
                className="bg-slate-900/90 text-slate-300 font-medium px-2 py-0.5 rounded-md text-[11px] tracking-tight border border-slate-700/80 shadow-xs"
              >
                {source}
              </span>
            ))}

            {article.articleCount > 1 && (
              <span className="inline-flex items-center space-x-1 text-[11px] font-semibold text-emerald-300 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-md">
                <Layers className="w-3 h-3 text-emerald-400" />
                <span>Combined {article.articleCount} feeds</span>
              </span>
            )}

            {article.topicTag === 'Following' && (
              <span
                className="inline-flex items-center space-x-1 text-[11px] font-semibold text-emerald-300 bg-emerald-950/90 border border-emerald-700/80 px-2 py-0.5 rounded-md shadow-xs"
                title={article.matchedTopic ? `Following boosted topic: ${article.matchedTopic}` : 'Following boosted topic'}
              >
                <TrendingUp className="w-3 h-3 text-emerald-400" />
                <span>Following{article.matchedTopic ? `: ${article.matchedTopic}` : ''}</span>
              </span>
            )}

            {article.topicTag === 'Occasional' && (
              <span
                className="inline-flex items-center space-x-1 text-[11px] font-semibold text-amber-300 bg-amber-950/90 border border-amber-700/80 px-2 py-0.5 rounded-md shadow-xs"
                title={article.matchedTopic ? `Occasional de-prioritized topic: ${article.matchedTopic}` : 'Occasional de-prioritized topic'}
              >
                <SlidersHorizontal className="w-3 h-3 text-amber-400" />
                <span>Occasional{article.matchedTopic ? `: ${article.matchedTopic}` : ''}</span>
              </span>
            )}
          </div>

          {/* Time & Category */}
          <div className="flex items-center space-x-2 text-xs text-slate-400">
            {article.category && (
              <span className="inline-flex items-center text-[11px] text-slate-400">
                <Tag className="w-3 h-3 mr-1 text-slate-500" />
                {article.category}
              </span>
            )}
            <span className="flex items-center text-slate-400">
              <Clock className="w-3 h-3 mr-1 text-slate-500" />
              {getRelativeTime(article.timestamp)}
            </span>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-lg sm:text-xl font-bold text-slate-100 group-hover:text-indigo-200 transition leading-snug tracking-tight mb-2">
          {cleanTitle}
        </h2>

        {/* Content & Media Layout: Stacked on small screens, Side-by-Side (Image on Right) on Desktop */}
        <div className="flex flex-col md:flex-row md:items-start md:gap-5 mt-2.5">
          {/* Image Carousel / Media (Top of Story on Mobile, Right Column on Desktop) */}
          {showImages && article.images && article.images.length > 0 && (
            <ImageCarousel
              images={article.images}
              articleTitle={cleanTitle}
              articleSummary={cleanSummary}
              showImages={showImages}
              rules={rules}
            />
          )}

          {/* Story Text & Details Column */}
          <div className="flex-1 min-w-0 md:order-1">
            {/* Summary Content */}
            {displaySummary && (
              <p className="text-sm sm:text-[15px] text-slate-300 leading-relaxed font-normal">
                {displaySummary}
              </p>
            )}

            {/* Expandable Full Article Details */}
            {isExpanded && (
              <div className="mt-4 pt-3.5 border-t border-slate-700/60 bg-slate-900/60 rounded-xl p-4 space-y-3 border border-slate-800 animate-in fade-in duration-200">
                <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-xs uppercase tracking-wider">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Additional Coverage</span>
                </div>
                <div className="space-y-2.5 text-slate-200 text-sm leading-relaxed font-normal">
                  {displayDetails.length > 0 ? (
                    displayDetails.map((paragraph, pIdx) => (
                      <p key={pIdx} className="text-slate-300">
                        {paragraph}
                      </p>
                    ))
                  ) : (
                    <p className="text-slate-400 italic text-xs">
                      No additional context reported beyond the main summary above. Refer to original source links for full coverage.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Expand / Read More Button */}
            <div className="mt-3 flex items-center justify-start">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/70 hover:bg-indigo-900/90 text-indigo-300 hover:text-indigo-100 border border-indigo-800/60 transition text-xs font-semibold cursor-pointer active:scale-95"
                title={isExpanded ? 'Show less' : 'Show more'}
              >
                {isExpanded ? (
                  <>
                    <Minus className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Show Less</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Show More</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions & Source Links */}
      <div className="mt-4 pt-3.5 border-t border-slate-750 flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={() => setShowSources(!showSources)}
          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center space-x-1 cursor-pointer transition"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>{showSources ? 'Hide Original Links' : `Original Sources (${article.sourceLinks.length})`}</span>
        </button>
      </div>

      {/* Expandable Original Source Links */}
      {showSources && (
        <div className="mt-3 p-3 bg-slate-900/90 border border-slate-750 rounded-xl space-y-2 text-xs">
          <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
            Direct Publisher Links
          </p>
          <div className="space-y-1.5">
            {article.sourceLinks.map((link, lIdx) => (
              <a
                key={lIdx}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between text-indigo-300 hover:text-indigo-200 transition hover:underline group/link"
              >
                <span className="font-medium truncate pr-2">{link.name} — Headline Article</span>
                <ExternalLink className="w-3 h-3 text-slate-500 group-hover/link:text-indigo-300 flex-shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}
    </article>
  );
};
