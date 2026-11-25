// Runs before the page is first laid out (a plain script at the top of <body>, not a
// module), so the first layout is already the final one and nothing jumps around
// (Cumulative Layout Shift; see docs/PERFORMANCE.md). Kept tiny and dependency-free.
(function () {
  var d = document.documentElement, h = location.hash;
  try {
    var t = localStorage.getItem('lsp.theme');
    if (t) d.dataset.theme = t;
  } catch (e) {}
  if (/planner\.html$/.test(location.pathname)) {
    // Terrain 3D opened from Professional mode hides the controls Professional already has.
    if (/(^#|&)from=pro(&|$)/.test(h)) d.classList.add('terrain-view');
  } else if (!/^#pro(&|$)/.test(h)) {
    // The landing intro and the Beginner walk cover the Professional app: keep it
    // hidden until Professional mode is opened, so its start-up is not visible
    // movement (and keyboard focus can't wander into it). See setMode in
    // src/experience/index.js.
    d.classList.add('app-covered');
  }
})();
