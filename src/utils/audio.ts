/**
 * Audio format conversion utilities for bridging Twilio (mulaw 8kHz) ↔ ElevenLabs (PCM 16-bit).
 */

// μ-law decompression lookup table (ITU-T G.711)
const MULAW_DECODE_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  let mu = ~i & 0xff;
  const sign = mu & 0x80 ? -1 : 1;
  mu = mu & 0x7f;
  const exponent = (mu >> 4) & 0x07;
  const mantissa = mu & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  MULAW_DECODE_TABLE[i] = sign * sample;
}

/** Decode mulaw bytes to 16-bit PCM samples (little-endian). */
export function mulawToPcm(mulaw: Buffer): Buffer {
  const pcm = Buffer.alloc(mulaw.length * 2);
  for (let i = 0; i < mulaw.length; i++) {
    pcm.writeInt16LE(MULAW_DECODE_TABLE[mulaw[i]], i * 2);
  }
  return pcm;
}

/** Encode 16-bit PCM samples (little-endian) to mulaw bytes. */
export function pcmToMulaw(pcm: Buffer): Buffer {
  const mulaw = Buffer.alloc(pcm.length / 2);
  for (let i = 0; i < mulaw.length; i++) {
    mulaw[i] = encodeMulawSample(pcm.readInt16LE(i * 2));
  }
  return mulaw;
}

function encodeMulawSample(sample: number): number {
  const BIAS = 0x84;
  const CLIP = 32635;
  const sign = sample < 0 ? 0x80 : 0;
  if (sample < 0) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;

  let exponent = 7;
  const expMask = 0x4000;
  for (; exponent > 0; exponent--) {
    if (sample & expMask) break;
    sample <<= 1;
  }

  const mantissa = (sample >> 10) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/** Resample PCM 16-bit from srcRate to dstRate using linear interpolation. */
export function resamplePcm16(input: Buffer, srcRate: number, dstRate: number): Buffer {
  if (srcRate === dstRate) return input;
  const srcSamples = input.length / 2;
  const dstSamples = Math.round(srcSamples * dstRate / srcRate);
  const output = Buffer.alloc(dstSamples * 2);
  const ratio = srcRate / dstRate;

  for (let i = 0; i < dstSamples; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const s0 = input.readInt16LE(Math.min(idx, srcSamples - 1) * 2);
    const s1 = input.readInt16LE(Math.min(idx + 1, srcSamples - 1) * 2);
    const sample = Math.round(s0 + frac * (s1 - s0));
    output.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }
  return output;
}

/** Convert Twilio mulaw 8kHz (base64) → PCM 16-bit at target sample rate (base64). */
export function twilioToElevenLabs(mulawBase64: string, targetRate: number): string {
  const mulaw = Buffer.from(mulawBase64, 'base64');
  const pcm8k = mulawToPcm(mulaw);
  const pcmResampled = resamplePcm16(pcm8k, 8000, targetRate);
  return pcmResampled.toString('base64');
}

/** Convert ElevenLabs PCM 16-bit at source rate (raw Buffer) → Twilio mulaw 8kHz (base64). */
export function elevenLabsToTwilio(pcmBuffer: Buffer, sourceRate: number): string {
  const pcm8k = resamplePcm16(pcmBuffer, sourceRate, 8000);
  const mulaw = pcmToMulaw(pcm8k);
  return mulaw.toString('base64');
}
