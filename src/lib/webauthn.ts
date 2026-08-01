import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL, isoUint8Array } from "@simplewebauthn/server/helpers";

export const RP_NAME = "Solit POS";
export const RP_ID = process.env.WEBAUTHN_RP_ID ?? "solit-pos.store";

const ORIGIN_ENV = process.env.WEBAUTHN_ORIGIN ?? `https://${RP_ID}`;
export const ORIGIN: string | string[] = ORIGIN_ENV.includes(",")
  ? ORIGIN_ENV.split(",").map((o) => o.trim())
  : ORIGIN_ENV;

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

if (!process.env.WEBAUTHN_RP_ID || !process.env.WEBAUTHN_ORIGIN) {
  console.warn(
    "[webauthn] WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN belum diset — pakai default:",
    { RP_ID, ORIGIN: ORIGIN_ENV }
  );
}

export {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  isoBase64URL,
  isoUint8Array,
};