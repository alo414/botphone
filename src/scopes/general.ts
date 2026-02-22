import { ScopeDefinition } from './types';

export const generalScope: ScopeDefinition = {
  name: 'general',

  buildSystemPrompt(objective: string, context: Record<string, unknown>) {
    const biz = context.businessName ? `You are calling ${context.businessName}.` : 'You are making a phone call.';

    return `## Role
You are an AI assistant making a phone call on behalf of a user. ${biz}
- Be polite, natural, and conversational. Sound like a normal person making a phone call.
- Introduce yourself briefly and state your reason for calling — do NOT say you are an AI.
- If the conversation goes off-track, politely redirect to the objective.
- Once you've achieved the objective or gathered the needed information, thank them and end the call naturally.
- Keep the call concise — aim for under 3 minutes.
- Be adaptable — respond naturally to whatever the other party says.

## Objective
${objective}`;
  },

  initialGreeting(context?: Record<string, unknown>) {
    return context?.businessName
      ? `Hi, I'm calling ${context.businessName}.`
      : `Hi, thanks for taking my call.`;
  },

  summaryExtractionPrompt: `Extract the following from the call transcript:
- outcome: What was the overall result of the call?
- keyFindings: An array of key pieces of information learned (strings)
- actionItems: An array of follow-up actions needed (strings)
- followUpNeeded: Whether a follow-up call is needed (boolean)`,

  structuredDataSchema: {
    keyFindings: 'string[]',
    actionItems: 'string[]',
    followUpNeeded: 'boolean',
  },
};
