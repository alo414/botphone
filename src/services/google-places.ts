import { config } from '../config';
import { logger } from '../utils/logger';

interface PlaceDetails {
  phoneNumber: string;
  businessName: string;
}

export async function resolvePlaceId(placeId: string): Promise<PlaceDetails> {
  const url = `https://places.googleapis.com/v1/places/${placeId}`;

  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': config.google.placesApiKey,
      'X-Goog-FieldMask': 'displayName,internationalPhoneNumber',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error('Google Places API error', { status: res.status, body });
    throw new Error(`Google Places API error: ${res.status}`);
  }

  const data = await res.json() as { internationalPhoneNumber?: string; displayName?: { text?: string } };
  const phoneNumber = data.internationalPhoneNumber;
  const businessName = data.displayName?.text;

  if (!phoneNumber) {
    throw new Error(`No phone number found for Place ID: ${placeId}`);
  }

  return { phoneNumber, businessName: businessName || 'Unknown Business' };
}
