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

type NavigationState = {
  paletteOpen: boolean;
  scrollPositions: Record<string, number>;
  viewEntries: Record<string, ViewEntryState>;
  setPaletteOpen: (open: boolean) => void;
  saveScroll: (historyKey: string, position: number) => void;
  setViewEntry: (historyKey: string, entry: ViewEntryState) => void;
};

export const useNavigationStore = create<NavigationState>((set) => ({
  paletteOpen: false,
  scrollPositions: {},
  viewEntries: {},
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  saveScroll: (historyKey, position) =>
    set((state) => ({
      scrollPositions: { ...state.scrollPositions, [historyKey]: position },
    })),
  setViewEntry: (historyKey, entry) =>
    set((state) => ({
      viewEntries: { ...state.viewEntries, [historyKey]: entry },
    })),
}));
