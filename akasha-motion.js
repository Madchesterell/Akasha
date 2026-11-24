/**
 * Akasha motion — animasi entrance per section saat panel/tab aktif.
 * Berdiri sendiri: tidak mengubah logika script.js.
 * Deteksi via MutationObserver pada class "hidden".
 */
(function () {
  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PANEL_IDS = [
    'dashboardHomePanel',
    'myWorkspacesPanel',
    'productivityPanel',
    'notificationsPanel',
    'profilePanel',
    'mainTaskContainer',
    'calendarPanel',
    'activityPanel',
    'announcementPanel',
    'divisionManagementPanel',
    'teamPanel'
  ];

  const VIEW_IDS = ['dashboardView', 'workspaceView'];

  /** Selector unit section di dalam panel (bukan per-item). */
  const SECTION_SELECTOR = [
    ':scope > .greet-hero',
    ':scope > .stats-grid',
    ':scope > .dash-deadline',
    ':scope > .card',
    ':scope > .reminder-banner',
    ':scope > .ws-page-head',
    ':scope > .ws-card-grid',
    ':scope > .dash-grid > .dash-main > .card',
    ':scope > .dash-grid > .dash-side > .card',
    ':scope > #profileView > .profile-card',
    ':scope > #profileView > .card',
    ':scope > #profileView > .profile-grid',
    ':scope > #profileView > .profile-stats'
  ].join(',');

  const STAGGER_MS = 55;
  const MAX_STAGGER_INDEX = 6;
  const ENTER_CLASS = 'ak-motion-enter';
  const PENDING_CLASS = 'ak-motion-pending';
  const VIEW_CLASS = 'ak-view-enter';

  const tokens = new WeakMap();

  function prefersReduce() {
    return REDUCE || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function sectionRoots(panel) {
    if (!panel) return [];
    const list = Array.from(panel.querySelectorAll(SECTION_SELECTOR));
    // dedupe & hanya yang terlihat
    const seen = new Set();
    return list.filter((el) => {
      if (seen.has(el)) return false;
      if (el.classList.contains('hidden')) return false;
      if (el.closest('.hidden') && el.closest('.hidden') !== panel) return false;
      // parkiran / tersembunyi di home
      if (el.closest('.dash-parked')) return false;
      // elemen yang tidak dirender (mis. grid desktop yang disembunyikan di ponsel) tidak perlu dianimasikan
      if (el.offsetParent === null) return false;
      seen.add(el);
      return true;
    });
  }

  function clearMotion(el) {
    el.classList.remove(ENTER_CLASS, PENDING_CLASS);
    el.style.removeProperty('animation-delay');
  }

  function runCountUp(scope) {
    if (prefersReduce() || !scope) return;
    const nodes = scope.querySelectorAll('.summary-item .num, .ring-num, .profile-stats dd');
    nodes.forEach((el) => {
      if (el.dataset.akCountLock === '1') return;
      const text = (el.textContent || '').trim();
      const match = text.match(/-?\d+(\.\d+)?/);
      if (!match) return;
      const target = parseFloat(match[0]);
      if (!Number.isFinite(target)) return;
      const suffix = text.slice(match.index + match[0].length);
      const prefix = text.slice(0, match.index);
      const isInt = Number.isInteger(target) && !match[0].includes('.');
      el.dataset.akCountLock = '1';
      el.classList.add('ak-count');
      const dur = 1200;
      const t0 = performance.now();
      const from = 0;
      function frame(now) {
        const p = Math.min(1, (now - t0) / dur);
        const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        const v = from + (target - from) * eased;
        el.textContent = prefix + (isInt ? Math.round(v) : v.toFixed(1)) + suffix;
        if (p < 1) requestAnimationFrame(frame);
        else {
          el.textContent = text;
          setTimeout(() => { delete el.dataset.akCountLock; }, 800);
        }
      }
      requestAnimationFrame(frame);
    });
  }

  function animatePanel(panel) {
    if (!panel || panel.classList.contains('hidden')) return;
    const token = (tokens.get(panel) || 0) + 1;
    tokens.set(panel, token);

    const sections = sectionRoots(panel);
    if (!sections.length) {
      // panel kosong / konten di-inject belakangan — coba lagi singkat
      setTimeout(() => {
        if (tokens.get(panel) !== token) return;
        if (panel.classList.contains('hidden')) return;
        const retry = sectionRoots(panel);
        if (retry.length) animatePanel(panel);
      }, 120);
      return;
    }

    if (prefersReduce()) {
      sections.forEach(clearMotion);
      return;
    }

    sections.forEach((el, i) => {
      clearMotion(el);
      el.classList.add(PENDING_CLASS);
      const delay = Math.min(i, MAX_STAGGER_INDEX) * STAGGER_MS;
      // force reflow agar pending diterapkan sebelum enter
      void el.offsetWidth;
      el.style.animationDelay = delay + 'ms';
      el.classList.remove(PENDING_CLASS);
      el.classList.add(ENTER_CLASS);
      const onEnd = (ev) => {
        if (ev.target !== el) return;
        el.removeEventListener('animationend', onEnd);
        if (tokens.get(panel) !== token) return;
        el.classList.remove(ENTER_CLASS);
        el.style.removeProperty('animation-delay');
      };
      el.addEventListener('animationend', onEnd);
      // fallback cleanup
      setTimeout(() => {
        if (tokens.get(panel) !== token) return;
        el.classList.remove(ENTER_CLASS, PENDING_CLASS);
        el.style.removeProperty('animation-delay');
      }, delay + 600);
    });

    // count-up setelah section pertama mulai terlihat
    setTimeout(() => {
      if (tokens.get(panel) !== token) return;
      runCountUp(panel);
    }, 50);
  }

  function animateView(view) {
    if (!view || view.classList.contains('hidden') || prefersReduce()) return;
    view.classList.remove(VIEW_CLASS);
    void view.offsetWidth;
    view.classList.add(VIEW_CLASS);
    const done = () => {
      view.classList.remove(VIEW_CLASS);
      view.removeEventListener('animationend', done);
    };
    view.addEventListener('animationend', done);
    setTimeout(() => view.classList.remove(VIEW_CLASS), 500);
  }

  function becameVisible(oldValue, el) {
    const oldHas = (oldValue || '').split(/\s+/).includes('hidden');
    const nowHas = el.classList.contains('hidden');
    return oldHas && !nowHas;
  }

  function observe() {
    const targets = [];
    PANEL_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) targets.push(el);
    });
    VIEW_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) targets.push(el);
    });
    if (!targets.length) return;

    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type !== 'attributes' || m.attributeName !== 'class') continue;
        const el = m.target;
        if (!(el instanceof HTMLElement)) continue;
        if (!becameVisible(m.oldValue, el)) continue;

        if (VIEW_IDS.includes(el.id)) {
          animateView(el);
          // panel aktif di dalam view
          if (el.id === 'dashboardView') {
            PANEL_IDS.slice(0, 5).forEach((pid) => {
              const p = document.getElementById(pid);
              if (p && !p.classList.contains('hidden')) animatePanel(p);
            });
          }
          if (el.id === 'workspaceView') {
            PANEL_IDS.slice(5).forEach((pid) => {
              const p = document.getElementById(pid);
              if (p && !p.classList.contains('hidden')) animatePanel(p);
            });
          }
          continue;
        }

        if (PANEL_IDS.includes(el.id)) animatePanel(el);
      }
    });

    targets.forEach((el) => {
      mo.observe(el, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    });

    // Tab pertama yang sudah terlihat saat motion siap (mis. setelah login cepat)
    requestAnimationFrame(() => {
      PANEL_IDS.forEach((id) => {
        const p = document.getElementById(id);
        if (p && !p.classList.contains('hidden') && p.offsetParent !== null) {
          // Hanya jika view induk juga terlihat
          const dash = document.getElementById('dashboardView');
          const ws = document.getElementById('workspaceView');
          const inDash = dash && !dash.classList.contains('hidden') && dash.contains(p);
          const inWs = ws && !ws.classList.contains('hidden') && ws.contains(p);
          if (inDash || inWs) animatePanel(p);
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observe);
  } else {
    observe();
  }
})();
