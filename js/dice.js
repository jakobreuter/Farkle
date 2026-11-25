// 3D CSS die shared by the dice games. The face shown is always exactly the value
// passed in; the spinning is purely cosmetic.

export const ROLL_MS = 1600;

const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const FACE_ROT = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };

export function createDie(index, onClick) {
  const el = document.createElement('div');
  el.className = 'die no-anim';
  el.dataset.i = index;
  el.setAttribute('role', 'button');
  const faces = [1, 2, 3, 4, 5, 6].map((f) => {
    const pips = Array.from({ length: 9 }, (_, k) => `<span class="pip${PIPS[f].includes(k) ? ' on' : ''}"></span>`).join('');
    return `<div class="face f${f}">${pips}</div>`;
  }).join('');
  el.innerHTML = `<div class="cube-wrap"><div class="tumble"><div class="cube">${faces}</div></div></div>`;
  if (onClick) el.addEventListener('click', () => onClick(index));
  const cube = el.querySelector('.cube');
  const spin = { x: 0, y: 0, z: 0 };
  let value = 1;
  let timer = null;

  function show(v, spinIt) {
    const [bx, by] = FACE_ROT[v];
    if (spinIt) {
      // several whole tumbles on every axis; whole turns only so it lands flat and square
      const dir = () => (Math.random() < 0.5 ? -1 : 1);
      spin.x += 360 * (3 + Math.floor(Math.random() * 3)) * dir();
      spin.y += 360 * (2 + Math.floor(Math.random() * 3)) * dir();
      spin.z += 360 * (1 + Math.floor(Math.random() * 2)) * dir();
    }
    value = v;
    cube.style.transform = `rotateZ(${spin.z}deg) rotateX(${bx + spin.x}deg) rotateY(${by + spin.y}deg)`;
    el.setAttribute('aria-label', `die showing ${v}`);
  }

  const die = {
    el,
    get value() { return value; },
    /** show a value without animation */
    set(v) { if (v !== value && !el.classList.contains('rolling')) show(v, false); },
    shake(on) { el.classList.toggle('shaking', on); },
    roll(v) {
      el.classList.remove('no-anim', 'shaking', 'rolling');
      el.style.setProperty('--dx', `${Math.round(Math.random() * 120 - 60)}px`);
      el.style.setProperty('--tilt', `${Math.round(Math.random() * 50 - 25)}deg`);
      el.style.setProperty('--delay', `${Math.round(Math.random() * 120)}ms`);
      void el.offsetWidth; // restart CSS animation
      el.classList.add('rolling');
      show(v, true);
      clearTimeout(timer);
      timer = setTimeout(() => {
        el.classList.remove('rolling');
        // drop the extra whole turns (looks identical) so angles stay small
        el.classList.add('no-anim');
        spin.x %= 360; spin.y %= 360; spin.z %= 360;
        show(value, false);
        void el.offsetWidth;
        el.classList.remove('no-anim');
      }, ROLL_MS + 160);
    },
  };
  show(index % 6 + 1, false);
  return die;
}
