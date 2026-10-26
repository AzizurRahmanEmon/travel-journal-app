export function secretFromOtpauthUrl(otpauthUrl: string): string | null {
  const match = /[?&]secret=([^&]+)/.exec(otpauthUrl);
  if (!match?.[1]) {
    return null;
  }
  return decodeURIComponent(match[1]);
}
