async function testGoogleNewsRedirect() {
  // Test link from RSS
  const gnUrl = "https://news.google.com/rss/articles/CBMijAFBVV95cUxNTGJvd2puYjRGS0xWYnZiU3ZQZFFGZ0M1aHpRR0N5T0s3bDlYcW9LZC1aZVJXNGtVaks2cmxHN1ZTWlRRZ25oY2RFSE5NM21BMlpXWTBIaVdaRFd2N1BZSFoxWVZINUc4enFYVXFxaWFQSFBOSHlvY3cwR1I0b2FJSHZqUnVIT2k3dC1pYQ?oc=5";

  // Try fetching with google news API or mobile user-agent or Googlebot or POST
  const res = await fetch(gnUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
    }
  });

  const html = await res.text();
  console.log("HTML length:", html.length);

  // Search for the guardian or real link inside the html
  const guardianIndex = html.indexOf("theguardian.com");
  console.log("theguardian.com index:", guardianIndex);
  if (guardianIndex !== -1) {
    console.log("Snippet around guardian:", html.substring(guardianIndex - 100, guardianIndex + 200));
  }

  // Search for data-n-a-u or data-url or any http link
  const allUrls = html.match(/https?:\/\/[^\s"'<>\\]+/g) || [];
  const uniqueUrls = Array.from(new Set(allUrls));
  console.log("Unique URLs in response:", uniqueUrls.length);
  const filtered = uniqueUrls.filter(u => !u.includes("google") && !u.includes("gstatic") && !u.includes("w3.org") && !u.includes("schema.org"));
  console.log("Filtered non-Google URLs:", filtered);
}

testGoogleNewsRedirect();
