import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Link2,
  ArrowRight,
  Download,
  Loader2,
} from "lucide-react";
import { useI18n } from "../i18n";
import type { GameInstance } from "../types";

interface ImportLinkModalProps {
  open: boolean;
  initialUrl?: string | null;
  onClose: () => void;
  onSuccess: (instance: GameInstance, installed: number, skipped: number) => void;
  onNotify: (tone: "success" | "warning" | "info", title: string, message: string) => void;
}

interface PackPreview {
  id: string;
  name: string;
  version: string;
  loader: string;
  modCount: number;
  author?: string | null;
  mods: Array<{ name: string; enabled: boolean; versionId?: string | null }>;
}

export function ImportLinkModal({
  open,
  initialUrl,
  onClose,
  onSuccess,
  onNotify,
}: ImportLinkModalProps) {
  const { t, locale } = useI18n();
  const isRu = locale === "ru";

  const [inputVal, setInputVal] = useState(initialUrl || "");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PackPreview | null>(null);

  const handleFetchPreview = useCallback(async (urlOrId?: string) => {
    const target = (urlOrId || inputVal).trim();
    if (!target) return;
    if (
      target.startsWith("scope://party/") ||
      target.startsWith("onyx://party/") ||
      target.includes("/party/")
    ) {
      setError(t("party.guide.partyLinkNotice"));
      setPreview(null);
      return;
    }
    setLoadingPreview(true);
    setError(null);
    try {
      const data = await window.onyx.state.previewSyncProfile(target);
      setPreview(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }, [inputVal, t]);

  useEffect(() => {
    if (initialUrl) {
      setInputVal(initialUrl);
      void handleFetchPreview(initialUrl);
    } else {
      setPreview(null);
      setError(null);
      setInputVal("");
    }
  }, [initialUrl, open, handleFetchPreview]);

  async function handleInstall() {
    const target = inputVal.trim();
    if (!target) return;
    setInstalling(true);
    setError(null);
    try {
      const result = await window.onyx.state.importSyncProfileUrl(target);
      onSuccess(result.instance, result.installed, result.skipped);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      onNotify(
        "warning",
        isRu ? "Ошибка установки" : "Installation failed",
        msg,
      );
    } finally {
      setInstalling(false);
    }
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !installing) onClose();
        }}
      >
        <motion.div
          className="modal create-modal"
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 10 }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        >
          {!installing && (
            <button
              className="modal__close"
              onClick={onClose}
              aria-label={t("common.close")}
            >
              <X size={18} />
            </button>
          )}

          <div className="modal__eyebrow">
            <Link2 size={14} />
            <span>{isRu ? "ИМПОРТ СБОРКИ" : "IMPORT MODPACK"}</span>
          </div>

          <h2>{isRu ? "Скачать по ссылке" : "Download Shared Modpack"}</h2>
          <p className="modal__subtitle">
            {isRu
              ? "Вставь ссылку от друга или код сборки pk_... для автоматической загрузки."
              : "Paste a share link or pack code pk_... to download automatically."}
          </p>

          <label className="field" style={{ marginTop: 0, marginBottom: 16 }}>
            <span>{isRu ? "Ссылка или код сборки" : "Share URL or Pack Code"}</span>
            <div className="field__control" style={{ paddingRight: 4 }}>
              <Link2 size={16} />
              <input
                autoFocus
                placeholder="https://onyx-launcher-hub.vercel.app/pack/pk_... или pk_..."
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !preview && !loadingPreview) {
                    void handleFetchPreview();
                  }
                }}
                style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
              />
              <button
                type="button"
                className="button button--secondary"
                disabled={loadingPreview || !inputVal.trim()}
                onClick={() => void handleFetchPreview()}
                style={{ height: 31, padding: "0 12px", fontSize: 12 }}
              >
                {loadingPreview ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <>
                    <span>{isRu ? "Найти" : "Inspect"}</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>
          </label>

          {error && (
            <div className="auth-error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          {preview && (
            <div style={{ marginBottom: 16 }}>
              <div className="instance-preview instance-preview--lime" style={{ marginBottom: 12 }}>
                <div className="instance-preview__glow" />
                <span>{preview.name.trim().slice(0, 2).toUpperCase() || "NX"}</span>
                <div>
                  <strong>{preview.name}</strong>
                  <small>
                    Minecraft {preview.version} · {preview.loader} · {preview.modCount} {isRu ? (preview.modCount === 1 ? "мод" : preview.modCount < 5 ? "мода" : "модов") : "mods"}
                  </small>
                </div>
              </div>

              {preview.mods && preview.mods.length > 0 && (
                <div
                  style={{
                    maxHeight: 130,
                    overflowY: "auto",
                    background: "rgba(0, 0, 0, 0.25)",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-muted)",
                  }}
                >
                  {preview.mods.slice(0, 40).map((m, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "2px 0",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      • {m.name}
                    </div>
                  ))}
                  {preview.mods.length > 40 && (
                    <div style={{ padding: "4px 0 2px", color: "var(--text-muted)", fontStyle: "italic" }}>
                      + {preview.mods.length - 40} {isRu ? "еще модов..." : "more mods..."}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="modal__footer">
            <button
              type="button"
              className="button button--ghost"
              onClick={onClose}
              disabled={installing}
            >
              {t("common.close")}
            </button>

            {preview ? (
              <button
                type="button"
                className="button button--primary"
                disabled={installing}
                onClick={() => void handleInstall()}
              >
                {installing ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    <span>{isRu ? "Установка..." : "Installing..."}</span>
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    <span>{isRu ? "Установить сборку" : "Install Modpack"}</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                className="button button--primary"
                disabled={loadingPreview || !inputVal.trim()}
                onClick={() => void handleFetchPreview()}
              >
                {loadingPreview ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <>
                    <ArrowRight size={16} />
                    <span>{isRu ? "Проверить" : "Inspect"}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
