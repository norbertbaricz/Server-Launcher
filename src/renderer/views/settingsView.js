// Settings view helpers isolate navigation logic for the settings panel.

export function createSettingsView({ setActiveView, viewState }) {
  function open({ closeSetupView, closePluginsView }, callback) {
    if (!setActiveView) return;
    if (viewState.isSettingsViewOpen) {
      if (typeof callback === 'function') callback();
      return;
    }
    if (viewState.isSetupViewOpen) {
      closeSetupView(() => open({ closeSetupView, closePluginsView }, callback));
      return;
    }
    if (viewState.isPluginsViewOpen) {
      closePluginsView(() => open({ closeSetupView, closePluginsView }, callback));
      return;
    }
    setActiveView('settings', callback);
  }

  function close(callback) {
    if (!setActiveView) {
      if (typeof callback === 'function') callback();
      return;
    }
    if (!viewState.isSettingsViewOpen) {
      if (typeof callback === 'function') callback();
      return;
    }
    setActiveView('dashboard', callback);
  }

  return { open, close };
}
