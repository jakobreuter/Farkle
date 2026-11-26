# 🎲 Game Night

Play games in the browser with friends: Farkle, Yacht, Draw, Lucky Streak, Property Rush and Secret Face. No sign-up, works on phones.

**Play:** https://jakobreuter.github.io/Farkle/

## How it works for players
1. Open the site, enter your name and tap **Create session**.
2. Tap **Invite friends** and send the link. On an iPhone this opens the share sheet.
3. Friends open the link, type their name and tap **Join**.
4. The host picks a game and settings and taps **Start**. After a game the host can play again or pick another game.

If the host leaves or switches apps for more than a few seconds, the next person who joined becomes host automatically
and is told so. The original host can come back and rejoins as a regular player. If someone steps away, everyone else
can still finish their turns; the game simply waits when it's the away player's turn.

## Games
- **Farkle**: six dice, push your luck. Set aside scoring dice; first bank needs 500.
- **Yacht**: the classic public-domain five-dice category game (13 boxes, upper bonus at 63).
- **Draw**: one player sketches a word, everyone else guesses.
- **Lucky Streak**: an original press-your-luck card game. Flip cards and bust on a repeated number.
- **Property Rush**: an original set-collecting card game for 2–5 players. Bank money, place properties, charge rent,
  swipe and swap deals, and block with Shields. The first to 3 complete sets wins.
- **Secret Face**: an original 2-player deduction game with 24 illustrated characters. Ask yes/no questions
  (answered automatically), flip faces down, and guess the other player's face.

## Fair randomness
- Every die, card and word pick is exactly uniform. There is no weighting, no streak or "catch-up" logic, and every player is handled the same way.
- Each random event is created by *two* players together using commit–reveal.
  The host commits to a secret random seed (sending only its SHA-256 hash), another player sends their own random seed,
  then the host reveals its seed. Results come from `SHA-256(hostSeed:guestSeed:rollId:counter)`, using rejection sampling
  so every outcome is exactly equally likely. The contributing player's browser re-checks the result and shows a warning if it doesn't verify.
- If nobody else answers within a moment (e.g. they switched apps), the host's cryptographic RNG is used so the game never stalls.

## Farkle scoring
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
A plain static site (HTML/CSS/JS, no build step). Browsers exchange small JSON messages through
public MQTT brokers over secure WebSockets (several at once, de-duplicated). That works on any network, including
cellular, and recovers when a phone pauses the page in the background. No game server or account is needed.
The host's browser referees each game; the relay can't affect randomness, which comes from commit–reveal.

- `js/session.js`: rooms, host referee, host hand-off, fair randomness service
- `js/net.js`: message relay (MQTT) with presence heartbeats
- `js/rng.js`: uniform random integers and commit–reveal helpers
- `js/engines/*.js`: pure rules for each game (tested in `tests/`)
- `js/games/*.js`: each game's screen; `js/games/index.js` lists the games
- `js/dice.js`: the 3D dice; `js/app.js`: home, lobby and game screens

Run tests: `node --test tests/*.mjs`. Run locally: `python3 -m http.server`, then open http://localhost:8000.

## Enabling GitHub Pages
Repository **Settings → Pages → Build and deployment → Source: Deploy from a branch**, pick `main` (or this branch) and `/ (root)`, then Save. Pages on a private repo needs GitHub Pro; otherwise make the repo public.
The site goes live at `https://<user>.github.io/Farkle/` within a minute or two.
