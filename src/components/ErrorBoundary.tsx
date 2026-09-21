import { Component, useContext, type ErrorInfo, type ReactNode } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { I18nContext } from "../i18n";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep a useful breadcrumb in DevTools without exposing account data.
    console.error("Onyx renderer crashed", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <FatalScreen error={this.state.error} />;
  }
}

const FATAL_FALLBACKS: Record<string, string> = {
  "fatal.eyebrow": "Critical failure",
  "fatal.title": "Onyx encountered an unexpected crash",
  "fatal.message":
    "A renderer error interrupted the launcher. You can reload the window to resume.",
  "fatal.restart": "Reload Onyx",
};

function FatalScreen({ error }: { error: Error }) {
  const i18n = useContext(I18nContext);
  const t = i18n?.t || ((key: string) => FATAL_FALLBACKS[key] || key);

  return (
    <main className="fatal-screen">
      <div className="fatal-screen__icon">
        <CircleAlert size={30} />
      </div>
      <p className="eyebrow">{t("fatal.eyebrow")}</p>
      <h1>{t("fatal.title")}</h1>
      <p>{t("fatal.message")}</p>
      <pre>{error.message}</pre>
      <button
        className="button button--primary"
        onClick={() => window.location.reload()}
      >
        <RefreshCw size={16} /> {t("fatal.restart")}
      </button>
    </main>
  );
}