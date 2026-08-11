export interface NewsSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  tags?: string[];
  lastFetched?: string;
  error?: string;
}

export interface ReplacementRule {
  id: string;
  term: string;
  replacement: string;
  enabled: boolean;
}

export interface RawNewsItem {
  id: string;
  title: string;
  description: string;
  link: string;
  pubDate: string;
  sourceName: string;
  sourceUrl: string;
  images: string[];
}

export interface SourceLink {
  name: string;
  url: string;
}

export interface SynthesizedArticle {
  id: string;
  title: string;
  summary: string;
  fullDetails?: string;
  sources: string[];
  sourceLinks: SourceLink[];
  images: string[];
  timestamp: string;
  articleCount: number;
  category?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
  token?: string;
}

export interface UserSettings {
  sources: NewsSource[];
  rules: ReplacementRule[];
  timeframeValue: string;
  showImages: boolean;
  selectedModel?: string;
  updatedAt?: string;
}

export interface SynthesisRequest {
  items: RawNewsItem[];
  rules: ReplacementRule[];
  timeframeHours: number;
  selectedModel?: string;
}

export interface SynthesisResponse {
  articles: SynthesizedArticle[];
  isAI: boolean;
  timestamp: string;
  error?: string;
}
