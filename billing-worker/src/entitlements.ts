/** Receipt interpretation and short signed leases; client claims never grant access. */
import type { Decision, JsonObject } from './types';
import { sign_rs256 } from './crypto';

export const SUB = 'kotoba_premium';
export const LIFE = 'kotoba_lifetime';
export type EntitlementDecision = Decision;

function object(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function integer(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value); }

export function epoch(text: unknown): number {
  if (typeof text !== 'string') return 0;
  // Google returns timezone-aware ISO timestamps. Reject normalized invalid dates.
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(?:[.,](\d+))?(Z|[+-]\d{2}:?\d{2})(?![\s\S])/.exec(text);
  if (!match) return 0;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]! || hour > 23 || minute > 59 || second > 59) return 0;
  const zone = match[8]!;
  if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(-2)) > 59)) return 0;
  const normalized = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${(match[7] ?? '').padEnd(3, '0').slice(0, 3)}${zone}`;
  const millis = Date.parse(normalized);
  return Number.isFinite(millis) ? Math.trunc(millis / 1000) : 0;
}

export function decision(product: string, value: unknown, now: number): Decision {
  if (product !== SUB && product !== LIFE) throw new Error('Unknown product');
  const receipt = object(value) ? value : {};
  if (product === SUB) {
    const raw = receipt.lineItems;
    const items = Array.isArray(raw) ? raw.filter((x): x is JsonObject => object(x) && x.productId === SUB && object(x.offerDetails) && (x.offerDetails.basePlanId === 'monthly' || x.offerDetails.basePlanId === 'annual')) : [];
    const until = items.length ? Math.max(...items.map(item => epoch(item.expiryTime))) : 0;
    const active = typeof receipt.subscriptionState === 'string' && ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_CANCELED', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'].includes(receipt.subscriptionState) && until > now && typeof receipt.acknowledgementState === 'string' && ['ACKNOWLEDGEMENT_STATE_PENDING', 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'].includes(receipt.acknowledgementState);
    return { active, kind: 'subscription', until, ackNeeded: active && receipt.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING' };
  }
  const consumption = 'consumptionState' in receipt ? receipt.consumptionState : 0, quantity = 'quantity' in receipt ? receipt.quantity : 1, refundable = 'refundableQuantity' in receipt ? receipt.refundableQuantity : 1;
  const active = integer(receipt.purchaseState) && receipt.purchaseState === 0 && integer(consumption) && consumption === 0 && integer(receipt.acknowledgementState) && [0, 1].includes(receipt.acknowledgementState) && integer(quantity) && quantity === 1 && integer(refundable) && refundable === 1 && ('productId' in receipt ? receipt.productId : LIFE) === LIFE;
  return { active, kind: 'lifetime', until: 0, ackNeeded: active && receipt.acknowledgementState === 0 };
}

export function claims(package_name: string, installation: string, product: string, result: Decision, now: number, options: { account?: string; ttl?: number } = {}): JsonObject {
  if (typeof installation !== 'string' || !/^[A-Za-z0-9-]{10,80}(?![\s\S])/.test(installation)) throw new Error('Invalid installation');
  const { account = '', ttl = 3600 } = options;
  if ((product !== SUB && product !== LIFE) || !integer(ttl) || ttl < 300 || ttl > 3600 || !integer(now)) throw new Error('Invalid lease policy');
  let expiry = now + (result.active ? ttl : 300);
  if (result.active && result.kind === 'subscription') expiry = Math.min(expiry, result.until);
  return { iss: 'studio501.kotoba', aud: package_name, sub: installation, account, iat: now, exp: expiry, active: result.active, kind: result.kind, product };
}

export const sign = sign_rs256;
