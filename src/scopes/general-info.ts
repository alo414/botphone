import { ScopeDefinition } from './types';

export const generalInfoScope: ScopeDefinition = {
  name: 'general_info',

  buildSystemPrompt(objective: string, context: Record<string, unknown>) {
    const biz = context.businessName ? `You are calling ${context.businessName}.` : 'You are calling a business.';
    const itemName = context.itemName ? `Item to ask about: ${context.itemName}.` : '';

    return `You are an AI assistant making a phone call on behalf of a user. ${biz}

Your objective: ${objective}

${itemName}

Guidelines:
- Be polite, natural, and conversational. Sound like a normal person making a phone call.
- Introduce yourself briefly: "Hi, I'm calling to check on..." — do NOT say you are an AI.
- Ask clear, specific questions to get the information needed.
- If the conversation goes off-track, politely redirect to the objective.
- If you reach a voicemail, leave a brief message with the key question and say you'll call back.
- Once you have the information needed, thank them and end the call naturally.
- Keep the call concise — aim for under 2 minutes.

Key information to gather:
- Item availability and pricing
- Store hours and location details
- Any relevant policies or restrictions`;
  },

  initialGreeting(context?: Record<string, unknown>) {
    return context?.businessName
      ? `Hi, I'm calling ${context.businessName} with a quick question.`
      : `Hi, I'm calling with a quick question.`;
  },

  summaryExtractionPrompt: `Extract the following from the call transcript:
- outcome: What was the result of the call?
- itemAvailability: Is the item available? ("in_stock", "out_of_stock", "limited", or null)
- itemPrice: Price if mentioned (string or null)
- storeHours: Store hours if mentioned (string or null)
- additionalInfo: Any other relevant information gathered`,

  structuredDataSchema: {
    itemAvailability: '"in_stock" | "out_of_stock" | "limited" | null',
    itemPrice: 'string | null',
    storeHours: 'string | null',
    additionalInfo: 'string | null',
  },
};
