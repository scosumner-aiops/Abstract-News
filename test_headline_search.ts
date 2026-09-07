import { extractImagesFromArticleHtml } from './src/utils/rss';

async function testHeadlineSearch() {
  const headline = "Jaguar Land Rover confirms plan to cut 4,000 jobs over two years";
  const sourceDomain = "theguardian.com";

  console.log(`Searching real URL for headline: "${headline}" on domain ${sourceDomain}...`);

  // Try searching DuckDuckGo HTML for direct publisher article link
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:${sourceDomain} "${headline}"`)}`;
  const res = await fetch(ddgUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });

  console.log("DDG status:", res.status);
  const html = await res.text();

  // Extract direct article URL from DDG search results
  const matches = Array.from(html.matchAll(/class="result__url"[^>]*href=["']([^"']+)["']/gi)).map(m => m[1]);
  console.log("DDG result URLs:", matches);

  // Alternatively extract all links to the source domain
  const domainMatches = Array.from(html.matchAll(new RegExp(`https?:\\/\\/(?:www\\.)?${sourceDomain.replace('.', '\\.')}\\/[^\\s"'<>]+`, 'gi'))).map(m => m[0]);
  console.log("Direct domain URLs:", domainMatches);

  const realArticleUrl = domainMatches[0] || matches[0];
  if (realArticleUrl) {
    console.log("\n--- Real Article URL resolved:", realArticleUrl);
    const pubRes = await fetch(realArticleUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    console.log("Publisher fetch status:", pubRes.status);
    const pubHtml = await pubRes.text();
    const imgs = extractImagesFromArticleHtml(pubHtml, realArticleUrl);
    console.log("REAL ARTICLE IMAGES:", imgs);
  }
}

testHeadlineSearch();
