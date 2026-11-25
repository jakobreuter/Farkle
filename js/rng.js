// Fair randomness. Every outcome is exactly uniform: no weighting, no streak logic,
// no "comeback" help for anyone.
//
// Online, each random event (a dice roll, a card flip, a word pick) is made with
// commit–reveal between the host and one other player, so neither can bias it:
//   1. host picks a secret random seed H and sends only SHA-256(H) (the "commitment")
//   2. the other player replies with their own random seed G
//   3. host reveals H; results come from SHA-256(H : G : id : counter)
//   4. that player's browser checks SHA-256(H) matches and recomputes the results.
// If nobody else is around to contribute (e.g. they switched apps), the host uses its
// own cryptographic RNG so the game never stalls.
//
// Integers in [0, r) are drawn with rejection sampling so every value is equally likely.

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

const TWO32 = 2 ** 32;

/** Turn a stream of 32-bit words into uniform integers, one per range. */
function sample(nextWord, ranges) {
  return ranges.map((r) => {
    if (!(Number.isInteger(r) && r >= 1)) throw new Error('bad range');
    const limit = Math.floor(TWO32 / r) * r;
    for (;;) {
      const u = nextWord();
      if (u < limit) return u % r;
    }
  });
}

/** Uniform integers from the browser's cryptographic RNG. */
export function cryptoInts(ranges) {
  const buf = new Uint32Array(64);
  let i = buf.length;
  return sample(() => {
    if (i === buf.length) { crypto.getRandomValues(buf); i = 0; }
    return buf[i++];
  }, ranges);
}

/** Uniform integers derived from both players' seeds (deterministic, verifiable). */
export async function deriveInts(hostSeed, guestSeed, id, ranges) {
  // Pre-generate enough hash output; rejection is rare (< 1 in 2^31 per draw for small ranges).
  const words = [];
  let counter = 0;
  const need = ranges.length + 8;
  while (words.length < need) {
    const h = await sha256Bytes(`${hostSeed}:${guestSeed}:${id}:${counter++}`);
    const dv = new DataView(h.buffer);
    for (let k = 0; k < 8; k++) words.push(dv.getUint32(k * 4));
  }
  let i = 0;
  return sample(() => {
    // 8 spare words: running out would need 8 consecutive rejections (odds < 1e-60)
    if (i >= words.length) throw new Error('randomness exhausted');
    return words[i++];
  }, ranges);
}

// Dice helpers (1..6)
export const cryptoDice = (n) => cryptoInts(Array(n).fill(6)).map((v) => v + 1);
export async function deriveDice(hostSeed, guestSeed, id, n) {
  return (await deriveInts(hostSeed, guestSeed, id, Array(n).fill(6))).map((v) => v + 1);
}
