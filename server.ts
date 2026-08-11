import express from 'express';
import path from 'path';
import fs from 'fs';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

class DocRef {
  constructor(private db: any, private col: string, private docId: string) {}
  async get() {
    const snap = await getDoc(doc(this.db, this.col, this.docId));
    return {
      exists: snap.exists(),
      data: () => snap.data()
    };
  }
  async set(data: any) {
    await setDoc(doc(this.db, this.col, this.docId), data);
  }
  async delete() {
    await deleteDoc(doc(this.db, this.col, this.docId));
  }
}

class ColRef {
  constructor(private db: any, private col: string) {}
  doc(docId: string) {
    return new DocRef(this.db, this.col, docId);
  }
}

class DbWrapper {
  constructor(private db: any) {}
  collection(col: string) {
    return new ColRef(this.db, col);
  }
}

let db: any = null;

function getDb(): any {
  if (!db) {
    let config: any = {};
    try {
      config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
    } catch (e) {
      console.warn('Failed to read firebase-applet-config.json:', e);
    }
    const app = initializeApp(config);
    const dbId = config.firestoreDatabaseId || config.databaseId || 'ai-studio-abstractnews-5dac5c76-1bd6-4159-9e3f-fb2da2d47328';
    const rawDb = getFirestore(app, dbId);
    db = new DbWrapper(rawDb);
  }
  return db;
}
import {
  parseRssXml,
  extractImagesFromArticleHtml,
  synthesizeLocalFallback,
  applyReplacements,
  isImageMatchingRules,
  stripHtml,
  formatConciseSummary,
  ensureParagraphBreaks,
  mergeDuplicateSynthesizedArticles,
  cleanLiveblogAndRoundupArtifacts,
  cleanMediaAudioVideoJunk,
  splitIntoSentences,
  isJunkOrMetadataParagraph,
  sanitizeArticleDetailsParagraphs,
  hasSufficientArticleDetails
} from './src/utils/rss';
import { RawNewsItem, ReplacementRule, SynthesizedArticle } from './src/types';

declare module 'express-session' {
  interface SessionData {
    user?: {
      id: string;
      email: string;
      name: string;
      picture?: string;
    };
    oauthState?: string;
    oauthRedirectUri?: string;
    isPopup?: boolean;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust proxy for Cloud Run/container environments
  app.set('trust proxy', 1);

