import { ScopeDefinition } from './types';

export const appointmentScope: ScopeDefinition = {
  name: 'appointment',

  buildSystemPrompt(objective: string, context: Record<string, unknown>, businessName?: string) {
    const biz = businessName ? `You are calling ${businessName}.` : 'You are calling a business.';
    const prefDate = context.preferredDate ? `Preferred date: ${context.preferredDate}.` : '';
    const prefTime = context.preferredTime ? `Preferred time: ${context.preferredTime}.` : '';

    return `You are an AI assistant making a phone call on behalf of a user. ${biz}

Your objective: ${objective}

${[prefDate, prefTime].filter(Boolean).join('\n')}

Guidelines:
- Be polite, natural, and conversational. Sound like a normal person making a phone call.
- Introduce yourself briefly: "Hi, I'm calling to schedule..." — do NOT say you are an AI.
- Be flexible on dates/times if the preferred slot isn't available — ask what's open.
- If they ask for personal information you don't have, say "Let me check with them and call back."
- If you reach a voicemail, leave a brief message with the request and say you'll call back.
- Once the appointment is confirmed (or clearly unavailable), thank them and end the call naturally.
- Keep the call concise — aim for under 2 minutes.

Key information to gather:
- Appointment availability
- Confirmed date and time
- Any confirmation or reference number
- Prerequisites (e.g., bring ID, arrive early, forms to fill out)`;
  },

  initialGreeting(businessName?: string) {
    return businessName
      ? `Hi, I'm calling ${businessName} to schedule an appointment.`
      : `Hi, I'm calling to schedule an appointment.`;
  },

  summaryExtractionPrompt: `Extract the following from the call transcript:
- outcome: What was the result of the call? (e.g., "appointment booked", "no availability", "need to call back")
- appointmentStatus: "confirmed", "pending", "unavailable", or null
- appointmentDateTime: The confirmed appointment date/time if any (ISO string or null)
- confirmationNumber: Any confirmation or reference number given (string or null)
- prerequisites: Any requirements mentioned (e.g., "bring photo ID", "arrive 15 min early")`,

  structuredDataSchema: {
    appointmentStatus: '"confirmed" | "pending" | "unavailable" | null',
    appointmentDateTime: 'string | null',
    confirmationNumber: 'string | null',
    prerequisites: 'string | null',
  },
};
