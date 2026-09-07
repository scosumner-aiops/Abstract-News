import express from 'express';
import path from 'path';
import fs from 'fs';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { GoogleGenAI, Type } from '@google/genai';

function jsToFirestoreValue(val: any): any {
  if (val === null || val === undefined) {
    return { nullValue: "NULL_VALUE" };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map(jsToFirestoreValue)
      }
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = jsToFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function firestoreValueToJs(val: any): any {
  if (!val) return null;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return parseFloat(val.doubleValue);
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    const values = val.arrayValue?.values || [];
    return values.map(firestoreValueToJs);
  }
  if ('mapValue' in val) {
    const fields = val.mapValue?.fields || {};
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      res[k] = firestoreValueToJs(v);
    }
    return res;
  }
  return null;
}

let firestoreConfig: any = null;

function getFirestoreConfig() {
  if (!firestoreConfig) {
    try {
      firestoreConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
    } catch (e) {
      console.warn('Failed to read firebase-applet-config.json:', e);
      firestoreConfig = {};
    }
  }
  return {
    projectId: process.env.FIREBASE_PROJECT_ID || firestoreConfig.projectId || 'lucky-blend-9wjkk',
    apiKey: process.env.FIREBASE_API_KEY || firestoreConfig.apiKey || 'AIzaSyCp_DMGJj2yMfPr5-sDqsqyZZ2XooTzFhw',
    databaseId: process.env.FIRESTORE_DATABASE_ID || firestoreConfig.firestoreDatabaseId || firestoreConfig.databaseId || 'ai-studio-abstractnews-5dac5c76-1bd6-4159-9e3f-fb2da2d47328',
  };
}

class FirestoreDocRef {
  constructor(private collectionName: string, private docId: string) {}

  private getDocUrl() {
    const { projectId, databaseId, apiKey } = getFirestoreConfig();
    return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/${this.collectionName}/${encodeURIComponent(this.docId)}?key=${apiKey}`;
  }

  async get() {
    try {
      const url = this.getDocUrl();
      const res = await fetch(url);
      if (res.status === 404) {
        return { exists: false, data: () => null };
      }
      if (!res.ok) {
        const errText = await res.text();
        console.error(`Firestore REST GET error (${res.status}):`, errText);
        return { exists: false, data: () => null };
      }
      const docJson = await res.json();
      const data = firestoreValueToJs({ mapValue: { fields: docJson.fields || {} } });
      return {
        exists: true,
        data: () => data
      };
    } catch (err) {
      console.error(`Firestore REST GET failed for ${this.docId}:`, err);
      return { exists: false, data: () => null };
    }
  }

  async set(data: any, options?: { merge?: boolean }) {
    try {
      let url = this.getDocUrl();
      const keys = Object.keys(data);
      for (const key of keys) {
        // Enclose key in backticks if it contains spaces or special characters
        const fieldPath = key.includes(' ') || key.includes('-') || key.includes('.') ? `\`${key}\`` : key;
        url += `&updateMask.fieldPaths=${encodeURIComponent(fieldPath)}`;
      }
      const fields = jsToFirestoreValue(data).mapValue?.fields || {};
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error(`Firestore REST SET error (${res.status}):`, errText);
      }
    } catch (err) {
      console.error(`Firestore REST SET failed for ${this.docId}:`, err);
    }
  }

  async delete() {
    try {
      const url = this.getDocUrl();
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) {
        const errText = await res.text();
        console.error(`Firestore REST DELETE error (${res.status}):`, errText);
      }
    } catch (err) {
      console.error(`Firestore REST DELETE failed for ${this.docId}:`, err);
    }
  }
}

class FirestoreCollectionRef {
  constructor(private collectionName: string) {}
  doc(docId: string) {
    return new FirestoreDocRef(this.collectionName, docId);
  }
}

class FirestoreDbClient {
  collection(collectionName: string) {
    return new FirestoreCollectionRef(collectionName);
  }
}

const dbClient = new FirestoreDbClient();

