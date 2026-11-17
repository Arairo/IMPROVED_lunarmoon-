// "About this project" sheet: what the app is, the challenge, the data, how it
// was checked, limits, the team and the AI-use disclosure Space Apps asks for.

// Fill these in; the team section stays hidden while `members` is empty.
export const TEAM = {
  name: 'Dell Monitors',
  members: ['Ammar Rasyid Bin Remy Azrai', 'Ahmad Ibrahim Shahmi', 'Pratyush Kumar Biswal', 'Muhammad Nawfal Bin Khairul Azlan'],
  location: 'Kuala Lumpur, Malaysia',
};

const REPO = 'https://github.com/Arairo/NASA_lunarmoon-';

export function openAbout({ onVideo } = {}) {
  const box = document.createElement('div');
  box.className = 'xp-video xp-about';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'About this project');
  const team = TEAM.members.length
    ? `<section><h3>Team${TEAM.name ? ` · ${TEAM.name}` : ''}</h3><p>${TEAM.members.join(' · ')}${TEAM.location ? `<br><span class="a-dim">${TEAM.location}</span>` : ''}</p></section>`
    : '';
  box.innerHTML = `<div class="v-card a-card">
      <div class="v-head"><b>About this project</b>
        <button type="button" class="xp-chip xp-icon-btn" data-v="close" aria-label="Close">✕</button></div>
      <div class="a-body">
        <p class="a-lead">Lunar Site Planner helps mission planners, teachers and the public choose <b>where and when to land near the Moon’s south pole</b>. For any site and date it shows where the Sun and Earth sit against the real terrain horizon, so you can see at a glance whether a lander will have <b>sunlight for power</b> and <b>Earth in view for radio</b>, and how that changes if the launch slips.</p>
        <section><h3>The challenge</h3><p>NASA Space Apps Challenge 2026 · <i>CLPS Lunar Mission Browser</i>: make it fast and intuitive to compare landing sites and dates by visualising Sun and Earth positions relative to the horizon.</p></section>
        <section><h3>Two ways in</h3><p><b>Beginner</b>: a calm, step-by-step walk with Lumi, with the “why” whenever you want it. <b>Professional</b>: the full planner with the 3D Moon, timeline, power, radio links and side-by-side comparison, plus a 3D terrain view (CesiumJS) for experts.</p></section>
        <section><h3>Space agency data</h3><ul>
          <li><b>NASA LRO LOLA</b> laser altimetry: south-pole terrain grids used to compute each site’s real horizon.</li>
          <li><b>NASA LRO LROC WAC</b> mosaics (via USGS Astrogeology): Moon imagery and the 450 m polar map.</li>
          <li><b>NASA Blue Marble</b>: Earth imagery.</li>
          <li><b>NASA Deep Space Network</b> station locations for the radio-link check.</li>
          <li>Sun and Earth positions from the astronomy-engine library with the IAU lunar rotation model, <b>checked against NASA JPL Horizons</b>.</li>
        </ul></section>
        <section><h3>How we know it’s right</h3><p>48 checks against NASA JPL Horizons (worst difference about 0.005°), the Sun’s height at five Apollo landings within 0.35° of the mission reports, and sunsets at Blue Ghost, Chandrayaan-3 and SLIM on the days their teams reported. Every site’s skyline comes from NASA LOLA terrain.</p>
          <button type="button" class="xp-chip" data-v="trust">See the full checks, data and sources</button></section>
        <section><h3>Honest limits</h3><p>Real NASA LOLA terrain covers every site: 20 m around the main south-polar sites, 240 m elsewhere near the south pole and about 1.9 km for the rest of the Moon. A ridge-top value can still shift by several percentage points within a few hundred metres, so use the landing-area check. The GO / GO WITH CARE / NO GO lights use our own rules of thumb, not a NASA standard. In the 3D view, Earth is drawn closer and smaller than it really is.</p></section>
        ${team}
        <section><h3>How we used AI</h3><p>We used Claude Code (Anthropic) as a coding assistant to write and test the app’s code and text. The narration voice in our tutorial videos is AI-generated (Kokoro text-to-speech), the promo’s music was synthesised in code, and the videos carry an “SI-assisted” label. The science engine was checked against NASA JPL Horizons, and every data source is listed above. No NASA logos or branding are used.</p></section>
        <div class="a-links"><a class="xp-chip" href="${REPO}" target="_blank" rel="noopener">Source code on GitHub</a>
          <button type="button" class="xp-chip" data-v="video">▶ Two-minute tutorial</button>
          <button type="button" class="xp-chip" data-v="promo">▶ 48-second promo</button></div>
      </div>
    </div>`;
  document.body.appendChild(box);
  const close = () => { box.remove(); removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', onKey);
  box.addEventListener('click', (e) => {
    if (e.target === box || e.target.closest('[data-v="close"]')) close();
    if (e.target.closest('[data-v="video"]')) { close(); onVideo?.(); }
    if (e.target.closest('[data-v="promo"]')) { close(); onVideo?.('promo'); }
    if (e.target.closest('[data-v="trust"]')) { close(); import('./trust.js').then((m) => import('../data/sites.js').then((d) => m.openTrust({ sites: d.default }))); }
  });
  setTimeout(() => box.querySelector('[data-v="close"]')?.focus(), 50);
}
