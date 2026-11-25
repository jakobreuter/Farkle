// Small shared UI helpers for the game views.

export const $ = (s, root = document) => root.querySelector(s);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/**
 * Scoreboard that updates in place (so highlights/bars animate).
 * rows: [{ name, score, active, me, away, sub, pct }]
 */
export function scoreboard(el, rows) {
  if (el.children.length !== rows.length) {
    el.innerHTML = rows.map(() => `<div class="player">
      <div class="pname"><span class="nm"></span><span class="tag"></span></div>
      <div class="pscore"></div><div class="psub"></div><div class="bar"><span></span></div></div>`).join('');
  }
  rows.forEach((r, i) => {
    const c = el.children[i];
    c.classList.toggle('active', !!r.active);
    c.classList.toggle('away', !!r.away);
    c.querySelector('.nm').textContent = r.name;
    c.querySelector('.tag').textContent = r.away ? 'away' : r.me ? 'you' : '';
    c.querySelector('.pscore').textContent = typeof r.score === 'number' ? r.score.toLocaleString() : (r.score ?? '');
    c.querySelector('.psub').textContent = r.sub || '';
    const bar = c.querySelector('.bar');
    bar.style.display = r.pct == null ? 'none' : '';
    if (r.pct != null) bar.firstElementChild.style.width = `${Math.max(0, Math.min(100, r.pct))}%`;
  });
}

/** Big pop-up word over the table ("FARKLE!", "BUST!"). */
export function banner(el, text, kind, ms = 1500) {
  el.textContent = text;
  el.className = `banner ${kind}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), ms);
}

/** "Sam's turn" pill that slides in. */
export function turnPill(el, text, delay = 0) {
  clearTimeout(el._t1);
  clearTimeout(el._t2);
  el._t1 = setTimeout(() => {
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    el._t2 = setTimeout(() => el.classList.remove('show'), 1700);
  }, delay);
}
