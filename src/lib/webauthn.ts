import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL, isoUint8Array } from "@simplewebauthn/server/helpers";

export const RP_NAME = "Solit POS";
export const RP_ID = process.env.WEBAUTHN_RP_ID ?? "solit-pos.store";
export const ORIGIN = process.env.WEBAUTHN_ORIGIN ?? `https://${RP_ID}`;
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  isoBase64URL,
  isoUint8Array,
};