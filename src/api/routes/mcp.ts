import { Router, Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import * as callQueries from '../../db/queries/calls';
import { initiateCall, getActiveCall } from '../../services/call-manager';
import { resolvePlaceId } from '../../services/google-places';
import { toE164, isValidPhone } from '../../utils/phone';
import { logger } from '../../utils/logger';
import { CallStatus } from '../../types';

export const mcpRouter = Router();

function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'call-agent', version: '1.0.0' });

  server.tool(
    'make_call',
    'Initiate an outbound AI phone call and wait for it to complete. Returns a summary of the outcome. After presenting the summary to the user, always ask if they would like to see the full transcript — if yes, call get_call with the returned call ID.',
    {
      scope: z.enum(['restaurant', 'general_info', 'appointment', 'general'])
        .describe('Call scenario type — controls the AI agent\'s behavior'),
      phone_number: z.string().optional()
        .describe('Phone number to call in E.164 format (e.g. +14155551234). Required if place_id is not given.'),
      place_id: z.string().optional()
        .describe('Google Place ID — automatically resolves the phone number and business name.'),
      objective: z.string()
        .describe('What the call should accomplish, e.g. "Check if they have a table for 4 at 7pm Saturday"'),
      context: z.record(z.string(), z.unknown()).optional()
        .describe('Additional key/value context passed to the AI agent'),
    },
    async ({ scope, phone_number, place_id, objective, context }) => {
      try {
        if (!place_id && !phone_number) {
          return { content: [{ type: 'text' as const, text: 'Error: either phone_number or place_id is required' }], isError: true };
        }

        let resolvedPhone: string;
        let businessName: string | null = null;

        if (place_id) {
          const place = await resolvePlaceId(place_id);
          resolvedPhone = toE164(place.phoneNumber);
          businessName = place.businessName;
        } else {
          if (!isValidPhone(phone_number!)) {
            return { content: [{ type: 'text' as const, text: 'Error: invalid phone number format' }], isError: true };
          }
          resolvedPhone = toE164(phone_number!);
        }

        const call = await callQueries.createCall({
          scope,
          phone_number: resolvedPhone,
          business_name: businessName,
          objective,
          context: context || {},
        });

        initiateCall(call.id).catch((err) => {
          logger.error('Failed to initiate call from MCP', { callId: call.id, error: err.message });
        });

        // Poll until the call reaches a terminal state
        const POLL_INTERVAL_MS = 3_000;
        const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
        const TERMINAL_STATUSES: CallStatus[] = ['completed', 'failed', 'no_answer', 'busy'];
        const deadline = Date.now() + TIMEOUT_MS;

        let finished = await callQueries.getCall(call.id);
        while (finished && !TERMINAL_STATUSES.includes(finished.status)) {
          if (Date.now() > deadline) {
            return {
              content: [{
                type: 'text' as const,
                text: [
                  `The call to ${resolvedPhone} is still in progress after 10 minutes.`,
                  `Call ID: ${call.id}`,
                  `Use get_call to check status and retrieve the transcript later.`,
                ].join('\n'),
              }],
            };
          }
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
          finished = await callQueries.getCall(call.id);
        }

        if (!finished) {
          return { content: [{ type: 'text' as const, text: `Error: call record not found` }], isError: true };
        }

        // Build summary response
        const target = businessName ? `${businessName} (${resolvedPhone})` : resolvedPhone;

        if (finished.status === 'completed' && finished.summary) {
          const lines: string[] = [
            `Call to ${target} completed in ${finished.duration_seconds ?? '?'}s.`,
            ``,
            `Outcome: ${finished.summary.outcome}`,
          ];

          const structured = finished.summary.structuredData;
          if (structured && Object.keys(structured).length > 0) {
            lines.push('', 'Key details:');
            for (const [k, v] of Object.entries(structured)) {
              lines.push(`  • ${k}: ${JSON.stringify(v)}`);
            }
          }

          lines.push('', `Call ID: ${finished.id}`);
          lines.push(`[Full transcript available — ask the user if they'd like to see it, then call get_call('${finished.id}')]`);

          return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
        }

        // Non-completed terminal status (failed, no_answer, busy)
        return {
          content: [{
            type: 'text' as const,
            text: [
              `Call to ${target} ended with status: ${finished.status}.`,
              `Call ID: ${finished.id}`,
            ].join('\n'),
          }],
        };
      } catch (err) {
        logger.error('MCP make_call error', { error: (err as Error).message });
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    'list_calls',
    'List recent outbound calls with their current status, phone number, and objective.',
    {
      status: z.enum(['queued', 'ringing', 'in_progress', 'completed', 'failed', 'no_answer', 'busy']).optional()
        .describe('Filter by call status'),
      limit: z.number().int().min(1).max(100).optional()
        .describe('Number of calls to return (default 20, max 100)'),
    },
    async ({ status, limit }) => {
      try {
        const calls = await callQueries.listCalls({ status: status as CallStatus | undefined, limit: limit || 20 });
        if (calls.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No calls found.' }] };
        }

        const header = `${'ID'.padEnd(36)} | ${'STATUS'.padEnd(12)} | ${'PHONE'.padEnd(15)} | BUSINESS / OBJECTIVE`;
        const divider = '-'.repeat(100);
        const rows = calls.map(c => {
          const label = c.business_name || c.objective.slice(0, 40);
          return `${c.id} | ${c.status.padEnd(12)} | ${c.phone_number.padEnd(15)} | ${label}`;
        });

        return { content: [{ type: 'text' as const, text: [header, divider, ...rows].join('\n') }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    'get_call',
    'Get full details, outcome summary, and transcript for a specific call by ID.',
    {
      id: z.string().uuid().describe('Call ID returned by make_call or list_calls'),
    },
    async ({ id }) => {
      try {
        const call = await callQueries.getCall(id);
        if (!call) {
          return { content: [{ type: 'text' as const, text: `Call ${id} not found` }], isError: true };
        }

        // If call is active, include live transcript
        const active = getActiveCall(id);
        const transcript = active
          ? active.transcript
          : await callQueries.getTranscript(id);

        const lines: string[] = [
          `Call ${call.id}`,
          `Status:    ${call.status}`,
          `Phone:     ${call.phone_number}`,
          call.business_name ? `Business:  ${call.business_name}` : null,
          `Scope:     ${call.scope}`,
          `Objective: ${call.objective}`,
          `Created:   ${call.created_at.toISOString()}`,
          call.duration_seconds != null ? `Duration:  ${call.duration_seconds}s` : null,
        ].filter(Boolean) as string[];

        if (call.summary) {
          lines.push('', 'Outcome:', call.summary.outcome);
          const structured = call.summary.structuredData;
          if (structured && Object.keys(structured).length > 0) {
            lines.push('', 'Structured data:');
            for (const [k, v] of Object.entries(structured)) {
              lines.push(`  ${k}: ${JSON.stringify(v)}`);
            }
          }
        }

        if (transcript.length > 0) {
          lines.push('', active ? 'Live transcript:' : 'Transcript:');
          for (const entry of transcript) {
            const role = entry.role === 'agent' ? 'Agent' : 'User ';
            lines.push(`  [${role}] ${entry.text}`);
          }
        }

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    'wake',
    'Wake the call-agent server if it has scaled to zero. Call this before make_call if the server may be cold. Returns immediately once the server is up.',
    {},
    async () => ({
      content: [{ type: 'text' as const, text: 'Server is awake and ready.' }],
    })
  );

  return server;
}

// POST /mcp — handles all MCP JSON-RPC requests (tool calls, capability negotiation, etc.)
mcpRouter.post('/', async (req: Request, res: Response) => {
  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('close', () => { server.close(); });
  } catch (err) {
    logger.error('MCP POST error', { error: (err as Error).message });
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /mcp — SSE channel for server-initiated messages
mcpRouter.get('/', async (req: Request, res: Response) => {
  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res);
    res.on('close', () => { server.close(); });
  } catch (err) {
    logger.error('MCP GET error', { error: (err as Error).message });
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});