function getDb(): any {
  return dbClient;
}
import {
  parseRssXml,
  extractImagesFromArticleHtml,
  isGoogleNewsPlaceholder,
  synthesizeLocalFallback,
  applyReplacements,
  cleanCitationGrammarGlitches,
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
import { RawNewsItem, ReplacementRule, SynthesizedArticle, TopicPreference } from './src/types';
import { isNonEnglishText } from './src/utils/language';
import { DEFAULT_SOURCES, DEFAULT_RULES, DEFAULT_TOPIC_PREFERENCES } from './src/utils/defaultSettings';

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

export const app = express();

// Trust proxy for Cloud Run, Vercel, and reverse proxies
app.set('trust proxy', 1);

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
      if (!defaultDoc.exists || !Array.isArray(defaultDoc.data()?.sources) || defaultDoc.data().sources.length === 0) {
        await getDb().collection('userSettings').doc('default_settings').set({
          sources: DEFAULT_SOURCES,
          rules: DEFAULT_RULES,
          topicPreferences: DEFAULT_TOPIC_PREFERENCES,
          timeframeValue: '24',
          showImages: true,
          selectedModel: 'gemini-3.5-lite',
          primarySourceId: 'none',
          updatedAt: new Date().toISOString(),
        });
        console.log('Default settings successfully initialized in Firestore.');
      }
    } catch (err) {
      console.error('Failed to initialize default settings in Firestore:', err);
    }
  }

  // Helper to load default settings
  async function loadDefaultSettings() {
    try {
      const doc = await getDb().collection('userSettings').doc('default_settings').get();
      if (doc.exists && Array.isArray(doc.data()?.sources) && doc.data().sources.length > 0) {
        return doc.data();
      }
    } catch (err) {
      console.error('Failed to read defaultSettings from Firestore:', err);
    }
    return {
      sources: DEFAULT_SOURCES,
      rules: DEFAULT_RULES,
      topicPreferences: DEFAULT_TOPIC_PREFERENCES,
      timeframeValue: '24',
      showImages: true,
      selectedModel: 'gemini-3.5-lite',
      primarySourceId: 'none',
    };
  }

  async function loadUserSettingsForGoogleUser(email: string): Promise<any> {
    const cleanEmail = email.toLowerCase().trim();
    try {
      const docRef = getDb().collection('userSettings').doc(cleanEmail);
      const doc = await docRef.get();

      if (doc.exists) {
        const data = doc.data() || {};
        let needsSave = false;
        if (!Array.isArray(data.sources) || data.sources.length === 0) {
          const defaultSettings = await loadDefaultSettings();
          data.sources = defaultSettings.sources || DEFAULT_SOURCES;
          needsSave = true;
        }
        if (!Array.isArray(data.rules)) {
          const defaultSettings = await loadDefaultSettings();
          data.rules = defaultSettings.rules || DEFAULT_RULES;
          needsSave = true;
        }
        if (!Array.isArray(data.topicPreferences)) {
          data.topicPreferences = [];
          needsSave = true;
        }
        if (data['Google user'] !== cleanEmail) {
          data['Google user'] = cleanEmail;
          needsSave = true;
        }
        if (needsSave) {
          await docRef.set({ ...data, 'Google user': cleanEmail }, { merge: true }).catch(() => {});
        }
        return data;
      }

      // First time login for this Google user: preload with default_settings from Firestore
      console.log(`Preloading new Firestore document for first-time Google user: ${cleanEmail}`);
      const defaultSettings = await loadDefaultSettings();

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
      const defaultSettings = await loadDefaultSettings();
      return { ...defaultSettings, 'Google user': cleanEmail };
    }
  }

  async function saveUserSettingsForGoogleUser(email: string, settings: any) {
    const cleanEmail = email.toLowerCase().trim();
    try {
      // Ensure we don't save empty sources list unless explicitly intended
      if (!Array.isArray(settings.sources) || settings.sources.length === 0) {
        settings.sources = DEFAULT_SOURCES;
      }
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

    // Fast-path: check if URL, filename, or slug matches citation anonymizer terms
    if (isImageMatchingRules(imageUrl, activeRules)) {
      return true;
    }

    // Skip Vision API calls if quota was exceeded recently
    if (Date.now() < visionQuotaCooldownUntil) {
      return false;
    }

    const termsList = activeRules.map(r => r.term.trim()).filter(Boolean);
    const cacheKey = `${imageUrl}::${termsList.sort().join('|')}`;

    if (visionCache.has(cacheKey)) {
      return visionCache.get(cacheKey)!;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const imageRes = await fetch(imageUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });
      clearTimeout(timeout);

      if (!imageRes.ok) {
        return false;
      }

      const contentType = (imageRes.headers.get('content-type') || '').toLowerCase();
      if (!contentType.startsWith('image/')) {
        return false;
      }

      const arrayBuffer = await imageRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length < 500 || buffer.length > 15 * 1024 * 1024) {
        return false;
      }

      // Safeguard against HTML error pages returned with image content-type
      const firstChunk = buffer.slice(0, 16).toString('utf8').toLowerCase();
      if (firstChunk.includes('<!') || firstChunk.includes('<html') || firstChunk.includes('<?xml')) {
        return false;
      }

      let mimeType = 'image/jpeg';
      if (contentType.includes('png')) mimeType = 'image/png';
      else if (contentType.includes('webp')) mimeType = 'image/webp';
      else if (contentType.includes('gif')) mimeType = 'image/gif';

      const base64Data = buffer.toString('base64');

      const prompt = `You are a strict news media anonymizer and citation filter.
The following is the active citation anonymizer list of prohibited public figures or entities:
${termsList.map(t => `- "${t}"`).join('\n')}

Analyze this news photograph with extreme scrutiny:
1. Thoroughly inspect EVERY individual person depicted anywhere in the image (foreground, background, seated at desks or tables, standing, speaking at podiums, attending summits or bilateral meetings, or walking).
2. CRITICAL MANDATE: If ANY of the prohibited individuals from the list above appears anywhere in this image—even if they are sitting or standing next to another leader, foreign prime minister, host, or official (such as in bilateral meetings, trade negotiations, summits, or joint press conferences)—you MUST identify them and flag the image as forbidden.
3. Check recognizable facial features, hair, profile, body shape, and name placards.
4. If ANY prohibited individual is visually depicted or present, respond strictly with JSON:
   {"forbidden": true, "detected": "Name of prohibited person"}
5. If NO prohibited individuals are present in this image, respond strictly with JSON:
   {"forbidden": false, "detected": ""}`;

      const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];
      let visionResponse: any = null;

      for (const model of modelsToTry) {
        try {
          visionResponse = await ai.models.generateContent({
            model,
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
            break;
          }
        } catch (modelErr: any) {
          const errMsg = (modelErr?.message || modelErr?.toString() || '').toLowerCase();
          if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('resource_exhausted')) {
            visionQuotaCooldownUntil = Date.now() + 3 * 60 * 1000;
            break;
          }
        }
      }

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
        visionQuotaCooldownUntil = Date.now() + 3 * 60 * 1000;
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

    // Collect all candidate image URLs across all articles
    const allUrls = Array.from(
      new Set(articles.flatMap(a => a.images || []).filter(img => !isImageMatchingRules(img, activeRules)))
    );

    if (allUrls.length === 0) {
      return articles.map(art => ({
        ...art,
        images: (art.images || []).filter(img => !isImageMatchingRules(img, activeRules)),
      }));
    }

    const forbiddenMap = new Map<string, boolean>();
    const batchSize = 5;

    for (let i = 0; i < allUrls.length; i += batchSize) {
      if (Date.now() < visionQuotaCooldownUntil) break;
      const batch = allUrls.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (url) => {
          try {
            const isForbidden = await checkImageVisionForbidden(url, activeRules, ai);
            forbiddenMap.set(url, isForbidden);
          } catch {
            forbiddenMap.set(url, false);
          }
        })
      );
    }

    return articles.map(art => {
      if (!art.images || art.images.length === 0) return art;
      const cleanImages = art.images.filter(img => {
        if (isImageMatchingRules(img, activeRules)) return false;
        if (forbiddenMap.get(img) === true) return false;
        return true;
      });
      return {
        ...art,
        images: cleanImages,
      };
    });
  }

  // Global Request Logger for API and Auth routes
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/auth')) {
      console.log(`[HTTP ${req.method}] ${req.path} | Host: ${req.get('host') || 'none'} | X-Forwarded-Host: ${req.get('x-forwarded-host') || 'none'} | Query: ${JSON.stringify(req.query)}`);
    }
    next();
  });

  // 1. Health Check
  app.get('/api/health', (req, res) => {
    const hasKey = Boolean(process.env.GEMINI_API_KEY);
    const hasOauth = Boolean(process.env.OAUTH_CLIENT_ID);
    console.log(`[Health Check] aiEnabled: ${hasKey}, hasOauth: ${hasOauth}`);
    res.json({ status: 'ok', aiEnabled: hasKey, hasOauth });
  });

  // Helper to determine the accurate public redirect URI for Google OAuth
  function getRedirectUri(req: express.Request): string {
    // 1. Explicit APP_URL configured by user
    if (process.env.APP_URL) {
      const baseUrl = process.env.APP_URL.replace(/\/$/, '');
      const uri = `${baseUrl}/auth/google/callback`;
      console.log(`[OAuth Diagnostic] Redirect URI from APP_URL: ${uri}`);
      return uri;
    }

    // 2. Host header from x-forwarded-host (e.g. abstract-news.vercel.app on Vercel)
    const xForwardedHost = req.get('x-forwarded-host');
    const xForwardedProto = req.get('x-forwarded-proto') || 'https';
    if (xForwardedHost && !xForwardedHost.includes('localhost') && xForwardedHost !== '127.0.0.1') {
      const uri = `${xForwardedProto}://${xForwardedHost}/auth/google/callback`;
      console.log(`[OAuth Diagnostic] Redirect URI from x-forwarded-host (${xForwardedHost}): ${uri}`);
      return uri;
    }

    // 3. Vercel System Env VERCEL_URL
    if (process.env.VERCEL_URL) {
      const cleanVercelUrl = process.env.VERCEL_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const uri = `https://${cleanVercelUrl}/auth/google/callback`;
      console.log(`[OAuth Diagnostic] Redirect URI from VERCEL_URL: ${uri}`);
      return uri;
    }

    // 4. Host header fallback
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    const uri = `${protocol}://${host}/auth/google/callback`;
    console.log(`[OAuth Diagnostic] Redirect URI from host header (${host}): ${uri}`);
    return uri;
  }

  // 1a. Get Google OAuth URL for direct popup launch
  app.get('/api/auth/url', (req, res) => {
    console.log('[OAuth Step 1] Request received at /api/auth/url');
    const clientId = process.env.OAUTH_CLIENT_ID;
    const clientSecret = process.env.OAUTH_CLIENT_SECRET;

    if (!clientId) {
      console.error('[OAuth Error] OAUTH_CLIENT_ID environment variable is MISSING on server!');
      return res.status(400).json({
        error: 'OAuth Client ID not configured',
        hasClientId: false,
        hasClientSecret: Boolean(clientSecret),
      });
    }

    if (!clientSecret) {
      console.warn('[OAuth Warning] OAUTH_CLIENT_SECRET environment variable is MISSING on server!');
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

    console.log(`[OAuth Step 1 Success] Generated Auth URL with redirectUri=${redirectUri}`);
    res.json({ url: authUrl, redirectUri });
  });

  // 1b. Google OAuth Initiate
  app.get('/auth/google', (req, res) => {
    console.log('[OAuth Step 1] Request received at /auth/google');
    const clientId = process.env.OAUTH_CLIENT_ID;
    if (!clientId) {
      console.error('[OAuth Error] /auth/google invoked but OAUTH_CLIENT_ID is MISSING!');
      if (req.query.popup === 'true') {
        return res.send(`
          <html>
            <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
              <div style="text-align: center; padding: 24px; background: #1e293b; border-radius: 12px; max-width: 400px; border: 1px solid #334155;">
                <h3 style="margin-top:0;">OAuth Client ID Not Configured</h3>
                <p style="font-size: 14px; color: #94a3b8;">Please enter your <code>OAUTH_CLIENT_ID</code> and <code>OAUTH_CLIENT_SECRET</code> in your Vercel Environment Variables.</p>
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

    console.log(`[OAuth Step 1 Redirecting] Redirecting user to Google accounts page with redirectUri=${redirectUri}`);
    res.redirect(authUrl);
  });

  // 1c. Google OAuth Callback
  app.get('/auth/google/callback', async (req, res) => {
    console.log('[OAuth Callback] Received callback request from Google');
    const { code, state, error: googleError } = req.query;

    if (googleError) {
      console.error(`[OAuth Callback Error from Google] Google returned error parameter: ${googleError}`);
      return res.status(400).send(`Google authentication error: ${googleError}`);
    }

    if (!code || typeof code !== 'string') {
      console.error('[OAuth Callback Error] Missing authorization code parameter');
      return res.status(400).send('Missing authorization code parameter.');
    }

    const clientId = process.env.OAUTH_CLIENT_ID;
    const clientSecret = process.env.OAUTH_CLIENT_SECRET;
    const redirectUri = req.session.oauthRedirectUri || getRedirectUri(req);

    console.log(`[OAuth Callback Config Check] Client ID set: ${Boolean(clientId)}, Client Secret set: ${Boolean(clientSecret)}, Redirect URI: ${redirectUri}`);

    if (!clientId || !clientSecret) {
      console.error('[OAuth Callback Fatal Error] OAUTH_CLIENT_ID or OAUTH_CLIENT_SECRET is missing on the server!');
      return res.status(500).send('Server configuration error: OAUTH_CLIENT_ID or OAUTH_CLIENT_SECRET is missing.');
    }

    try {
      console.log('[OAuth Callback Step 2] Requesting token exchange from Google (https://oauth2.googleapis.com/token)...');
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        console.error(`[OAuth Callback Error] Token exchange failed with HTTP ${tokenRes.status}: ${errBody}`);
        return res.status(500).send(`Failed token exchange with Google: ${errBody}`);
      }

      const tokens = await tokenRes.json();
      const accessToken = tokens.access_token;
      console.log('[OAuth Callback Step 2 Success] Successfully exchanged code for Google access token');

      console.log('[OAuth Callback Step 3] Fetching user profile from Google userinfo endpoint...');
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!profileRes.ok) {
        const profileErr = await profileRes.text();
        console.error(`[OAuth Callback Error] Profile fetch failed with HTTP ${profileRes.status}: ${profileErr}`);
        return res.status(500).send('Failed to fetch user profile.');
      }

      const profile = await profileRes.json();
      console.log(`[OAuth Callback Step 3 Success] User profile retrieved: email=${profile.email}, name=${profile.name}`);

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

      const isPopup = req.session.isPopup || (typeof state === 'string' && state.startsWith('popup_'));
      console.log(`[OAuth Callback Complete] Session populated for user=${user.email} (isPopup=${isPopup})`);

      req.session.save((err) => {
        if (err) {
          console.error('[OAuth Callback Session Save Error]', err);
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
      console.error('[OAuth Callback Exception] Exception during callback processing:', err);
      res.status(500).send(`Authentication error occurred: ${err.message || err}`);
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
      const defaultSettings = await loadDefaultSettings();
      return res.json({ settings: defaultSettings, userKey: 'guest', isGuest: true });
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
      return [
        'https://www.independent.co.uk/news/rss',
        'https://www.independent.co.uk/rss',
        'https://news.google.com/rss/search?q=site:independent.co.uk&hl=en-GB&gl=GB&ceid=GB:en'
      ];
    }
    if (normName.includes('la presse') || normName.includes('lapresse') || normUrl.includes('lapresse.ca')) {
      return [
        'https://www.lapresse.ca/actualites/rss',
        'https://www.lapresse.ca/manchettes/rss',
        'https://www.lapresse.ca/international/rss',
        'https://news.google.com/rss/search?q=site:lapresse.ca&hl=fr&gl=CA&ceid=CA:fr'
      ];
    }
    if (normName.includes('global news') || normUrl.includes('globalnews.ca')) {
      return [
        'https://globalnews.ca/feed/',
        'https://globalnews.ca/canada/feed/',
        'https://news.google.com/rss/search?q=site:globalnews.ca&hl=en-CA&gl=CA&ceid=CA:en'
      ];
    }
    if (normName.includes('cbc') || normUrl.includes('cbc.ca')) {
      return [
        'https://www.cbc.ca/cmlink/rss-topstories',
        'https://www.cbc.ca/cmlink/rss-canada',
        'https://rss.cbc.ca/lineup/topstories.xml',
        'https://news.google.com/rss/search?q=site:cbc.ca&hl=en-CA&gl=CA&ceid=CA:en'
      ];
    }
    if (normName.includes('national post') || normUrl.includes('nationalpost.com')) {
      return [
        'https://nationalpost.com/category/news/feed',
        'https://nationalpost.com/feed',
        'https://nationalpost.com/rss',
        'https://news.google.com/rss/search?q=site:nationalpost.com&hl=en-CA&gl=CA&ceid=CA:en'
      ];
    }
    if (normName.includes('montreal gazette') || normUrl.includes('montrealgazette.com')) {
      return [
        'https://news.google.com/rss/search?q=site:montrealgazette.com&hl=en-CA&gl=CA&ceid=CA:en',
        'https://montrealgazette.com/category/news/feed'
      ];
    }
    if (normName.includes('globo') || normUrl.includes('globo.com')) {
      return [
        'https://g1.globo.com/rss/g1/',
        'https://news.google.com/rss/search?q=site:g1.globo.com&hl=pt-BR&gl=BR&ceid=BR:pt'
      ];
    }
    if (normName.includes('guardian') || normUrl.includes('theguardian.com')) {
      return [
        'https://www.theguardian.com/world/rss',
        'https://www.theguardian.com/business/rss',
        'https://www.theguardian.com/uk/rss',
        'https://www.theguardian.com/international/rss',
        'https://news.google.com/rss/search?q=site:theguardian.com&hl=en-GB&gl=GB&ceid=GB:en'
      ];
    }
    if (normName.includes('reuters') || normUrl.includes('reuters.com')) {
      return [
        'https://news.google.com/rss/search?q=site:reuters.com&hl=en-US&gl=US&ceid=US:en'
      ];
    }
    if (normName.includes('associated press') || normUrl.includes('apnews.com') || normName === 'ap news') {
      return [
        'https://news.google.com/rss/search?q=site:apnews.com&hl=en-US&gl=US&ceid=US:en'
      ];
    }
    if (normName.includes('deutsche welle') || normName === 'dw' || normUrl.includes('dw.com')) {
      return [
        'https://rss.dw.com/xml/rss-en-all',
        'https://rss.dw.com/rdf/rss-en-all',
        'https://news.google.com/rss/search?q=site:dw.com&hl=en-US&gl=US&ceid=US:en'
      ];
    }
    if (normName.includes('france 24') || normUrl.includes('france24.com')) {
      return [
        'https://www.france24.com/en/rss',
        'https://news.google.com/rss/search?q=site:france24.com&hl=en-US&gl=US&ceid=US:en'
      ];
    }
    if (normName.includes('al jazeera') || normUrl.includes('aljazeera.com')) {
      return [
        'https://www.aljazeera.com/xml/rss/all.xml',
        'https://news.google.com/rss/search?q=site:aljazeera.com&hl=en-US&gl=US&ceid=US:en'
      ];
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
      if (priorityCandidates.length > 0) {
        const fetchPromises = priorityCandidates.map(async (targetUrl) => {
          const directRes = await tryFetch(targetUrl);
          if (directRes.text) {
            return parseRssXml(directRes.text, sourceName, urlStr);
          }
          return [];
        });

        const results = await Promise.all(fetchPromises);
        const allMergedItems: RawNewsItem[] = [];
        const seenLinks = new Set<string>();

        results.forEach((items) => {
          items.forEach((item) => {
            const cleanLink = (item.link || '').trim().toLowerCase();
            if (cleanLink && !seenLinks.has(cleanLink)) {
              seenLinks.add(cleanLink);
              allMergedItems.push(item);
            }
          });
        });

        if (allMergedItems.length > 0) {
          return allMergedItems;
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

  async function resolveRealPublisherArticle(title: string, sourceName: string): Promise<{ url: string; images: string[] } | null> {
    if (!title || !sourceName) return null;
    const normSource = sourceName.toLowerCase();
    let directFeeds: string[] = [];

    if (normSource.includes('guardian')) {
      directFeeds = [
        'https://www.theguardian.com/business/rss',
        'https://www.theguardian.com/world/rss',
        'https://www.theguardian.com/uk/rss',
        'https://www.theguardian.com/international/rss'
      ];
    } else if (normSource.includes('al jazeera') || normSource.includes('aljazeera')) {
      directFeeds = ['https://www.aljazeera.com/xml/rss/all.xml'];
    } else if (normSource.includes('independent')) {
      directFeeds = ['https://www.independent.co.uk/news/rss', 'https://www.independent.co.uk/rss'];
    } else if (normSource.includes('cbc')) {
      directFeeds = ['https://www.cbc.ca/cmlink/rss-topstories', 'https://www.cbc.ca/cmlink/rss-canada'];
    } else if (normSource.includes('la presse') || normSource.includes('lapresse')) {
      directFeeds = ['https://www.lapresse.ca/actualites/rss', 'https://www.lapresse.ca/manchettes/rss'];
    } else if (normSource.includes('global news')) {
      directFeeds = ['https://globalnews.ca/feed/'];
    }

    for (const feedUrl of directFeeds) {
      try {
        const res = await fetch(feedUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AbstractNews/1.0 RSS Reader' },
          signal: AbortSignal.timeout(4000)
        });
        if (!res.ok) continue;
        const xml = await res.text();
        const items = parseRssXml(xml, sourceName, feedUrl);

        const titleWords = title.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3);
        if (titleWords.length === 0) continue;

        for (const item of items) {
          const itemTitleNorm = item.title.toLowerCase().replace(/[^\w\s]/g, '');
          const matches = titleWords.filter(w => itemTitleNorm.includes(w));
          const matchRatio = matches.length / titleWords.length;

          if (matchRatio >= 0.45) {
            let imgs = (item.images || []).filter(img => !isGoogleNewsPlaceholder(img));
            if (imgs.length === 0 && item.link && item.link.startsWith('http')) {
              try {
                const pageRes = await fetch(item.link, {
                  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                  signal: AbortSignal.timeout(4000)
                });
                if (pageRes.ok) {
                  const html = await pageRes.text();
                  imgs = extractImagesFromArticleHtml(html, item.link).filter(img => !isGoogleNewsPlaceholder(img));
                }
              } catch {}
            }
            return { url: item.link, images: imgs };
          }
        }
      } catch {}
    }

    return null;
  }

  // Helper for clicking through to original article URLs to scrape full article paragraphs and missing images
  async function enrichNewsItems(items: RawNewsItem[]): Promise<RawNewsItem[]> {
    // Clean all items first: remove Google News placeholder images/logos
    for (const item of items) {
      item.images = (item.images || []).filter(img => !isGoogleNewsPlaceholder(img));
    }

    const itemsToEnrich = items.filter(
      (i) => i.link && i.link.startsWith('http') && (
        stripHtml(i.description || '').length < 350 ||
        !i.images ||
        i.images.length === 0 ||
        i.link.includes('news.google.com')
      )
    );

    if (itemsToEnrich.length === 0) return items;

    // Process up to 100 items in parallel chunks of 25 to avoid timing out
    const chunkSize = 25;
    const candidates = itemsToEnrich.slice(0, 100);
    for (let c = 0; c < candidates.length; c += chunkSize) {
      const chunk = candidates.slice(c, c + chunkSize);
      await Promise.all(
        chunk.map(async (item) => {
          try {
            // If item has a Google News link or no images, try resolving direct publisher link first
            if (item.link.includes('news.google.com') || !item.images || item.images.length === 0) {
              const resolved = await resolveRealPublisherArticle(item.title, item.sourceName);
              if (resolved && resolved.url) {
                item.link = resolved.url;
                if (resolved.images && resolved.images.length > 0) {
                  item.images = resolved.images;
                }
              }
            }

            // Now fetch original article page if link is a direct publisher URL
            if (item.link && !item.link.includes('news.google.com')) {
              const res = await fetch(item.link, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
                signal: AbortSignal.timeout(4500),
              });
              if (res.ok) {
                const html = await res.text();

                // Extract images if item currently has no images
                if (!item.images || item.images.length === 0) {
                  const articleImgs = extractImagesFromArticleHtml(html, item.link).filter(img => !isGoogleNewsPlaceholder(img));
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
              }
            }
          } catch {}
        })
      );
    }

    return items;
  }

  // Fallback search mechanism to ensure every synthesized article gets a high-resolution news photo
  async function fetchFallbackImagesForArticleTitle(title: string, rules: ReplacementRule[]): Promise<string[]> {
    if (!title || title.trim().length < 5) return [];
    try {
      const cleanSearchQuery = title.replace(/['"’]/g, '').trim();
      const searchUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(cleanSearchQuery)}&hl=en-US&gl=US&ceid=US:en`;
      const res = await fetch(searchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AbstractNews/1.0 RSS Reader' },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return [];
      const xml = await res.text();
      const itemMatches = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi));
      for (const itemXml of itemMatches.slice(0, 3)) {
        const linkMatch = itemXml[0].match(/<link>([^<]+)<\/link>/i);
        if (linkMatch) {
          const itemLink = linkMatch[1].replace(/&amp;/g, '&').trim();
          const artRes = await fetch(itemLink, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            signal: AbortSignal.timeout(4000),
          });
          if (artRes.ok) {
            const html = await artRes.text();
            const extracted = extractImagesFromArticleHtml(html, itemLink, rules);
            const clean = extracted.filter(img => !isGoogleNewsPlaceholder(img) && !isImageMatchingRules(img, rules));
            if (clean.length > 0) return clean;
          }
        }
      }
    } catch {}
    return [];
  }

  async function ensureImagesForArticles(articles: SynthesizedArticle[], rules: ReplacementRule[]): Promise<SynthesizedArticle[]> {
    await Promise.all(
      articles.map(async (art) => {
        art.images = (art.images || []).filter(img => !isGoogleNewsPlaceholder(img) && !isImageMatchingRules(img, rules));

        // 1. Scrape lead images across all direct publisher sources if article has multiple feeds and few images
        if (art.images.length < 3 && art.sourceLinks && art.sourceLinks.length > 0) {
          const directLinks = art.sourceLinks
            .map(l => l.url)
            .filter(u => u && !u.includes('news.google.com') && u.startsWith('http'));

          await Promise.all(
            directLinks.slice(0, 5).map(async (linkUrl) => {
              try {
                const pageRes = await fetch(linkUrl, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                  },
                  signal: AbortSignal.timeout(4000),
                });
                if (pageRes.ok) {
                  const html = await pageRes.text();
                  const scraped = extractImagesFromArticleHtml(html, linkUrl, rules);
                  scraped.forEach((img) => {
                    if (!art.images.includes(img) && !isGoogleNewsPlaceholder(img) && !isImageMatchingRules(img, rules)) {
                      art.images.push(img);
                    }
                  });
                }
              } catch {}
            })
          );
        }

        // 2. If article still has zero images, search via news headline query
        if (!art.images || art.images.length === 0) {
          const fallbackImgs = await fetchFallbackImagesForArticleTitle(art.title, rules);
          if (fallbackImgs.length > 0) {
            art.images = fallbackImgs.filter(img => !isGoogleNewsPlaceholder(img) && !isImageMatchingRules(img, rules));
          }
        }
      })
    );
    return articles;
  }

  async function ensureArticlesInEnglish(
    articles: SynthesizedArticle[],
    ai: GoogleGenAI | null,
    rules: ReplacementRule[]
  ): Promise<SynthesizedArticle[]> {
    const nonEnglishIndices: number[] = [];
    articles.forEach((art, idx) => {
      const sample = `${art.title} ${art.summary || ''}`;
      if (isNonEnglishText(sample)) {
        nonEnglishIndices.push(idx);
      }
    });

    if (nonEnglishIndices.length === 0) return articles;

    console.log(`[Translation] Detected ${nonEnglishIndices.length} non-English article(s). Translating to English before publishing...`);

    if (!ai) return articles;

    await Promise.all(
      nonEnglishIndices.map(async (idx) => {
        const art = articles[idx];
        try {
          const prompt = `You are a world-class news editor and professional journalistic translator.
Translate the following news story completely and fluently into professional, journalistic ENGLISH before publishing.
- CRITICAL: Title, summary, and full details MUST be in clear, natural English.
- Preserve all concrete facts, names, dates, quotes, figures, and meaning accurately.
- Completely strip any remaining HTML, CDATA tags, and stray delimiters (like "]]>").
- Do NOT output any preamble, meta-comments, or explanatory notes.

Story to translate:
Title: ${art.title}
Summary: ${art.summary || ''}
Full Details: ${art.fullDetails || ''}

Return valid JSON adhering strictly to:
{
  "title": "Natural journalistic headline in English",
  "summary": "Crisp 1-2 sentence executive summary in English (approx 25-45 words)",
  "fullDetails": "2-4 paragraphs with concrete facts and numbers in English"
}`;

          const translationModels = ['gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-3.5-flash-lite'];
          let translatedText = '';

          for (const modelName of translationModels) {
            try {
              const resp = await ai.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                  responseMimeType: 'application/json',
                  temperature: 0.1,
                },
              });
              translatedText = resp.text || '';
              if (translatedText) break;
            } catch (mErr: any) {
              // Try next model
            }
          }

          if (!translatedText) return;

          const parsed = JSON.parse(translatedText);
          if (parsed.title) {
            art.title = cleanCitationGrammarGlitches(stripHtml(cleanLiveblogAndRoundupArtifacts(applyReplacements(parsed.title, rules))));
          }
          if (parsed.summary) {
            art.summary = cleanCitationGrammarGlitches(cleanMediaAudioVideoJunk(formatConciseSummary(cleanLiveblogAndRoundupArtifacts(applyReplacements(parsed.summary, rules)))));
          }
          if (parsed.fullDetails) {
            art.fullDetails = cleanCitationGrammarGlitches(cleanMediaAudioVideoJunk(cleanLiveblogAndRoundupArtifacts(applyReplacements(parsed.fullDetails, rules))));
          }
          console.log(`[Translation] Successfully translated to English: "${art.title}"`);
        } catch (err: any) {
          console.error(`[Translation Error] Failed translating article "${art.title}":`, err.message);
        }
      })
    );

    return articles;
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
      const { items, rules = [], topics = [], timeframeHours = 24, selectedModel = 'gemini-3.5-lite', primarySourceName } = req.body as {
        items: RawNewsItem[];
        rules: ReplacementRule[];
        topics?: TopicPreference[];
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
          const activeTopics = (topics || []).filter(t => t.enabled && t.topic && t.topic.trim().length > 0);
          const seeMoreTopics = activeTopics.filter(t => t.weight === 'more').map(t => t.topic.trim());
          const seeLessTopics = activeTopics.filter(t => t.weight === 'less').map(t => t.topic.trim());

          let systemInstruction = `You are a world-class executive news editor and synthesizer.
Your task:
1. Synthesize raw news feed entries into up to 35 distinct, major headline stories representing the top news events in the defined timeframe.

2. STRICT SINGLE-TOPIC MANDATE & NO TOPIC MIXING (CRITICAL):
   - Each synthesized article MUST focus strictly and exclusively on ONE single, specific cohesive news event or subject.
   - You MUST NEVER mix, concatenate, or blend unrelated news events, different sports matches, or separate geopolitical stories into the same article, summary, or fullDetails body.
   - LIVEBLOG / ROUNDUP CLEANUP: Raw feed entries may contain live blogs or roundups with transition phrases (e.g., "Back to Ukraine, where...", "In other news...", "Here are this week's other releases...", "Meanwhile...", "Live updates:"). You MUST extract ONLY the primary main story topic of that entry and COMPLETELY STRIP/REMOVE all unrelated side updates, transition sentences, secondary product announcements, or off-topic roundup lists.

3. MANDATORY ENGLISH TRANSLATION & PUBLISHING STANDARD (CRITICAL):
   - ALL synthesized articles (including 'title', 'summary', 'fullDetails', and 'category') MUST be written in fluent, natural, journalistic ENGLISH.
   - If any input feed item or story is written in Portuguese (such as Globo G1), Spanish, French, German, Italian, Russian, Arabic, Chinese, Japanese, or ANY language other than English, YOU MUST ACCURATELY AND COMPLETELY TRANSLATE AND SYNTHESIZE IT ENTIRELY INTO CLEAR, FLUENT ENGLISH.
   - You are STRICTLY FORBIDDEN from publishing foreign language headlines, summaries, or details. All output stories must be translated into English before publishing.

4. SIMPLIFIED, DIRECT LANGUAGE & HIGH-DENSITY REPORTING (CRITICAL):
   a. PLAIN, DIRECT LANGUAGE — NO WORDINESS, NO FILLER:
      - Write in clean, straightforward, plain English. Get straight to the point.
      - Use active voice and crisp, concise sentences. Avoid passive, winding phrasing.
      - ELIMINATE EMPTY FILLER AND JOURNALISTIC CLICHES: Do NOT use phrases like "In a dramatic turn of events", "This development comes as", "It remains to be seen", "Observers note that", "Highlighting the broader significance", "Against the backdrop of", "Taking center stage", "Amid growing tensions".
      - State facts, actions, and consequences plainly without preamble or decorative fluff.

   b. SUMMARY CARD: CONCISE, PUNCHY, AND TO THE POINT:
      - 'summary' MUST be a crisp 1 to 2 sentence executive card (approx 25 to 45 words).
      - Directly state: Who did what, where, and the immediate outcome.
      - Zero fluff, zero preamble, zero wordiness.

   c. 'SHOW MORE' (fullDetails): MORE FACTS AND INSIGHTS, NOT MORE WORDS:
      - Focus on high factual density rather than word volume. Do NOT pad with fluff, wordy exposition, or repetitive restatements.
      - Provide 2 to 4 tight, substantive paragraphs (approx 180 to 300 words total) separated by double linebreaks (\n\n).
      - PACK EVERY PARAGRAPH WITH CONCRETE DETAILS:
        * Hard numbers, percentages, dollar figures, casualty/damage metrics, vote tallies, and dates.
        * Specific names, titles, government agencies, courts, and corporate entities.
        * Official policy decisions, regulatory actions, treaty articles, or contractual terms.
        * Direct, verifiable quotes and explicit statements from key stakeholders.
      - DELIVER MEANINGFUL INSIGHTS (THE "WHY" AND "WHAT'S NEXT"):
        * Explain underlying drivers, geopolitical or market catalysts, and strategic motivations.
        * Outline concrete upcoming milestones: scheduled votes, court hearings, appeals, regulatory deadlines, or operational next steps.
      - STRICT ZERO-REPETITION MANDATE (NO REPEAT TOPICS / NO ECHOING):
        * 'fullDetails' MUST NEVER repeat, rephrase, or re-state what was already stated in the headline or the summary.
        * It MUST start immediately with deeper factual context and chronological developments.
        * Each subsequent paragraph in 'fullDetails' MUST address a fresh, distinct aspect (e.g., Paragraph 1: Hard figures & timeline; Paragraph 2: Conflicting stakeholder statements & official quotes; Paragraph 3: Strategic insights & next milestones). Never circle back to repeat earlier points.
      - NO MEDIA PLAYER NOTICES OR SYSTEM TEXT: Completely strip all audio/video player text (e.g., "Listen to this article", "To play this video enable JavaScript").
      - NO METADATA OR CAPTIONS: Never include photo credits, time stamps, or isolated subheadings.
      - NO GENERIC FILLER OR SOURCE EXPLANATIONS: Do not include meta-comments explaining the synthesis or pointing to sources. End naturally with concrete facts.

4. TARGETED REPLACEMENT RULES & MANDATORY NAMING OF ALL NON-RESTRICTED ENTITIES (CRITICAL):
   a. STRICT TARGETED REPLACEMENTS & FLAWLESS GRAMMATICAL INTEGRATION:
      You MUST ONLY replace terms that match the following specific forbidden rules:
${activeRules.map(r => `      * Replace: "${r.term}" -> With: "${r.replacement}"`).join('\n')}
      Instead of using the prohibited name/citation, describe who or what they are naturally in context (e.g. replace "Doug Ford" with "the premier of Ontario" or "the government of Ontario"; replace "Tesla" with "a leading U.S. electric automaker").
      
      GRAMMATICAL INTEGRATION RULES (STRICTLY AVOID GLITCHES):
      - DO NOT DUPLICATE TITLES: If the raw feed has an honorific or title before the name (e.g., "U.S. President Donald Trump", "President Trump", "Ontario Premier Doug Ford"), DO NOT write "U.S. president the U.S. president" or "President the U.S. president". Replace the entire combination with the natural substitute: "The U.S. president took to social media...", "The premier of Ontario announced...".
      - PROPER NOUN ADJUNCT & ATTRIBUTIVE GRAMMAR:
        * NEVER write "U.S. president Administration", "the U.S. president Administration", "the U.S. president campaign", or "the U.S. president officials".
        * For administrations: write "the U.S. administration", "the presidential administration", or "the U.S. president's administration".
        * For campaigns and cabinets: write "the presidential campaign", "the presidential cabinet", or "the U.S. president's campaign".
        * For teams, officials, policies, and orders: write "the U.S. president's team", "administration officials", "the U.S. president's policies", or "the presidential order".
      - AVOID DOUBLE ARTICLES: Never write "the the U.S. president" or "a the".
      - PROPER SENTENCE CAPITALIZATION: Ensure proper capitalization when substituting text at the start of sentences (e.g., "The U.S. president announced...", "The U.S. administration stated..."). The sentence must remain grammatically smooth, readable, and natural.

   b. MANDATORY NAMING OF COUNTRIES, PEOPLE, CITIES & NON-BLOCKED ENTITIES (DO NOT MAKE ABSTRACT):
      - CRITICAL: You are STRICTLY FORBIDDEN from generalizing, omitting, or anonymizing any country, city, person, politician, government leader, company, or institution that is NOT on the forbidden list above!
      - PRESERVE REAL COUNTRIES AND NATIONS: ALWAYS explicitly name countries (e.g., Ukraine, United Kingdom, Canada, France, Germany, China, Japan, United States, Israel, Brazil). Do NOT abstract them as "a European country", "a North American nation", "a neighbouring state", or "an overseas ally".
      - PRESERVE REAL CITIES & REGIONS: ALWAYS explicitly name cities, provinces, and regions (e.g., London, Montreal, Toronto, Kyiv, Paris, Berlin, Ottawa, Tokyo, Gaza, Washington). Do NOT abstract them as "a major city", "a regional capital", or "an urban center".
      - PRESERVE REAL PEOPLE & OFFICIALS: If a person (e.g., Keir Starmer, Emmanuel Macron, Volodymyr Zelenskyy, Mark Carney, or any other official or individual) is NOT on the forbidden list, YOU MUST EXPLICITLY NAME THEM with their actual name and real title. Do NOT say "a European leader", "a foreign minister", "a prominent politician", or "authorities".
      - PRESERVE REAL COMPANIES & ORGANIZATIONS: Unless a specific company or organization is explicitly on the block list, name them directly (e.g., Apple, Boeing, NATO, the United Nations, FIFA, OpenAI, etc.).
      - WRITE CONCRETE, VIVID, FACTUAL JOURNALISM: The articles must be specific, grounded, and factual, never vague or abstract. Only replace the specific terms explicitly listed in the replacement rules above.

   c. CITATION ANONYMIZER RULES ARE NEVER A REASON NOT TO PUBLISH AN ARTICLE (CRITICAL MANDATE):
      - DO NOT SUPPRESS, DROP, OR OMIT ARTICLES: If an important news event or major story involves a person, entity, or leader on the citation anonymizer list, YOU MUST ALWAYS SYNTHESIZE AND PUBLISH THAT ARTICLE!
      - Citation anonymizer rules are strictly textual replacements (replacing the prohibited name with their natural title or role, such as "the U.S. president") and visual image filters (suppressing photos that depict them).
      - Having a subject on the citation anonymizer list, or having an associated image filtered out or removed, is ABSOLUTELY NOT A REASON TO NOT PUBLISH THE ARTICLE.
      - Every relevant story must be published, regardless of whether its imagery is suppressed or absent. You simply do not show any images that show that rule.

5. Plain Text Formatting:
   You MUST NEVER output HTML tags (such as <p>, <a>, <div>, <br>, <span>) anywhere in returned title, summary, or fullDetails fields. All text must be clean, readable plain text.

6. Return valid JSON adhering strictly to the schema provided.
Include "matchedItemIds" as an array of numerical IDs corresponding ONLY to input items that report on that EXACT same specific story.`;

          if (activeTopics.length > 0) {
            systemInstruction += `\n\n7. TOPIC WEIGHTING & EDITORIAL PRIORITIES (CRITICAL):
The user has configured explicit topic weights for story selection and curation. This is NOT a binary exclusion filter, but an editorial weighting directive:
${seeMoreTopics.length > 0 ? `- "SEE MORE OF" (BOOSTED / FOLLOWING) TOPICS:
${seeMoreTopics.map(t => `  * "${t}": Actively prioritize, feature, and synthesize stories covering this subject. Dedicate candidate article slots to cohesive, high-quality coverage of this topic whenever available in the raw news feeds. For any synthesized story covering this topic, set "topicTag": "Following" and "matchedTopic": "${t}".`).join('\n')}` : ''}
${seeLessTopics.length > 0 ? `- "SEE LESS OF" (DE-PRIORITIZED / OCCASIONAL) TOPICS:
${seeLessTopics.map(t => `  * "${t}": De-emphasize and downweight coverage on this subject. Do NOT select routine or run-of-the-mill stories on this topic. ONLY select a story on this topic if it represents an exceptionally major, landmark, or critical breaking development, keeping appearances rare and occasional. For any synthesized story selected from this topic, set "topicTag": "Occasional" and "matchedTopic": "${t}".`).join('\n')}` : ''}
- NEUTRAL / UNLISTED TOPICS:
  Synthesize with standard, balanced editorial judgment. Set "topicTag": "" and "matchedTopic": "".`;
          }

          if (primarySourceName) {
            systemInstruction += `\n\n8. CRITICAL PRIMARY ANCHOR MANDATE:
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
                            title: { type: Type.STRING, description: 'Direct, crisp headline without forbidden citations' },
                            summary: { type: Type.STRING, description: 'Direct 1-2 sentence executive summary (25-45 words) in plain, simple English. Strictly to the point: who did what, where, and the immediate outcome. Zero filler.' },
                            fullDetails: { type: Type.STRING, description: 'High-density factual breakdown in 2 to 4 tight, substantive paragraphs (180-300 words total) separated by double linebreaks. Focus on MORE FACTS and INSIGHTS (concrete figures, dates, verified quotes, underlying drivers, next milestones), NOT MORE WORDS. Zero filler, and strictly NO repetition of the headline or summary.' },
                            sources: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Names of news sources covering this story' },
                            category: { type: Type.STRING, description: 'Category like World, Tech, Politics, Business' },
                            matchedItemIds: { type: Type.ARRAY, items: { type: Type.INTEGER }, description: 'List of matching input item IDs' },
                            topicTag: { type: Type.STRING, description: 'Must be "Following" if this story covers a boosted topic, "Occasional" if it covers a de-prioritized topic, or empty string if neutral' },
                            matchedTopic: { type: Type.STRING, description: 'The exact matched topic name if topicTag is Following or Occasional, else empty string' },
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

                // Gather images from matched items, excluding those matching forbidden citation replacement rules or generic logos
                const images: string[] = [];
                matchedItems.forEach(item => {
                  if (item.images && Array.isArray(item.images)) {
                    item.images.forEach(img => {
                      if (!images.includes(img) && !isGoogleNewsPlaceholder(img) && !isImageMatchingRules(img, rules)) {
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
                const cleanTitle = cleanCitationGrammarGlitches(stripHtml(cleanLiveblogAndRoundupArtifacts(applyReplacements(art.title, rules))));
                let cleanSummary = cleanCitationGrammarGlitches(cleanMediaAudioVideoJunk(formatConciseSummary(cleanLiveblogAndRoundupArtifacts(applyReplacements(art.summary, rules)))));
                if (!cleanSummary && matchedItems.length > 0) {
                  const firstDesc = cleanMediaAudioVideoJunk(stripHtml(matchedItems[0].description || ''));
                  cleanSummary = cleanCitationGrammarGlitches(firstDesc ? splitIntoSentences(firstDesc)[0] || cleanTitle : cleanTitle);
                }
                const rawFullText = art.fullDetails ? cleanMediaAudioVideoJunk(applyReplacements(art.fullDetails, rules)) : '';
                const sanitizedP = sanitizeArticleDetailsParagraphs(rawFullText, cleanTitle, cleanSummary);
                let cleanFullDetails = cleanCitationGrammarGlitches(sanitizedP.join('\n\n'));

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
                      cleanFullDetails = cleanCitationGrammarGlitches(extraSanitized.join('\n\n'));
                    }
                  }
                }

                const latestTimestamp = matchedItems.length > 0
                  ? matchedItems[0].pubDate
                  : new Date().toISOString();

                const rawTopicTag = art.topicTag ? String(art.topicTag).trim() : '';
                const topicTag = rawTopicTag === 'Following' || rawTopicTag === 'Occasional' ? rawTopicTag : undefined;
                const matchedTopic = art.matchedTopic ? String(art.matchedTopic).trim() : undefined;

                return {
                  id: `ai-synth-${idx}-${Date.now()}`,
                  title: cleanTitle,
                  summary: cleanSummary,
                  fullDetails: cleanFullDetails || cleanSummary,
                  sources: art.sources || matchedItems.map(m => m.sourceName),
                  sourceLinks: sourceLinks.length > 0 ? sourceLinks : [{ name: 'Source', url: matchedItems[0]?.link || '#' }],
                  images,
                  timestamp: latestTimestamp,
                  articleCount: matchedItems.length || 1,
                  category: art.category || 'World News',
                  topicTag,
                  matchedTopic: topicTag ? matchedTopic : undefined,
                };
              }).filter(art => Boolean(art.title && art.title.trim().length > 0));

              // Apply post-synthesis duplicate merging pass to combine any remaining overlapping topics
              const deduplicatedArticles = mergeDuplicateSynthesizedArticles(synthesizedArticles).slice(0, 25);

              // Sort articles: boosted 'Following' stories first, then neutral stories, then 'Occasional' stories
              deduplicatedArticles.sort((a, b) => {
                const scoreA = a.topicTag === 'Following' ? 2 : a.topicTag === 'Occasional' ? 0 : 1;
                const scoreB = b.topicTag === 'Following' ? 2 : b.topicTag === 'Occasional' ? 0 : 1;
                return scoreB - scoreA;
              });

              // Ensure non-English articles are translated to English before publishing
              const englishArticles = await ensureArticlesInEnglish(deduplicatedArticles, ai, rules);

              // Ensure every article has lead imagery via fallback fetch if missing
              await ensureImagesForArticles(englishArticles, rules);

              // Filter article images with Gemini Vision against active rules
              const cleanArticles = await filterArticleImagesWithVision(englishArticles, rules, ai);

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
      const fallbackArticles = synthesizeLocalFallback(items, rules, timeframeHours, primarySourceName, topics);
      const englishFallbackArticles = ai ? await ensureArticlesInEnglish(fallbackArticles, ai, rules) : fallbackArticles;
      await ensureImagesForArticles(englishFallbackArticles, rules);
      const cleanFallbackArticles = await filterArticleImagesWithVision(englishFallbackArticles, rules, ai);
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

  // 4. On-demand Article Translation Endpoint
  app.post('/api/translate', async (req, res) => {
    try {
      const { articles, rules = [] } = req.body as { articles: SynthesizedArticle[]; rules: ReplacementRule[] };
      if (!articles || !Array.isArray(articles)) {
        res.status(400).json({ error: 'Articles array is required' });
        return;
      }
      const ai = getGeminiClient();
      if (!ai) {
        res.status(400).json({ error: 'Gemini client is currently unavailable' });
        return;
      }
      const translated = await ensureArticlesInEnglish(articles, ai, rules);
      res.json({ articles: translated });
    } catch (err: any) {
      console.error('Error in /api/translate:', err);
      res.status(500).json({ error: err.message || 'Translation failed' });
    }
  });

  // 5. Verification Endpoint: Check candidate image URLs against Citation Anonymizer rules (Text & Gemini Vision)
  app.post('/api/images/check-rules', async (req, res) => {
    try {
      const { imageUrls = [], rules = [] } = req.body as { imageUrls: string[]; rules: ReplacementRule[] };
      if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
        res.json({ blockedUrls: [], allowedUrls: [] });
        return;
      }

      const activeRules = (rules || []).filter(r => r.enabled && r.term && r.term.trim().length > 0);
      if (activeRules.length === 0) {
        res.json({ blockedUrls: [], allowedUrls: imageUrls });
        return;
      }

      const ai = getGeminiClient();
      const blockedUrls: string[] = [];
      const allowedUrls: string[] = [];

      await Promise.all(
        imageUrls.map(async (url) => {
          if (!url || typeof url !== 'string') return;

          // 1. Text/URL matching
          if (isImageMatchingRules(url, activeRules)) {
            blockedUrls.push(url);
            return;
          }

          // 2. Vision API check
          if (ai) {
            try {
              const isForbidden = await checkImageVisionForbidden(url, activeRules, ai);
              if (isForbidden) {
                blockedUrls.push(url);
                return;
              }
            } catch {
              // If check fails, allow
            }
          }

          allowedUrls.push(url);
        })
      );

      res.json({ blockedUrls, allowedUrls });
    } catch (err: any) {
      console.error('Error in /api/images/check-rules:', err);
      res.status(500).json({ error: err.message || 'Image check failed' });
    }
  });

  // Vite development middleware or static serving
  async function startServer() {
    const PORT = 3000;
    initializeDefaultSettings().catch((err) => {
      console.warn('Background default settings initialization notice:', err);
    });

    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
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

  // Only start the standalone HTTP listener in non-Vercel environments (e.g. Cloud Run / local dev)
  if (!process.env.VERCEL) {
    startServer();
  }

  export default app;
