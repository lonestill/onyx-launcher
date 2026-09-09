import { motion } from "framer-motion";
import { useState } from "react";
import {
  ArrowRight,
  Boxes,
  Clock3,
  ExternalLink,
  Folder,
  FolderOpen,
  Layers3,
  LoaderCircle,
  Play,
  Plus,
  Radio,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Wrench,
} from "lucide-react";
import { useI18n } from "../i18n";
import type { GameInstance, MinecraftServerStatus, PlaySession, RouteId } from "../types";
import { formatPlaytime } from "../utils";

interface HomePageProps {
  instances: GameInstance[];
  sessions: PlaySession[];
  profileName: string;
  onNavigate: (route: RouteId) => void;
  onPlay: (instance: GameInstance) => void;
  onOpen: (instance: GameInstance) => void;
  onCreate: () => void;
  onConfigure: (instance: GameInstance) => void;
}

export function HomePage({
  instances,
  sessions,
  profileName,
  onNavigate,
  onPlay,
  onOpen,
  onCreate,
  onConfigure,
}: HomePageProps) {
  const { locale, t } = useI18n();
  const hour = new Date().getHours();
  const greeting =
    hour < 6
      ? t("home.greeting.night")
      : hour < 12
        ? t("home.greeting.morning")
        : hour < 18
          ? t("home.greeting.day")
          : t("home.greeting.evening");

  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [quickServer, setQuickServer] = useState("");
  const [pingResult, setPingResult] = useState<MinecraftServerStatus | null>(null);
  const [pinging, setPinging] = useState(false);

  const activeInstance =
    instances.find((instance) => instance.id === selectedInstanceId) ??
    instances.find((instance) => instance.favorite) ??
    instances[0];

  const displayName = (instance: GameInstance) =>
    instance.id === "vanilla-start" && instance.name === "Pure Game"
      ? t("home.defaultName")
      : instance.name;

  const displayDescription = (instance: GameInstance) =>
    instance.id === "vanilla-start" && instance.description === "Minecraft without modifications"
      ? t("home.defaultDescription")
      : instance.description;

  const latestSession = sessions[0];
  const failedInstance =
    latestSession?.exitCode !== undefined &&
    latestSession?.exitCode !== null &&
    latestSession.exitCode !== 0
      ? instances.find((instance) => instance.id === latestSession.instanceId)
      : undefined;

  const isRunning = activeInstance?.status === "running";
  const isSetup = activeInstance?.status === "setup" || activeInstance?.status === "pack-ready";
  const isError = activeInstance?.status === "error";

  const handlePingServer = async () => {
    if (!quickServer.trim() || pinging) return;
    setPinging(true);
    try {
      const res = await window.onyx.system.serverStatus(quickServer.trim());
      setPingResult(res);
    } catch {
      setPingResult({ online: false, address: quickServer.trim() });
    } finally {
      setPinging(false);
    }
  };

  const handleJoinServer = async () => {
    if (!quickServer.trim() || !activeInstance) return;
    try {
      await window.onyx.state.updateInstance(activeInstance.id, {
        settings: {
          ...activeInstance.settings,
          serverAddress: quickServer.trim(),
        },
      });
      const updated: GameInstance = {
        ...activeInstance,
        settings: {
          ...activeInstance.settings,
          serverAddress: quickServer.trim(),
        },
      };
      onPlay(updated);
    } catch {
      onPlay(activeInstance);
    }
  };

  return (
    <motion.div
      className="page home-page"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
    >
      <div className="page-heading page-heading--home">
        <div>
          <p className="eyebrow">COMMAND CENTER</p>
          <h1>
            {greeting}, <span>{profileName === "Player" ? t("profile.player") : profileName}</span>
          </h1>
        </div>
        <div className="page-heading__actions">
          <button className="button button--secondary" onClick={() => onNavigate("library")}>
            {t("home.library")}
            <ArrowRight size={14} />
          </button>
          <button className="button button--primary" onClick={onCreate}>
            <Plus size={15} />
            {t("home.newInstance")}
          </button>
        </div>
      </div>

      {activeInstance && (
        <section className="hero-station">
          <div className="hero-station__main">
            <div className="hero-station__tag">
              <span
                className={`status-pill ${
                  isRunning
                    ? "status-pill--running"
                    : isError
                      ? "status-pill--error"
                      : "status-pill--ready"
                }`}
              >
                {isRunning
                  ? t("home.status.running")
                  : isError
                    ? t("home.status.error")
                    : isSetup
                      ? t("home.status.setup")
                      : t("home.status.continue")}
              </span>
              <i>·</i>
              <span>
                {activeInstance.lastPlayed === "Never played"
                  ? t("home.neverPlayed")
                  : activeInstance.lastPlayed}
              </span>
            </div>

            <h2>{displayName(activeInstance)}</h2>
            {displayDescription(activeInstance) && (
              <p className="hero-station__desc">{displayDescription(activeInstance)}</p>
            )}

            <div className="hero-station__meta">
              <span>
                <Layers3 size={13} />
                Minecraft {activeInstance.version}
              </span>
              <span>
                <Boxes size={13} />
                {activeInstance.loader}
              </span>
              <span>
                <Clock3 size={13} />
                {formatPlaytime(activeInstance.playtimeMinutes, locale)}
              </span>
              {activeInstance.modCount > 0 && (
                <span>
                  {t("home.modsActive", { count: activeInstance.modCount })}
                </span>
              )}
            </div>

            <div className="hero-station__actions">
              <button
                className={`button button--play ${
                  isRunning ? "button--danger-quiet" : "button--primary"
                }`}
                onClick={() => onPlay(activeInstance)}
              >
                {isRunning ? (
                  <>
                    <Square size={15} fill="currentColor" />
                    {t("home.action.stop")}
                  </>
                ) : isSetup ? (
                  <>
                    <Sparkles size={15} />
                    {t("home.action.install")}
                  </>
                ) : isError ? (
                  <>
                    <Wrench size={15} />
                    {t("home.action.retry")}
                  </>
                ) : (
                  <>
                    <Play size={15} fill="currentColor" />
                    {t("home.action.play")}
                  </>
                )}
              </button>

              <button
                className="button button--secondary"
                onClick={() => onOpen(activeInstance)}
              >
                <FolderOpen size={14} />
                <span>{t("common.open")}</span>
              </button>

              <button
                className="button button--secondary button--icon-only"
                onClick={() => onConfigure(activeInstance)}
                title={t("home.action.configure")}
              >
                <Settings size={14} />
              </button>

              <button
                className="button button--secondary button--icon-only"
                onClick={() => void window.onyx.state.openInstanceFolder(activeInstance.id)}
                title="Open instance folder in Finder"
              >
                <Folder size={14} />
              </button>
            </div>
          </div>

          <div className="hero-station__telemetry">
            <div className="hero-station__card">
              <div className="hero-station__card-head">
                <div className="hero-station__glyph">
                  {activeInstance.iconUrl ? (
                    <img src={activeInstance.iconUrl} alt="" />
                  ) : (
                    <span>{activeInstance.glyph || "MC"}</span>
                  )}
                </div>
                <div>
                  <strong>{displayName(activeInstance)}</strong>
                  <small>Minecraft {activeInstance.version} · {activeInstance.loader.split(" ")[0]}</small>
                </div>
              </div>

              <div className="hero-station__specs">
                <div className="hero-station__spec">
                  <small>MEMORY</small>
                  <strong>
                    {activeInstance.settings?.memory
                      ? `${activeInstance.settings.memory} MB`
                      : "Auto (4 GB)"}
                  </strong>
                </div>
                <div className="hero-station__spec">
                  <small>JAVA RUNTIME</small>
                  <strong>
                    {activeInstance.javaMajor
                      ? `Java ${activeInstance.javaMajor}`
                      : "Java 21 (Auto)"}
                  </strong>
                </div>
                <div className="hero-station__spec">
                  <small>ONYX GUARD</small>
                  <strong className={isError ? "text-danger" : "text-emerald"}>
                    {isError ? "Issue detected" : "All checks pass"}
                  </strong>
                </div>
                <div className="hero-station__spec">
                  <small>WORLD SNAPSHOTS</small>
                  <strong className="text-emerald">Armed</strong>
                </div>
              </div>

              {activeInstance.settings?.serverAddress && (
                <div className="hero-station__server">
                  <Server size={12} />
                  <span>{activeInstance.settings.serverAddress}</span>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <h2>{t("home.recent")}</h2>
            <p>{t("home.recentHint")}</p>
          </div>
          <button
            className="text-button"
            onClick={() => onNavigate("library")}
          >
            {t("home.library")} <ArrowRight size={13} />
          </button>
        </div>

        <div className="recent-grid">
          {instances.slice(0, 7).map((instance, index) => {
            const isCurrent = instance.id === activeInstance?.id;
            return (
              <motion.article
                className={`recent-card recent-card--instance recent-card--${instance.color} ${
                  isCurrent ? "is-selected" : ""
                }`}
                key={instance.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedInstanceId(instance.id)}
                onDoubleClick={() => onOpen(instance)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedInstanceId(instance.id);
                  }
                }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.02 * index }}
              >
                <span className="recent-card__icon">
                  {instance.iconUrl ? (
                    <img src={instance.iconUrl} alt="" />
                  ) : (
                    instance.glyph
                  )}
                </span>
                <span className="recent-card__copy">
                  <strong>{displayName(instance)}</strong>
                  <small>
                    {instance.version} · {instance.loader.split(" ")[0]}
                  </small>
                </span>
                <button
                  className="recent-card__play"
                  aria-label={t("home.action.play")}
                  onClick={(event) => {
                    event.stopPropagation();
                    onPlay(instance);
                  }}
                >
                  <Play size={13} fill="currentColor" />
                </button>
              </motion.article>
            );
          })}

          <button className="recent-card recent-card--new" onClick={onCreate}>
            <span className="recent-card__icon">
              <Plus size={18} />
            </span>
            <span className="recent-card__copy">
              <strong>{t("home.newInstance")}</strong>
              <small>{t("home.newHint")}</small>
            </span>
          </button>
        </div>
      </section>

      <section className="ops-grid">
        <div className={`ops-card ops-card--guard ${failedInstance ? "has-alert" : ""}`}>
          <div className="ops-card__head">
            <div className={`ops-card__icon ${failedInstance ? "ops-card__icon--danger" : ""}`}>
              {failedInstance ? <ShieldAlert size={16} /> : <ShieldCheck size={16} />}
            </div>
            <div className="ops-card__titles">
              <strong>Onyx Guard</strong>
              <span>{failedInstance ? "Action required" : "Integrity verified"}</span>
            </div>
          </div>
          <div className="ops-card__body">
            {failedInstance ? (
              <div className="guard-crash-info">
                <p className="guard-crash-msg">
                  Last launch of <strong>{displayName(failedInstance)}</strong> exited with code {failedInstance.lastExitCode ?? 1}.
                </p>
                <p className="guard-crash-diagnosis">
                  {failedInstance.lastDiagnosis?.message || "Crash log recorded and ready for analysis."}
                </p>
              </div>
            ) : (
              <div className="guard-clean-info">
                <div className="guard-clean-row">
                  <span className="text-emerald">✓</span>
                  <span>Zero conflicting mod IDs detected</span>
                </div>
                <div className="guard-clean-row">
                  <span className="text-emerald">✓</span>
                  <span>World Guard safety snapshots armed</span>
                </div>
                <div className="guard-clean-row">
                  <span className="text-emerald">✓</span>
                  <span>Binary bisect engine ready</span>
                </div>
              </div>
            )}
            <div className="ops-card__footer">
              <button
                className={`button button--full ${
                  failedInstance ? "button--danger-quiet" : "button--secondary"
                }`}
                onClick={() => onOpen(failedInstance ?? activeInstance)}
              >
                <Wrench size={13} />
                {failedInstance ? "Analyze Crash & Bisect" : "Open Diagnostics"}
              </button>
            </div>
          </div>
        </div>

        <div className="ops-card ops-card--server">
          <div className="ops-card__head">
            <div className="ops-card__icon">
              <Radio size={16} />
            </div>
            <div className="ops-card__titles">
              <strong>Quick Join</strong>
              <span>Direct multiplayer launch</span>
            </div>
          </div>
          <div className="ops-card__body">
            <div className="quick-join-form">
              <div className="quick-join-input-shell">
                <Server size={14} />
                <input
                  type="text"
                  placeholder="mc.hypixel.net"
                  value={quickServer}
                  onChange={(event) => setQuickServer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleJoinServer();
                  }}
                />
                {quickServer && (
                  <button
                    type="button"
                    className="quick-join-ping-btn"
                    onClick={() => void handlePingServer()}
                    disabled={pinging}
                  >
                    {pinging ? <LoaderCircle size={12} className="spin" /> : "Ping"}
                  </button>
                )}
              </div>
              {pingResult && (
                <div className="quick-join-status">
                  <span
                    className={`status-dot ${
                      pingResult.online ? "status-dot--online" : "status-dot--offline"
                    }`}
                  />
                  <span>
                    {pingResult.online
                      ? `${pingResult.latencyMs ?? 0}ms · ${pingResult.playersOnline ?? 0} online`
                      : "Server offline or unreachable"}
                  </span>
                </div>
              )}
            </div>
            <div className="ops-card__footer">
              <button
                className="button button--secondary button--full"
                onClick={() => void handleJoinServer()}
                disabled={!quickServer.trim() || isRunning}
              >
                <Play size={13} fill="currentColor" />
                Connect & Play
              </button>
            </div>
          </div>
        </div>

        <div className="ops-card ops-card--picks">
          <div className="ops-card__head">
            <div className="ops-card__icon">
              <Sparkles size={16} />
            </div>
            <div className="ops-card__titles">
              <strong>Curated Picks</strong>
              <span>Tested for performance & shaders</span>
            </div>
          </div>
          <div className="ops-card__body">
            <div className="picks-fast-list">
              <div
                className="picks-fast-item"
                role="button"
                tabIndex={0}
                onClick={() => onNavigate("picks")}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    onNavigate("picks");
                  }
                }}
              >
                <div className="picks-fast-icon">FO</div>
                <div className="picks-fast-copy">
                  <strong>Fabulously Optimized</strong>
                  <small>400+ FPS · Sodium & Iris shaders</small>
                </div>
                <ExternalLink size={13} />
              </div>
              <div
                className="picks-fast-item"
                role="button"
                tabIndex={0}
                onClick={() => onNavigate("picks")}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    onNavigate("picks");
                  }
                }}
              >
                <div className="picks-fast-icon">SO</div>
                <div className="picks-fast-copy">
                  <strong>Simply Optimized</strong>
                  <small>Lightweight Vanilla+ engine</small>
                </div>
                <ExternalLink size={13} />
              </div>
            </div>
            <div className="ops-card__footer">
              <button
                className="button button--secondary button--full"
                onClick={() => onNavigate("picks")}
              >
                Explore All Picks
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </section>
    </motion.div>
  );
}
