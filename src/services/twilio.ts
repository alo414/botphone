import Twilio from 'twilio';
import { config } from '../config';
import { logger } from '../utils/logger';

const client = Twilio(config.twilio.accountSid, config.twilio.authToken);

export async function hangupCall(callSid: string): Promise<void> {
  await client.calls(callSid).update({ status: 'completed' });
  logger.info('Call hung up', { callSid });
}

export async function createOutboundCall(params: {
  to: string;
  callId: string;
}): Promise<string> {
  const call = await client.calls.create({
    to: params.to,
    from: config.twilio.phoneNumber,
    url: `${config.publicUrl}/twilio/voice?callId=${params.callId}`,
    statusCallback: `${config.publicUrl}/twilio/status?callId=${params.callId}`,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST',
    timeout: 30,
    machineDetection: 'DetectMessageEnd',
  });

  logger.info('Outbound call created', { callSid: call.sid, to: params.to });
  return call.sid;
}
