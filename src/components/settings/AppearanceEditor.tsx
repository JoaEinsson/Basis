import {
  Check,
  Copy,
  Download,
  FileUp,
  Palette,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  deleteTheme as removeTheme,
  duplicateTheme,
  exportTheme,
  getEditableTheme,
  getThemeTokenRegistry,
  importTheme,
  resolveTheme,
  saveThemeEdits,
} from "../../lib/tauri";
import type {
  EditableTheme,
  ResolvedTheme,
  ThemeSummary,
  ThemeTokenDescriptor,
  ThemeTokenValue,
} from "../../lib/types";
import { useTheme } from "../../theme/ThemeProvider";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  RangeInput,
  SegmentedControl,
  Toggle,
} from "../ui";

const BASIC_TOKENS = new Set([
  "color.background.canvas",
  "color.background.surface",
  "color.text.primary",
  "color.accent.primary",
  "shape.radius.surface",
  "density.scale",
  "type.scale",
  "effects.surfaceOpacity",
  "effects.backdropBlur",
  "shape.radius.artwork",
  "effects.artworkSaturation",
  "motion.duration.normal",
  "color.lyrics.active",
  "color.lyrics.past",
  "color.lyrics.upcoming",
  "color.lyrics.translation",
  "component.lyrics.activeScale",
  "component.lyrics.inactiveOpacity",
]);

