import { Request, Response, NextFunction } from 'express';
import { validateApiKey } from '../db/queries/apiKeys';

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers['authorization'] || req.headers['x-api-key'];
  const key = (typeof header === 'string' ? header : header?.[0])?.replace(/^Bearer\s+/i, '').trim();
  if (!key) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const valid = await validateApiKey(key);
  if (!valid) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
