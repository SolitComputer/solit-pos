export const TURN_HOST = process.env.NEXT_PUBLIC_TURN_HOST ?? "";
export const TURN_USER = process.env.NEXT_PUBLIC_TURN_USER ?? "";
export const TURN_PASS = process.env.NEXT_PUBLIC_TURN_PASS ?? "";

export const hasCustomTurn = !!(TURN_HOST && TURN_USER && TURN_PASS);

export function buildIceServers(): RTCIceServer[] {
  const stun: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  if (hasCustomTurn) {
    return [
      ...stun,
      { urls: `turn:${TURN_HOST}:3478`, username: TURN_USER, credential: TURN_PASS },
      { urls: `turn:${TURN_HOST}:3478?transport=tcp`, username: TURN_USER, credential: TURN_PASS },
      { urls: `turns:${TURN_HOST}:443?transport=tcp`, username: TURN_USER, credential: TURN_PASS },
    ];
  }
  // Fallback publik — kurang stabil utk produksi, sangat disarankan pakai TURN sendiri
  return [
    ...stun,
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turns:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
  ];
}

export const ICE_SERVERS = buildIceServers();