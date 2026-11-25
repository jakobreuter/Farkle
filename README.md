# 🎲 Farkle Online

Play Farkle in the browser with a friend, with animated 3D dice and provably fair rolls.

**Play:** https://jakobreuter.github.io/farkle/ (after GitHub Pages is enabled, see below)

## How to play with a friend
1. Open the site, enter your name and click **Create game**.
2. Send the link (or the 5-letter room code) to your friend.
3. They open it, enter their name, and click **Join game**. The game starts automatically.

You can also choose **Pass & play** to play on one device.

## Fair dice
- Every die is uniform on 1–6. There is no weighting, no streak or "catch-up" logic, and both players are handled the same way.
- **Online:** each roll is created by *both* players together using commit–reveal.
  The host commits to a secret random seed (sending only its SHA-256 hash), the guest sends their own random seed,
  then the host reveals its seed. The dice come from `SHA-256(hostSeed:guestSeed:rollId:counter)`, using rejection sampling
  so every face is exactly equally likely. The guest's browser re-checks every roll and shows a warning if one doesn't verify.
  So neither player can steer the dice, even by editing the code.
- **Offline:** dice use the browser's cryptographic RNG (`crypto.getRandomValues`), also with rejection sampling.

## Rules / scoring
| Combination | Points |
|---|---|
| Single 1 / single 5 | 100 / 50 |
| Three 1s | 1,000 |
| Three of a kind (2–6) | face × 100 |
| Four / five / six of a kind | 1,000 / 2,000 / 3,000 |
| Straight 1–6, three pairs, four of a kind + pair | 1,500 |
| Two triplets | 2,500 |

Farkle (no scoring dice) loses the turn's points. If you score with all six dice you get **hot dice** and roll all six again.
When someone reaches the target, every other player gets one last turn.

## How it works
A plain static site (HTML/CSS/JS, no build step). Players connect directly browser-to-browser with WebRTC via
[PeerJS](https://peerjs.com/) and its free public signaling server, so no game server is needed.

- `js/farkle.js`: pure rules engine
- `js/rng.js`: fair dice and commit–reveal
- `js/net.js`: peer-to-peer connection
- `js/app.js`: UI, animation and game flow

Run tests: `node --test tests/*.mjs`. Run locally: `python3 -m http.server`, then open http://localhost:8000.

## Enabling GitHub Pages
Repository **Settings → Pages → Build and deployment → Source: Deploy from a branch**, pick `main` and `/ (root)`, then Save.
The site goes live at `https://<user>.github.io/farkle/` within a minute or two.
