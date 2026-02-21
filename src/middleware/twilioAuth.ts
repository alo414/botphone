import { Request, Response, NextFunction } from 'express';
import { validateRequest } from 'twilio';
import { config } from '../config';

export function twilioWebhookAuth(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers['x-twilio-signature'] as string;
  const url = `${config.publicUrl}${req.originalUrl}`;

  const valid = validateRequest(
    config.twilio.authToken,
    signature,
    url,
    req.body,
  );

  if (!valid) {
    res.status(403).send('Forbidden');
    return;
  }

  next();
}
