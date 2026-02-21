import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export const authRouter = Router();

const pendingStates = new Map<string, { expiresAt: number }>();

// Prune expired states every minute
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingStates) if (v.expiresAt < now) pendingStates.delete(k);
}, 60_000);

// GET /api/auth/login — redirects browser to Google for frontend login
authRouter.get('/login', (_req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, { expiresAt: Date.now() + 10 * 60 * 1000 });

  const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleUrl.searchParams.set('client_id', config.google.oauthClientId);
  googleUrl.searchParams.set('redirect_uri', `${config.publicUrl}/api/auth/callback`);
  googleUrl.searchParams.set('response_type', 'code');
  googleUrl.searchParams.set('scope', 'openid email');
  googleUrl.searchParams.set('state', state);
  googleUrl.searchParams.set('prompt', 'select_account');

  res.redirect(googleUrl.toString());
});

// GET /api/auth/callback — Google redirects here after user authenticates
authRouter.get('/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    res.redirect(`/?auth_error=${encodeURIComponent(error)}`);
    return;
  }

  const pending = pendingStates.get(state);
  if (!pending || pending.expiresAt < Date.now()) {
    res.redirect('/?auth_error=invalid_state');
    return;
  }
  pendingStates.delete(state);

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.google.oauthClientId,
        client_secret: config.google.oauthClientSecret,
        redirect_uri: `${config.publicUrl}/api/auth/callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      logger.error('Google token exchange failed', { status: tokenRes.status });
      res.redirect('/?auth_error=token_exchange_failed');
      return;
    }

    const tokenData = await tokenRes.json() as { access_token: string };
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const user = await userRes.json() as { email: string };

    if (config.allowedEmails.length > 0 && !config.allowedEmails.includes(user.email)) {
      logger.warn('Login attempt from non-allowed email', { email: user.email });
      res.redirect('/?auth_error=not_allowed');
      return;
    }

    const expiresIn = 30 * 24 * 60 * 60; // 30 days
    const token = jwt.sign({ email: user.email }, config.jwt.secret, { expiresIn });

    res.redirect(`/?token=${encodeURIComponent(token)}`);
  } catch (err) {
    logger.error('Auth callback error', { error: (err as Error).message });
    res.redirect('/?auth_error=server_error');
  }
});
