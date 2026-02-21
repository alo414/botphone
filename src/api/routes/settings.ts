import { Router } from 'express';
import { getSettings, updateSettings } from '../../db/queries/settings';

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
    const updated = await updateSettings(req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export { router as settingsRouter };
