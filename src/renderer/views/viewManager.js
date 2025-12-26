// View manager centralizes view activation logic for the renderer.
// It keeps active view state and toggles the appropriate DOM panels.

export function createViewManager({ viewMap, mainContentArea, viewState }) {
  if (!viewState) {
    throw new Error('viewState is required');
  }

  function setActiveView(target, callback) {
    const incoming = viewMap[target];
    const outgoing = viewState.activeViewKey ? viewMap[viewState.activeViewKey] : null;

    if (!incoming) {
      if (typeof callback === 'function') callback();
      return;
    }

    if (viewState.activeViewKey === target) {
      if (typeof callback === 'function') callback();
      return;
    }

    if (incoming) {
      incoming.classList.add('active-view');
      incoming.setAttribute('aria-hidden', 'false');
      incoming.scrollTop = 0;
    }

    if (outgoing && outgoing !== incoming) {
      outgoing.classList.remove('active-view');
      outgoing.setAttribute('aria-hidden', 'true');
    }

    viewState.activeViewKey = target;
    viewState.isSettingsViewOpen = target === 'settings';
    viewState.isPluginsViewOpen = target === 'plugins';
    viewState.isSetupViewOpen = target === 'setup';
    viewState.isJavaViewOpen = target === 'java';

    if (mainContentArea) {
      mainContentArea.scrollTop = 0;
      mainContentArea.scrollLeft = 0;
    }

    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof callback === 'function') {
      if (prefersReducedMotion) {
        callback();
      } else {
        setTimeout(callback, 300);
      }
    }
  }

  return { setActiveView };
}
