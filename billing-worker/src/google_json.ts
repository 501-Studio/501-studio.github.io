import { is_record, type JsonObject } from './types';

const INTEGER_FIELDS = new Set(['purchaseState', 'consumptionState', 'acknowledgementState',
  'quantity', 'refundableQuantity', 'expires_in', 'submittedAt', 'refundReason',
  'productType', 'refundType', 'eventTimeMillis']);

/** Python int type checks reject 0.0 and 0e0 even when JS normalizes them to 0. */
export function parse_json_integer_fields(text: string): unknown {
  return JSON.parse(text, (key: string, value: unknown,
                                          context?: { source?: string }) => {
    if (typeof value === 'number' && INTEGER_FIELDS.has(key)) {
      // Fail closed if a runtime ever lacks ES JSON source context support.
      if (typeof context?.source !== 'string') throw new Error('google_json_source_context_required');
      if (!/^-?(?:0|[1-9]\d*)(?![\s\S])/.test(context.source) || !Number.isSafeInteger(value)) return null;
    }
    return value;
  });
}

export function parse_google_json(text: string): JsonObject {
  const result = parse_json_integer_fields(text);
  if (!is_record(result)) throw new Error('invalid_google_response');
  return result;
}
