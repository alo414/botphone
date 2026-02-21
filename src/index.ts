import express from 'express';
import expressWs from 'express-ws';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config';
import { initDatabase } from './db/init';
import { logger } from './utils/logger';
import { callsRouter } from './api/routes/calls';
import { twilioRouter, handleMediaStream } from './api/routes/twilio';
import { settingsRouter } from './api/routes/settings';
import { oauthRouter } from './api/routes/oauth';
import { authRouter } from './api/routes/auth';
import { mcpRouter } from './api/routes/mcp';
import { jwtAuth } from './middleware/jwtAuth';

const { app } = expressWs(express());

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const authLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
const callCreationLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
const mcpLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });

// OAuth 2.0 endpoints for MCP (public — part of the auth flow itself)
app.use('/oauth', authLimiter, oauthRouter);

// Frontend Google OAuth (public — part of the auth flow itself)
app.use('/api/auth', authLimiter, authRouter);

// MCP endpoint for Claude.ai integration (protected by Google OAuth JWT)
app.use('/mcp', mcpLimiter, jwtAuth, mcpRouter);

// OAuth Protected Resource Metadata (RFC 9728) — MCP spec requires this for auth discovery
app.get('/.well-known/oauth-protected-resource', (_req, res) => {
  res.json({
    resource: config.publicUrl,
    authorization_servers: [config.publicUrl],
  });
});

// OAuth metadata — Claude.ai discovers this to initiate the OAuth flow
app.get('/.well-known/oauth-authorization-server', (_req, res) => {
  res.json({
    issuer: config.publicUrl,
    authorization_endpoint: `${config.publicUrl}/oauth/authorize`,
    token_endpoint: `${config.publicUrl}/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
  });
});

// API routes (protected by Google OAuth JWT)
app.use('/api/calls', jwtAuth, callCreationLimiter, callsRouter);
app.use('/api/settings', jwtAuth, settingsRouter);
app.use('/twilio', twilioRouter);

// WebSocket route — must be on app directly (express-ws doesn't patch sub-routers)
app.ws('/twilio/media-stream', handleMediaStream);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend in production
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*splat', (_req, res, next) => {
  if (_req.path.startsWith('/api') || _req.path.startsWith('/twilio')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'));
});

async function start() {
  try {
    await initDatabase();
    app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`, { publicUrl: config.publicUrl });
    });
  } catch (err) {
    logger.error('Failed to start server', { error: (err as Error).message });
    process.exit(1);
  }
}

start();
