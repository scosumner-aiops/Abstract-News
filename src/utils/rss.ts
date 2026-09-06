import { RawNewsItem, ReplacementRule, SynthesizedArticle, TopicPreference } from '../types';

/**
 * Extracts image URLs from article HTML content (OpenGraph, Twitter card, or <img> tags)
 */
export function extractImagesFromArticleHtml(html: string, pageUrl: string): string[] {
  if (!html) return [];
  const images: string[] = [];

  const addImage = (rawUrl: string) => {
    if (!rawUrl) return;
    try {
      const cleanUrl = rawUrl.replace(/&amp;/g, '&').trim();
      let resolved = cleanUrl;
      if (cleanUrl.startsWith('//')) {
        resolved = 'https:' + cleanUrl;
      } else if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        resolved = new URL(cleanUrl, pageUrl).toString();
      }
      if ((resolved.startsWith('http://') || resolved.startsWith('https://')) && !images.includes(resolved)) {
        images.push(resolved);
      }
    } catch {
      // ignore invalid URL
    }
  };

  // 1. Meta OpenGraph images
  const ogMatches = [
    ...html.matchAll(/<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/gi),
    ...html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["']/gi),
  ];
  for (const match of ogMatches) {
    addImage(match[1]);
  }

  // 2. Meta Twitter images
  const twMatches = [
    ...html.matchAll(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/gi),
    ...html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/gi),
  ];
  for (const match of twMatches) {
    addImage(match[1]);
  }

  // 3. Link rel="image_src"
  const linkMatches = html.matchAll(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/gi);
  for (const match of linkMatches) {
    addImage(match[1]);
  }

  // 4. Primary article image tags
  const articleMatch =
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
    html.match(/<div[^>]*class=["'][^"']*(?:article|story|post|entry|content|body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const container = articleMatch ? articleMatch[1] : html;

  const imgMatches = container.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi);
  for (const match of imgMatches) {
    addImage(match[1]);
  }

  const excludeKeywords = [
    'pixel', 'avatar', 'badge', '1x1', 'favicon', 'tracking', 'spacer',
    'ad.doubleclick', 'logo', 'footer', 'social', 'sprite', 'icon', 'button'
  ];

  return images.filter(url => {
    const lower = url.toLowerCase();
    return !excludeKeywords.some(k => lower.includes(k));
  });
}

/**
 * Extracts image URLs from raw RSS item string or XML node
 */
export function extractImagesFromItemXml(itemXml: string): string[] {
  const images: string[] = [];

  const addImage = (url: string) => {
    if (!url) return;
    const cleanUrl = url.replace(/&amp;/g, '&').trim();
    if ((cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) && !images.includes(cleanUrl)) {
      images.push(cleanUrl);
    }
  };

  // 1. Check media:content, media:thumbnail, media:group tags
  const mediaMatches = itemXml.matchAll(/<media:(?:content|thumbnail|group)[\s\S]*?>/gi);
  for (const match of mediaMatches) {
    const tag = match[0];
    const urlMatch = tag.match(/url=["']([^"']+)["']/i);
    if (urlMatch) {
      addImage(urlMatch[1]);
    }
  }

  // 2. Check enclosure or atom:link url/href="..."
  const enclosureMatches = itemXml.matchAll(/<(?:enclosure|atom:link)[^>]+(?:url|href)=["']([^"']+)["'][^>]*>/gi);
  for (const match of enclosureMatches) {
    addImage(match[1]);
  }

  // 3. Check <img> tags inside description or content
  const imgMatches = itemXml.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi);
  for (const match of imgMatches) {
    addImage(match[1]);
  }

  // 4. Fallback: match general image URLs in the XML string
  const rawUrlMatches = itemXml.matchAll(/(https?:\/\/[^\s"']+\.(?:png|jpg|jpeg|webp|gif)(?:\?[^\s"']*)?)/gi);
  for (const match of rawUrlMatches) {
    addImage(match[1]);
  }

  const excludeKeywords = ['pixel', 'avatar', 'badge', '1x1', 'favicon', 'tracking', 'spacer', 'ad.doubleclick', 'logo', 'footer', 'icon'];

  return images.filter(url => {
    const lower = url.toLowerCase();
    return !excludeKeywords.some(k => lower.includes(k));
  });
}

/**
 * Decodes numeric and named HTML entities into clean characters
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  let text = str;

  for (let i = 0; i < 3; i++) {
    const prev = text;

    // Decode basic XML/HTML entities first so nested &amp;#8217; becomes &#8217;
    text = text
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&#39;/gi, "'")
      .replace(/&nbsp;/gi, ' ');

    // Unescape numeric entities (decimal &#8217; and hex &#x2019;)
    text = text.replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return _;
      }
    });

    text = text.replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return _;
      }
    });

    const entityMap: Record<string, string> = {
      '&rsquo;': "'",
      '&lsquo;': "'",
      '&rdquo;': '"',
      '&ldquo;': '"',
      '&hellip;': '...',
      '&mdash;': '—',
      '&ndash;': '–',
      '&trade;': '™',
      '&reg;': '®',
      '&copy;': '©',
    };

    for (const [entity, replacement] of Object.entries(entityMap)) {
      text = text.replace(new RegExp(entity, 'gi'), replacement);
    }

    if (text === prev) break;
  }

  // Strip WordPress RSS footer boilerplates like "[...]", "[&#8230;]", and "The post ... appeared first on ..."
  text = text
    .replace(/\[\s*\u2026\s*\]|\[\s*\.\.\.\s*\]|\[\s*&#\d+;\s*\]/gi, '')
    .replace(/\s*The post\s+[\s\S]*?\s+appeared first on\s+[\s\S]*?\./gi, '')
    .replace(/\s*The post\s+[\s\S]*?\s+appeared first on\s+[\s\S]*/gi, '');

  return text;
}

/**
 * Strips media/audio player notices, video player JavaScript warnings, and media boilerplate
 */
