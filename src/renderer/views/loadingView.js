// Loading view helpers isolate the splash/loader logic.

export function createLoadingView({ loadingScreen, loadingTextEl }) {
  const view = {
    show(text) {
      if (!loadingScreen) return;
      if (text && loadingTextEl) loadingTextEl.textContent = text;
      loadingScreen.classList.remove('hidden');
      loadingScreen.style.opacity = '1';
    },
    hide() {
      if (!loadingScreen) return;
      loadingScreen.style.opacity = '0';
      setTimeout(() => {
        loadingScreen.classList.add('hidden');
      }, 500);
    },
    setText(fallbackText, translationKeyGetter) {
      if (!loadingTextEl) return;
      const translated = translationKeyGetter ? translationKeyGetter() : null;
      const text = translated || fallbackText;
      loadingTextEl.textContent = text;
    }
  };

  return view;
}