  await initializeDefaultSettings();

  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'abstract-news-session-secret-key-12345',
      resave: false,
      saveUninitialized: false,
      proxy: true,
      cookie: {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      },
    })
  );

  function getUserFromReq(req: express.Request): { id: string; email: string; name: string; picture?: string; token?: string } | null {
    if (req.session?.user?.email) {
      return req.session.user;
    }
    const authHeader = req.headers.authorization || req.headers['x-auth-token'];
    if (authHeader && typeof authHeader === 'string') {
      const tokenStr = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
      try {
        const decoded = JSON.parse(Buffer.from(tokenStr, 'base64').toString('utf8'));
        if (decoded && decoded.email) {
          return {
            id: decoded.id || decoded.email,
            email: decoded.email,
            name: decoded.name || decoded.email.split('@')[0],
            picture: decoded.picture,
            token: tokenStr,
          };
        }
      } catch (e) {
        // Fallback or invalid token format
      }
    }
    const emailHeader = req.headers['x-user-email'];
    if (emailHeader && typeof emailHeader === 'string' && emailHeader.includes('@')) {
      const clean = emailHeader.trim().toLowerCase();
      return { id: clean, email: clean, name: clean.split('@')[0] };
    }
    return null;
  }

  // Local JSON store for individual user settings
  const SETTINGS_FILE_PATH = path.join(process.cwd(), 'data', 'user_settings.json');

  function ensureDataDirExists() {
    const dir = path.dirname(SETTINGS_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Initialize default settings in Firestore
  async function initializeDefaultSettings() {
    try {
      console.log('Initializing default settings...');
      const defaultDoc = await getDb().collection('userSettings').doc('default_settings').get();
      const defaultSources = [
        {
          id: 'globo-g1',
          name: 'Globo (G1)',
          url: 'https://g1.globo.com/rss/g1/',
          enabled: true,
          tags: ['Headlines']
        },
        {
          id: 'the-guardian',
          name: 'The Guardian',
          url: 'https://www.theguardian.com/world/rss',
          enabled: true,
          tags: ['Headlines']
        },
        {
          id: 'reuters',
          name: 'Reuters',
          url: 'https://reuters.com',
          enabled: true,
          tags: ['Headlines']
        },
        {
          id: 'al-jazeera',
          name: 'Al Jazeera English',
          url: 'https://www.aljazeera.com/xml/rss/all.xml',
          enabled: true,
          tags: ['Headlines']
        },
        {
          id: 'associated-press',
          name: 'Associated Press',
          url: 'https://apnews.com',
          enabled: true,
          tags: ['Headlines']
        },
        {
          id: 'deutsche-welle',
          name: 'Deutsche Welle (DW)',
          url: 'https://rss.dw.com/xml/rss-en-all',
          enabled: true,
          tags: ['Headlines']
        },
        {
          id: 'france-24',
          name: 'France 24',
          url: 'https://www.france24.com/en/rss',
          enabled: true,
          tags: ['Headlines']
        },
        {
          id: 'the-independent',
          name: 'The Independent',
          url: 'https://www.independent.co.uk/news/rss',
          enabled: true,
          tags: ['Headlines']
        },
        {
          id: 'la-presse',
          name: 'La Presse',
          url: 'https://www.lapresse.ca/actualites/rss',
          enabled: true,
          tags: ['Headlines']
        },
        {
          id: 'global-news',
          name: 'Global News Canada',
          url: 'https://globalnews.ca/feed/',
          enabled: true,
          tags: ['Headlines']
        },
        {
          id: 'cbc-news',
          name: 'CBC News',
          url: 'https://www.cbc.ca/cmlink/rss-topstories',
          enabled: true,
          tags: ['Headlines']
        },
        {
          id: 'national-post',
          name: 'National Post',
          url: 'https://nationalpost.com/category/news/feed',
          enabled: true,
          tags: ['Headlines']
        },
        {
          id: 'montreal-gazette',
          name: 'Montreal Gazette',
          url: 'https://news.google.com/rss/search?q=site:montrealgazette.com&hl=en-CA&gl=CA&ceid=CA:en',
          enabled: true,
          tags: ['Headlines']
        }
      ];

      const defaultRules = [
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
        }
      ];

      // Always update default_settings template in Firestore to reflect latest sources & rules
      await getDb().collection('userSettings').doc('default_settings').set({
        sources: defaultSources,
        rules: defaultRules,
        timeframeValue: '24',
        showImages: true,
        selectedModel: 'gemini-3.5-lite',
        updatedAt: new Date().toISOString(),
      });
      console.log('Default settings successfully updated in Firestore.');
    } catch (err) {
      console.error('Failed to initialize default settings in Firestore:', err);
    }
  }

  // Helper to load default settings
  async function loadDefaultSettings() {
    try {
      const doc = await getDb().collection('userSettings').doc('default_settings').get();
      return doc.exists ? doc.data() : null;
    } catch (err) {
      console.error('Failed to read defaultSettings from Firestore:', err);
      return null;
    }
  }

  async function loadUserSettingsForGoogleUser(email: string): Promise<any> {
    const cleanEmail = email.toLowerCase().trim();
    try {
      const docRef = getDb().collection('userSettings').doc(cleanEmail);
      const doc = await docRef.get();

      if (doc.exists) {
        const data = doc.data() || {};
        // Ensure "Google user" field is stored in plain text
        if (data['Google user'] !== cleanEmail) {
          await docRef.set({ ...data, 'Google user': cleanEmail }, { merge: true }).catch(() => {});
          data['Google user'] = cleanEmail;
        }
        return data;
      }

      // First time login for this Google user: preload with default_settings from Firestore
      console.log(`Preloading new Firestore document for first-time Google user: ${cleanEmail}`);
      const defaultSettings = (await loadDefaultSettings()) || {};

      const newDocData = {
        ...defaultSettings,
        'Google user': cleanEmail,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Save as custom user document in Firestore immediately
      await docRef.set(newDocData);
      return newDocData;
    } catch (err) {
      console.error(`Failed to load/initialize settings for ${cleanEmail}:`, err);
      const defaultSettings = (await loadDefaultSettings()) || {};
      return { ...defaultSettings, 'Google user': cleanEmail };
    }
  }

  async function saveUserSettingsForGoogleUser(email: string, settings: any) {
    const cleanEmail = email.toLowerCase().trim();
    try {
      await getDb().collection('userSettings').doc(cleanEmail).set(
        {
          ...settings,
          'Google user': cleanEmail,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      console.log(`Saved user settings to Firestore for Google user: ${cleanEmail}`);
    } catch (err) {
      console.error(`Failed to save settings to Firestore for ${cleanEmail}:`, err);
    }
  }

  // Initialize Gemini client lazy/safely if key exists
  const getGeminiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  // Cache for Gemini Vision image anonymization checks
  const visionCache = new Map<string, boolean>();
  let visionQuotaCooldownUntil = 0;

  async function checkImageVisionForbidden(
    imageUrl: string,
    rules: ReplacementRule[],
    ai: GoogleGenAI
  ): Promise<boolean> {
    const activeRules = rules.filter(r => r.enabled && r.term && r.term.trim().length > 0);
    if (activeRules.length === 0) return false;

    // Skip Vision API calls if quota was exceeded recently
    if (Date.now() < visionQuotaCooldownUntil) {
      return false;
    }

    const termsList = activeRules.map(r => r.term.trim());
    const cacheKey = `${imageUrl}::${termsList.sort().join('|')}`;

    if (visionCache.has(cacheKey)) {
      return visionCache.get(cacheKey)!;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);

      const imageRes = await fetch(imageUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      clearTimeout(timeout);

      if (!imageRes.ok) {
        return false;
      }

      const arrayBuffer = await imageRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length < 500 || buffer.length > 12 * 1024 * 1024) {
        return false;
      }

      const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
      let mimeType = 'image/jpeg';
      if (contentType.includes('png')) mimeType = 'image/png';
      else if (contentType.includes('webp')) mimeType = 'image/webp';
      else if (contentType.includes('gif')) mimeType = 'image/gif';

      const base64Data = buffer.toString('base64');

      const prompt = `You are a strict media anonymization & citation filter. Your job is to analyze this news photo and detect if ANY of the following prohibited people, public figures, brands, or entities are visually depicted or present anywhere in the image:
${termsList.map(t => `- "${t}"`).join('\n')}

Inspect facial features, prominent logos, text on apparel/signs, or well-known public individuals.
Does this image show, feature, or contain ANY of the prohibited subjects listed above?

Respond ONLY with valid JSON:
{"forbidden": true/false, "detected": "Name of detected subject or empty string"}`;

      const visionResponse = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType,
            },
          },
          { text: prompt },
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.0,
        },
      });

      if (visionResponse && visionResponse.text) {
        const parsed = JSON.parse(visionResponse.text);
        const isForbidden = Boolean(parsed.forbidden);
        if (isForbidden) {
          console.log(`[Vision Anonymizer] BLOCKED image (${imageUrl}): Detected "${parsed.detected}"`);
        }
        visionCache.set(cacheKey, isForbidden);
        return isForbidden;
      }
    } catch (err: any) {
      const errMsg = (err?.message || err?.toString() || JSON.stringify(err) || '').toLowerCase();
      if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('resource_exhausted')) {
        visionQuotaCooldownUntil = Date.now() + 5 * 60 * 1000; // 5 minute cooldown
        console.log('[Vision Anonymizer] Vision API rate limit / quota reached. Falling back to text-rule image filters.');
      }
    }

    visionCache.set(cacheKey, false);
    return false;
  }

  async function filterArticleImagesWithVision(
    articles: SynthesizedArticle[],
    rules: ReplacementRule[],
    ai: GoogleGenAI | null
  ): Promise<SynthesizedArticle[]> {
    const activeRules = rules.filter(r => r.enabled && r.term && r.term.trim().length > 0);
    if (!ai || activeRules.length === 0 || Date.now() < visionQuotaCooldownUntil) {
      return articles;
    }

    console.log(`[Vision Anonymizer] Scanning article images against ${activeRules.length} active rule(s)...`);

    let scannedCount = 0;
    const maxScansPerPass = 3; // Limit vision API requests per pass to preserve quota

    const result: SynthesizedArticle[] = [];
    for (const art of articles) {
      if (!art.images || art.images.length === 0 || scannedCount >= maxScansPerPass || Date.now() < visionQuotaCooldownUntil) {
        result.push(art);
        continue;
      }

      const checkedImages: string[] = [];
      for (const imgUrl of art.images) {
        if (scannedCount < maxScansPerPass && Date.now() >= visionQuotaCooldownUntil) {
          scannedCount++;
          const isForbidden = await checkImageVisionForbidden(imgUrl, rules, ai);
          if (!isForbidden) {
            checkedImages.push(imgUrl);
          }
        } else {
          checkedImages.push(imgUrl);
        }
      }

      result.push({
        ...art,
        images: checkedImages,
      });
    }

    return result;
  }

  // 1. Health Check
  app.get('/api/health', (req, res) => {
    const hasKey = Boolean(process.env.GEMINI_API_KEY);
    res.json({ status: 'ok', aiEnabled: hasKey, hasOauth: Boolean(process.env.OAUTH_CLIENT_ID) });
  });

  // Helper to determine the accurate public redirect URI for Google OAuth
  function getRedirectUri(req: express.Request): string {
    if (process.env.APP_URL) {
      const baseUrl = process.env.APP_URL.replace(/\/$/, '');
      return `${baseUrl}/auth/google/callback`;
    }

    const referer = req.get('referer') || req.get('origin');
    if (referer) {
      try {
        const url = new URL(referer);
        if (url.hostname && !url.hostname.includes('localhost') && url.hostname !== '127.0.0.1') {
          return `${url.protocol}//${url.host}/auth/google/callback`;
        }
      } catch (e) {
        // ignore
      }
    }

    const xForwardedHost = req.get('x-forwarded-host');
    const xForwardedProto = req.get('x-forwarded-proto') || 'https';
    if (xForwardedHost && !xForwardedHost.includes('localhost') && xForwardedHost !== '127.0.0.1') {
      return `${xForwardedProto}://${xForwardedHost}/auth/google/callback`;
    }

    const host = req.get('host') || 'localhost:3000';
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    return `${protocol}://${host}/auth/google/callback`;
  }

  // 1a. Get Google OAuth URL for direct popup launch
  app.get('/api/auth/url', (req, res) => {
    const clientId = process.env.OAUTH_CLIENT_ID;
    if (!clientId) {
      return res.status(400).json({ error: 'OAuth Client ID not configured' });
    }

    const redirectUri = getRedirectUri(req);
    const isPopup = req.query.popup !== 'false';
    const statePrefix = isPopup ? 'popup_' : 'direct_';
    const state = statePrefix + Math.random().toString(36).substring(2) + Date.now().toString(36);

    req.session.oauthState = state;
    req.session.oauthRedirectUri = redirectUri;
    req.session.isPopup = isPopup;

    const scopes = [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' ');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}&prompt=select_account&access_type=offline`;

    res.json({ url: authUrl });
  });

  // 1b. Google OAuth Initiate
  app.get('/auth/google', (req, res) => {
    const clientId = process.env.OAUTH_CLIENT_ID;
    if (!clientId) {
      if (req.query.popup === 'true') {
        return res.send(`
          <html>
            <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
              <div style="text-align: center; padding: 24px; background: #1e293b; border-radius: 12px; max-width: 400px; border: 1px solid #334155;">
                <h3 style="margin-top:0;">OAuth Client ID Not Configured</h3>
                <p style="font-size: 14px; color: #94a3b8;">Please enter your <code>OAUTH_CLIENT_ID</code> and <code>OAUTH_CLIENT_SECRET</code> in the environment panel on the left.</p>
                <button onclick="window.close()" style="background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Close Window</button>
              </div>
            </body>
          </html>
        `);
      }
      return res.redirect('/?error=oauth_unconfigured');
    }

    const redirectUri = getRedirectUri(req);
    const isPopup = req.query.popup === 'true';
    const statePrefix = isPopup ? 'popup_' : 'direct_';
    const state = statePrefix + Math.random().toString(36).substring(2) + Date.now().toString(36);

    req.session.oauthState = state;
    req.session.oauthRedirectUri = redirectUri;
    req.session.isPopup = isPopup;

    const scopes = [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' ');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}&prompt=select_account&access_type=offline`;

    res.redirect(authUrl);
  });

  // 1c. Google OAuth Callback
  app.get('/auth/google/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!code || typeof code !== 'string') {
      return res.status(400).send('Missing authorization code.');
    }

    const clientId = process.env.OAUTH_CLIENT_ID;
    const clientSecret = process.env.OAUTH_CLIENT_SECRET;
    const redirectUri = req.session.oauthRedirectUri || getRedirectUri(req);

    try {
      // Exchange authorization code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId || '',
          client_secret: clientSecret || '',
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        console.error('Failed token exchange:', errBody);
        return res.status(500).send('Failed token exchange with Google.');
      }

      const tokens = await tokenRes.json();
      const accessToken = tokens.access_token;

      // Fetch user profile from Google UserInfo endpoint
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!profileRes.ok) {
        return res.status(500).send('Failed to fetch user profile.');
      }

      const profile = await profileRes.json();

      const rawEmail = (profile.email || '').toLowerCase().trim();
      const tokenPayload = {
        id: profile.id,
        email: rawEmail,
        name: profile.name || profile.email,
        picture: profile.picture,
        iat: Date.now(),
      };
      const token = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');

      const user = {
        id: profile.id,
        email: rawEmail,
        name: profile.name || profile.email,
        picture: profile.picture,
        token,
      };

      req.session.user = user;
      
      // Determine if this was a popup flow (check session OR state parameter)
      const isPopup = req.session.isPopup || (typeof state === 'string' && state.startsWith('popup_'));

      // Ensure session cookie is saved before completing HTTP response
      req.session.save((err) => {
        if (err) {
          console.error('Error saving session in callback:', err);
        }

        if (isPopup) {
          return res.send(`
            <!DOCTYPE html>
            <html>
              <head><title>Sign In Successful</title></head>
              <body style="background:#0f172a;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
                <div style="text-align:center;padding:24px;">
                  <h2 style="margin-bottom:8px;">Signed in as ${user.name}</h2>
                  <p style="color:#94a3b8;font-size:14px;">Updating app session...</p>
                </div>
                <script>
                  try {
                    if (window.opener && !window.opener.closed) {
                      window.opener.postMessage({ type: 'OAUTH_SUCCESS', user: ${JSON.stringify(user)} }, '*');
                      window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', user: ${JSON.stringify(user)} }, '*');
                    }
                  } catch (e) {
                    console.error('Error posting message to opener:', e);
                  }
                  setTimeout(function() {
                    try { window.close(); } catch(e){}
                  }, 500);
                </script>
              </body>
            </html>
          `);
        }

        res.redirect('/');
      });
    } catch (err: any) {
      console.error('Error during Google callback:', err);
      res.status(500).send('Authentication error occurred.');
    }
  });

  // 1d. Auth status endpoint
  app.get('/api/auth/me', (req, res) => {
    const user = getUserFromReq(req);
    if (user && req.session) {
      req.session.user = user;
    }
    res.json({ user });
  });

  // 1e. Auth logout endpoint
  app.post('/api/auth/logout', (req, res) => {
    if (req.session) {
      req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ success: true });
      });
    } else {
      res.json({ success: true });
    }
  });

  // 1f. User settings get/save endpoint (Stored in Firestore under Google account email)
  app.get('/api/user/settings', async (req, res) => {
    const user = getUserFromReq(req);
    if (!user || !user.email) {
      return res.status(401).json({ error: 'Authentication required. Please sign in with Google.' });
    }

    const email = user.email.toLowerCase().trim();
    const settings = await loadUserSettingsForGoogleUser(email);

    res.json({ settings, userKey: email });
  });

  app.post('/api/user/settings', async (req, res) => {
    const user = getUserFromReq(req);
    if (!user || !user.email) {
      return res.status(401).json({ error: 'Authentication required. Please sign in with Google.' });
    }

    const email = user.email.toLowerCase().trim();
    const newSettings = req.body.settings;
    if (!newSettings) {
      return res.status(400).json({ error: 'Missing settings payload' });
    }

    await saveUserSettingsForGoogleUser(email, newSettings);

    res.json({ success: true, settings: newSettings, userKey: email });
  });

  // Endpoint to update default_settings in Firestore (for dev/admin initialization)
  app.post('/api/user/default-settings', async (req, res) => {
    const user = getUserFromReq(req);
    if (!user || !user.email) {
      return res.status(401).json({ error: 'Authentication required. Please sign in with Google.' });
    }

    const newSettings = req.body.settings;
    if (!newSettings) {
      return res.status(400).json({ error: 'Missing settings payload' });
    }

    try {
      await getDb().collection('userSettings').doc('default_settings').set({
        ...newSettings,
        'Google user': 'default_settings_template',
        updatedAt: new Date().toISOString(),
      });
      res.json({ success: true, settings: newSettings, userKey: 'default_settings' });
    } catch (err) {
      console.error('Failed to update default_settings in Firestore:', err);
      res.status(500).json({ error: 'Failed to update default settings' });
    }
  });

  app.delete('/api/user/settings', async (req, res) => {
    const user = getUserFromReq(req);
    if (!user || !user.email) {
      return res.status(401).json({ error: 'Authentication required. Please sign in with Google.' });
    }

    const email = user.email.toLowerCase().trim();
    try {
      await getDb().collection('userSettings').doc(email).delete();
      res.json({ success: true });
    } catch (err) {
      console.error('Failed to delete userSettings:', err);
      res.status(500).json({ error: 'Failed to reset settings' });
    }
  });

  function resolveDirectFeedUrls(sourceName: string, urlStr: string): string[] {
    const normName = (sourceName || '').toLowerCase();
    const normUrl = (urlStr || '').toLowerCase();

    if (normName.includes('independent') || normUrl.includes('independent.co.uk')) {
      return ['https://www.independent.co.uk/news/rss', 'https://www.independent.co.uk/rss'];
    }
    if (normName.includes('la presse') || normName.includes('lapresse') || normUrl.includes('lapresse.ca')) {
      return [
        'https://www.lapresse.ca/actualites/rss',
        'https://www.lapresse.ca/manchettes/rss',
        'https://www.lapresse.ca/international/rss'
      ];
    }
    if (normName.includes('global news') || normUrl.includes('globalnews.ca')) {
      return ['https://globalnews.ca/feed/', 'https://globalnews.ca/canada/feed/'];
    }
    if (normName.includes('cbc') || normUrl.includes('cbc.ca')) {
      return [
        'https://www.cbc.ca/cmlink/rss-topstories',
        'https://www.cbc.ca/cmlink/rss-canada',
        'https://rss.cbc.ca/lineup/topstories.xml'
      ];
    }
    if (normName.includes('national post') || normUrl.includes('nationalpost.com')) {
      return [
        'https://nationalpost.com/category/news/feed',
        'https://nationalpost.com/feed',
        'https://nationalpost.com/rss'
      ];
    }
    if (normName.includes('montreal gazette') || normUrl.includes('montrealgazette.com')) {
      return [
        'https://news.google.com/rss/search?q=site:montrealgazette.com&hl=en-CA&gl=CA&ceid=CA:en',
        'https://montrealgazette.com/category/news/feed'
      ];
    }
    if (normName.includes('globo') || normUrl.includes('globo.com')) {
      return ['https://g1.globo.com/rss/g1/'];
    }
    if (normName.includes('guardian') || normUrl.includes('theguardian.com')) {
      return ['https://www.theguardian.com/world/rss'];
    }
    if (normName.includes('reuters') || normUrl.includes('reuters.com')) {
      return ['https://news.google.com/rss/search?q=site:reuters.com&hl=en-US&gl=US&ceid=US:en'];
    }
    if (normName.includes('associated press') || normUrl.includes('apnews.com') || normName === 'ap news') {
      return ['https://news.google.com/rss/search?q=site:apnews.com&hl=en-US&gl=US&ceid=US:en'];
    }
    if (normName.includes('deutsche welle') || normName === 'dw' || normUrl.includes('dw.com')) {
      return ['https://rss.dw.com/xml/rss-en-all', 'https://rss.dw.com/rdf/rss-en-all'];
    }
    if (normName.includes('france 24') || normUrl.includes('france24.com')) {
      return ['https://www.france24.com/en/rss'];
    }
    if (normName.includes('al jazeera') || normUrl.includes('aljazeera.com')) {
      return ['https://www.aljazeera.com/xml/rss/all.xml'];
    }

    return [];
  }

  // Helper for smart RSS fetching with automatic feed link discovery and fallbacks
  async function fetchAndParseFeed(sourceName: string, urlStr: string): Promise<RawNewsItem[]> {
    const tryFetch = async (targetUrl: string) => {
      try {
        const response = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AbstractNews/1.0 RSS Reader',
            'Accept': 'application/rss+xml, application/xml, text/xml, text/html, */*',
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) return { text: '', url: targetUrl };
        const text = await response.text();
        return { text, url: targetUrl };
      } catch (e) {
        return { text: '', url: targetUrl };
      }
    };

    try {
      // 1. Check priority direct feed URLs
      const priorityCandidates = resolveDirectFeedUrls(sourceName, urlStr);
      for (const targetUrl of priorityCandidates) {
        const directRes = await tryFetch(targetUrl);
        if (directRes.text) {
          const items = parseRssXml(directRes.text, sourceName, urlStr);
          if (items.length > 0) return items;
        }
      }

      // 2. Try given urlStr
      let { text } = await tryFetch(urlStr);
      if (!text) return [];

      let items = parseRssXml(text, sourceName, urlStr);
      if (items.length > 0) return items;

      // 3. If parsing yielded 0 items, check if content is HTML containing an RSS/Atom <link> tag
      const linkMatch =
        text.match(/<link[^>]+type=["'](application\/rss\+xml|application\/atom\+xml)["'][^>]+href=["']([^"']+)["']/i) ||
        text.match(/<link[^>]+href=["']([^"']+)["'][^>]+type=["'](application\/rss\+xml|application\/atom\+xml)["']/i);

      if (linkMatch) {
        let feedHref = linkMatch[1].startsWith('http') ? linkMatch[1] : linkMatch[2];
        if (feedHref && !feedHref.startsWith('http')) {
          try {
            feedHref = new URL(feedHref, urlStr).toString();
          } catch {}
        }
        if (feedHref) {
          console.log(`[Auto-Discovery] Found RSS feed link for ${sourceName}: ${feedHref}`);
          const discovered = await tryFetch(feedHref);
          if (discovered.text) {
            items = parseRssXml(discovered.text, sourceName, urlStr);
            if (items.length > 0) return items;
          }
        }
      }

      // 4. Fallback: try common RSS feed path suffixes
      const cleanUrl = urlStr.replace(/\/$/, '');
      const fallbacks = [
        `${cleanUrl}/feed/`,
        `${cleanUrl}/feed`,
        `${cleanUrl}/rss`,
        `${cleanUrl}/rss.xml`,
        `${cleanUrl}/category/news/feed`,
        `${cleanUrl}/actualites/rss`,
        `${cleanUrl}/cmlink/rss-topstories`
      ].filter((u) => u !== urlStr);

      for (const fbUrl of fallbacks) {
        const fb = await tryFetch(fbUrl);
        if (fb.text) {
          items = parseRssXml(fb.text, sourceName, urlStr);
          if (items.length > 0) {
            console.log(`[Auto-Discovery] Resolved fallback RSS feed for ${sourceName}: ${fbUrl}`);
            return items;
          }
        }
      }

      // 5. Google News RSS search fallback by domain hostname
      try {
        const parsedUrl = new URL(urlStr);
        const hostname = parsedUrl.hostname.replace(/^www\./, '');
        if (hostname) {
          const gnUrl = `https://news.google.com/rss/search?q=site:${hostname}&hl=en-US&gl=US&ceid=US:en`;
          const gnRes = await tryFetch(gnUrl);
          if (gnRes.text) {
            items = parseRssXml(gnRes.text, sourceName, urlStr);
            if (items.length > 0) {
              console.log(`[Google News Fallback] Resolved RSS feed for ${sourceName}: ${gnUrl}`);
              return items;
            }
          }
        }
      } catch {}

      return [];
    } catch (err: any) {
      console.warn(`Failed fetching RSS feed ${sourceName} (${urlStr}): ${err.message || err}`);
      return [];
    }
  }

  function isFrenchText(text: string): boolean {
    if (!text) return false;
    const sample = text.toLowerCase();
    const frenchWords = [
      ' le ', ' la ', ' les ', ' des ', ' dans ', ' pour ', ' sur ', ' avec ',
      ' sont ', ' est ', ' une ', ' un ', ' que ', ' qui ', ' ont ', ' cette ', ' par ', " qu'", " d'", " l'"
    ];
    let matchCount = 0;
    for (const w of frenchWords) {
      if (sample.includes(w)) matchCount++;
    }
    return matchCount >= 3;
  }

  function isFrenchItem(item: RawNewsItem): boolean {
    const normSource = (item.sourceName || '').toLowerCase();
    const normLink = (item.link || '').toLowerCase();
    if (
      normSource.includes('la presse') ||
      normSource.includes('radio-canada') ||
      normSource.includes('le monde') ||
      normSource.includes('le devoir') ||
      normSource.includes('le figaro') ||
      normLink.includes('lapresse.ca') ||
      normLink.includes('radio-canada.ca') ||
      normLink.includes('lemonde.fr')
    ) {
      return true;
    }
    return isFrenchText((item.title || '') + ' ' + (item.description || ''));
  }

  async function translateFrenchNewsItems(items: RawNewsItem[]): Promise<RawNewsItem[]> {
    const frenchItems = items.filter(isFrenchItem);
    if (frenchItems.length === 0) return items;

    const ai = getGeminiClient();
    if (!ai) return items;

    console.log(`[French Translator] Translating ${frenchItems.length} French article(s)...`);
    const chunkSize = 15;
    for (let i = 0; i < frenchItems.length; i += chunkSize) {
      const chunk = frenchItems.slice(i, i + chunkSize);
      const payload = chunk.map((item, idx) => ({
        id: idx,
        title: item.title,
        description: item.description,
      }));

      const prompt = `You are an expert news translator. Translate the following French news article titles and descriptions into clean, natural, accurate English.
Preserve news accuracy, key facts, proper nouns, and context.

Return JSON with a "translations" array containing objects with "id", "title", and "description".`;

      try {
        const res = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: prompt + '\n\nInput JSON:\n' + JSON.stringify(payload),
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                translations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.INTEGER },
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                    },
                    required: ['id', 'title', 'description'],
                  },
                },
              },
              required: ['translations'],
            },
          },
        });

        if (res && res.text) {
          const parsed = JSON.parse(res.text);
          if (parsed && Array.isArray(parsed.translations)) {
            parsed.translations.forEach((t: any) => {
              if (typeof t.id === 'number' && chunk[t.id]) {
                if (t.title) chunk[t.id].title = t.title.trim();
                if (t.description) chunk[t.id].description = t.description.trim();
              }
            });
          }
        }
      } catch (err) {
        console.warn('French translation batch failed:', err);
      }
    }

    return items;
  }

  // Helper for clicking through to original article URLs to scrape full article paragraphs and missing images
  async function enrichNewsItems(items: RawNewsItem[]): Promise<RawNewsItem[]> {
    const itemsToEnrich = items.filter(
      (i) => i.link && i.link.startsWith('http') && (
        stripHtml(i.description || '').length < 350 ||
        !i.images ||
        i.images.length === 0
      )
    );

    if (itemsToEnrich.length === 0) return items;

    await Promise.all(
      itemsToEnrich.slice(0, 45).map(async (item) => {
        try {
          const res = await fetch(item.link, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: AbortSignal.timeout(4500),
          });
          if (!res.ok) return;
          const html = await res.text();

          // Extract images if item currently has no images
          if (!item.images || item.images.length === 0) {
            const articleImgs = extractImagesFromArticleHtml(html, item.link);
            if (articleImgs.length > 0) {
              item.images = articleImgs;
            }
          }

          // Extract article body if description is short
          if (stripHtml(item.description || '').length < 350) {
            let cleanHtml = html
              .replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/<style[\s\S]*?<\/style>/gi, '')
              .replace(/<nav[\s\S]*?<\/nav>/gi, '')
              .replace(/<header[\s\S]*?<\/header>/gi, '')
              .replace(/<footer[\s\S]*?<\/footer>/gi, '')
              .replace(/<aside[\s\S]*?<\/aside>/gi, '')
              .replace(/<form[\s\S]*?<\/form>/gi, '');

            const articleMatch =
              cleanHtml.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
              cleanHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
              cleanHtml.match(/<div[^>]*class=["'][^"']*(?:article|story|post|entry|content|body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
            const container = articleMatch ? articleMatch[1] : cleanHtml;

            const pMatches = container.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
            const extracted: string[] = [];

            for (const pXml of pMatches) {
              const cleanP = stripHtml(pXml).trim();
              if (
                cleanP.length > 30 &&
                !isJunkOrMetadataParagraph(cleanP) &&
                !cleanP.toLowerCase().includes('cookie') &&
                !cleanP.toLowerCase().includes('all rights reserved') &&
                !cleanP.toLowerCase().includes('privacy policy') &&
                !cleanP.toLowerCase().includes('subscribe') &&
                !cleanP.toLowerCase().includes('copyright') &&
                !cleanP.toLowerCase().includes('sign up for')
              ) {
                extracted.push(cleanP);
              }
            }

            if (extracted.length > 0) {
              const fullBody = extracted.join('\n\n');
              const truncatedBody = fullBody.substring(0, 10000);
              if (truncatedBody.length > (item.description || '').length) {
                item.description = truncatedBody;
              }
            } else {
              const metaOgMatch =
                html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
                html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ||
                html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
              if (metaOgMatch && metaOgMatch[1]) {
                const metaDesc = stripHtml(metaOgMatch[1]).trim().substring(0, 10000);
                if (metaDesc.length > (item.description || '').length) {
                  item.description = metaDesc;
                }
              }
            }
          }
        } catch {}
      })
    );

    return items;
  }

  // 2. RSS Fetch Proxy API Endpoint
  app.post('/api/rss/fetch', async (req, res) => {
    try {
      const { sources, timeframeHours = 24 } = req.body as { sources: { name: string; url: string; enabled: boolean }[]; timeframeHours: number };

      if (!sources || !Array.isArray(sources)) {
        res.status(400).json({ error: 'Sources array is required' });
        return;
      }

      const activeSources = sources.filter(s => s.enabled && s.url);
      const allItems: RawNewsItem[] = [];

      const fetchResults = await Promise.all(
        activeSources.map(source => fetchAndParseFeed(source.name, source.url))
      );

      fetchResults.forEach(items => {
        allItems.push(...items);
      });

      // Filter items according to requested timeframeHours
      const cutoff = Date.now() - timeframeHours * 60 * 60 * 1000;
      const filteredItems = allItems.filter(item => {
        const itemTime = new Date(item.pubDate).getTime();
        return !isNaN(itemTime) && itemTime >= cutoff;
      });

      // Enrich items with article body text and missing images from publisher pages
      await enrichNewsItems(filteredItems);

      // Translate French items right after capture
      await translateFrenchNewsItems(filteredItems);

      res.json({ items: filteredItems, totalFetched: allItems.length });
    } catch (error: any) {
      console.error('Error in /api/rss/fetch:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch RSS feeds' });
    }
  });

  // 3. Synthesize & Anonymize API Endpoint
  app.post('/api/synthesize', async (req, res) => {
    try {
      const { items, rules = [], timeframeHours = 24, selectedModel = 'gemini-3.5-lite', primarySourceName } = req.body as {
        items: RawNewsItem[];
        rules: ReplacementRule[];
        timeframeHours: number;
        selectedModel?: string;
        primarySourceName?: string;
      };

      if (!items || !Array.isArray(items) || items.length === 0) {
        res.json({ articles: [], isAI: false, timestamp: new Date().toISOString() });
        return;
      }

      const ai = getGeminiClient();

      if (ai) {
        try {
          // Prepare payload for Gemini (include up to 200 items across all sources)
          const sortedItems = [...items]
            .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
            .slice(0, 200);

          const payload = sortedItems.map((item, index) => ({
            id: index,
            title: cleanMediaAudioVideoJunk(cleanLiveblogAndRoundupArtifacts(item.title)),
            description: cleanMediaAudioVideoJunk(cleanLiveblogAndRoundupArtifacts(item.description)),
            source: item.sourceName,
            link: item.link,
            pubDate: item.pubDate,
          }));

          const activeRules = rules.filter(r => r.enabled && r.term.trim().length > 0);

          let systemInstruction = `You are a world-class executive news editor and synthesizer.
Your task:
1. Synthesize raw news feed entries into up to 35 distinct, major headline stories representing the top news events in the defined timeframe.

2. STRICT SINGLE-TOPIC MANDATE & NO TOPIC MIXING (CRITICAL):
   - Each synthesized article MUST focus strictly and exclusively on ONE single, specific cohesive news event or subject.
   - You MUST NEVER mix, concatenate, or blend unrelated news events, different sports matches, or separate geopolitical stories into the same article, summary, or fullDetails body.
   - LIVEBLOG / ROUNDUP CLEANUP: Raw feed entries may contain live blogs or roundups with transition phrases (e.g., "Back to Ukraine, where...", "In other news...", "Here are this week's other releases...", "Meanwhile...", "Live updates:"). You MUST extract ONLY the primary main story topic of that entry and COMPLETELY STRIP/REMOVE all unrelated side updates, transition sentences, secondary product announcements, or off-topic roundup lists.

3. CONCISE FULL ARTICLE BREAKDOWN REQUIREMENT (CRITICAL):
   - 'summary' MUST be a brief 2-3 sentence executive overview card (max 30-50 words) that directly summarizes the actual factual news story event itself.
   - NO MEDIA PLAYER BOILERPLACE OR SYSTEM NOTICES (CRITICAL): Raw RSS feeds frequently contain embedded audio/video player text or browser warnings (e.g. "Listen to this article...", "The audio version of this article is generated by AI...", "To play this video you need to enable JavaScript..."). You MUST COMPLETELY EXCLUDE all media player notices, audio disclaimers, video player warnings, and JavaScript messages from 'summary' and 'fullDetails'. Every summary MUST be a real, factual summary of the news story event itself.
   - 'fullDetails' MUST be a concise, focused detailed breakdown (~100-200 words total, approx 2 to 3 short paragraphs) providing deeper background context, key developments, timelines, and implications without forbidden citations.
   - DO NOT REPEAT THE HEADLINE OR SUMMARY IN 'fullDetails': 'fullDetails' MUST BE THE CONTINUATION of the article only. DO NOT include the article title/headline or summary paragraph at the top or anywhere inside 'fullDetails'. It MUST start directly with deeper background context and detailed developments.
   - NO IMAGE CAPTIONS, CITATIONS, OR METADATA (CRITICAL): Never include phrases like "Image source, Reuters", "Photo credit", "Published 4 hours ago", or isolated subheadings/questions in 'fullDetails'.
   - NO GENERIC FILLER OR SOURCE EXPLANATIONS: Do not include meta-comments explaining the synthesis or pointing to sources. End naturally with concrete story details.

4. MANDATORY ENTITY ANONYMIZATION / CITATION FILTER:
   You MUST NEVER mention or cite any of the following restricted terms or individuals anywhere in your generated titles or summaries:
${activeRules.map(r => `   - Forbidden: "${r.term}" -> Replace with: "${r.replacement}"`).join('\n')}
   Instead of using the prohibited name/citation, describe who or what they are naturally in context (e.g. replace "Doug Ford" with "the premier of Ontario" or "the government of Ontario"; replace "Tesla" with "a leading U.S. electric automaker"). Ensure proper capitalization when substituting text at the start of sentences. The sentence must remain grammatically smooth and natural.

5. Plain Text Formatting:
   You MUST NEVER output HTML tags (such as <p>, <a>, <div>, <br>, <span>) anywhere in returned title, summary, or fullDetails fields. All text must be clean, readable plain text.

6. Return valid JSON adhering strictly to the schema provided.
Include "matchedItemIds" as an array of numerical IDs corresponding ONLY to input items that report on that EXACT same specific story.`;

          if (primarySourceName) {
            systemInstruction += `\n\n7. CRITICAL PRIMARY ANCHOR MANDATE:
- Your primary anchor news source is "${primarySourceName}".
- Every single synthesized article you generate MUST be anchored in "${primarySourceName}". This means it must report on a news event that is actually covered by at least one feed entry from "${primarySourceName}".
- You are STRONGLY FORBIDDEN from generating any synthesized article that does NOT have "${primarySourceName}" as one of its sources.
- BLENDING RULE: For each anchored story from "${primarySourceName}", you must search the rest of the news items (from all other sources) to find entries reporting on the same or related story. You should merge, integrate, and blend their developments, facts, or context into this story. Add those other sources to the "sources" list of the article, and include their input IDs in "matchedItemIds".`;
          }

          const primaryModel = selectedModel || 'gemini-3.5-lite';
          const secondaryModel = primaryModel === 'gemini-3.5-lite' ? 'gemini-3.1-flash-lite' : 'gemini-3.5-lite';
          const modelsToTry = [primaryModel, secondaryModel];
          let response: any = null;

          for (const modelName of modelsToTry) {
            try {
              response = await ai.models.generateContent({
                model: modelName,
                contents: JSON.stringify(payload),
                config: {
                  systemInstruction,
                  responseMimeType: 'application/json',
                  temperature: 0.1,
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      articles: {
                        type: Type.ARRAY,
                        description: 'At most 20 synthesized news articles',
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            title: { type: Type.STRING, description: 'Headline story title without forbidden citations' },
                            summary: { type: Type.STRING, description: 'Concise 2-3 sentence executive summary without forbidden citations' },
                            fullDetails: { type: Type.STRING, description: 'Comprehensive full-length article breakdown with 3 to 5 detailed paragraphs separated by linebreaks, providing background context, key developments, timelines, stakeholder perspectives, and implications without forbidden citations' },
                            sources: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Names of news sources covering this story' },
                            category: { type: Type.STRING, description: 'Category like World, Tech, Politics, Business' },
                            matchedItemIds: { type: Type.ARRAY, items: { type: Type.INTEGER }, description: 'List of matching input item IDs' },
                          },
                          required: ['title', 'summary', 'fullDetails', 'sources', 'matchedItemIds'],
                        },
                      },
                    },
                    required: ['articles'],
                  },
                },
              });
              if (response && response.text) break;
            } catch (err: any) {
              const errMsg = (err?.message || err?.toString() || '').toLowerCase();
              if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('resource_exhausted')) {
                // Rate limit hit for model, continue to fallback model
                continue;
              }
              break;
            }
          }

          if (response && response.text) {
            const jsonText = response.text;
            const parsed = JSON.parse(jsonText);

            if (parsed && Array.isArray(parsed.articles)) {
              const synthesizedArticles: SynthesizedArticle[] = parsed.articles.slice(0, 25).map((art: any, idx: number) => {
                const matchedIds: number[] = art.matchedItemIds || [];
                const matchedItems = matchedIds.map(id => sortedItems[id]).filter(Boolean);

                // Gather images from matched items, excluding those matching forbidden citation replacement rules
                const images: string[] = [];
                matchedItems.forEach(item => {
                  if (item.images && Array.isArray(item.images)) {
                    item.images.forEach(img => {
                      const itemContext = `${item.title} ${item.description} ${item.link} ${art.title || ''} ${art.summary || ''} ${art.fullDetails || ''}`;
                      if (!images.includes(img) && !isImageMatchingRules(img, rules, itemContext)) {
                        images.push(img);
                      }
                    });
                  }
                });

                // Gather original source links
                const sourceLinks = matchedItems.map(item => ({
                  name: item.sourceName,
                  url: item.link,
                })).filter((link, i, self) => i === self.findIndex(l => l.url === link.url));

                // Clean title, summary, and fullDetails extra safeguard with local replacement and HTML stripping
                const cleanTitle = stripHtml(cleanLiveblogAndRoundupArtifacts(applyReplacements(art.title, rules)));
                let cleanSummary = cleanMediaAudioVideoJunk(formatConciseSummary(cleanLiveblogAndRoundupArtifacts(applyReplacements(art.summary, rules))));
                if (!cleanSummary && matchedItems.length > 0) {
                  const firstDesc = cleanMediaAudioVideoJunk(stripHtml(matchedItems[0].description || ''));
                  cleanSummary = firstDesc ? splitIntoSentences(firstDesc)[0] || cleanTitle : cleanTitle;
                }
                const rawFullText = art.fullDetails ? cleanMediaAudioVideoJunk(applyReplacements(art.fullDetails, rules)) : '';
                const sanitizedP = sanitizeArticleDetailsParagraphs(rawFullText, cleanTitle, cleanSummary);
                let cleanFullDetails = sanitizedP.join('\n\n');

                // Guarantee proper minimum length and multi-paragraph coverage for fullDetails without title/summary repetition
                if (cleanFullDetails.trim().length < 200) {
                  const matchedDescriptions = matchedItems
                    .map(m => stripHtml(cleanLiveblogAndRoundupArtifacts(applyReplacements(m.description || '', rules))))
                    .filter(Boolean);

                  const extraSentences: string[] = [];
                  matchedDescriptions.forEach(txt => {
                    const sents = splitIntoSentences(txt);
                    sents.forEach(s => {
                      const trimmed = s.trim();
                      if (
                        trimmed.length > 20 &&
                        !isJunkOrMetadataParagraph(trimmed) &&
                        !extraSentences.some(e => e.toLowerCase().includes(trimmed.toLowerCase().slice(0, 30)))
                      ) {
                        extraSentences.push(trimmed);
                      }
                    });
                  });

                  if (extraSentences.length > 0) {
                    const extraParagraphs: string[] = [];
                    let chunk: string[] = [];
                    extraSentences.forEach((sent, sIdx) => {
                      chunk.push(sent);
                      if (chunk.length >= 2 || sIdx === extraSentences.length - 1) {
                        extraParagraphs.push(chunk.join(' '));
                        chunk = [];
                      }
                    });
                    const extraSanitized = sanitizeArticleDetailsParagraphs(extraParagraphs.join('\n\n'), cleanTitle, cleanSummary);
                    if (extraSanitized.length > 0) {
                      cleanFullDetails = extraSanitized.join('\n\n');
                    }
                  }
                }

                const latestTimestamp = matchedItems.length > 0
                  ? matchedItems[0].pubDate
                  : new Date().toISOString();

                return {
                  id: `ai-synth-${idx}-${Date.now()}`,
                  title: cleanTitle,
                  summary: cleanSummary,
                  fullDetails: cleanFullDetails,
                  sources: art.sources || matchedItems.map(m => m.sourceName),
                  sourceLinks: sourceLinks.length > 0 ? sourceLinks : [{ name: 'Source', url: matchedItems[0]?.link || '#' }],
                  images,
                  timestamp: latestTimestamp,
                  articleCount: matchedItems.length || 1,
                  category: art.category || 'World News',
                };
              }).filter(art => hasSufficientArticleDetails(art.fullDetails, art.title, art.summary));

              // Apply post-synthesis duplicate merging pass to combine any remaining overlapping topics
              const deduplicatedArticles = mergeDuplicateSynthesizedArticles(synthesizedArticles).slice(0, 25);

              // Filter article images with Gemini Vision against active rules
              const cleanArticles = await filterArticleImagesWithVision(deduplicatedArticles, rules, ai);

              res.json({
                articles: cleanArticles,
                isAI: true,
                timestamp: new Date().toISOString(),
              });
              return;
            }
          } else {
            console.log('Gemini API quota or rate limit reached; using local synthesis engine.');
          }
        } catch (aiError: any) {
          console.log('Gemini API notice, seamlessly executing local synthesis fallback.');
        }
      }

      // Fallback local engine
      const fallbackArticles = synthesizeLocalFallback(items, rules, timeframeHours);
      const cleanFallbackArticles = await filterArticleImagesWithVision(fallbackArticles, rules, ai);
      res.json({
        articles: cleanFallbackArticles,
        isAI: false,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('Error in /api/synthesize:', error);
      res.status(500).json({ error: error.message || 'Synthesize operation failed' });
    }
  });

  // Vite development middleware or static serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
