const path = require('node:path');
const fs = require('node:fs');
const log = require('electron-log');

const DEFAULT_THEMES = [
  { code: 'skypixel', name: 'Skypixel Blue', colors: { primary: '#3b82f6', primaryHover: '#2563eb', accent: '#60a5fa' } },
  { code: 'nord', name: 'Nord', colors: { primary: '#88c0d0', primaryHover: '#81a1c1', accent: '#a3be8c' } },
  { code: 'aurora', name: 'Aurora', colors: { primary: '#06b6d4', primaryHover: '#0891b2', accent: '#a78bfa' } },
  { code: 'midnight', name: 'Midnight', colors: { primary: '#6366f1', primaryHover: '#4f46e5', accent: '#14b8a6' } },
  { code: 'emerald', name: 'Emerald', colors: { primary: '#22c55e', primaryHover: '#16a34a', accent: '#34d399' } },
  { code: 'sunset', name: 'Sunset', colors: { primary: '#f97316', primaryHover: '#ea580c', accent: '#fb7185' } },
  { code: 'crimson', name: 'Crimson', colors: { primary: '#ef4444', primaryHover: '#dc2626', accent: '#fca5a5' } },
  { code: 'ocean', name: 'Ocean', colors: { primary: '#0ea5e9', primaryHover: '#0284c7', accent: '#22d3ee' } },
  { code: 'grape', name: 'Grape', colors: { primary: '#8b5cf6', primaryHover: '#7c3aed', accent: '#d8b4fe' } },
  { code: 'neon', name: 'Neon', colors: { primary: '#22d3ee', primaryHover: '#06b6d4', accent: '#a3e635' } }
];

function resolveThemesDir(appPathOverride = null) {
  if (appPathOverride) {
    return path.join(appPathOverride, 'src', 'themes');
  }
  // __dirname here points to src/main, so themes sit at ../themes
  return path.join(__dirname, '..', 'themes');
}

function readAvailableThemes(appPathOverride = null) {
  const themesDir = resolveThemesDir(appPathOverride);
  try {
    const entries = fs.readdirSync(themesDir, { withFileTypes: true });
    const themes = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const fullPath = path.join(themesDir, entry.name);
      try {
        const raw = fs.readFileSync(fullPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') continue;
        const { code, name, colors } = parsed;
        if (!code || typeof code !== 'string') continue;
        themes.push({
          code,
          name: typeof name === 'string' && name.trim() ? name : code,
          colors: {
            primary: colors?.primary || '#3b82f6',
            primaryHover: colors?.primaryHover || colors?.primary || '#2563eb',
            accent: colors?.accent || colors?.primary || '#60a5fa'
          }
        });
      } catch (err) {
        log.warn(`Failed to parse theme file ${fullPath}:`, err);
      }
    }
    return themes.length ? themes : DEFAULT_THEMES;
  } catch (error) {
    log.error('Could not read themes directory:', error);
    return DEFAULT_THEMES;
  }
}

module.exports = {
  DEFAULT_THEMES,
  readAvailableThemes,
  resolveThemesDir,
};
