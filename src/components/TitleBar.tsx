import { useEffect, useState } from "react";
import { Maximize2, Minus, Search, Square, X } from "lucide-react";
import { useI18n } from "../i18n";

interface TitleBarProps {
  onSearch: () => void;
}

export function TitleBar({ onSearch }: TitleBarProps) {
  const { t } = useI18n();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void window.onyx.window.isMaximized().then(setMaximized);
    return window.onyx.onWindowMaximized(setMaximized);
  }, []);

  return (
    <header className="titlebar">
      <div className="titlebar__brand">
        <span className="brand-mark brand-mark--small" aria-hidden="true">
          <i />
          <b />
        </span>
        <span>ONYX</span>
      </div>

      <button className="titlebar__search no-drag" onClick={onSearch}>
        <Search size={14} strokeWidth={2.3} />
        <span>{t("titlebar.search")}</span>
        <kbd>Ctrl K</kbd>
      </button>

      <div className="window-actions no-drag">
        <button
          aria-label={t("titlebar.minimize")}
          onClick={() => void window.onyx.window.minimize()}
        >
          <Minus size={17} />
        </button>
        <button
          aria-label={
            maximized ? t("titlebar.restore") : t("titlebar.maximize")
          }
          onClick={() => void window.onyx.window.maximize()}
        >
          {maximized ? <Square size={13} /> : <Maximize2 size={14} />}
        </button>
        <button
          className="window-actions__close"
          aria-label={t("common.close")}
          onClick={() => void window.onyx.window.close()}
        >
          <X size={17} />
        </button>
      </div>
    </header>
  );
}
