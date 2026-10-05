/** Explicit Google fakes; storage and cryptography remain the real workerd APIs. */
import { SUB, LIFE } from '../src/entitlements';
import type { JsonObject, PlayApi } from '../src/types';

export const NOW = 1790460000;
export const PACKAGE = 'com.studio501.kotoba';
export const SUBSCRIPTION = 'projects/test-project/subscriptions/play-rtdn';
export const KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
export const OWNER_A = 'a'.repeat(64), OWNER_B = 'b'.repeat(64);
export const TOKEN = 'test-purchase-token-secret-12345';
export function product(owner: string | null = OWNER_A, state = 0, order = 'GPA.current-order'): JsonObject {
  return { purchaseState: state, acknowledgementState: 1, consumptionState: 0,
    obfuscatedExternalAccountId: owner, orderId: order, productId: LIFE };
}
export function subscription(owner: string | null = OWNER_A, order = 'GPA.current-order..1', linked?: string): JsonObject {
  return { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    externalAccountIdentifiers: { obfuscatedExternalAccountId: owner }, lineItems: [
      { productId: SUB, offerDetails: { basePlanId: 'monthly' }, expiryTime: new Date((NOW + 86400) * 1000).toISOString(),
        latestSuccessfulOrderId: order }], ...(linked ? { linkedPurchaseToken: linked } : {}) };
}
export function envelope(kind: string, notice: JsonObject, message_id = 'notification-1', package_name = PACKAGE): JsonObject {
  const value = { version: '1.0', packageName: package_name, eventTimeMillis: String(NOW * 1000), [kind]: notice };
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return { subscription: SUBSCRIPTION, message: { messageId: message_id,
    data: btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')) } };
}
export class FakePlay implements PlayApi {
  receipts: Record<string, JsonObject> = {};
  lookups: [string, string][] = [];
  acknowledgements: [string, string][] = [];
  fail_lookup = false;
  fail_ack = false;
  pages = new Map<string | undefined, JsonObject>();
  page_calls: [number, number, string | undefined][] = [];
  after_ack?: (product: string, token: string) => void;
  async lookup(item: string, token: string): Promise<JsonObject> {
    this.lookups.push([item, token]);
    if (this.fail_lookup) throw new Error('fake Google outage');
    return structuredClone(this.receipts[token] ?? {});
  }
  async acknowledge(item: string, token: string): Promise<void> {
    this.acknowledgements.push([item, token]);
    if (!this.fail_ack) this.receipts[token].acknowledgementState = item === SUB ? 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' : 1;
    this.after_ack?.(item, token);
  }
  async decode_integrity(): Promise<JsonObject> { return {}; }
  async voided(start: number, end: number, page?: string | null): Promise<JsonObject> {
    this.page_calls.push([start, end, page ?? undefined]);
    return structuredClone(this.pages.get(page ?? undefined) ?? { voidedPurchases: [] });
  }
}
export function review_record(): JsonObject {
  return { preference: 'NEUTRAL', externalSubmissionReference: 'private-evidence-reference-1234',
    submittedAt: NOW, externalSubmissionConfirmed: true };
}
