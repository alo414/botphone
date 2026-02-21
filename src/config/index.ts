import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  publicUrl: required('PUBLIC_URL'),
  twilio: {
    accountSid: required('TWILIO_ACCOUNT_SID'),
    authToken: required('TWILIO_AUTH_TOKEN'),
    phoneNumber: required('TWILIO_PHONE_NUMBER'),
  },
  openai: {
    apiKey: required('OPENAI_API_KEY'),
  },
  google: {
    placesApiKey: required('GOOGLE_PLACES_API_KEY'),
    oauthClientId: required('GOOGLE_OAUTH_CLIENT_ID'),
    oauthClientSecret: required('GOOGLE_OAUTH_CLIENT_SECRET'),
  },
  jwt: {
    secret: required('JWT_SECRET'),
  },
  database: {
    url: required('DATABASE_URL'),
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || '',
  },
};
