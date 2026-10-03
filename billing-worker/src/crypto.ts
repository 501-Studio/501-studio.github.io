/** Web Crypto primitives and Python cryptography-compatible Fernet assembly. */
const utf8 = new TextEncoder();
const decode_utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export function to_bytes(value: string | Uint8Array): Uint8Array {
  return typeof value === 'string' ? utf8.encode(value) : value;
}

// Copy to an ordinary ArrayBuffer: Web Crypto must not receive a shared buffer.
export function to_buffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer;
}

export function base64url_encode(value: Uint8Array | ArrayBuffer, padding = false): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const result = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_');
  return padding ? result : result.replace(/=+$/, '');
}

export function base64url_decode(value: string): Uint8Array {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]*={0,2}(?![\s\S])/.test(value)) throw new Error('Invalid base64url');
  const unpadded = value.replace(/=+$/, '');
  if (unpadded.length % 4 === 1 || (value.includes('=') && value.length % 4 !== 0)) throw new Error('Invalid base64url');
  const standard = unpadded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - unpadded.length % 4) % 4);
  const bytes = Uint8Array.from(atob(standard), c => c.charCodeAt(0));
  // Reject ambiguous encodings with non-zero unused bits.
  if (base64url_encode(bytes) !== unpadded) throw new Error('Invalid base64url');
  return bytes;
}

export function decode_text(value: Uint8Array): string { return decode_utf8.decode(value); }

export async function sha256_hex(value: string | Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', to_buffer(to_bytes(value))));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function hmac_sha256_hex(secret: string | Uint8Array, value: string | Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', to_buffer(to_bytes(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, to_buffer(to_bytes(value))));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Compare fixed-purpose secrets without a content-dependent early return. */
export function compare_digest(left: string, right: string): boolean {
  const a = utf8.encode(left), b = utf8.encode(right);
  let different = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) different |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return different === 0;
}

function compare_keys(a: string, b: string): number {
  const aa = Array.from(a, c => c.codePointAt(0)!), bb = Array.from(b, c => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) if (aa[i] !== bb[i]) return aa[i]! - bb[i]!;
  return aa.length - bb.length;
}

/** json.dumps(sort_keys=True,separators=(',', ':'),ensure_ascii=True). */
export function canonical_json(value: unknown): string {
  function serialize(item: unknown): string {
    if (item === null) return 'null';
    if (typeof item === 'string') return JSON.stringify(item).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
    if (typeof item === 'boolean') return item ? 'true' : 'false';
    if (typeof item === 'number' && Number.isFinite(item)) return JSON.stringify(item);
    if (Array.isArray(item)) return '[' + item.map(serialize).join(',') + ']';
    if (typeof item === 'object' && item !== null) {
      const record = item as Record<string, unknown>;
      return '{' + Object.keys(record).sort(compare_keys).map(key => serialize(key) + ':' + serialize(record[key])).join(',') + '}';
    }
    throw new Error('Invalid canonical JSON value');
  }
  return serialize(value);
}

export async function import_rsa_private_key(pem: string | Uint8Array): Promise<CryptoKey> {
  const text = typeof pem === 'string' ? pem : decode_text(pem);
  const match = /^\s*-----BEGIN PRIVATE KEY-----\s+([A-Za-z0-9+/=\r\n\t ]+)\s+-----END PRIVATE KEY-----\s*(?![\s\S])/.exec(text);
  if (!match) throw new Error('RSA PKCS8 private key required');
  const binary = atob(match[1]!.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', to_buffer(bytes), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const algorithm = key.algorithm as { name: string; modulusLength: number };
  if (algorithm.name !== 'RSASSA-PKCS1-v1_5' || algorithm.modulusLength < 2048) throw new Error('RSA key must be at least 2048 bits');
  return key;
}

export async function sign_rs256(payload: Record<string, unknown>, pem: string | Uint8Array): Promise<string> {
  const content = base64url_encode(utf8.encode('{"alg":"RS256","typ":"JWT"}')) + '.' + base64url_encode(utf8.encode(canonical_json(payload)));
  const key = await import_rsa_private_key(pem);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, to_buffer(utf8.encode(content)));
  return content + '.' + base64url_encode(signature);
}

/** Format version 0x80, 64-bit timestamp, IV, AES-CBC/PKCS7, HMAC-SHA256. */
export class Fernet {
  private readonly material: Uint8Array;
  private keys: Promise<{ signing: CryptoKey; encryption: CryptoKey }> | undefined;

  constructor(key: string) {
    this.material = base64url_decode(key);
    if (this.material.length !== 32) throw new Error('Fernet key must be 32 url-safe base64-encoded bytes');
  }

  private get_keys(): Promise<{ signing: CryptoKey; encryption: CryptoKey }> {
    this.keys ??= Promise.all([
      crypto.subtle.importKey('raw', to_buffer(this.material.slice(0, 16)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']),
      crypto.subtle.importKey('raw', to_buffer(this.material.slice(16)), 'AES-CBC', false, ['encrypt', 'decrypt']),
    ]).then(([signing, encryption]) => ({ signing, encryption }));
    return this.keys;
  }

  async encrypt(value: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
    if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid Fernet timestamp');
    const keys = await this.get_keys(), iv = crypto.getRandomValues(new Uint8Array(16));
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: to_buffer(iv) }, keys.encryption, to_buffer(utf8.encode(value))));
    const body = new Uint8Array(25 + ciphertext.length);
    body[0] = 0x80;
    new DataView(body.buffer).setBigUint64(1, BigInt(now), false);
    body.set(iv, 9); body.set(ciphertext, 25);
    const signature = new Uint8Array(await crypto.subtle.sign('HMAC', keys.signing, to_buffer(body)));
    const token = new Uint8Array(body.length + signature.length);
    token.set(body); token.set(signature, body.length);
    return base64url_encode(token, true);
  }

  async decrypt(value: string): Promise<string> {
    try {
      const token = base64url_decode(value);
      if (token.length < 73 || token[0] !== 0x80 || (token.length - 57) % 16 !== 0) throw new Error('Invalid token');
      const keys = await this.get_keys(), body = token.slice(0, -32), signature = token.slice(-32);
      if (!await crypto.subtle.verify('HMAC', keys.signing, to_buffer(signature), to_buffer(body))) throw new Error('Invalid token');
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: to_buffer(body.slice(9, 25)) }, keys.encryption, to_buffer(body.slice(25)));
      return decode_text(new Uint8Array(plaintext));
    } catch {
      throw new Error('Invalid Fernet token');
    }
  }
}