export function AppearanceEditor({ libraryReady }: { libraryReady: boolean }) {
  const theme = useTheme();
  const { preview, clearPreview } = theme;
  const [previews, setPreviews] = useState<Record<string, ResolvedTheme>>({});
  const [registry, setRegistry] = useState<ThemeTokenDescriptor[]>([]);
  const [editing, setEditing] = useState<EditableTheme | null>(null);
  const [baseTokens, setBaseTokens] = useState<Record<string, ThemeTokenValue>>(
    {},
  );
  const [draftTokens, setDraftTokens] = useState<
    Record<string, ThemeTokenValue>
  >({});
  const [draftName, setDraftName] = useState("");
  const [mode, setMode] = useState<"basic" | "advanced">("basic");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [duplicateSource, setDuplicateSource] = useState<ThemeSummary | null>(
    null,
  );
  const [importOpen, setImportOpen] = useState(false);
  const [importSource, setImportSource] = useState("");
  const [importReplace, setImportReplace] = useState(false);
  const [exported, setExported] = useState<{
    name: string;
    source: string;
  } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    if (!libraryReady) return;
    void getThemeTokenRegistry()
      .then(setRegistry)
      .catch(() => setRegistry([]));
  }, [libraryReady]);

  useEffect(() => {
    if (!theme.catalog) return;
    let active = true;
    void Promise.allSettled(
      theme.catalog.themes.map(
        async (item) => [item.id, await resolveTheme(item.id)] as const,
      ),
    ).then((results) => {
      if (!active) return;
      setPreviews(
        Object.fromEntries(
          results.flatMap((result) =>
            result.status === "fulfilled" ? [result.value] : [],
          ),
        ),
      );
    });
    return () => {
      active = false;
    };
  }, [theme.catalog]);

  useEffect(() => {
    if (!editing) return;
    preview({ ...baseTokens, ...draftTokens });
  }, [baseTokens, draftTokens, editing, preview]);

  useEffect(() => () => clearPreview(), [clearPreview]);

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  async function beginEdit(item: ThemeSummary) {
    await perform(async () => {
      if (item.builtIn) {
        setDuplicateSource(item);
        return;
      }
      await theme.select(item.appearance, item.id);
      const editable = await getEditableTheme(item.id);
      const base = await resolveTheme(
        editable.basedOn ??
          (editable.appearance === "light"
            ? "builtin:paper"
            : "builtin:nocturne"),
      );
      setEditing(editable);
      setBaseTokens(base.tokens);
      setDraftTokens(editable.tokens);
      setDraftName(editable.name);
      setQuery("");
    });
  }

  async function createDuplicate(name: string) {
    if (!duplicateSource) return;
    await perform(async () => {
      const created = await duplicateTheme(duplicateSource.id, name);
      setDuplicateSource(null);
      await theme.refresh();
      await beginEdit(created);
    });
  }

  async function save() {
    if (!editing) return;
    await perform(async () => {
      const savedName = draftName.trim();
      await saveThemeEdits(editing.id, savedName, draftTokens);
      theme.clearPreview();
      setEditing(null);
      await theme.refresh();
      setNotice(`${savedName} saved.`);
    });
  }

  async function deleteCurrent() {
    if (!editing) return;
    await perform(async () => {
      const wasSelected =
        theme.selection?.lightSelection === editing.id ||
        theme.selection?.darkSelection === editing.id;
      await removeTheme(editing.id);
      theme.clearPreview();
      setEditing(null);
      setConfirmingDelete(false);
      await theme.refresh();
      if (wasSelected) {
        setNotice("Theme deleted. The built-in Theme is active again.");
      } else {
        setNotice("Theme deleted.");
      }
    });
  }

  async function importJson() {
    await perform(async () => {
      const imported = await importTheme(importSource, importReplace);
      setImportOpen(false);
      setImportSource("");
      setImportReplace(false);
      await theme.refresh();
      await beginEdit(imported);
    });
  }

  async function prepareExport(item: ThemeSummary) {
    await perform(async () => {
      setExported({ name: item.name, source: await exportTheme(item.id) });
    });
  }

  const displayedTokens = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return registry.filter((descriptor) => {
      if (mode === "basic" && !BASIC_TOKENS.has(descriptor.id)) return false;
      return (
        !normalized ||
        descriptor.id.toLocaleLowerCase().includes(normalized) ||
        descriptor.label.toLocaleLowerCase().includes(normalized) ||
        descriptor.category.toLocaleLowerCase().includes(normalized)
      );
    });
  }, [mode, query, registry]);

  const sections = useMemo(() => {
    const grouped = new Map<string, ThemeTokenDescriptor[]>();
    for (const descriptor of displayedTokens) {
      const group = grouped.get(descriptor.category) ?? [];
      group.push(descriptor);
      grouped.set(descriptor.category, group);
    }
    return [...grouped.entries()];
  }, [displayedTokens]);

  const previewTokens = { ...baseTokens, ...draftTokens };
  const contrast = contrastReport(previewTokens);
  const dirty =
    editing !== null &&
    (draftName.trim() !== editing.name ||
      !sameTokenMap(draftTokens, editing.tokens));

  function closeEditor() {
    if (dirty) {
      setConfirmingDiscard(true);
      return;
    }
    theme.clearPreview();
    setEditing(null);
  }

  return (
    <section
      className="settings-section appearance-settings"
      id="settings-appearance"
      aria-labelledby="appearance-settings"
    >
      <div className="settings-section-heading">
        <div>
          <h2 id="appearance-settings">Appearance</h2>
          <p>Choose a built-in Theme or customize a portable copy.</p>
        </div>
        <button
          type="button"
          disabled={!libraryReady || busy}
          onClick={() => setImportOpen(true)}
        >
          <FileUp aria-hidden="true" size={16} /> Import Theme
        </button>
      </div>

      {!libraryReady && (
        <p className="inline-error">
          Add a music folder before managing portable themes.
        </p>
      )}
      {(error ?? theme.error) && (
        <p className="inline-error" role="alert">
          {error ?? theme.error}
        </p>
      )}
      {notice && (
        <p className="theme-notice" role="status">
          {notice}
        </p>
      )}
      {theme.catalog?.warnings.map((warning) => (
        <p className="theme-warning" key={warning}>
          {warning}
        </p>
      ))}

      <Toggle
        className="system-theme-toggle"
        checked={theme.selection?.followSystemAppearance ?? false}
        disabled={!libraryReady || busy || !theme.selection}
        onChange={(event) =>
          void perform(() => theme.setFollowSystem(event.target.checked))
        }
      >
        <span>
          <strong>Follow system appearance</strong>
          <small>
            Use the saved light or dark Theme when the operating system changes.
          </small>
        </span>
      </Toggle>

      <div className="theme-card-grid" aria-label="Available Themes">
        {theme.catalog?.themes.map((item) => {
          const selected =
            item.appearance === "light"
              ? theme.selection?.lightSelection === item.id
              : theme.selection?.darkSelection === item.id;
          const active = selected && theme.activeAppearance === item.appearance;
          const colors = previews[item.id]?.tokens;
          return (
            <article
              className="theme-card"
              data-active={active || undefined}
              key={item.id}
            >
              <button
                className="theme-preview"
                type="button"
                disabled={busy}
                aria-label={`Use ${item.name} for ${item.appearance} appearance`}
                onClick={() =>
                  void perform(() => theme.select(item.appearance, item.id))
                }
                style={previewStyle(colors)}
              >
                <span className="theme-preview-surface">
                  <span className="theme-preview-accent" />
                  <span className="theme-preview-lyric" data-state="past" />
                  <span className="theme-preview-lyric" data-state="active" />
                  <span className="theme-preview-lyric" data-state="upcoming" />
                </span>
              </button>
              <div className="theme-card-label">
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.builtIn ? "Built-in" : "Custom"} · {item.appearance}
                  </small>
                </span>
                {selected && <Check aria-label="Selected" size={17} />}
              </div>
              <div className="theme-card-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void beginEdit(item)}
                >
                  <Palette aria-hidden="true" size={15} />{" "}
                  {item.builtIn ? "Duplicate" : "Edit"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void prepareExport(item)}
                >
                  <Download aria-hidden="true" size={15} /> Export
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {editing && (
        <div className="theme-editor" aria-label={`Edit ${editing.name}`}>
          <div className="theme-editor-heading">
            <label>
              <span>Theme name</span>
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
              />
            </label>
            <div className="theme-editor-actions">
              <span className="theme-editor-state" role="status">
                {dirty ? "Unsaved changes" : "Saved"}
              </span>
              <button type="button" onClick={closeEditor}>
                <X aria-hidden="true" size={16} /> Close
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 aria-hidden="true" size={16} /> Delete
              </button>
              <button
                className="primary-action"
                type="button"
                disabled={busy || !draftName.trim() || !dirty}
                onClick={() => void save()}
              >
                <Save aria-hidden="true" size={16} /> Save
              </button>
            </div>
          </div>

          <div className="theme-editor-toolbar">
            <SegmentedControl
              ariaLabel="Editor mode"
              className="segmented-control"
              value={mode}
              onChange={setMode}
              options={[
                { label: "Basic", value: "basic" },
                { label: "Advanced", value: "advanced" },
              ]}
            />
            <label className="theme-token-search">
              <Search aria-hidden="true" size={16} />
              <span className="sr-only">Search theme tokens</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tokens"
              />
            </label>
            <button
              type="button"
              disabled={Object.keys(draftTokens).length === 0}
              onClick={() => setConfirmingReset(true)}
            >
              <RotateCcw aria-hidden="true" size={16} /> Reset all to base
            </button>
          </div>

          <div
            className="contrast-status"
            data-warning={!contrast.ok || undefined}
          >
            <strong>{contrast.ok ? "Contrast AA" : "Contrast warning"}</strong>
            <span>{contrast.message}</span>
          </div>

          <div className="theme-token-sections">
            {sections.length === 0 && (
              <p className="theme-token-empty" role="status">
                No matching theme tokens.
              </p>
            )}
            {sections.map(([category, descriptors]) => (
              <section className="theme-token-section" key={category}>
                <div className="theme-token-section-heading">
                  <h3>{category}</h3>
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...draftTokens };
                      for (const descriptor of descriptors)
                        delete next[descriptor.id];
                      setDraftTokens(next);
                    }}
                  >
                    Reset section
                  </button>
                </div>
                <div className="theme-token-list">
                  {descriptors.map((descriptor) => (
                    <ThemeTokenControl
                      key={descriptor.id}
                      descriptor={descriptor}
                      value={
                        draftTokens[descriptor.id] ??
                        baseTokens[descriptor.id] ??
                        descriptor.defaultValue
                      }
                      overridden={Object.hasOwn(draftTokens, descriptor.id)}
                      onChange={(value) =>
                        setDraftTokens((current) => ({
                          ...current,
                          [descriptor.id]: value,
                        }))
                      }
                      onReset={() =>
                        setDraftTokens((current) => {
                          const next = { ...current };
                          delete next[descriptor.id];
                          return next;
                        })
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {duplicateSource && (
        <NameDialog
          title={`Duplicate ${duplicateSource.name}`}
          initialName={`${duplicateSource.name} Copy`}
          busy={busy}
          onCancel={() => setDuplicateSource(null)}
          onSave={(name) => void createDuplicate(name)}
        />
      )}
      {importOpen && (
        <JsonDialog
          title="Import Theme JSON"
          value={importSource}
          busy={busy}
          primaryLabel="Import"
          onChange={setImportSource}
          replace={importReplace}
          onReplace={setImportReplace}
          onCancel={() => {
            setImportOpen(false);
            setImportReplace(false);
          }}
          onPrimary={() => void importJson()}
        />
      )}
      {exported && (
        <ExportDialog exported={exported} onClose={() => setExported(null)} />
      )}
      {confirmingDelete && editing && (
        <Dialog
          className="small-dialog"
          ariaLabelledBy="delete-theme-title"
          dismissible={!busy}
          onClose={() => setConfirmingDelete(false)}
        >
          <h2 id="delete-theme-title">Delete “{editing.name}”?</h2>
          <p>This removes the custom Theme file. Your music is not changed.</p>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <DialogActions>
            <button type="button" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void deleteCurrent()}
            >
              Delete Theme
            </Button>
          </DialogActions>
        </Dialog>
      )}
      {confirmingDiscard && (
        <Dialog
          className="small-dialog"
          ariaLabelledBy="discard-theme-title"
          onClose={() => setConfirmingDiscard(false)}
        >
          <h2 id="discard-theme-title">Discard unsaved changes?</h2>
          <p>Your saved Theme will not be changed.</p>
          <DialogActions>
            <button type="button" onClick={() => setConfirmingDiscard(false)}>
              Keep editing
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingDiscard(false);
                theme.clearPreview();
                setEditing(null);
              }}
            >
              Discard changes
            </button>
          </DialogActions>
        </Dialog>
      )}
      {confirmingReset && (
        <Dialog
          className="small-dialog"
          ariaLabelledBy="reset-theme-title"
          onClose={() => setConfirmingReset(false)}
        >
          <h2 id="reset-theme-title">Reset all tokens?</h2>
          <p>All overrides in this draft will return to the base Theme.</p>
          <DialogActions>
            <button type="button" onClick={() => setConfirmingReset(false)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftTokens({});
                setConfirmingReset(false);
              }}
            >
              Reset all
            </button>
          </DialogActions>
        </Dialog>
      )}
    </section>
  );
}

function sameTokenMap(
  first: Record<string, ThemeTokenValue>,
  second: Record<string, ThemeTokenValue>,
) {
  const firstKeys = Object.keys(first);
  const secondKeys = Object.keys(second);
  return (
    firstKeys.length === secondKeys.length &&
    firstKeys.every((key) => first[key] === second[key])
  );
}

function ThemeTokenControl({
  descriptor,
  value,
  overridden,
  onChange,
  onReset,
}: {
  descriptor: ThemeTokenDescriptor;
  value: ThemeTokenValue;
  overridden: boolean;
  onChange: (value: ThemeTokenValue) => void;
  onReset: () => void;
}) {
  const id = `theme-token-${descriptor.id.replaceAll(".", "-")}`;
  return (
    <div className="theme-token-row" data-overridden={overridden || undefined}>
      <label htmlFor={id}>
        <strong>{descriptor.label}</strong>
        <code>{descriptor.id}</code>
      </label>
      <div className="theme-token-input">
        {descriptor.kind === "color" &&
          typeof value === "string" &&
          isHexColor(value) && (
            <input
              aria-label={`${descriptor.label} color picker`}
              type="color"
              value={value.slice(0, 7)}
              onChange={(event) => onChange(event.target.value)}
            />
          )}
        {descriptor.kind === "number" && typeof value === "number" ? (
          <>
            <RangeInput
              id={id}
              min={descriptor.minimum ?? undefined}
              max={descriptor.maximum ?? undefined}
              step={numberStep(descriptor)}
              value={value}
              onChange={(event) => onChange(event.target.valueAsNumber)}
            />
            <input
              aria-label={`${descriptor.label} value`}
              className="theme-number-input"
              type="number"
              min={descriptor.minimum ?? undefined}
              max={descriptor.maximum ?? undefined}
              step={numberStep(descriptor)}
              value={value}
              onChange={(event) => {
                if (Number.isFinite(event.target.valueAsNumber))
                  onChange(event.target.valueAsNumber);
              }}
            />
          </>
        ) : descriptor.kind === "boolean" ? (
          <Checkbox
            id={id}
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
          >
            Enabled
          </Checkbox>
        ) : (
          <input
            id={id}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
        <button
          type="button"
          disabled={!overridden}
          aria-label={`Reset ${descriptor.label}`}
          onClick={onReset}
        >
          <RotateCcw aria-hidden="true" size={14} />
        </button>
      </div>
    </div>
  );
}

function NameDialog({
  title,
  initialName,
  busy,
  onCancel,
  onSave,
}: {
  title: string;
  initialName: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  return (
    <Dialog
      className="small-dialog"
      ariaLabel={title}
      dismissible={!busy}
      onClose={onCancel}
    >
      <form
        className="ui-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) onSave(name.trim());
        }}
      >
        <h2>{title}</h2>
        <label>
          Name
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <DialogActions>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !name.trim()}>
            Create Theme
          </button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function JsonDialog({
  title,
  value,
  busy,
  primaryLabel,
  onChange,
  replace,
  onReplace,
  onCancel,
  onPrimary,
}: {
  title: string;
  value: string;
  busy: boolean;
  primaryLabel: string;
  onChange: (value: string) => void;
  replace: boolean;
  onReplace: (replace: boolean) => void;
  onCancel: () => void;
  onPrimary: () => void;
}) {
  return (
    <Dialog
      className="small-dialog json-dialog"
      ariaLabel={title}
      dismissible={!busy}
      onClose={onCancel}
    >
      <h2>{title}</h2>
      <label className="file-input-action">
        <FileUp aria-hidden="true" size={16} /> Choose JSON file
        <input
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void file.text().then(onChange);
          }}
        />
      </label>
      <textarea
        autoFocus
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <Checkbox
        className="import-replace-option"
        checked={replace}
        onChange={(event) => onReplace(event.target.checked)}
      >
        Replace a custom Theme with the same ID
      </Checkbox>
      <DialogActions>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !value.trim()}
          onClick={onPrimary}
        >
          {primaryLabel}
        </button>
      </DialogActions>
    </Dialog>
  );
}

function ExportDialog({
  exported,
  onClose,
}: {
  exported: { name: string; source: string };
  onClose: () => void;
}) {
  function download() {
    const url = URL.createObjectURL(
      new Blob([exported.source], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFilename(exported.name)}.basis-theme.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Dialog
      className="small-dialog json-dialog"
      ariaLabel={`Export ${exported.name}`}
      onClose={onClose}
    >
      <h2>Export {exported.name}</h2>
      <textarea readOnly spellCheck={false} value={exported.source} />
      <DialogActions>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(exported.source)}
        >
          <Copy aria-hidden="true" size={15} /> Copy
        </button>
        <button type="button" onClick={download}>
          <Download aria-hidden="true" size={15} /> Download JSON
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </DialogActions>
    </Dialog>
  );
}

function previewStyle(tokens?: Record<string, ThemeTokenValue>) {
  return {
    "--theme-preview-canvas": colorToken(
      tokens,
      "color.background.canvas",
      "transparent",
    ),
    "--theme-preview-surface": colorToken(
      tokens,
      "color.background.surface",
      "transparent",
    ),
    "--theme-preview-accent": colorToken(
      tokens,
      "color.accent.primary",
      "currentColor",
    ),
    "--theme-preview-text": colorToken(
      tokens,
      "color.text.primary",
      "currentColor",
    ),
    "--theme-preview-lyrics-active": colorToken(
      tokens,
      "color.lyrics.active",
      "currentColor",
    ),
    "--theme-preview-lyrics-past": colorToken(
      tokens,
      "color.lyrics.past",
      "currentColor",
    ),
    "--theme-preview-lyrics-upcoming": colorToken(
      tokens,
      "color.lyrics.upcoming",
      "currentColor",
    ),
    "--theme-preview-lyrics-opacity": numberToken(
      tokens,
      "component.lyrics.inactiveOpacity",
      1,
    ),
    "--theme-preview-lyrics-scale": numberToken(
      tokens,
      "component.lyrics.activeScale",
      1,
    ),
    "--theme-preview-radius": `${numberToken(tokens, "shape.radius.surface", 0)}px`,
    "--theme-preview-elevation": textToken(tokens, "elevation.surface", "none"),
  } as React.CSSProperties;
}

function colorToken(
  tokens: Record<string, ThemeTokenValue> | undefined,
  id: string,
  fallback: string,
) {
  return textToken(tokens, id, fallback);
}

function textToken(
  tokens: Record<string, ThemeTokenValue> | undefined,
  id: string,
  fallback: string,
) {
  const value = tokens?.[id];
  return typeof value === "string" ? value : fallback;
}

function numberToken(
  tokens: Record<string, ThemeTokenValue> | undefined,
  id: string,
  fallback: number,
) {
  const value = tokens?.[id];
  return typeof value === "number" ? value : fallback;
}

export function contrastReport(tokens: Record<string, ThemeTokenValue>) {
  const canvas = textToken(tokens, "color.background.canvas", "");
  const text = textToken(tokens, "color.text.primary", "");
  const accent = textToken(tokens, "color.accent.primary", "");
  const onAccent = textToken(tokens, "color.accent.onAccent", "");
  const body = hexContrast(canvas, text);
  const control = hexContrast(accent, onAccent);
  const inactiveOpacity = numberToken(
    tokens,
    "component.lyrics.inactiveOpacity",
    0.62,
  );
  const lyricActive = hexContrast(
    canvas,
    textToken(tokens, "color.lyrics.active", ""),
  );
  const lyricPast = effectiveHexContrast(
    textToken(tokens, "color.lyrics.past", ""),
    canvas,
    inactiveOpacity,
  );
  const lyricUpcoming = effectiveHexContrast(
    textToken(tokens, "color.lyrics.upcoming", ""),
    canvas,
    inactiveOpacity,
  );
  const lyricTranslation = hexContrast(
    canvas,
    textToken(tokens, "color.lyrics.translation", ""),
  );
  const values = [
    body,
    control,
    lyricActive,
    lyricPast,
    lyricUpcoming,
    lyricTranslation,
  ];
  if (values.some((value) => value === null)) {
    return {
      ok: true,
      message:
        "OKLCH contrast is checked again by the Theme Engine when saved.",
    };
  }
  const [safeBody, safeControl, active, past, upcoming, translation] =
    values as number[];
  const ok = values.every((value) => value !== null && value >= 4.5);
  return {
    ok,
    message: `Text ${safeBody.toFixed(2)}:1 · Accent ${safeControl.toFixed(2)}:1 · Lyrics active ${active.toFixed(2)}:1, past ${past.toFixed(2)}:1, upcoming ${upcoming.toFixed(2)}:1, translation ${translation.toFixed(2)}:1${ok ? "" : " — target 4.5:1"}`,
  };
}

function effectiveHexContrast(
  foreground: string,
  background: string,
  opacity: number,
) {
  const front = hexChannels(foreground);
  const back = hexChannels(background);
  if (!front || !back) return null;
  const alpha = Math.max(0, Math.min(1, opacity));
  const mixed = front.map((channel, index) =>
    Math.round(channel * alpha + back[index] * (1 - alpha)),
  );
  return contrastFromChannels(mixed, back);
}

function hexContrast(first: string, second: string) {
  const a = luminance(first);
  const b = luminance(second);
  if (a === null || b === null) return null;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function luminance(value: string) {
  const channels = hexChannels(value);
  if (!channels) return null;
  return luminanceFromChannels(channels);
}

function hexChannels(value: string) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return null;
  return [1, 3, 5].map((start) =>
    Number.parseInt(value.slice(start, start + 2), 16),
  );
}

function contrastFromChannels(first: number[], second: number[]) {
  const a = luminanceFromChannels(first);
  const b = luminanceFromChannels(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function luminanceFromChannels(channels: number[]) {
  const normalized = channels.map((channel) => channel / 255);
  const [red, green, blue] = normalized.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function isHexColor(value: string) {
  return /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value);
}

function numberStep(descriptor: ThemeTokenDescriptor) {
  const span = (descriptor.maximum ?? 1) - (descriptor.minimum ?? 0);
  return span <= 2 ? 0.01 : span <= 20 ? 0.1 : 1;
}

function safeFilename(name: string) {
  return (
    name
      .trim()
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-|-$/g, "") || "basis-theme"
  );
}

function messageFor(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "The Theme operation could not be completed.";
}
