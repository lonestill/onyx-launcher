import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Cpu,
  HardDrive,
  LoaderCircle,
  MemoryStick,
  Package,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { useI18n, type TranslationKey } from "../i18n";
import type { CrashAutoFix, GameInstance } from "../types";

interface AutoFixConfirmModalProps {
  instance: GameInstance | null;
  fixAction: CrashAutoFix | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (instance: GameInstance, fix: CrashAutoFix) => Promise<void>;
}

export function AutoFixConfirmModal({
  instance,
  fixAction,
  busy,
  onClose,
  onConfirm,
}: AutoFixConfirmModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!fixAction) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fixAction, busy, onClose]);

  if (!fixAction || !instance) return null;

  const renderIcon = () => {
    switch (fixAction.type) {
      case "increase-memory":
        return <MemoryStick size={20} className="text-accent" />;
      case "switch-java":
        return <Cpu size={20} className="text-accent" />;
      case "install-indium":
      case "disable-culprit-mod":
        return <Package size={20} className="text-accent" />;
      case "clean-corrupted-file":
        return <HardDrive size={20} className="text-accent" />;
      case "reset-jvm-args":
      default:
        return <Wrench size={20} className="text-accent" />;
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onClose();
        }}
      >
        <motion.div
          className="modal autofix-confirm-modal"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 8 }}
          style={{ maxWidth: 480 }}
        >
          <button
            className="modal__close"
            onClick={onClose}
            disabled={busy}
            aria-label={t("common.close")}
          >
            <X size={18} />
          </button>

          <div className="modal__eyebrow" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Zap size={14} fill="currentColor" /> {t("crash.autofix.badge")}
          </div>

          <h2>{t("crash.autofix.confirm.title")}</h2>
          <p className="modal__subtitle">
            {t("crash.autofix.confirm.desc")}
          </p>

          <div
            className="autofix-preview-card"
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              padding: "14px 16px",
              borderRadius: "var(--radius-md, 8px)",
              background: "var(--color-bg-subtle, rgba(255, 255, 255, 0.04))",
              border: "1px solid var(--color-border, rgba(255, 255, 255, 0.1))",
              margin: "16px 0",
            }}
          >
            <div style={{ marginTop: 2 }}>{renderIcon()}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.85rem", opacity: 0.7, marginBottom: 2 }}>
                {t("crash.autofix.confirm.actionLabel")}
              </div>
              <strong style={{ display: "block", fontSize: "1rem", marginBottom: 4 }}>
                {t(fixAction.titleKey as TranslationKey)}
              </strong>
              <div style={{ fontSize: "0.9rem", color: "var(--color-text-secondary, #a1a1aa)" }}>
                {t(fixAction.descKey as TranslationKey, fixAction.payload)}
              </div>
            </div>
          </div>

          <div className="modal__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button
              className="button button--secondary"
              onClick={onClose}
              disabled={busy}
            >
              {t("crash.autofix.confirm.cancel")}
            </button>
            <button
              className="button button--primary button--glow"
              disabled={busy}
              onClick={() => onConfirm(instance, fixAction)}
            >
              {busy ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <Zap size={15} fill="currentColor" />
              )}
              {t("crash.autofix.confirm.apply")}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
