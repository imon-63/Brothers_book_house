/** App colour theme — chosen by the admin (store setting `theme`), applied as <html data-theme>. */

export type AppTheme = "classic" | "mint";
export const THEMES: AppTheme[] = ["classic", "mint"];

const KEY = "cholo-theme";

export function applyTheme(t: AppTheme) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(KEY, t); } catch { /* private mode */ }
}

/** Runs in <head> before first paint, so a returning visitor never sees the other theme flash. */
export const THEME_BOOT = `try{var t=localStorage.getItem("${KEY}");if(t==="mint"||t==="classic")document.documentElement.dataset.theme=t}catch(e){}`;
