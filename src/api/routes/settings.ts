import { Router } from 'express';
import { z } from 'zod';
import { getSettings, updateSettings } from '../../db/queries/settings';

const settingsSchema = z.object({
  provider: z.enum(['openai', 'elevenlabs']).optional(),
  openai: z.object({
    voice: z.string().min(1).max(100),
    speed: z.number().min(0.25).max(4),
  }).optional(),
  elevenlabs: z.object({
    agentId: z.string().max(200),
    agentPhoneNumberId: z.string().max(200).optional(),
  }).optional(),
  call: z.object({
    fallbackGreetDelaySec: z.number().min(1).max(120),
    noAudioHangupDelaySec: z.number().min(1).max(300),
  }).optional(),
  testCall: z.object({
    phoneNumber: z.string().max(30),
  }).optional(),
});

const router = Router();

// GET /api/settings
router.get('/', async (_req, res) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /api/settings
router.put('/', async (req, res) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: parsed.error.issues });
      return;
    }
    const updated = await updateSettings(parsed.data as any);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as settingsRouter };
