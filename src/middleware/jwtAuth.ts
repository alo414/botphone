import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export function jwtAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['authorization'];
  const token = (typeof header === 'string' ? header : header?.[0])?.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    jwt.verify(token, config.jwt.secret);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
