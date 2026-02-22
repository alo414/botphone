import OpenAI from 'openai';
import { config } from '../config';
import { getScope } from '../scopes';
import { CallRecord, CallSummary } from '../types';
import { logger } from '../utils/logger';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export async function generateSummary(
  call: CallRecord,
  transcript: { role: string; text: string }[]
): Promise<CallSummary> {
  const scope = getScope(call.scope);

  if (transcript.length === 0) {
    return {
      outcome: 'No conversation took place',
      structuredData: {},
      transcript,
    };
  }

  const transcriptText = transcript
    .map((t) => `${t.role === 'agent' ? 'AI Agent' : 'Business'}: ${t.text}`)
    .join('\n');

  const prompt = `You are analyzing a phone call transcript. The call was made to ${(call.context?.businessName as string) || 'a business'}.

Objective of the call: ${call.objective}

Transcript:
${transcriptText}

${scope.summaryExtractionPrompt}

Respond with a JSON object containing:
- "outcome": a brief description of what happened
- "structuredData": an object with the fields described above

Respond ONLY with valid JSON, no markdown or explanation.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from GPT-4o');

    const parsed = JSON.parse(content);

    return {
      outcome: parsed.outcome || 'Summary generation completed',
      structuredData: parsed.structuredData || {},
      transcript,
    };
  } catch (err) {
    logger.error('Error generating summary', { callId: call.id, error: (err as Error).message });
    return {
      outcome: 'Summary generation failed',
      structuredData: {},
      transcript,
    };
  }
}
