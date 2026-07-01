/**
 * Consent-attestation gating has been removed along with adult content.
 * This helper is retained as a no-op for call-site compatibility.
 */
export async function hasConsent(_postId: number): Promise<boolean> {
  return true;
}

export const CONSENT_ATTESTATION_VERSION = "1.0";
