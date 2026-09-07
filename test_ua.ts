async function testUserAgents() {
  const gnUrl = "https://news.google.com/rss/articles/CBMijAFBVV95cUxNTGJvd2puYjRGS0xWYnZiU3ZQZFFGZ0M1aHpRR0N5T0s3bDlYcW9LZC1aZVJXNGtVaks2cmxHN1ZTWlRRZ25oY2RFSE5NM21BMlpXWTBIaVdaRFd2N1BZSFoxWVZINUc4enFYVXFxaWFQSFBOSHlvY3cwR1I0b2FJSHZqUnVIT2k3dC1pYQ?oc=5";

  const uas = [
    "curl/7.68.0",
    "Googlebot/2.1 (+http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "AbstractNews/1.0 RSS Reader"
  ];

  for (const ua of uas) {
    const res = await fetch(gnUrl, {
      headers: { "User-Agent": ua },
      redirect: "manual"
    });
    console.log("UA:", ua, "| Status:", res.status, "| Location:", res.headers.get("location"));
    if (res.status === 200) {
      const text = await res.text();
      console.log("   Text length:", text.length);
      const matches = text.match(/https?:\/\/[^\s"'<>\\]+/g) || [];
      const nonGoogle = matches.filter(u => !u.includes("google") && !u.includes("gstatic"));
      console.log("   Non-Google URLs in body:", nonGoogle.slice(0, 3));
    }
  }
}
testUserAgents();
