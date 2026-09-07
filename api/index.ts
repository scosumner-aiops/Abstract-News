import type { Request, Response } from 'express';

let app: any = null;

try {
  // @ts-ignore
  const serverModule: any = await import('../dist/server.cjs');
  app = serverModule.app || serverModule.default?.app || serverModule.default || serverModule;
} catch (e1) {
  try {
    // @ts-ignore
    const serverModule: any = await import('../server.ts');
    app = serverModule.app || serverModule.default?.app || serverModule.default || serverModule;
  } catch (e2) {
    console.error('Failed to load server module in Vercel handler:', e1, e2);
  }
}

export default function handler(req: Request, res: Response) {
  // Ensure req.url preserves the full original path across Vercel rewrite layers
  if (req.originalUrl && req.url !== req.originalUrl) {
    req.url = req.originalUrl;
  }

  if (!app) {
    return res.status(500).json({ error: 'Server initialization failed' });
  }

  return app(req, res);
}
