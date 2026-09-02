import { create } from "zustand";
import type {
  Expr,
  LayoutKind,
  QueryField,
  QuerySort,
  ViewDensity,
} from "../lib/types";

export type ViewEntryState = {
  layout: LayoutKind;
  density: ViewDensity;
  query: Expr;
  sort: QuerySort[];
  groupBy: QueryField[];
  visibleFields: QueryField[];
  coverSize: number | null;
  selectedIds: string[];
};

export type NavigationFocusTarget = {
  attribute: "aria-label" | "data-focus-key" | "href" | "id";
  value: string;
};

type NavigationState = {
  focusTargets: Record<string, NavigationFocusTarget | null>;
  paletteOpen: boolean;
  searchSelections: Record<string, string[]>;
  scrollPositions: Record<string, number>;
  viewEntries: Record<string, ViewEntryState>;
  setPaletteOpen: (open: boolean) => void;
  saveFocus: (historyKey: string, target: NavigationFocusTarget | null) => void;
  saveSearchSelection: (historyKey: string, ids: string[]) => void;
  saveScroll: (historyKey: string, position: number) => void;
  setViewEntry: (historyKey: string, entry: ViewEntryState) => void;
};

export const useNavigationStore = create<NavigationState>((set) => ({
  focusTargets: {},
  paletteOpen: false,
  searchSelections: {},
  scrollPositions: {},
  viewEntries: {},
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  saveFocus: (historyKey, target) =>
    set((state) => ({
      focusTargets: { ...state.focusTargets, [historyKey]: target },
    })),
  saveSearchSelection: (historyKey, ids) =>
    set((state) => ({
      searchSelections: { ...state.searchSelections, [historyKey]: ids },
    })),
  saveScroll: (historyKey, position) =>
    set((state) => ({
      scrollPositions: { ...state.scrollPositions, [historyKey]: position },
    })),
  setViewEntry: (historyKey, entry) =>
    set((state) => ({
      viewEntries: { ...state.viewEntries, [historyKey]: entry },
    })),
}));
