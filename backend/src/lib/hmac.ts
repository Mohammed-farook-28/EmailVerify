import crypto from 'crypto';

/**
 * HMAC-SHA256 signing utility for webhook payloads
 * Follows Stripe-style signature format: t=timestamp,v1=signature
 */

/**
 * Generate a webhook signing secret with whsec_ prefix
 * @returns The full signing secret (only shown once at webhook creation)
 */
export function generateWebhookSecret(): string {
  const randomBytes = crypto.randomBytes(32);
  const base64 = randomBytes.toString('base64url');
  return `whsec_${base64}`;
}

/**
 * Sign a webhook payload using HMAC-SHA256
 * @param payload - The JSON payload as a string
 * @param secret - The webhook signing secret
 * @param timestamp - Unix timestamp in seconds
 * @returns Signature string in format: t=timestamp,v1=signature
 */
export function signWebhookPayload(
  payload: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000)
): string {
  // Remove whsec_ prefix if present for signing
  const signingKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;

  // Create signed payload: timestamp.payload
  const signedPayload = `${timestamp}.${payload}`;

  // Generate HMAC-SHA256 signature
  const signature = crypto
    .createHmac('sha256', signingKey)
    .update(signedPayload)
    .digest('hex');

  return `t=${timestamp},v1=${signature}`;
}

/**
 * Verify a webhook signature
 * @param payload - The raw payload string
 * @param signature - The signature header value (t=timestamp,v1=signature)
 * @param secret - The webhook signing secret
 * @param tolerance - Maximum age of signature in seconds (default: 300 = 5 minutes)
 * @returns true if signature is valid, false otherwise
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  tolerance: number = 300
): boolean {
  try {
    // Parse signature header
    const parts = signature.split(',');
    const timestampPart = parts.find(p => p.startsWith('t='));
    const signaturePart = parts.find(p => p.startsWith('v1='));

    if (!timestampPart || !signaturePart) {
      return false;
    }

    const timestamp = parseInt(timestampPart.slice(2), 10);
    const expectedSig = signaturePart.slice(3);

    // Verify timestamp is recent (within tolerance)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > tolerance) {
      return false;
    }

    // Remove whsec_ prefix if present
    const signingKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const computedSig = crypto
      .createHmac('sha256', signingKey)
      .update(signedPayload)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(expectedSig),
      Buffer.from(computedSig)
    );
  } catch {
    return false;
  }
}

/**
 * Hash a secret for storage (we never store raw secrets)
 * @param secret - The raw secret
 * @returns SHA-256 hash of the secret
 */
export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/**
 * Get the prefix of a secret for display purposes
 * @param secret - The full secret
 * @param length - Number of characters to show (default: 12)
 * @returns The prefix (e.g., "whsec_abc123")
 */
export function getSecretPrefix(secret: string, length: number = 12): string {
  return secret.slice(0, length);
}
