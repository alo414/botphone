import { ScopeDefinition } from './types';

export const restaurantScope: ScopeDefinition = {
  name: 'restaurant',

  buildSystemPrompt(objective: string, context: Record<string, unknown>, businessName?: string) {
    const biz = businessName ? `You are calling ${businessName}.` : 'You are calling a restaurant.';
    const partySize = context.partySize ? `Party size: ${context.partySize}.` : '';
    const prefDate = context.preferredDate ? `Preferred date: ${context.preferredDate}.` : '';
    const prefTime = context.preferredTime ? `Preferred time: ${context.preferredTime}.` : '';

    return `You are an AI assistant making a phone call on behalf of a user. ${biz}

Your objective: ${objective}

${[partySize, prefDate, prefTime].filter(Boolean).join('\n')}

Guidelines:
- Be polite, natural, and conversational. Sound like a normal person calling a restaurant.
- Introduce yourself briefly: "Hi, I'm calling to..." — do NOT say you are an AI.
- Ask clear questions to achieve the objective.
- If the conversation goes off-track, politely redirect to the objective.
- If you reach a voicemail, leave a brief message with the key request and say you'll call back.
- Once you have the information needed or have completed the task, thank them and end the call naturally.
- Keep the call concise — aim for under 2 minutes.

Key information to gather:
- Wait time for walk-ins (if relevant)
- Reservation availability and confirmation
- Any special instructions or requirements`;
  },

  initialGreeting(businessName?: string) {
    return businessName
      ? `Hi, I'm calling about ${businessName}.`
      : `Hi, I'm calling about your restaurant.`;
  },

  summaryExtractionPrompt: `Extract the following from the call transcript:
- outcome: What was the result of the call? (e.g., "reservation confirmed", "wait time obtained", "no availability")
- waitTime: Estimated wait time if mentioned (string or null)
- reservationStatus: "confirmed", "waitlisted", "unavailable", or null
- reservationDateTime: The confirmed reservation date/time if any (ISO string or null)
- confirmationNumber: Any confirmation or reference number given (string or null)
- specialInstructions: Any special notes or instructions mentioned`,

  structuredDataSchema: {
    waitTime: 'string | null',
    reservationStatus: '"confirmed" | "waitlisted" | "unavailable" | null',
    reservationDateTime: 'string | null',
    confirmationNumber: 'string | null',
    specialInstructions: 'string | null',
  },
};
