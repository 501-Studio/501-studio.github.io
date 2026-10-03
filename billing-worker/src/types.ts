export type JsonObject = Record<string, unknown>;

export class BillingError extends Error {
  constructor(public readonly code: string, public readonly status = 400) {
    super(code);
    this.name = 'BillingError';
  }
}

export function is_record(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface Decision {
  active: boolean;
  kind: 'subscription' | 'lifetime';
  until: number;
  ackNeeded: boolean;
  accountDeleted?: boolean;
}

export interface PlayApi {
  lookup(product: string, token: string): Promise<JsonObject>;
  acknowledge(product: string, token: string): Promise<void>;
  decode_integrity(token: string): Promise<JsonObject>;
  voided(start: number, end: number, page?: string | null): Promise<JsonObject>;
}

export interface Env {
  BILLING_STATE: DurableObjectNamespace;
  RECEIPT_VERIFICATION_ENABLED: string;
  PLAY_PACKAGE: string;
  ENTITLEMENT_PRIVATE_KEY_PEM?: string;
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  ACCOUNT_HMAC_KEY?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  PLAY_SIGNING_CERT_SHA256?: string;
  PUBSUB_AUDIENCE?: string;
  PUBSUB_SERVICE_ACCOUNT_EMAIL?: string;
  PUBSUB_SUBSCRIPTION?: string;
  OPS_AUDIENCE?: string;
  OPS_SERVICE_ACCOUNT_EMAIL?: string;
  ACCOUNT_DELETION_ENABLED?: string;
  ACCOUNT_DELETION_WEB_ORIGIN?: string;
  RECONCILIATION_ENABLED?: string;
}
