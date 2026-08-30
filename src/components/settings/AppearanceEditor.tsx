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
      await saveThemeEdits(editing.id, draftName, draftTokens);
      theme.clearPreview();
      setEditing(null);
      await theme.refresh();
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
      await theme.refresh();
      if (wasSelected) {
        setNotice(
          "The selected Theme was deleted. Basis restored Paper or Nocturne for its appearance slot.",
        );
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

  return (
    <section
      className="settings-section appearance-settings"
      aria-labelledby="appearance-settings"
    >
      <div className="settings-section-heading">
        <div>
          <h2 id="appearance-settings">Appearance</h2>
          <p>
            Themes are portable data. They can change visual treatment without
            changing Basis navigation or information structure.
          </p>
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

      <label className="system-theme-toggle">
        <input
          type="checkbox"
          checked={theme.selection?.followSystemAppearance ?? false}
          disabled={!libraryReady || busy || !theme.selection}
          onChange={(event) =>
            void perform(() => theme.setFollowSystem(event.target.checked))
          }
        />
        <span>
          <strong>Follow system appearance</strong>
          <small>
            Use the saved light or dark Theme when the operating system changes.
          </small>
        </span>
      </label>

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
                  <span />
                  <span />
                  <span />
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
              <button
                type="button"
                onClick={() => {
                  theme.clearPreview();
                  setEditing(null);
                }}
              >
                <X aria-hidden="true" size={16} /> Close
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void deleteCurrent()}
              >
                <Trash2 aria-hidden="true" size={16} /> Delete
              </button>
              <button
                className="primary-action"
                type="button"
                disabled={busy || !draftName.trim()}
                onClick={() => void save()}
              >
                <Save aria-hidden="true" size={16} /> Save
              </button>
            </div>
          </div>

          <div className="theme-editor-toolbar">
            <div className="segmented-control" aria-label="Editor mode">
              <button
                type="button"
                data-active={mode === "basic" || undefined}
                onClick={() => setMode("basic")}
              >
                Basic
              </button>
              <button
                type="button"
                data-active={mode === "advanced" || undefined}
                onClick={() => setMode("advanced")}
              >
                Advanced
              </button>
            </div>
            {mode === "advanced" && (
              <label className="theme-token-search">
                <Search aria-hidden="true" size={16} />
                <span className="sr-only">Search theme tokens</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search tokens"
                />
              </label>
            )}
            <button type="button" onClick={() => setDraftTokens({})}>
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
    </section>
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
            <input
              id={id}
              type="range"
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
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
          />
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
    <div className="dialog-backdrop">
      <form
        className="small-dialog"
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
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !name.trim()}>
            Create Theme
          </button>
        </div>
      </form>
    </div>
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
    <div className="dialog-backdrop">
      <section
        className="small-dialog json-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
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
        <label className="import-replace-option">
          <input
            type="checkbox"
            checked={replace}
            onChange={(event) => onReplace(event.target.checked)}
          />
          Replace a custom Theme when its ID already exists
        </label>
        <div className="dialog-actions">
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
        </div>
      </section>
    </div>
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
    <div className="dialog-backdrop">
      <section
        className="small-dialog json-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Export ${exported.name}`}
      >
        <h2>Export {exported.name}</h2>
        <textarea readOnly spellCheck={false} value={exported.source} />
        <div className="dialog-actions">
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
        </div>
      </section>
    </div>
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

function contrastReport(tokens: Record<string, ThemeTokenValue>) {
  const canvas = textToken(tokens, "color.background.canvas", "");
  const text = textToken(tokens, "color.text.primary", "");
  const accent = textToken(tokens, "color.accent.primary", "");
  const onAccent = textToken(tokens, "color.accent.onAccent", "");
  const body = hexContrast(canvas, text);
  const control = hexContrast(accent, onAccent);
  if (body === null || control === null) {
    return {
      ok: true,
      message:
        "OKLCH contrast is checked again by the Theme Engine when saved.",
    };
  }
  const ok = body >= 4.5 && control >= 4.5;
  return {
    ok,
    message: `Text ${body.toFixed(2)}:1 · Accent control ${control.toFixed(2)}:1${ok ? "" : " — target 4.5:1"}`,
  };
}

function hexContrast(first: string, second: string) {
  const a = luminance(first);
  const b = luminance(second);
  if (a === null || b === null) return null;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function luminance(value: string) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return null;
  const channels = [1, 3, 5].map(
    (start) => Number.parseInt(value.slice(start, start + 2), 16) / 255,
  );
  const [red, green, blue] = channels.map((channel) =>
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
