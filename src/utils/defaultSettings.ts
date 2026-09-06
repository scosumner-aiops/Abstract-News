import { NewsSource, ReplacementRule, TopicPreference } from '../types';

export const DEFAULT_SOURCES: NewsSource[] = [
  {
    id: 'globo-g1',
    name: 'Globo (G1)',
    url: 'https://g1.globo.com/rss/g1/',
    enabled: true,
    tags: ['Headlines', 'World'],
  },
  {
    id: 'the-guardian',
    name: 'The Guardian',
    url: 'https://www.theguardian.com/world/rss',
    enabled: true,
    tags: ['Headlines', 'World'],
  },
  {
    id: 'reuters',
    name: 'Reuters',
    url: 'https://reuters.com',
    enabled: true,
    tags: ['Headlines', 'World', 'Business'],
  },
  {
    id: 'al-jazeera',
    name: 'Al Jazeera English',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    enabled: true,
    tags: ['Headlines', 'World'],
  },
  {
    id: 'associated-press',
    name: 'Associated Press',
    url: 'https://apnews.com',
    enabled: true,
    tags: ['Headlines', 'World'],
  },
  {
    id: 'deutsche-welle',
    name: 'Deutsche Welle (DW)',
    url: 'https://rss.dw.com/xml/rss-en-all',
    enabled: true,
    tags: ['Headlines', 'World'],
  },
  {
    id: 'france-24',
    name: 'France 24',
    url: 'https://www.france24.com/en/rss',
    enabled: true,
    tags: ['Headlines', 'World'],
  },
  {
    id: 'the-independent',
    name: 'The Independent',
    url: 'https://www.independent.co.uk/news/rss',
    enabled: true,
    tags: ['Headlines', 'World'],
  },
  {
    id: 'la-presse',
    name: 'La Presse',
    url: 'https://www.lapresse.ca/actualites/rss',
    enabled: true,
    tags: ['Headlines', 'World'],
  },
  {
    id: 'global-news',
    name: 'Global News Canada',
    url: 'https://globalnews.ca/feed/',
    enabled: true,
    tags: ['Headlines', 'World'],
  },
  {
    id: 'cbc-news',
    name: 'CBC News',
    url: 'https://www.cbc.ca/cmlink/rss-topstories',
    enabled: true,
    tags: ['Headlines', 'World'],
  },
  {
    id: 'national-post',
    name: 'National Post',
    url: 'https://nationalpost.com/category/news/feed',
    enabled: true,
    tags: ['Headlines', 'World'],
  },
  {
    id: 'montreal-gazette',
    name: 'Montreal Gazette',
    url: 'https://news.google.com/rss/search?q=site:montrealgazette.com&hl=en-CA&gl=CA&ceid=CA:en',
    enabled: true,
    tags: ['Headlines', 'World'],
  },
];

export const DEFAULT_RULES: ReplacementRule[] = [
  {
    id: 'rule-1',
    term: 'Doug Ford',
    replacement: 'the premier of Ontario',
    enabled: true,
  },
  {
    id: 'rule-2',
    term: 'Tesla',
    replacement: 'a leading U.S. electric automaker',
    enabled: true,
  },
  {
    id: 'rule-3',
    term: 'Donald Trump',
    replacement: 'the U.S. president',
    enabled: true,
  },
  {
    id: 'rule-4',
    term: 'Elon Musk',
    replacement: 'a prominent tech mogul',
    enabled: true,
  },
];

export const DEFAULT_TOPIC_PREFERENCES: TopicPreference[] = [];

