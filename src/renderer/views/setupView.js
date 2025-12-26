// Setup view helpers isolate navigation for the setup panel.

export function createSetupView({ setActiveView, viewState }) {
  function open({ closeSettingsView, closePluginsView }, callback) {
    if (!setActiveView) return;
    if (viewState.isSetupViewOpen) {
      if (typeof callback === 'function') callback();
      return;
    }
    if (viewState.isSettingsViewOpen) {
      closeSettingsView(() => open({ closeSettingsView, closePluginsView }, callback));
      return;
    }
    if (viewState.isPluginsViewOpen) {
      closePluginsView(() => open({ closeSettingsView, closePluginsView }, callback));
      return;
    }
    setActiveView('setup', callback);
  }

  function close(callback) {
    if (!setActiveView) {
      if (typeof callback === 'function') callback();
      return;
    }
    if (!viewState.isSetupViewOpen) {
      if (typeof callback === 'function') callback();
      return;
    }
    setActiveView('dashboard', callback);
  }

  return { open, close };
}
