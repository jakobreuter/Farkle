// Fair dice. Every die is uniform on 1..6 — no weighting, no streak logic,
// no "comeback" help for anyone.
//
// Offline: the browser's cryptographic RNG (crypto.getRandomValues).
// Online: commit–reveal between both players, so NEITHER player can bias a roll,
// even by modifying their own copy of the code:
//   1. host picks a secret random seed H and sends only SHA-256(H) (the "commitment")
//   2. guest replies with its own random seed G
//   3. host reveals H; dice = SHA-256(H : G : rollId : counter) bytes
//   4. guest checks SHA-256(H) matches the commitment and recomputes the dice.
// The host can't choose H after seeing G, and the guest doesn't know H when picking G.

// Bytes >= 252 are rejected so that byte % 6 is exactly uniform (252 = 42 * 6).
const LIMIT = 252;

export function cryptoDice(n) {
  const out = [];
  const buf = new Uint8Array(16);
  while (out.length < n) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < LIMIT) out.push((b % 6) + 1);
      if (out.length === n) break;
    }
  }
  return out;
}

export function randomHex(bytes = 32) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function sha256Bytes(text) {
  const data = new TextEncoder().encode(text);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

export async function sha256Hex(text) {
  const b = await sha256Bytes(text);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function deriveDice(hostSeed, guestSeed, rollId, n) {
  const out = [];
  for (let counter = 0; out.length < n; counter++) {
    const h = await sha256Bytes(`${hostSeed}:${guestSeed}:${rollId}:${counter}`);
    for (const b of h) {
      if (b < LIMIT) out.push((b % 6) + 1);
      if (out.length === n) break;
    }
  }
  return out;
}
