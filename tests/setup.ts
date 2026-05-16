import 'fake-indexeddb/auto';

if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.randomUUID !== 'function') {
  const cryptoLib = await import('node:crypto');
  (globalThis as { crypto?: Crypto }).crypto = {
    ...(globalThis.crypto ?? {}),
    randomUUID: () => cryptoLib.randomUUID()
  } as Crypto;
}
