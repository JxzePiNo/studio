import { sha256 } from "@noble/hashes/sha2.js";

/** Bounded memory, including for 500 MB files; the nonce proves possession. */
export async function fingerprintFile(file: Blob, nonce = "", signal?: AbortSignal) {
  const hash = sha256.create();
  if (nonce) hash.update(new TextEncoder().encode(nonce));
  for (let offset = 0; offset < file.size; offset += 4 * 1024 * 1024) {
    signal?.throwIfAborted();
    hash.update(new Uint8Array(await file.slice(offset, offset + 4 * 1024 * 1024).arrayBuffer()));
  }
  signal?.throwIfAborted();
  return Array.from(hash.digest(), byte => byte.toString(16).padStart(2, "0")).join("");
}
