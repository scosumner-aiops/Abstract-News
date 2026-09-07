import { extractImagesFromArticleHtml } from './src/utils/rss';

async function testBingSearch() {
  const headline = "Jaguar Land Rover confirms plan to cut 4,000 jobs over two years";
  const sourceDomain = "theguardian.com";

  console.log(`Searching Bing for headline: "${headline}" on domain ${sourceDomain}...`);

  const bingUrl = `https://www.bing.com/search?q=site:${sourceDomain}+"${encodeURIComponent(headline)}"`;
  const res = await fetch(bingUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });

  console.log("Bing status:", res.status);
  const html = await res.text();

  const domainMatches = Array.from(html.matchAll(new RegExp(`https?:\\/\\/(?:www\\.)?${sourceDomain.replace('.', '\\.')}\\/[^\\s"'<>]+`, 'gi'))).map(m => m[0]);
  console.log("Bing Direct domain URLs:", domainMatches);

  const realArticleUrl = domainMatches[0];
  if (realArticleUrl) {
    console.log("\n--- Real Article URL resolved from Bing:", realArticleUrl);
    const pubRes = await fetch(realArticleUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    console.log("Publisher fetch status:", pubRes.status);
    const pubHtml = await pubRes.text();
    const imgs = extractImagesFromArticleHtml(pubHtml, realArticleUrl);
    console.log("REAL ARTICLE IMAGES FROM BING RESOLVED PAGE:", imgs);
  }
}

testBingSearch();
