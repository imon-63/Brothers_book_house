"use client";

/**
 * The admin's current বিভাগ (section). Sections are dynamic (owners can add
 * new ones), so this is a plain section *code* string — not the storefront's
 * fixed VerticalId union. Persisted per browser.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSections, type AdminSection } from "@/lib/api/admin/sections";

const KEY = "cholo_admin_section";

type Ctx = {
  /** current section code ("book", "food", "stationery", …) */
  code: string;
  section: AdminSection | null;
  sections: AdminSection[];
  loading: boolean;
  setCode: (code: string) => void;
  byCode: (code: string | null | undefined) => AdminSection | undefined;
  byId: (id: string | null | undefined) => AdminSection | undefined;
};

const SectionContext = createContext<Ctx>({
  code: "book", section: null, sections: [], loading: true, setCode: () => undefined, byCode: () => undefined, byId: () => undefined,
});

export function AdminSectionProvider({ children }: { children: ReactNode }) {
  const q = useSections();
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    try { setPicked(localStorage.getItem(KEY)); } catch { /* ignore */ }
  }, []);
  const sections = useMemo(() => [...(q.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [q.data]);
  const code = sections.some((s) => s.code === picked) ? picked! : sections[0]?.code ?? picked ?? "book";
  const setCode = useCallback((c: string) => {
    setPicked(c);
    try { localStorage.setItem(KEY, c); } catch { /* ignore */ }
  }, []);
  const value = useMemo<Ctx>(() => ({
    code,
    section: sections.find((s) => s.code === code) ?? null,
    sections,
    loading: q.isLoading,
    setCode,
    byCode: (c) => sections.find((s) => s.code === c),
    byId: (id) => sections.find((s) => s.id === id),
  }), [code, sections, q.isLoading, setCode]);
  return <SectionContext.Provider value={value}>{children}</SectionContext.Provider>;
}

export function useAdminSection() {
  return useContext(SectionContext);
}
