async function testFollow302() {
  const gnUrl = "https://news.google.com/rss/articles/CBMijAFBVV95cUxNTGJvd2puYjRGS0xWYnZiU3ZQZFFGZ0M1aHpRR0N5T0s3bDlYcW9LZC1aZVJXNGtVaks2cmxHN1ZTWlRRZ25oY2RFSE5NM21BMlpXWTBIaVdaRFd2N1BZSFoxWVZINUc4enFYVXFxaWFQSFBOSHlvY3cwR1I0b2FJSHZqUnVIT2k3dC1pYQ?oc=5&hl=en-US&gl=US&ceid=US:en";

  const res = await fetch(gnUrl, {
    headers: { "User-Agent": "AbstractNews/1.0 RSS Reader" }
  });
  console.log("Status:", res.status, "| Final URL:", res.url);
  const text = await res.text();
  console.log("Text length:", text.length);

  // Search for canonical or url inside text
  const urlMatches = text.match(/https?:\/\/[^\s"'<>\\]+/g) || [];
  const nonGoogle = Array.from(new Set(urlMatches.filter(u => !u.includes("google") && !u.includes("gstatic") && !u.includes("w3.org"))));
  console.log("Non-Google URLs found:", nonGoogle);
}
testFollow302();
