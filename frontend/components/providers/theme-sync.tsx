"use client";

import { useEffect } from "react";
import { useStorefront } from "@/lib/api/content";
import { applyTheme, THEMES, type AppTheme } from "@/lib/theme";

/** Keeps <html data-theme> in step with the admin's store setting. */
export function ThemeSync() {
  const theme = useStorefront().data?.settings?.theme as AppTheme | undefined;
  useEffect(() => {
    if (theme && THEMES.includes(theme)) applyTheme(theme);
  }, [theme]);
  return null;
}
