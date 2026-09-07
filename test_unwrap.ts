import { extractImagesFromArticleHtml } from './src/utils/rss';

async function testUnwrap() {
  const gnUrl = "https://news.google.com/rss/articles/CBMijAFBVV95cUxNTGJvd2puYjRGS0xWYnZiU3ZQZFFGZ0M1aHpRR0N5T0s3bDlYcW9LZC1aZVJXNGtVaks2cmxHN1ZTWlRRZ25oY2RFSE5NM21BMlpXWTBIaVdaRFd2N1BZSFoxWVZINUc4enFYVXFxaWFQSFBOSHlvY3cwR1I0b2FJSHZqUnVIT2k3dC1pYQ?oc=5";
  console.log("Fetching Google News URL:", gnUrl);

  const res = await fetch(gnUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });

  const html = await res.text();
  console.log("HTML length:", html.length);

  // 1. Check for data-n-a-u or data-url or a[jsname] or links in HTML
  const urlMatches = Array.from(html.matchAll(/https?:\/\/(?:www\.)?theguardian\.com\/[^\s"'<>]+/gi)).map(m => m[0]);
  console.log("Found Guardian URLs in HTML:", urlMatches.slice(0, 3));

  const allUrls = Array.from(html.matchAll(/data-(?:n-a-u|url|href)=["']([^"']+)["']/gi)).map(m => m[1]);
  console.log("Found data- url attributes:", allUrls);

  // 2. Test unwrapping with unwrapGoogleNewsUrl or decoding
  const linkMatches = Array.from(html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)).map(m => m[1]);
  const pubLinks = linkMatches.filter(l => !l.includes("google.com") && !l.includes("gstatic.com") && l.startsWith("http"));
  console.log("Found direct publisher links in <a> tags:", pubLinks);

  // 3. Test fetching the actual publisher page
  const targetUrl = urlMatches[0] || pubLinks[0];
  if (targetUrl) {
    console.log("\n--- Fetching Target Publisher Page:", targetUrl);
    const pubRes = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    console.log("Publisher fetch status:", pubRes.status);
    const pubHtml = await pubRes.text();
    const imgs = extractImagesFromArticleHtml(pubHtml, targetUrl);
    console.log("EXTRACTED IMAGES FROM REAL PUBLISHER PAGE:", imgs);
  }
}

testUnwrap();
