async function testGoogleNewsEndpoints() {
  const token = "CBMijAFBVV95cUxNTGJvd2puYjRGS0xWYnZiU3ZQZFFGZ0M1aHpRR0N5T0s3bDlYcW9LZC1aZVJXNGtVaks2cmxHN1ZTWlRRZ25oY2RFSE5NM21BMlpXWTBIaVdaRFd2N1BZSFoxWVZINUc4enFYVXFxaWFQSFBOSHlvY3cwR1I0b2FJSHZqUnVIT2k3dC1pYQ";

  const endpoints = [
    `https://news.google.com/rss/articles/${token}`,
    `https://news.google.com/articles/${token}`,
    `https://news.google.com/m/articles/${token}`,
    `https://news.google.com/read/${token}`
  ];

  for (const ep of endpoints) {
    console.log("\nTesting endpoint:", ep);
    try {
      const res = await fetch(ep, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        redirect: "manual"
      });
      console.log("Status:", res.status, "Location:", res.headers.get("location"));
      if (res.status === 200) {
        const text = await res.text();
        console.log("Response text length:", text.length);
        const matches = text.match(/https?:\/\/(?:www\.)?theguardian\.com\/[^\s"'<>]+/gi);
        console.log("Guardian matches:", matches);
      }
    } catch (e: any) {
      console.log("Error:", e.message);
    }
  }
}

testGoogleNewsEndpoints();