export function cleanMediaAudioVideoJunk(str: string): string {
  if (!str) return '';
  let cleaned = str;

  // 1. Audio Player Disclaimers (CBC, BBC, etc.)
  cleaned = cleaned.replace(/Listen to this article[\s\S]*?(?:improve the results|mispronunciations can occur|technology|partners|\.|\n|$)/gi, '');
  cleaned = cleaned.replace(/The audio version of this article is generated by AI-based technology[\s\S]*?(?:improve the results|mispronunciations can occur|results|\.|\n|$)/gi, '');
  cleaned = cleaned.replace(/Mispronunciations can occur\.?\s*We are working with our partners to continually review and improve the results\.?/gi, '');
  cleaned = cleaned.replace(/We are working with our partners to continually review and improve the results\.?/gi, '');

  // 2. Video Player JavaScript Warnings (BBC, CNN, etc.)
  cleaned = cleaned.replace(/To play this (?:video|audio) you need to enable JavaScript in your browser\.?/gi, '');
  cleaned = cleaned.replace(/To play this (?:video|audio) please enable JavaScript in your browser\.?/gi, '');
  cleaned = cleaned.replace(/You need to enable JavaScript in your browser\.?/gi, '');
  cleaned = cleaned.replace(/Please enable JavaScript in your browser\.?/gi, '');
  cleaned = cleaned.replace(/JavaScript is disabled in your browser\.?/gi, '');

  // 3. General audio/video boilerplate phrases
  cleaned = cleaned.replace(/Estimated \d+ minutes?/gi, '');
  cleaned = cleaned.replace(/Listen to this article/gi, '');

  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Strips raw HTML tags and unescapes HTML entities, converting block tags to clean newlines
 */
export function stripHtml(str: string): string {
  if (!str) return '';

  let text = str;

  // 1. Strip script, style, noscript tags and comments completely including their internal contents
  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // 2. Convert closing paragraph/div/list tags or breaks to newlines
  text = text
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/gi, ' ');

  // 3. Decode HTML entities
  for (let i = 0; i < 2; i++) {
    text = decodeHtmlEntities(text);
  }

  // 4. Strip boilerplate RSS footer links & JSON/Schema artifacts & media player junk
  text = text
    .replace(/\b(continue reading|read more|full story)\b\.*/gi, '')
    .replace(/"@type"\s*:\s*"[^"]*"/gi, '')
    .replace(/"Headline"\s*:\s*"/gi, '')
    .replace(/"Description"\s*:\s*"/gi, '')
    .replace(/\{\s*"@context"[\s\S]*?\}/gi, '')
    .replace(/Org\/[a-z0-9\-_\/]+["'\s\}]*/gi, '');

  text = cleanMediaAudioVideoJunk(text);

  // Split lines, clean inline whitespace, filter empty lines, join back with clean paragraph spacing
  const lines = text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);

  return lines.join('\n\n');
}

/**
 * Safely splits text into sentences without breaking on abbreviations or acronyms (e.g., U.S., U.K., Mr., Dr., etc.)
 */
export function splitIntoSentences(text: string): string[] {
  if (!text) return [];

  // Protect decimal numbers (e.g. 22.8, 3.14, 0.5) so periods inside numbers are not treated as sentence ends
  let protectedText = text.replace(/(\d+)\.(\d+)/g, '$1___DOT___$2');

  // Protect multi-dot acronyms (e.g. U.S., U.K., E.U., U.N., D.C., A.M., P.M., Ph.D., i.e., e.g.)
  protectedText = protectedText.replace(/\b(?:[A-Za-z]\.){2,}/gi, (match) => {
    return match.replace(/\./g, '___DOT___');
  });

  // Protect common title & word abbreviations (case-insensitive)
  const abbrRegex = /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|Sen|Rep|Gov|Gen|Col|Maj|Capt|St|Inc|Ltd|Co|Corp|vs|etc|No|Vol|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\./gi;
  protectedText = protectedText.replace(abbrRegex, (match) => match.replace(/\./g, '___DOT___'));

  // Protect single-letter initials or abbreviations (e.g. "John F. Kennedy", "S. and other", or "U.S.")
  protectedText = protectedText.replace(/\b([A-Za-z])\./g, '$1___DOT___');

  // Clean up any stray spaces before punctuation (e.g., "to do . " -> "to do.")
  protectedText = protectedText.replace(/\s+([.,!?])/g, '$1');

  const matches = protectedText.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  if (!matches || matches.length === 0) {
    return [protectedText.replace(/___DOT___/g, '.').trim()];
  }

  return matches.map((s) => s.replace(/___DOT___/g, '.').trim()).filter(Boolean);
}

/**
 * Ensures that the first character of every sentence, paragraph, line, title, or quote start is capitalized,
 * while safely ignoring periods in acronyms and abbreviations (e.g., U.S., U.K., Dr., Mr., etc.).
 */
export function fixSentenceStartCapitalization(text: string): string {
  if (!text) return '';

  // 1. Protect decimal numbers and multi-dot acronyms
  let protectedText = text.replace(/(\d+)\.(\d+)/g, '$1___DOT___$2');

  protectedText = protectedText.replace(/\b(?:[A-Za-z]\.){2,}/gi, (match) => {
    return match.replace(/\./g, '___DOT___');
  });

  const abbrRegex = /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|Sen|Rep|Gov|Gen|Col|Maj|Capt|St|Inc|Ltd|Co|Corp|vs|etc|No|Vol|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\./gi;
  protectedText = protectedText.replace(abbrRegex, (match) => match.replace(/\./g, '___DOT___'));

  // Protect single-letter initials/abbreviations (e.g. "John F. Kennedy", "S.", "U.S.")
  protectedText = protectedText.replace(/\b([A-Za-z])\./g, '$1___DOT___');

  // 2. Capitalize initial letters at the start of string, after punctuation (. ! ? : \n \r), or after quotes/brackets
  let capitalized = protectedText.replace(/(^|[\.\!\?\n\r:]+\s*["'“‘\(\[]*|<[^>]+>\s*)([a-z])/g, (match, p1, p2) => {
    return p1 + p2.toUpperCase();
  });

  // 3. Unprotect acronyms/abbreviations/decimal numbers
  return capitalized.replace(/___DOT___/g, '.');
}

/**
 * Cleans up grammatical and readability glitches from anonymizer replacements,
 * such as duplicate titles ("U.S. president the U.S. president"),
 * ungrammatical noun adjuncts ("U.S. president Administration" -> "The U.S. administration"),
 * double articles ("the the", "a a"), and missing articles for bare singular titles.
 */
export function cleanCitationGrammarGlitches(text: string): string {
  if (!text) return '';
  let res = text;

  // 1. Redundant / duplicate title sequences (e.g. "U.S. president the U.S. president", "President the U.S. president")
  res = res.replace(
    /\b(?:(?:the|The)\s+)?(?:u\.s\.\s+|us\s+|united\s+states\s+)?president\s+(?:the\s+)?(?:u\.s\.\s+|us\s+|united\s+states\s+)?president\b/gi,
    'the U.S. president'
  );
  res = res.replace(/\b(?:(?:the|The)\s+)?president\s+the\s+U\.S\.\s+president\b/gi, 'the U.S. president');
  res = res.replace(/\b(?:(?:the|The)\s+)?(?:ontario\s+)?premier\s+(?:the\s+)?(?:ontario\s+)?premier\b/gi, 'the premier');
  res = res.replace(/\b(?:(?:the|The)\s+)?prime\s+minister\s+(?:the\s+)?prime\s+minister\b/gi, 'the prime minister');
  res = res.replace(/\b(?:(?:the|The)\s+)?(?:ceo|chief\s+executive)\s+(?:the\s+)?(?:ceo|chief\s+executive)\b/gi, 'the chief executive');

  // 2. Noun adjunct glitches (e.g. "U.S. president Administration", "the U.S. president Administration")
  res = res.replace(/\b(?:the\s+)?(?:u\.s\.\s+|us\s+|united\s+states\s+)?president\s+(?:Administration|administration)\b/gi, 'the U.S. administration');
  res = res.replace(/\b(?:the\s+)?(?:u\.s\.\s+|us\s+|united\s+states\s+)?president\s+campaign\b/gi, 'the presidential campaign');
  res = res.replace(/\b(?:the\s+)?(?:u\.s\.\s+|us\s+|united\s+states\s+)?president\s+cabinet\b/gi, 'the presidential cabinet');
  res = res.replace(/\b(?:the\s+)?(?:u\.s\.\s+|us\s+|united\s+states\s+)?president\s+officials\b/gi, 'U.S. administration officials');
  res = res.replace(
    /\b(?:the\s+)?(?:u\.s\.\s+|us\s+|united\s+states\s+)?president\s+(team|transition\s+team|aides|advisers|advisors|allies|policies|policy|doctrine|orders?|lawyers|attorneys|spokesperson|spokespeople|spokesman|spokeswoman)\b/gi,
    "the U.S. president's $1"
  );

  // 3. Premier / Prime Minister / Leader noun adjunct glitches (e.g. "the premier government", "the premier policies")
  res = res.replace(/\b(?:the\s+)?(?:ontario\s+)?premier\s+(government|cabinet|team|officials|policies|policy)\b/gi, "the premier's $1");
  res = res.replace(/\b(?:the\s+)?prime\s+minister\s+(government|cabinet|team|officials|policies|policy)\b/gi, "the prime minister's $1");

  // 4. Double / clashing determiners (e.g. "the the", "a a", "the a", "a the")
  res = res.replace(/\b(the|The)\s+(?:the|The)\b/g, '$1');
  res = res.replace(/\b(a|A)\s+(?:a|A)\b/g, '$1');
  res = res.replace(/\b(an|An)\s+(?:an|An)\b/g, '$1');
  res = res.replace(/\b(?:the|The)\s+(?:a|an)\b/g, 'the');
  res = res.replace(/\b(?:a|A)\s+the\b/g, 'the');

  // 5. Bare singular titles at sentence start or start of string missing article "The"
  // E.g. "U.S. president took to social media...", "U.S. president signed...", "U.S. administration moves..."
  res = res.replace(
    /(^|[\.\!\?\n\r:]+\s*["'“‘\(\[]*)U\.S\.\s+president\s+(took|said|announced|stated|signed|met|spoke|visited|declared|posted|criticized|praised|defended|warned|threatened|called|vowed|issued|nominated|appointed|ordered|arrived|rejected|urged|approved|attended|headed|hosted|confirmed|traveled|faces|signals|moves)\b/gi,
    (match, prefix, verb) => `${prefix}The U.S. president ${verb}`
  );
  res = res.replace(/(^|[\.\!\?\n\r:]+\s*["'“‘\(\[]*)U\.S\.\s+administration\b/gi, (match, prefix) => `${prefix}The U.S. administration`);

  // 6. Sentence start capitalization
  return fixSentenceStartCapitalization(res.trim());
}

/**
 * Formats text into a concise, punchy 1-2 sentence summary (max ~280 chars)
 */
export function formatConciseSummary(str: string): string {
  if (!str) return '';
  const clean = cleanCitationGrammarGlitches(cleanLiveblogAndRoundupArtifacts(stripHtml(str).replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()));
  if (!clean) return '';

  let summary = clean;
  const sentences = splitIntoSentences(clean);
  if (sentences && sentences.length > 0) {
    let result = '';
    for (let i = 0; i < Math.min(sentences.length, 2); i++) {
      const nextSentence = sentences[i];
      if ((result + ' ' + nextSentence).trim().length > 280 && i >= 1) {
        break;
      }
      result = (result + ' ' + nextSentence).trim();
    }
    if (result.length >= 20) summary = result;
  } else if (clean.length > 280) {
    const sub = clean.substring(0, 275);
    const lastSpace = sub.lastIndexOf(' ');
    summary = (lastSpace > 120 ? sub.substring(0, lastSpace) : sub) + '...';
  }

  return cleanCitationGrammarGlitches(fixSentenceStartCapitalization(summary));
}

/**
 * Breaks long unformatted text into clean, structured paragraphs with natural line breaks
 */
export function ensureParagraphBreaks(str: string): string[] {
  if (!str) return [];
  const clean = stripHtml(str);

  const rawBlocks = clean
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const paragraphs: string[] = [];

  for (const block of rawBlocks) {
    // If block is reasonably sized (<= 320 characters), keep as single paragraph
    if (block.length <= 320) {
      paragraphs.push(fixSentenceStartCapitalization(block));
      continue;
    }

    // Split long wall of text into 2-3 sentence paragraph blocks safely
    const sentences = splitIntoSentences(block);
    let chunk = '';
    let count = 0;

    for (const sentence of sentences) {
      chunk = (chunk + ' ' + sentence).trim();
      count++;

      if (count >= 3 || chunk.length >= 280) {
        paragraphs.push(fixSentenceStartCapitalization(chunk));
        chunk = '';
        count = 0;
      }
    }

    if (chunk.length > 0) {
      paragraphs.push(fixSentenceStartCapitalization(chunk));
    }
  }

  return paragraphs;
}

/**
 * Parse raw RSS XML text into RawNewsItem list using regex (environment agnostic)
 */
export function parseRssXml(xmlText: string, sourceName: string, sourceUrl: string): RawNewsItem[] {
  const items: RawNewsItem[] = [];
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  const matches = xmlText.match(itemRegex) || [];

  matches.forEach((itemXml, index) => {
    const getTag = (tag: string) => {
      const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
      const cdataMatch = itemXml.match(cdataRegex);
      if (cdataMatch) return cdataMatch[1].trim();

      const simpleRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const simpleMatch = itemXml.match(simpleRegex);
      if (simpleMatch) return simpleMatch[1].trim();

      return '';
    };

    const titleRaw = getTag('title');
    
    // Evaluate all content candidates to find the richest full article body
    const descCandidates = [
      getTag('content:encoded'),
      getTag('content'),
      getTag('fulltext'),
      getTag('description'),
      getTag('summary'),
    ].filter(Boolean);

    let descRaw = descCandidates[0] || '';
    let maxLen = stripHtml(descRaw).length;
    for (const cand of descCandidates) {
      const cleanLen = stripHtml(cand).length;
      if (cleanLen > maxLen) {
        maxLen = cleanLen;
        descRaw = cand;
      }
    }

    const linkRaw = getTag('link');
    const pubDateRaw = getTag('pubDate') || getTag('dc:date') || getTag('updated');

    if (!titleRaw) return;

    const title = stripHtml(titleRaw);
    const description = stripHtml(descRaw);
    const link = linkRaw.replace(/<[^>]+>/g, '').trim() || sourceUrl;
    
    let pubDate = new Date();
    if (pubDateRaw) {
      const parsed = new Date(pubDateRaw);
      if (!isNaN(parsed.getTime())) pubDate = parsed;
    }

    const images = extractImagesFromItemXml(itemXml);

    items.push({
      id: `${sourceName.toLowerCase().replace(/\s+/g, '-')}-${index}-${Date.now()}`,
      title,
      description,
      link,
      pubDate: pubDate.toISOString(),
      sourceName,
      sourceUrl,
      images,
    });
  });

  return items;
}

/**
 * Applies anonymization/replacement rules to a string with proper sentence-start capitalization,
 * possessive handling ('s, ’s, '), apostrophe variation matching, and plural suffixes.
 */
export function applyReplacements(text: string, rules: ReplacementRule[]): string {
  if (!text) return '';
  let result = text;
  const activeRules = rules.filter((r) => r.enabled && r.term.trim().length > 0);

  // Sort rules by term length descending so longer phrases match first (e.g., "Donald Trump" before "Trump")
  const sortedRules = [...activeRules].sort((a, b) => b.term.trim().length - a.term.trim().length);

  sortedRules.forEach((rule) => {
    const rawTerm = rule.term.trim();
    const rawReplacement = rule.replacement.trim();
    if (!rawTerm) return;

    // 1. Strip possessive suffixes from term and replacement to obtain clean base words
    // Handles straight ('), curly (’), backtick (`), left single quote (‘)
    const cleanTerm = rawTerm.replace(/['’'‘\`]s?$/i, '').trim();
    let cleanReplacement = rawReplacement.replace(/['’'‘\`]s?$/i, '').trim();

    if (!cleanTerm || !cleanReplacement) return;

    // Ensure titles used as singular noun phrases have a natural leading article if missing
    if (/^(?:u\.s\.\s+|us\s+|united\s+states\s+)?president\b/i.test(cleanReplacement) && !/^(?:the|a|an)\b/i.test(cleanReplacement)) {
      cleanReplacement = 'the ' + cleanReplacement;
    } else if (/^(?:ontario\s+)?premier\b/i.test(cleanReplacement) && !/^(?:the|a|an)\b/i.test(cleanReplacement)) {
      cleanReplacement = 'the ' + cleanReplacement;
    } else if (/^prime\s+minister\b/i.test(cleanReplacement) && !/^(?:the|a|an)\b/i.test(cleanReplacement)) {
      cleanReplacement = 'the ' + cleanReplacement;
    }

    // 2. Build regex pattern for cleanTerm that allows optional title prefixes, apostrophe variations, possessive/plural suffixes,
    // and trailing noun adjuncts (e.g., "Trump Administration", "Trump campaign", "Trump officials", "Trump team")
    const escapedCleanTerm = cleanTerm
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/['’'‘\`]/g, "['’'‘\\`]");

    // Title prefixes that precede people's names in news reporting
    const titlePrefixPattern = `(?:(?:(?:the|a|an)\\s+)?(?:(?:former|ex-?)\\s+)?(?:u\\.s\\.\\s+|us\\s+|united\s+states\\s+|ontario\\s+|california\\s+)?(?:president|vice\\s+president|premier|prime\\s+minister|governor|mayor|senator|representative|congressman|congresswoman|minister|chancellor|secretary|ceo|chief\\s+executive|director|chairman|chairwoman)\\s+|mr\\.\\s+|mrs\\.\\s+|ms\\.\\s+|dr\\.\\s+)`;

    // Attributive noun adjuncts that follow leaders' names without apostrophes
    const adjunctSuffixPattern = `(?:\\s+(administration|government|campaign|cabinet|white\\s+house|officials|official|aides|aide|advisers|advisors|adviser|advisor|team|transition\\s+team|allies|ally|supporters|supporter|critics|critic|policies|policy|doctrine|orders?|lawyers|attorneys|spokesperson|spokespeople|spokesman|spokeswoman))`;

    const regex = new RegExp(
      `(${titlePrefixPattern})?\\b${escapedCleanTerm}(?:(['’'‘\`]s)|(['’'‘\`])|(s['’'‘\`])|(s))?${adjunctSuffixPattern}?(?![a-zA-Z0-9_])`,
      'gi'
    );

    result = result.replace(
      regex,
      (match, capturedPrefix, g1PossessiveS, g2Apostrophe, g3PluralPossessive, g4Plural, capturedAdjunct, offset, fullString) => {
        // Determine if match is at sentence start
        const prefix = fullString.slice(0, offset);
        const isStartOfSentence =
          offset === 0 ||
          /[\.\!\?\n\r:]\s*["'“‘\(\[]*$/.test(prefix) ||
          /^\s*$/.test(prefix);

        let targetReplacement = cleanReplacement;

        const hasPossessiveInText = Boolean(g1PossessiveS || g2Apostrophe || g3PluralPossessive);
        const hasPossessiveInRule = /['’'‘\`]s?$/i.test(rawReplacement) || /['’'‘\`]s?$/i.test(rawTerm);

        if (capturedAdjunct) {
          const adj = capturedAdjunct.toLowerCase();
          if (adj === 'administration') {
            if (/president/i.test(cleanReplacement)) {
              targetReplacement = 'the U.S. administration';
            } else {
              targetReplacement = `${cleanReplacement}'s administration`;
            }
          } else if (adj === 'campaign') {
            if (/president/i.test(cleanReplacement)) {
              targetReplacement = 'the presidential campaign';
            } else {
              targetReplacement = `${cleanReplacement}'s campaign`;
            }
          } else if (adj === 'cabinet') {
            if (/president/i.test(cleanReplacement)) {
              targetReplacement = 'the presidential cabinet';
            } else {
              targetReplacement = `${cleanReplacement}'s cabinet`;
            }
          } else if (adj === 'officials' || adj === 'official') {
            if (/president/i.test(cleanReplacement)) {
              targetReplacement = adj === 'officials' ? 'U.S. administration officials' : 'a U.S. administration official';
            } else {
              targetReplacement = `${cleanReplacement}'s ${capturedAdjunct}`;
            }
          } else if (adj === 'government') {
            if (/premier|ontario/i.test(cleanReplacement)) {
              targetReplacement = 'the Ontario government';
            } else {
              targetReplacement = `${cleanReplacement}'s government`;
            }
          } else {
            // Team, allies, policy, doctrine, order, etc.
            const basePossessive = /[s|z|x]$/i.test(cleanReplacement)
              ? `${cleanReplacement}'`
              : `${cleanReplacement}'s`;
            targetReplacement = `${basePossessive} ${capturedAdjunct}`;
          }
        } else if (hasPossessiveInText || hasPossessiveInRule) {
          // Form possessive of cleanReplacement
          if (/[s|z|x]$/i.test(cleanReplacement)) {
            targetReplacement = `${cleanReplacement}'`;
          } else {
            targetReplacement = `${cleanReplacement}'s`;
          }
        } else if (g4Plural) {
          // Form simple plural of cleanReplacement if matched plural suffix 's'
          if (/[s|x|z|ch|sh]$/i.test(cleanReplacement)) {
            targetReplacement = `${cleanReplacement}es`;
          } else {
            targetReplacement = `${cleanReplacement}s`;
          }
        }

        // Avoid double determiners if preceding text ends with "the" or "The"
        if (/\b(?:the|The)\s+$/.test(prefix) && /^(?:the|The)\s+/i.test(targetReplacement)) {
          targetReplacement = targetReplacement.replace(/^(?:the|The)\s+/i, '');
        }

        if (targetReplacement.length > 0 && isStartOfSentence) {
          // Capitalize first character of replacement at sentence start
          targetReplacement = targetReplacement.charAt(0).toUpperCase() + targetReplacement.slice(1);
        }

        return targetReplacement;
      }
    );
  });

  // Post-processing pass to guarantee all grammar glitches, double titles, and sentence starts are properly normalized
  result = cleanCitationGrammarGlitches(result);

  return result;
}

/**
 * Checks whether an image or its associated article context matches any forbidden citation anonymizer rules.
 * If an image matches a rule (by term, replacement phrase, URL path/filename, or article context), returns true.
 */
export function isImageMatchingRules(
  imageUrl: string,
  rules: ReplacementRule[],
  contextText: string = ''
): boolean {
  if (!rules || rules.length === 0) return false;

  const activeRules = rules.filter((r) => r.enabled && r.term && r.term.trim().length > 0);
  if (activeRules.length === 0) return false;

  let urlLower = (imageUrl || '').toLowerCase();
  let decodedUrl = urlLower;
  try {
    decodedUrl = decodeURIComponent(urlLower);
  } catch {
    // ignore malformed URI
  }

  const contextLower = (contextText || '').toLowerCase();

  const stopWords = new Set([
    'the', 'and', 'for', 'a', 'an', 'in', 'on', 'at', 'to', 'of', 'with', 'by',
    'jpg', 'png', 'jpeg', 'webp', 'gif', 'img', 'image', 'photo', 'news', 'live', 'media'
  ]);

  return activeRules.some((rule) => {
    const termClean = rule.term.trim().toLowerCase();
    const repClean = (rule.replacement || '').trim().toLowerCase();
    if (!termClean) return false;

    // Helper: test for whole phrase or word boundary in text (including possessives and apostrophe variations)
    const containsPhraseOrWord = (text: string, phrase: string): boolean => {
      if (!text || !phrase) return false;
      const cleanP = phrase.replace(/['’'‘\`]s?$/i, '').trim();
      if (!cleanP) return false;
      if (text.includes(cleanP)) return true;

      try {
        const escaped = cleanP
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/['’'‘\`]/g, "['’'‘\\`]");
        const regex = new RegExp(`\\b${escaped}(?:['’'‘\`]s)?(?![a-zA-Z0-9_])`, 'i');
        return regex.test(text);
      } catch {
        return false;
      }
    };

    // 1. Check Context Text (Article title, description, link, or synthesized summary/details)
    if (contextLower) {
      // Check exact forbidden term (e.g. "elon musk")
      if (containsPhraseOrWord(contextLower, termClean)) return true;

      // Check replacement phrase if present (e.g. "a prominent tech mogul" or "tech mogul")
      if (repClean && repClean.length >= 3 && containsPhraseOrWord(contextLower, repClean)) {
        return true;
      }

      // Check significant words in term (e.g., "musk", "elon")
      const termWords = termClean
        .split(/\s+/)
        .map((w) => w.replace(/[^\w]/g, ''))
        .filter((w) => w.length >= 3 && !stopWords.has(w));

      if (termWords.length > 0) {
        for (const word of termWords) {
          try {
            const regex = new RegExp(`\\b${word}\\b`, 'i');
            if (regex.test(contextLower)) return true;
          } catch {
            if (contextLower.includes(word)) return true;
          }
        }
      }
    }

    // 2. Check Image URL or decoded URL
    if (urlLower || decodedUrl) {
      // Check term or term with URL separators
      const phraseVariations = [
        termClean,
        termClean.replace(/\s+/g, '-'),
        termClean.replace(/\s+/g, '_'),
        termClean.replace(/\s+/g, '+'),
        termClean.replace(/\s+/g, '%20'),
        termClean.replace(/\s+/g, ''),
      ];

      for (const varStr of phraseVariations) {
        if (varStr.length >= 2 && (urlLower.includes(varStr) || decodedUrl.includes(varStr))) {
          return true;
        }
      }

      // Check individual words in the image URL (e.g. "musk" or "elon" or "tesla")
      const termWords = termClean
        .split(/\s+/)
        .map((w) => w.replace(/[^\w]/g, ''))
        .filter((w) => w.length >= 3 && !stopWords.has(w));

      for (const word of termWords) {
        if (urlLower.includes(word) || decodedUrl.includes(word)) {
          return true;
        }
      }

      // Check replacement phrase in image URL
      if (repClean && repClean.length >= 4) {
        const repVariations = [
          repClean,
          repClean.replace(/\s+/g, '-'),
          repClean.replace(/\s+/g, '_'),
          repClean.replace(/\s+/g, ''),
        ];
        for (const repVar of repVariations) {
          if (repVar.length >= 4 && (urlLower.includes(repVar) || decodedUrl.includes(repVar))) {
            return true;
          }
        }
      }
    }

    return false;
  });
}

export function cleanLiveblogAndRoundupArtifacts(text: string): string {
  if (!text) return '';
  let cleaned = text;

  // Strips liveblog transitions like "Back to Ukraine, where Nine people...", "Back to Glasgow, where..."
  cleaned = cleaned.replace(/\bBack to [A-Z][a-zA-Z\s\-]+,\s*where\b[^\.\!\?\n]*[\.\!\?]?/g, '');

  // Strips generic filler, empty clichés, and wordy transitional phrases
  cleaned = cleaned.replace(/\bIt remains to be seen (whether|if)[^\.\!\?\n]*[\.\!\?]?/gi, '');
  cleaned = cleaned.replace(/\bOnly time will tell (whether|if|how)[^\.\!\?\n]*[\.\!\?]?/gi, '');
  cleaned = cleaned.replace(/\bIn a dramatic turn of events,?\s*/gi, '');
  cleaned = cleaned.replace(/\bAs events continue to unfold,?\s*/gi, '');
  cleaned = cleaned.replace(/\bAs developments unfold,?\s*/gi, '');
  cleaned = cleaned.replace(/\bAgainst the backdrop of [^,.]*,\s*/gi, '');
  cleaned = cleaned.replace(/\bHighlighting the broader significance[^\.\!\?\n]*[\.\!\?]?/gi, '');
  cleaned = cleaned.replace(/\bThis development comes as[^\.\!\?\n]*[\.\!\?]?/gi, '');
  cleaned = cleaned.replace(/\bThis comes at a (crucial|critical) juncture[^\.\!\?\n]*[\.\!\?]?/gi, '');
  cleaned = cleaned.replace(/\bIndustry analysts and affected parties are closely observing[^\.\!\?\n]*[\.\!\?]?/gi, '');
  cleaned = cleaned.replace(/\bJournalists and news outlets including [^.]+ continue tracking[^\.\!\?\n]*[\.\!\?]?/gi, '');
  cleaned = cleaned.replace(/\bKey stakeholders and officials continue to review[^\.\!\?\n]*[\.\!\?]?/gi, '');
  cleaned = cleaned.replace(/\bObservers emphasize the broader significance[^\.\!\?\n]*[\.\!\?]?/gi, '');
  cleaned = cleaned.replace(/\bThis detailed synthesis combines reporting from[^\.\!\?\n]*[\.\!\?]?/gi, '');
  cleaned = cleaned.replace(/\bDirect publisher links and updates are accessible[^\.\!\?\n]*[\.\!\?]?/gi, '');
  cleaned = cleaned.replace(/\bReporting and primary documentation provided via[^\.\!\?\n]*[\.\!\?]?/gi, '');
  cleaned = cleaned.replace(/\bReporting synthesized across[^\.\!\?\n]*[\.\!\?]?/gi, '');
  cleaned = cleaned.replace(/\bDeveloping reports highlight ongoing updates[^\.\!\?\n]*[\.\!\?]?/gi, '');
  cleaned = cleaned.replace(/\bStakeholders and observers continue following[^\.\!\?\n]*[\.\!\?]?/gi, '');

  return cleaned.trim();
}

const TOPIC_STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to',
  'for', 'with', 'by', 'about', 'against', 'between', 'into', 'through', 'during', 'before',
  'after', 'above', 'below', 'from', 'up', 'down', 'of', 'off', 'over', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any',
  'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
  'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now',
  'says', 'said', 'new', 'after', 'report', 'reports', 'news', 'update', 'latest', 'claims', 'amid',
  'briefing', 'live', 'minister', 'official', 'president', 'government', 'state', 'people',
  'military', 'forces', 'deal', 'plan', 'court', 'police', 'investigation', 'rights', 'world',
  'country', 'city', 'region', 'time', 'today', 'week', 'day', 'first', 'second', 'years', 'year',
  'million', 'billion', 'call', 'talks', 'top', 'lead', 'leads', 'war', 'attack', 'us', 'uk', 'eu',
  'boxing', 'athletics', 'relay', 'swimming', 'final', 'finals', 'games', 'gold', 'silver', 'bronze',
  'medal', 'medals', 'event', 'match', 'race', 'team', 'teams', 'cup', 'win', 'wins', 'won', 'title',
  'stole', 'show', 'mop', 'man', 'men', 'women', 'womens', 'mens', 'round', 'stage'
]);

/**
 * Jaccard text similarity calculation for topic clustering
 */
export function calculateJaccardSimilarity(str1: string, str2: string): number {
  const getTokens = (text: string) => {
    return new Set(
      text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !TOPIC_STOP_WORDS.has(w))
    );
  };

  const tokens1 = getTokens(str1);
  const tokens2 = getTokens(str2);

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  let intersectionCount = 0;
  tokens1.forEach(token => {
    if (tokens2.has(token)) intersectionCount++;
  });

  const unionSize = tokens1.size + tokens2.size - intersectionCount;
  return intersectionCount / unionSize;
}

/**
 * Checks if two articles refer to the exact same event, story, or entity cluster
 */
export function areArticlesAboutSameTopic(
  title1: string,
  desc1: string,
  title2: string,
  desc2: string
): boolean {
  const t1 = title1.toLowerCase().trim();
  const t2 = title2.toLowerCase().trim();

  // 1. High Title Jaccard Similarity (Direct title match / rewrites)
  const titleJaccard = calculateJaccardSimilarity(t1, t2);
  if (titleJaccard >= 0.50) {
    return true;
  }

  const getTitleKeywords = (txt: string) => {
    const clean = txt.replace(/[^\w\s]/g, ' ');
    return new Set(clean.split(/\s+/).filter(w => w.length >= 3 && !TOPIC_STOP_WORDS.has(w)));
  };

  const kw1 = getTitleKeywords(t1);
  const kw2 = getTitleKeywords(t2);

  // Count shared specific title keywords
  const sharedTitleKw: string[] = [];
  kw1.forEach(w => {
    if (kw2.has(w)) sharedTitleKw.push(w);
  });

  // Require at least 3 distinct specific non-generic keywords directly in the TITLES or 2 long keywords (>= 6 chars)
  if (sharedTitleKw.length >= 3 || (sharedTitleKw.length === 2 && sharedTitleKw.every(w => w.length >= 6))) {
    return true;
  }

  return false;
}

/**
 * Deduplicates and merges synthesized articles covering the same topic/event
 */
export function mergeDuplicateSynthesizedArticles(articles: SynthesizedArticle[]): SynthesizedArticle[] {
  if (!articles || articles.length <= 1) return articles;

  const merged: SynthesizedArticle[] = [];

  for (const art of articles) {
    let matchedIndex = -1;

    for (let i = 0; i < merged.length; i++) {
      const existing = merged[i];
      if (
        areArticlesAboutSameTopic(
          existing.title,
          existing.summary.slice(0, 120),
          art.title,
          art.summary.slice(0, 120)
        )
      ) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex >= 0) {
      // Merge art into merged[matchedIndex]
      const target = merged[matchedIndex];

      // Merge sources and source links
      const combinedSources = Array.from(new Set([...target.sources, ...art.sources]));
      const combinedLinksMap = new Map<string, string>();
      [...target.sourceLinks, ...art.sourceLinks].forEach(l => {
        if (l.url && !combinedLinksMap.has(l.url)) {
          combinedLinksMap.set(l.url, l.name);
        }
      });
      const combinedSourceLinks = Array.from(combinedLinksMap.entries()).map(([url, name]) => ({ name, url }));

      // Merge images
      const combinedImages = Array.from(new Set([...target.images, ...art.images]));

      // Combine full details paragraphs without duplication
      const pTarget = ensureParagraphBreaks(target.fullDetails || target.summary);
      const pArt = ensureParagraphBreaks(art.fullDetails || art.summary);
      const allParagraphs = Array.from(new Set([...pTarget, ...pArt]));
      const combinedFullDetails = allParagraphs.join('\n\n');

      // Keep title with higher descriptive length or clarity
      const bestTitle = art.title.length > target.title.length && !art.title.includes('...') ? art.title : target.title;
      const bestSummary = formatConciseSummary(
        target.summary.length >= art.summary.length ? target.summary : art.summary
      );

      merged[matchedIndex] = {
        ...target,
        title: bestTitle,
        summary: bestSummary,
        fullDetails: combinedFullDetails,
        sources: combinedSources,
        sourceLinks: combinedSourceLinks,
        images: combinedImages,
        articleCount: target.articleCount + art.articleCount,
        topicTag: target.topicTag || art.topicTag,
        matchedTopic: target.matchedTopic || art.matchedTopic,
      };
    } else {
      merged.push({ ...art });
    }
  }

  return merged;
}

/**
 * Cleans formatting, normalizes quote marks, and fixes unbalanced or orphan quotes.
 */
export function cleanQuotesAndFormatting(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();

  // Standardize smart/curly quotes
  cleaned = cleaned.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

  // Remove JSON escapes
  cleaned = cleaned.replace(/\\"/g, '"').replace(/\\'/g, "'");

  // Fix mismatched starting single quote before a word followed by a double quote (e.g. 'It seems so basic," she said")
  cleaned = cleaned.replace(/^'([A-Z0-9][^"]*")([^"]*)$/i, '"$1$2');

  // Fix mismatched surrounding quotes (e.g., 'Text" or "Text')
  if (cleaned.startsWith("'") && cleaned.endsWith('"')) {
    cleaned = '"' + cleaned.slice(1);
  } else if (cleaned.startsWith('"') && cleaned.endsWith("'")) {
    cleaned = cleaned.slice(0, -1) + '"';
  }

  // Remove leading orphan quotes/dashes/colons (unless starting a normal dialog quote)
  cleaned = cleaned.replace(/^[':\-\s]+/, '');

  // Remove trailing orphan quotes/dashes/colons
  cleaned = cleaned.replace(/[':\-\s]+$/, '');

  // Fix double quote duplicates like she said"' or she said""
  cleaned = cleaned.replace(/["']{2,}$/g, '"');

  // Fix unbalanced double quotes in a single clause
  const doubleQuotes = (cleaned.match(/"/g) || []).length;
  if (doubleQuotes % 2 !== 0) {
    if (cleaned.endsWith('"')) {
      cleaned = cleaned.slice(0, -1);
    } else if (/^"[^"]+$/.test(cleaned)) {
      cleaned = cleaned + '"';
    } else if (cleaned.includes('"')) {
      // If there is an isolated single double quote (e.g., Uefa adds: " We cannot keep going on), check if ending quote is missing
      cleaned = cleaned + '"';
    }
  }

  // Remove double spaces inside quotes or near punctuation
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * Detects if a paragraph is a transition header to a secondary roundup, digest, or listicle of off-topic news.
 */
export function isRoundupOrSideStoryHeader(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // 1. Matches "Here are this week's other...", "Here is the latest...", "Here are other..."
  if (/^here\s+(are|is)\s+(this\s+week'?s|today'?s|the\s+latest|other)?\s*(other\s+)?(ai-powered\s+|tech\s+|martech\s+|industry\s+|marketing\s+)?(news|releases|updates|stories|headlines|launches)/i.test(trimmed)) {
    return true;
  }

  // 2. Matches "In other news", "Other news and releases", "More news in brief", "Also this week", "Around the web", "Top stories this week"
  if (/^(in\s+other\s+news|other\s+news|more\s+news|in\s+brief|other\s+releases|also\s+this\s+week|around\s+the\s+web|more\s+top\s+stories|related\s+stories|read\s+next)/i.test(trimmed)) {
    return true;
  }

  // 3. Matches general "here are ... releases and news" anywhere in the line if line is short (<100 chars)
  if (trimmed.length < 110 && /\b(here\s+(are|is)|other)\b.*?\b(releases|news|updates|stories|headlines|roundup|in\s+brief|round-up)\b/i.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Detects if a paragraph or line is RSS/web scraping junk (timestamps, navigation widgets, isolated quotes, image credits, ads, JSON metadata, etc.)
 */
export function isJunkOrMetadataParagraph(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  if (isRoundupOrSideStoryHeader(trimmed)) return true;

  // Standalone quote marks, dashes, punctuation, or numbers only
  if (/^['"“”‘’\s\-\.\:\;\,\_\/\\]+$/.test(trimmed)) return true;
  if (/^['"“”‘’]\s*$/.test(trimmed)) return true;

  const lower = trimmed.toLowerCase();

  // 1. Advertisements / Promotional Copy / Sponsored Content (e.g., "10X your SEO with Semrush...", "Purpose-built for Enterprise")
  if (
    /\b(10x|boost|grow|drive|scale)\s+(your|our)\s+(seo|sales|traffic|leads|revenue|conversion)/i.test(trimmed) ||
    /\b(semrush|hubspot|ahrefs|salesforce|marketo)\b/i.test(trimmed) ||
    /\bpurpose-built for enterprise\b/i.test(trimmed) ||
    /\bworld's (most|leading|#1) (powerful|popular|advanced)\b/i.test(trimmed) ||
    /\b(free trial|get started for free|sign up today|demo now|download ebook|special offer|sponsored content|promoted article)\b/i.test(trimmed) ||
    /\b(advertisement|sponsored|promoted)\b/i.test(trimmed)
  ) {
    return true;
  }

  // 2. Code / JSON / Schema / OpenGraph metadata junk (e.g. Org/4-questions... "Headline": ...)
  if (
    /["']?(Headline|Description|@context|@type|schema\.org|url)["']?\s*:/i.test(trimmed) ||
    /^org\/[a-z0-9\-_\/]+/i.test(trimmed) ||
    /^\{\s*["'@]/i.test(trimmed) ||
    /["']?\s*\}\s*,\s*["']?/i.test(trimmed) ||
    trimmed.includes('"Headline":') ||
    trimmed.includes('"Description":')
  ) {
    return true;
  }

  // 3. Image source / photo credit / caption metadata (e.g., "Image source, Reuters", "Photo credit: Getty Images")
  if (/image\s*(source|caption|credit)|photo\s*(source|caption|credit|by)|media\s*caption|getty\s*images|\breuters\b|\bafp\b|\bepa\b/i.test(trimmed)) {
    if (trimmed.length < 90 || /^(image|photo|media|picture|source|credit)\b/i.test(trimmed)) {
      return true;
    }
  }

  // 4. Time metadata lines (e.g., "4 hours ago", "Published 1 hour ago", "Updated 20 mins ago", "Published")
  if (/^(published|updated|posted|created|modified)(\s+\d+\s*(sec|min|mins|minute|minutes|hour|hours|hr|hrs|day|days|wk|wks|week|weeks)\s+ago)?$/i.test(trimmed)) return true;
  if (/^\d+\s*(sec|min|mins|minute|minutes|hour|hours|hr|hrs|day|days|wk|wks|week|weeks|month|months|year|years)\s+ago$/i.test(trimmed)) return true;
  if (lower === 'published' || lower === 'updated' || lower === 'posted' || lower === 'recently' || lower === 'ago') return true;

  // 5. Navigation / UI / Footer / Widget junk / Social buttons
  if (/^(read more|click here|see also|related stories|related articles|share this|follow us|copyright|all rights reserved|source:|published by|direct publisher links)/i.test(trimmed)) return true;

  // 6. Short headline questions without period (e.g. "Infantino on the brink?", "What did Uefa's statement say?")
  if (trimmed.length < 55 && trimmed.endsWith('?') && !trimmed.includes('.')) return true;
  
  // 7. Isolated short titles/headers without end punctuation
  if (trimmed.length < 50 && !/[\.\!\?]$/.test(trimmed) && !trimmed.includes(',')) return true;

  // 8. Audio / Video player disclaimers and JavaScript warnings
  if (
    /listen to this article|audio version of this article|mispronunciations can occur|enable javascript in your browser|to play this (video|audio)|we are working with our partners to continually review/i.test(trimmed)
  ) {
    return true;
  }

  return false;
}

/**
 * Sanitizes fullDetails paragraphs: removes title/summary duplicates, filters junk lines, cleans quotes, truncates off-topic roundups, and targets 100-200 words.
 */
export function sanitizeArticleDetailsParagraphs(
  fullDetails: string,
  title: string = '',
  summary: string = ''
): string[] {
  if (!fullDetails) return [];

  const rawParagraphs = ensureParagraphBreaks(fullDetails);
  
  // Helper to normalize text to alpha-numeric lower for fuzzy substring containment
  const normAlpha = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const alphaTitle = normAlpha(stripHtml(title));
  const alphaSummary = normAlpha(stripHtml(summary));

  const result: string[] = [];
  let totalWords = 0;

  for (const rawP of rawParagraphs) {
    if (isRoundupOrSideStoryHeader(rawP)) {
      // Stop processing any subsequent paragraphs for this article as they belong to off-topic weekly roundups
      break;
    }

    let p = cleanQuotesAndFormatting(rawP.trim());
    if (!p) continue;

    if (isRoundupOrSideStoryHeader(p)) {
      break;
    }

    // Check junk/metadata
    if (isJunkOrMetadataParagraph(p)) continue;

    const alphaP = normAlpha(p);
    if (alphaP.length < 15) continue;

    // Duplication checks using alpha-numeric substring matching:
    // 1. If summary or title contains this entire paragraph (or a 20+ char slice of it)
    if (alphaSummary && alphaSummary.length >= alphaP.length && alphaSummary.includes(alphaP)) continue;
    if (alphaSummary && alphaP.length > 20 && alphaSummary.includes(alphaP.slice(0, 20))) continue;
    if (alphaSummary && alphaP.length > 30 && alphaSummary.includes(alphaP.slice(10, 35))) continue;

    if (alphaTitle && alphaTitle.length >= alphaP.length && alphaTitle.includes(alphaP)) continue;
    if (alphaTitle && alphaP.length > 20 && alphaTitle.includes(alphaP.slice(0, 20))) continue;

    // 2. If this paragraph contains the summary or title
    if (alphaSummary && alphaP.length >= alphaSummary.length && alphaP.includes(alphaSummary)) continue;

    // 3. Duplication check against previously added paragraphs in result (no repeated topics)
    const isTopicRepeat = result.some(prevP => {
      const alphaPrev = normAlpha(prevP);
      if (alphaPrev.length >= 30 && alphaP.length >= 30) {
        if (alphaPrev.includes(alphaP) || alphaP.includes(alphaPrev)) return true;
        if (alphaPrev.slice(0, 35) === alphaP.slice(0, 35)) return true;
      }
      return false;
    });
    if (isTopicRepeat) continue;

    // 4. Sentence level duplication check
    const pSentences = splitIntoSentences(p);
    const nonDupSentences: string[] = [];

    for (const sent of pSentences) {
      if (isRoundupOrSideStoryHeader(sent)) break;

      const alphaSent = normAlpha(sent);
      if (alphaSent.length < 15) continue;
      if (isJunkOrMetadataParagraph(sent)) continue;

      if (alphaSummary && alphaSummary.includes(alphaSent)) continue;
      if (alphaSummary && alphaSent.length > 20 && alphaSummary.includes(alphaSent.slice(0, 20))) continue;
      if (alphaTitle && alphaTitle.includes(alphaSent)) continue;

      // Ensure this sentence wasn't already included in earlier paragraphs
      const sentRepeatedInResult = result.some(prevP => {
        const alphaPrev = normAlpha(prevP);
        return alphaPrev.includes(alphaSent) || (alphaSent.length > 25 && alphaPrev.includes(alphaSent.slice(0, 25)));
      });
      if (sentRepeatedInResult) continue;

      nonDupSentences.push(sent);
    }

    if (nonDupSentences.length === 0) continue;

    const cleanP = cleanCitationGrammarGlitches(cleanQuotesAndFormatting(nonDupSentences.join(' ')));
    const wordsInP = cleanP.split(/\s+/).filter(Boolean).length;

    // High information density target: up to 350 substantive words across up to 4 paragraphs
    if (totalWords >= 320 && result.length >= 2) {
      break;
    }

    result.push(cleanP);
    totalWords += wordsInP;

    if (totalWords >= 400 || result.length >= 4) {
      break;
    }
  }

  return result;
}

/**
 * Checks if an article has enough detailed context beyond its title and summary to form a valid full article breakdown.
 */
export function hasSufficientArticleDetails(
  fullDetails: string | undefined,
  title: string = '',
  summary: string = ''
): boolean {
  if (!fullDetails) return false;
  const paragraphs = sanitizeArticleDetailsParagraphs(fullDetails, title, summary);
  if (paragraphs.length === 0) return false;

  const cleanText = paragraphs.join(' ').trim();
  const wordCount = cleanText.split(/\s+/).filter(Boolean).length;

  // Require at least 200 characters and 35 words of clean, non-duplicate detailed content beyond title & summary
  return cleanText.length >= 200 && wordCount >= 35;
}

/**
 * Fallback Local Clustering Engine
 */
export function synthesizeLocalFallback(
  items: RawNewsItem[],
  rules: ReplacementRule[],
  timeframeHours: number,
  primarySourceName?: string,
  topics?: TopicPreference[]
): SynthesizedArticle[] {
  const now = new Date().getTime();
  const cutoff = now - timeframeHours * 60 * 60 * 1000;

  // Filter items by timeframe
  const freshItems = items.filter(item => {
    const itemTime = new Date(item.pubDate).getTime();
    return itemTime >= cutoff;
  }).sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  if (freshItems.length === 0) return [];

  // Group similar items into clusters
  let clusters: { representativeTitle: string; items: RawNewsItem[] }[] = [];

  freshItems.forEach(item => {
    let bestClusterIndex = -1;

    clusters.forEach((cluster, idx) => {
      const repItem = cluster.items[0];
      if (areArticlesAboutSameTopic(cluster.representativeTitle, repItem.description || '', item.title, item.description || '')) {
        bestClusterIndex = idx;
      }
    });

    if (bestClusterIndex >= 0) {
      clusters[bestClusterIndex].items.push(item);
    } else {
      clusters.push({
        representativeTitle: item.title,
        items: [item],
      });
    }
  });

  // Sort clusters by number of coverage sources / items
  clusters.sort((a, b) => b.items.length - a.items.length);

  // If primarySourceName is provided, only keep clusters that contain at least one item from primarySourceName
  if (primarySourceName) {
    const anchored = clusters.filter(c =>
      c.items.some(item => (item.sourceName || '').toLowerCase() === primarySourceName.toLowerCase())
    );
    if (anchored.length > 0) {
      clusters = anchored;
    }
  }

  // Take top candidate clusters
  const candidateClusters = clusters.slice(0, 50);

  const initialSynthesized = candidateClusters.map((cluster, index) => {
    const mainItem = cluster.items[0];
    const sourceNames = Array.from(new Set(cluster.items.map(i => i.sourceName)));
    const sourceLinks = cluster.items.map(i => ({ name: i.sourceName, url: i.link }));
    
    // Deduplicate sourceLinks by URL
    const uniqueSourceLinks = sourceLinks.filter((link, idx, self) => 
      idx === self.findIndex(l => l.url === link.url)
    );

    // Combine images across items in cluster, filtering out images matching forbidden citation rules
    const images: string[] = [];
    cluster.items.forEach(item => {
      item.images.forEach(img => {
        const itemContext = `${item.title} ${item.description} ${item.link} ${cluster.representativeTitle}`;
        if (!images.includes(img) && !isImageMatchingRules(img, rules, itemContext)) {
          images.push(img);
        }
      });
    });

    const cleanTitle = cleanCitationGrammarGlitches(stripHtml(cleanLiveblogAndRoundupArtifacts(applyReplacements(mainItem.title, rules))));
    const rawMainDescClean = cleanLiveblogAndRoundupArtifacts(mainItem.description || '');
    const rawMainDesc = applyReplacements(rawMainDescClean, rules);
    const cleanSummary = cleanCitationGrammarGlitches(formatConciseSummary(rawMainDesc));

    // Collect descriptions across cluster items WITHOUT prepending titles
    const allClusterTexts = cluster.items
      .map(i => {
        const descPart = i.description ? cleanLiveblogAndRoundupArtifacts(applyReplacements(i.description, rules)) : '';
        return stripHtml(descPart);
      })
      .filter(d => d.trim().length > 0);

    const uniqueSentences: string[] = [];
    allClusterTexts.forEach(text => {
      const sents = splitIntoSentences(text);
      sents.forEach(s => {
        const trimmed = s.trim();
        if (
          trimmed.length > 18 &&
          !isJunkOrMetadataParagraph(trimmed) &&
          !uniqueSentences.some(u => u.toLowerCase().includes(trimmed.toLowerCase().slice(0, 30)))
        ) {
          uniqueSentences.push(trimmed);
        }
      });
    });

    const detailParagraphs: string[] = [];
    let currentChunk: string[] = [];
    uniqueSentences.forEach((sent, sIdx) => {
      currentChunk.push(sent);
      if (currentChunk.length >= 2 || sIdx === uniqueSentences.length - 1) {
        detailParagraphs.push(currentChunk.join(' '));
        currentChunk = [];
      }
    });

    const rawFullText = detailParagraphs.join('\n\n');
    const sanitizedP = sanitizeArticleDetailsParagraphs(rawFullText, cleanTitle, cleanSummary);
    const cleanFullDetails = sanitizedP.join('\n\n');

    // Topic weighting and tagging for local fallback
    const activeTopics = (topics || []).filter(t => t.enabled && t.topic.trim().length > 0);
    const seeMore = activeTopics.filter(t => t.weight === 'more');
    const seeLess = activeTopics.filter(t => t.weight === 'less');

    let topicTag: 'Following' | 'Occasional' | undefined = undefined;
    let matchedTopic: string | undefined = undefined;

    const lowerTitle = cleanTitle.toLowerCase();
    const lowerSummary = cleanSummary.toLowerCase();

    for (const sm of seeMore) {
      const term = sm.topic.toLowerCase().trim();
      if (lowerTitle.includes(term) || lowerSummary.includes(term)) {
        topicTag = 'Following';
        matchedTopic = sm.topic.trim();
        break;
      }
    }

    if (!topicTag) {
      for (const sl of seeLess) {
        const term = sl.topic.toLowerCase().trim();
        if (lowerTitle.includes(term) || lowerSummary.includes(term)) {
          topicTag = 'Occasional';
          matchedTopic = sl.topic.trim();
          break;
        }
      }
    }

    return {
      id: `synth-${index}-${Date.now()}`,
      title: cleanTitle,
      summary: cleanSummary,
      fullDetails: cleanFullDetails,
      sources: sourceNames,
      sourceLinks: uniqueSourceLinks,
      images,
      timestamp: mainItem.pubDate,
      articleCount: cluster.items.length,
      category: 'General News',
      topicTag,
      matchedTopic,
    };
  }).filter(art => hasSufficientArticleDetails(art.fullDetails, art.title, art.summary));

  // Prioritize 'Following' articles, balance neutral articles, and place 'Occasional' articles lower
  initialSynthesized.sort((a, b) => {
    const scoreA = a.topicTag === 'Following' ? 2 : a.topicTag === 'Occasional' ? 0 : 1;
    const scoreB = b.topicTag === 'Following' ? 2 : b.topicTag === 'Occasional' ? 0 : 1;
    return scoreB - scoreA;
  });

  return mergeDuplicateSynthesizedArticles(initialSynthesized).slice(0, 25);
}
