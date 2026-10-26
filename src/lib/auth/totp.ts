import { generateSecret, generateURI, verify } from "otplib";
import { toDataURL } from "qrcode";

const ISSUER = "Travel Photo Journal";
const STEP_SECONDS = 30;

export { generateSecret };

export function buildOtpauthUrl(email: string, secret: string): string {
  return generateURI({
    issuer: ISSUER,
    label: email,
    secret,
  });
}

export function toQrDataUrl(otpauthUrl: string): Promise<string> {
  return toDataURL(otpauthUrl);
}

export async function verifyCode(code: string, secret: string): Promise<boolean> {
  // One 30-second step on either side of the current code.
  const result = await verify({
    secret,
    token: code,
    epochTolerance: STEP_SECONDS,
  });
  return result.valid;
}
