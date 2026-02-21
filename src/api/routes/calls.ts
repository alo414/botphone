import { Router } from 'express';
import { z } from 'zod';
import * as callQueries from '../../db/queries/calls';
import { resolvePlaceId } from '../../services/google-places';
import { toE164, isValidPhone } from '../../utils/phone';
import { initiateCall, getActiveCall } from '../../services/call-manager';
import { hangupCall } from '../../services/twilio';
import { logger } from '../../utils/logger';
import { ScopeName } from '../../types';

export const callsRouter = Router();

const createCallSchema = z.object({
  scope: z.enum(['restaurant', 'general_info', 'appointment', 'general']),
  placeId: z.string().optional(),
  phoneNumber: z.string().optional(),
  objective: z.string().min(1).max(1000),
  context: z.record(z.string(), z.unknown()).optional(),
});

// POST /api/calls — create and initiate a call
callsRouter.post('/', async (req, res) => {
  try {
    const parsed = createCallSchema.parse(req.body);

    if (!parsed.placeId && !parsed.phoneNumber) {
      res.status(400).json({ error: 'Either placeId or phoneNumber is required' });
      return;
    }

    let phoneNumber: string;
    let businessName: string | null = null;

    if (parsed.placeId) {
      const place = await resolvePlaceId(parsed.placeId);
      phoneNumber = toE164(place.phoneNumber);
      businessName = place.businessName;
    } else {
      if (!isValidPhone(parsed.phoneNumber!)) {
        res.status(400).json({ error: 'Invalid phone number' });
        return;
      }
      phoneNumber = toE164(parsed.phoneNumber!);
    }

    const call = await callQueries.createCall({
      scope: parsed.scope,
      phone_number: phoneNumber,
      business_name: businessName,
      objective: parsed.objective,
      context: parsed.context || {},
    });

    // Fire and forget — initiateCall updates the DB as the call progresses
    initiateCall(call.id).catch((err) => {
      logger.error('Failed to initiate call', { callId: call.id, error: err.message });
    });

    res.status(201).json(call);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.issues });
      return;
    }
    logger.error('Error creating call', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/places/resolve — resolve a Place ID to phone + name
callsRouter.post('/places/resolve', async (req, res) => {
  try {
    const { placeId } = req.body;
    if (!placeId) {
      res.status(400).json({ error: 'placeId is required' });
      return;
    }
    const result = await resolvePlaceId(placeId);
    res.json(result);
  } catch (err) {
    logger.error('Error resolving place', { error: (err as Error).message });
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/calls — list calls
callsRouter.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const status = req.query.status as string | undefined;

    const calls = await callQueries.listCalls({
      limit,
      offset,
      status: status as any,
    });

    res.json(calls);
  } catch (err) {
    logger.error('Error listing calls', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/calls/:id/transcript/live — live in-memory transcript for an active call
callsRouter.get('/:id/transcript/live', (req, res) => {
  const active = getActiveCall(req.params.id);
  if (!active) {
    res.status(404).json({ error: 'No active call found' });
    return;
  }
  res.json({ transcript: active.transcript });
});

// POST /api/calls/:id/hangup — hang up an active call
callsRouter.post('/:id/hangup', async (req, res) => {
  try {
    const call = await callQueries.getCall(req.params.id);
    if (!call) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }
    if (!call.twilio_call_sid) {
      res.status(400).json({ error: 'Call has no Twilio SID' });
      return;
    }
    const activeStatuses = ['queued', 'ringing', 'in_progress'];
    if (!activeStatuses.includes(call.status)) {
      res.status(400).json({ error: `Call is already ${call.status}` });
      return;
    }
    await hangupCall(call.twilio_call_sid);
    res.json({ ok: true });
  } catch (err) {
    logger.error('Error hanging up call', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/calls/:id — update objective (only while queued or ringing)
callsRouter.patch('/:id', async (req, res) => {
  try {
    const call = await callQueries.getCall(req.params.id);
    if (!call) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }
    if (!['queued', 'ringing'].includes(call.status)) {
      res.status(409).json({ error: 'Objective can only be updated before the call is answered' });
      return;
    }
    const { objective } = req.body;
    if (typeof objective !== 'string' || objective.trim().length === 0 || objective.length > 1000) {
      res.status(400).json({ error: 'objective must be a non-empty string (max 1000 chars)' });
      return;
    }
    await callQueries.updateCallObjective(req.params.id, objective.trim());
    res.json({ ok: true });
  } catch (err) {
    logger.error('Error updating call objective', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/calls/:id — get call with transcript
callsRouter.get('/:id', async (req, res) => {
  try {
    const call = await callQueries.getCall(req.params.id);
    if (!call) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }

    const transcript = await callQueries.getTranscript(call.id);
    res.json({ ...call, transcript });
  } catch (err) {
    logger.error('Error getting call', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});
