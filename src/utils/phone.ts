/**
 * Normalize a phone number to E.164 format.
 * Handles common US formats: (555) 123-4567, 555-123-4567, +15551234567, etc.
 */
export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  if (digits.startsWith('1') && digits.length === 11) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  // Already has country code or international
  if (phone.startsWith('+')) {
    return `+${digits}`;
  }

  throw new Error(`Cannot normalize phone number: ${phone}`);
}

/**
 * Basic validation that a string looks like a phone number.
 */
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}
