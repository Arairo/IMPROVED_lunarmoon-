// Small accessible pop-over menu for header buttons (Help, Settings).
// items: [{ icon, label, sub, run, toggle, keepOpen } | { sep } | { head } | { seg: [{label, icon, on, run}] }]

import { icon } from './icons.js';
import { play } from './sound.js';

let openMenu = null;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function createMenu(button, build) {
  const pop = document.createElement('div');
  pop.className = 'xp-menu';
  pop.setAttribute('role', 'menu');
  pop.hidden = true;
  document.body.appendChild(pop);

  function render() {
    const items = build();
    pop.innerHTML = items.map((it, i) => {
      if (it.sep) return '<hr>';
      if (it.head) return `<div class="m-head">${esc(it.head)}</div>`;
      if (it.seg) return `<div class="m-seg" role="group">${it.seg.map((g, k) => `<button type="button" data-i="${i}" data-k="${k}" class="${g.on ? 'is-on' : ''}" aria-pressed="${!!g.on}">${icon(g.icon, 15)}${esc(g.label)}</button>`).join('')}</div>`;
      const sw = it.toggle !== undefined ? `<span class="m-switch${it.toggle ? ' is-on' : ''}" aria-hidden="true"><span></span></span>` : '';
      return `<button type="button" role="${it.toggle !== undefined ? 'menuitemcheckbox' : 'menuitem'}" ${it.toggle !== undefined ? `aria-checked="${!!it.toggle}"` : ''} data-i="${i}">
        <span class="m-ico">${icon(it.icon, 17)}</span><span class="m-txt"><b>${esc(it.label)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>${sw}</button>`;
    }).join('');
    pop.querySelectorAll('button[data-i]').forEach((b) => b.addEventListener('click', () => {
      const it = items[Number(b.dataset.i)];
      if (it.seg) { it.seg[Number(b.dataset.k)].run(); render(); play('tick'); return; }
      it.run();
      play('tick');
      if (it.keepOpen) render(); else close();
    }));
  }
  function place() {
    const r = button.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.top = `${Math.round(r.bottom + 8)}px`;
    pop.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)))}px`;
  }
  function open() {
    if (openMenu && openMenu !== api) openMenu.close();
    render();
    pop.hidden = false;
    place();
    requestAnimationFrame(() => pop.classList.add('is-open'));
    button.setAttribute('aria-expanded', 'true');
    openMenu = api;
    pop.querySelector('button')?.focus({ preventScroll: true });
  }
  function close() {
    pop.classList.remove('is-open');
    pop.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (openMenu === api) openMenu = null;
  }
  const api = { open, close };
  button.addEventListener('click', (e) => { e.stopPropagation(); pop.hidden ? open() : close(); });
  document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !pop.contains(e.target) && !button.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => {
    if (pop.hidden) return;
    if (e.key === 'Escape') { close(); button.focus(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const list = [...pop.querySelectorAll('button')];
      const at = list.indexOf(document.activeElement);
      list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
    }
  });
  window.addEventListener('resize', () => { if (!pop.hidden) place(); });
  return api;
}
