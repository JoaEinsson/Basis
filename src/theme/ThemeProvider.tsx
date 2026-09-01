import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getThemeSelection,
  listThemes,
  resolveTheme,
  setThemeSelection,
} from "../lib/tauri";
import type {
  ResolvedTheme,
  ThemeAppearance,
  ThemeCatalog,
  ThemeSelectionDto,
  ThemeTokenValue,
} from "../lib/types";
import { applyCssVariables, resolveCssVariables } from "./cssVariables";

const MANUAL_APPEARANCE_KEY = "basis.theme.manualAppearance";

type ThemeContextValue = {
  catalog: ThemeCatalog | null;
  selection: ThemeSelectionDto | null;
  resolved: ResolvedTheme | null;
  tokens: Record<string, ThemeTokenValue>;
  activeAppearance: ThemeAppearance;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  select: (appearance: ThemeAppearance, id: string) => Promise<void>;
  setFollowSystem: (follow: boolean) => Promise<void>;
  preview: (overrides: Record<string, ThemeTokenValue>) => void;
  clearPreview: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [catalog, setCatalog] = useState<ThemeCatalog | null>(null);
  const [selection, setSelection] = useState<ThemeSelectionDto | null>(null);
  const [resolved, setResolved] = useState<ResolvedTheme | null>(null);
  const [previewOverrides, setPreviewOverrides] = useState<Record<
    string,
    ThemeTokenValue
  > | null>(null);
  const [systemAppearance, setSystemAppearance] =
    useState<ThemeAppearance>(readSystemAppearance);
  const [manualAppearance, setManualAppearance] =
    useState<ThemeAppearance>(readManualAppearance);
  const [osReducedMotion, setOsReducedMotion] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);

  const activeAppearance = selection?.followSystemAppearance
    ? systemAppearance
    : manualAppearance;
  const effectiveTokens = useMemo(
    () =>
      resolved
        ? previewOverrides
          ? { ...resolved.tokens, ...previewOverrides }
          : resolved.tokens
        : {},
    [previewOverrides, resolved],
  );

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const [nextCatalog, nextSelection] = await Promise.all([
        listThemes(),
        getThemeSelection(),
      ]);
      setCatalog(nextCatalog);
      setSelection(nextSelection);
    } catch (cause) {
      setError(messageFor(cause, "Basis could not load portable themes."));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleExternalChange = () => void refresh();
    window.addEventListener("basis:themes-changed", handleExternalChange);
    return () =>
      window.removeEventListener("basis:themes-changed", handleExternalChange);
  }, [refresh]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemAppearance(media.matches ? "dark" : "light");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setOsReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!enabled || !selection) return;
    const id =
      activeAppearance === "light"
        ? selection.lightSelection
        : selection.darkSelection;
    const generation = ++requestGeneration.current;
    setLoading(true);
    void resolveTheme(id)
      .then((next) => {
        if (generation !== requestGeneration.current) return;
        setResolved(next);
        setPreviewOverrides(null);
        setError(null);
      })
      .catch((cause) => {
        if (generation !== requestGeneration.current) return;
        setError(
          messageFor(
            cause,
            "The selected theme is invalid. Basis kept the last known good appearance.",
          ),
        );
      })
      .finally(() => {
        if (generation === requestGeneration.current) setLoading(false);
      });
  }, [activeAppearance, enabled, selection]);

  const select = useCallback(
    async (appearance: ThemeAppearance, id: string) => {
      const follow = selection?.followSystemAppearance ?? false;
      const next = await setThemeSelection(appearance, id, follow);
      window.localStorage.setItem(MANUAL_APPEARANCE_KEY, appearance);
      setManualAppearance(appearance);
      setSelection(next);
      setPreviewOverrides(null);
      const nextCatalog = await listThemes();
      setCatalog(nextCatalog);
    },
    [selection?.followSystemAppearance],
  );

  const setFollowSystem = useCallback(
    async (follow: boolean) => {
      if (!selection) return;
      const appearance = follow ? systemAppearance : manualAppearance;
      const id =
        appearance === "light"
          ? selection.lightSelection
          : selection.darkSelection;
      setSelection(await setThemeSelection(appearance, id, follow));
    },
    [manualAppearance, selection, systemAppearance],
  );

  const preview = useCallback(
    (overrides: Record<string, ThemeTokenValue>) =>
      setPreviewOverrides(overrides),
    [],
  );
  const clearPreview = useCallback(() => setPreviewOverrides(null), []);

  useLayoutEffect(() => {
    if (!resolved) return;
    applyCssVariables(resolveCssVariables(effectiveTokens));
    document.documentElement.dataset.themeId = resolved.id;
    document.documentElement.dataset.themeAppearance = resolved.appearance;
    document.documentElement.dataset.themeReducedMotion = String(
      osReducedMotion &&
        effectiveTokens["motion.reduceWhenOsRequestsReducedMotion"] !== false,
    );
    document.documentElement.style.colorScheme = resolved.appearance;
  }, [effectiveTokens, osReducedMotion, resolved]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      catalog,
      selection,
      resolved,
      tokens: effectiveTokens,
      activeAppearance,
      loading,
      error,
      refresh,
      select,
      setFollowSystem,
      preview,
      clearPreview,
    }),
    [
      activeAppearance,
      catalog,
      error,
      effectiveTokens,
      loading,
      preview,
      clearPreview,
      refresh,
      resolved,
      select,
      selection,
      setFollowSystem,
    ],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}

function readSystemAppearance(): ThemeAppearance {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function readManualAppearance(): ThemeAppearance {
  return window.localStorage.getItem(MANUAL_APPEARANCE_KEY) === "light"
    ? "light"
    : "dark";
}

function messageFor(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}
