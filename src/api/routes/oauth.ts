import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export const oauthRouter = Router();

interface PendingAuthorization {
  clientRedirectUri: string;
  clientState: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  expiresAt: number;
}

interface PendingCode {
  email: string;
  clientRedirectUri: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  expiresAt: number;
}

const pendingAuthorizations = new Map<string, PendingAuthorization>();
const pendingCodes = new Map<string, PendingCode>();

// Prune expired entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingAuthorizations) if (v.expiresAt < now) pendingAuthorizations.delete(k);
  for (const [k, v] of pendingCodes) if (v.expiresAt < now) pendingCodes.delete(k);
}, 60_000);

// GET /oauth/authorize — Claude.ai redirects here to start the OAuth flow
oauthRouter.get('/authorize', (req, res) => {
  const { redirect_uri, state, code_challenge, code_challenge_method, response_type } = req.query as Record<string, string>;

  if (response_type !== 'code') {
    res.status(400).json({ error: 'unsupported_response_type' });
    return;
  }
  if (!redirect_uri) {
    res.status(400).json({ error: 'redirect_uri is required' });
    return;
  }

  if (config.oauthAllowedRedirectUris.length === 0 || !config.oauthAllowedRedirectUris.includes(redirect_uri)) {
    res.status(400).json({ error: 'invalid_redirect_uri' });
    return;
  }

  const ourState = crypto.randomBytes(16).toString('hex');
  pendingAuthorizations.set(ourState, {
    clientRedirectUri: redirect_uri,
    clientState: state,
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleUrl.searchParams.set('client_id', config.google.oauthClientId);
  googleUrl.searchParams.set('redirect_uri', `${config.publicUrl}/oauth/callback`);
  googleUrl.searchParams.set('response_type', 'code');
  googleUrl.searchParams.set('scope', 'openid email');
  googleUrl.searchParams.set('state', ourState);

  res.redirect(googleUrl.toString());
});

// GET /oauth/callback — Google redirects here after user authenticates
oauthRouter.get('/callback', async (req, res) => {
  const { code: googleCode, state: ourState, error } = req.query as Record<string, string>;

  if (error) {
    res.status(400).send(`Google OAuth error: ${error}`);
    return;
  }

  const pending = pendingAuthorizations.get(ourState);
  if (!pending || pending.expiresAt < Date.now()) {
    res.status(400).send('Invalid or expired state');
    return;
  }
  pendingAuthorizations.delete(ourState);

  try {
    // Exchange Google code for an access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: googleCode,
        client_id: config.google.oauthClientId,
        client_secret: config.google.oauthClientSecret,
        redirect_uri: `${config.publicUrl}/oauth/callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      logger.error('Google token exchange failed', { status: tokenRes.status });
      res.status(500).send('Authentication failed');
      return;
    }

    const tokenData = await tokenRes.json() as { access_token: string };

    // Fetch user info to get the email
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const user = await userRes.json() as { email: string };

    // Issue our own short-lived authorization code
    const ourCode = crypto.randomBytes(32).toString('hex');
    pendingCodes.set(ourCode, {
      email: user.email,
      clientRedirectUri: pending.clientRedirectUri,
      codeChallenge: pending.codeChallenge,
      codeChallengeMethod: pending.codeChallengeMethod,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    const redirectUrl = new URL(pending.clientRedirectUri);
    redirectUrl.searchParams.set('code', ourCode);
    if (pending.clientState) redirectUrl.searchParams.set('state', pending.clientState);

    res.redirect(redirectUrl.toString());
  } catch (err) {
    logger.error('OAuth callback error', { error: (err as Error).message });
    res.status(500).send('Authentication failed');
  }
});

// POST /oauth/token — Claude.ai exchanges authorization code for access token
oauthRouter.post('/token', (req, res) => {
  const { code, grant_type, code_verifier } = req.body as Record<string, string>;

  if (grant_type !== 'authorization_code') {
    res.status(400).json({ error: 'unsupported_grant_type' });
    return;
  }

  const pending = pendingCodes.get(code);
  if (!pending || pending.expiresAt < Date.now()) {
    res.status(400).json({ error: 'invalid_grant' });
    return;
  }
  pendingCodes.delete(code);

  // Validate PKCE
  if (pending.codeChallenge) {
    if (!code_verifier) {
      res.status(400).json({ error: 'invalid_grant' });
      return;
    }
    const challenge = crypto.createHash('sha256').update(code_verifier).digest('base64url');
    if (challenge !== pending.codeChallenge) {
      res.status(400).json({ error: 'invalid_grant' });
      return;
    }
  }

  const expiresIn = 30 * 24 * 60 * 60; // 30 days
  const token = jwt.sign({ email: pending.email }, config.jwt.secret, { expiresIn });

  res.json({ access_token: token, token_type: 'Bearer', expires_in: expiresIn });
});
