import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { LoaderCircle } from "lucide-react";
import { AuthModal } from "./components/AuthModal";
import { CommandPalette } from "./components/CommandPalette";
import { ContentModal } from "./components/ContentModal";
import { CreateInstanceModal } from "./components/CreateInstanceModal";
import { InstanceMenu } from "./components/InstanceMenu";
import { InstanceSettingsModal } from "./components/InstanceSettingsModal";
import {
  LauncherOverlay,
  type ActiveLaunch,
} from "./components/LauncherOverlay";
import { OnboardingModal } from "./components/OnboardingModal";
import {
  MaintenancePill,
  type MaintenanceState,
} from "./components/MaintenancePill";
import { Sidebar } from "./components/Sidebar";
import { TargetInstanceModal } from "./components/TargetInstanceModal";
import { TitleBar } from "./components/TitleBar";
import { ToastStack, type ToastMessage } from "./components/Toast";
import { HomePage } from "./pages/HomePage";
import type {
  CatalogProject,
  DownloadProgress,
  DownloadTask,
  GameInstance,
  LauncherProgress,
  LauncherSettings,
  LauncherState,
  LogDiagnosis,
  MinecraftVersion,
  NewInstanceInput,
  Profile,
  RouteId,
} from "./types";
import { useI18n } from "./i18n";
import { formatBytes } from "./utils";
import {
  buildSupportReport,
  localizeDiagnosis,
} from "./diagnostics";

const LibraryPage = lazy(() =>
  import("./pages/LibraryPage").then((module) => ({
    default: module.LibraryPage,
  })),
);
const DiscoverPage = lazy(() =>
  import("./pages/DiscoverPage").then((module) => ({
    default: module.DiscoverPage,
  })),
);
const PicksPage = lazy(() =>
  import("./pages/PicksPage").then((module) => ({
    default: module.PicksPage,
  })),
);
const DownloadsPage = lazy(() =>
  import("./pages/DownloadsPage").then((module) => ({
    default: module.DownloadsPage,
  })),
);
const SkinsPage = lazy(() =>
  import("./pages/SkinsPage").then((module) => ({
    default: module.SkinsPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);
const InstancePage = lazy(() =>
  import("./pages/InstancePage").then((module) => ({
    default: module.InstancePage,
  })),
);

export default function App() {
  const { locale, setLocale, t } = useI18n();
  const [state, setState] = useState<LauncherState | null>(null);
  const [route, setRoute] = useState<RouteId>("home");
  const [instanceReturnRoute, setInstanceReturnRoute] =
    useState<Exclude<RouteId, "instance">>("library");
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null,
  );
  const [versions, setVersions] = useState<MinecraftVersion[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [instanceMenu, setInstanceMenu] = useState<GameInstance | null>(null);
  const [contentInstance, setContentInstance] =
    useState<GameInstance | null>(null);
  const [settingsInstance, setSettingsInstance] =
    useState<GameInstance | null>(null);
  const [pendingMod, setPendingMod] = useState<CatalogProject | null>(null);
  const [activeLaunch, setActiveLaunch] = useState<ActiveLaunch | null>(null);
  const [launchExpanded, setLaunchExpanded] = useState(false);
  const [supportExportBusy, setSupportExportBusy] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [maintenance, setMaintenance] =
    useState<MaintenanceState | null>(null);

  const pushToast = useCallback(
    (
      tone: ToastMessage["tone"],
      title: string,
      message: string,
      duration = 4500,
    ) => {
      const id = Date.now() + Math.round(Math.random() * 1000);
      setToasts((current) => [...current, { id, tone, title, message }]);
      window.setTimeout(
        () =>
          setToasts((current) => current.filter((toast) => toast.id !== id)),
        duration,
      );
    },
    [],
  );

  const refreshState = useCallback(async () => {
    const next = await window.onyx.state.get();
    setState(next);
    return next;
  }, []);

  useEffect(() => {
    void refreshState()
      .then((loaded) => {
        setOnboardingOpen(!loaded.settings.onboardingComplete);
        if (loaded.settings.autoCheckUpdates) {
          void window.onyx.state.checkUpdates().catch(() => undefined);
        }
      })
      .catch(() => {
        pushToast(
          "warning",
          t("app.loadError.title"),
          t("app.loadError.message"),
        );
      });
    void window.onyx.minecraft
      .versions()
      .then(setVersions)
      .catch(() => undefined);
  }, [pushToast, refreshState, t]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setCreateOpen(false);
        setInstanceMenu(null);
        setContentInstance(null);
        setSettingsInstance(null);
        setPendingMod(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const removeDownload = window.onyx.onDownloadProgress(
      (progress: DownloadProgress) => {
        setState((current) => {
          if (!current) return current;
          const existing = current.downloads.some(
            (download) => download.id === progress.id,
          );
          const downloads = existing
            ? current.downloads.map((download) =>
                download.id === progress.id
                  ? { ...download, ...progress }
                  : download,
              )
            : [
                {
                  id: progress.id,
                  name: progress.name ?? t("app.download.name"),
                  subtitle: progress.subtitle ?? t("app.download.preparing"),
                  progress: progress.progress,
                  status: progress.status,
                  createdAt: new Date().toISOString(),
                  iconUrl: progress.iconUrl,
                } satisfies DownloadTask,
                ...current.downloads,
              ];
          return { ...current, downloads };
        });
        if (progress.status === "done") {
          pushToast(
            "success",
            t("app.install.done"),
            progress.subtitle ?? t("app.install.doneMessage"),
          );
          void refreshState();
        } else if (progress.status === "error") {
          pushToast(
            "warning",
            t("app.install.stopped"),
            progress.error ?? t("app.install.failed"),
            6500,
          );
        } else if (progress.status === "cancelled") {
          pushToast(
            "info",
            t("app.task.cancelled"),
            progress.error ?? t("app.task.cancelledMessage"),
          );
        }
      },
    );

    const removeInstance = window.onyx.onInstanceUpdated(
      (updated: GameInstance) => {
        setState((current) => {
          if (!current) return current;
          const exists = current.instances.some(
            (instance) => instance.id === updated.id,
          );
          return {
            ...current,
            instances: exists
              ? current.instances.map((instance) =>
                  instance.id === updated.id ? updated : instance,
                )
              : [updated, ...current.instances],
          };
        });
        setActiveLaunch((current) => {
          if (!current || current.instance.id !== updated.id) return current;
          if (current.mode === "running" && updated.status === "ready") {
            void refreshState();
            const diagnosis = updated.lastDiagnosis
              ? localizeDiagnosis(updated.lastDiagnosis, t)
              : null;
            pushToast(
              updated.lastExitCode === 0 ? "success" : "warning",
              t("app.game.finished"),
              updated.lastExitCode === 0
                ? t("app.game.finishedOk")
                : diagnosis
                  ? `${diagnosis.title}. ${diagnosis.message}`
                  : t("app.game.exitCode", { code: updated.lastExitCode ?? t("app.unknown") }),
            );
            if (updated.lastExitCode === 0) return null;
            setLaunchExpanded(true);
            return {
              ...current,
              instance: updated,
              mode: "logs",
              progress: {
                instanceId: updated.id,
                stage: "diagnostics",
                progress: 100,
                message: t("launch.lastLog"),
              },
              analysis: diagnosis ? [diagnosis] : [],
            };
          }
          return { ...current, instance: updated };
        });
      },
    );

    const removeSession =
      typeof window.onyx.onSessionRecorded === "function"
        ? window.onyx.onSessionRecorded((session) => {
            setState((current) =>
              current
                ? {
                    ...current,
                    sessions: [
                      session,
                      ...current.sessions.filter(
                        (item) => item.id !== session.id,
                      ),
                    ].slice(0, 500),
                  }
                : current,
            );
            const regression = session.performance?.insights.find(
              (insight) =>
                insight.code === "fps-regression" ||
                insight.code === "startup-regression" ||
                insight.code === "memory-regression",
            );
            if (regression) {
              const message =
                regression.code === "fps-regression"
                  ? t(
                      "instancePage.performance.insight.fpsRegressionText",
                      { value: regression.value },
                    )
                  : regression.code === "startup-regression"
                    ? t(
                        "instancePage.performance.insight.startupRegressionText",
                        { value: regression.value },
                      )
                    : t(
                        "instancePage.performance.insight.memoryRegressionText",
                        { value: regression.value },
                      );
              pushToast(
                "warning",
                t("app.performance.regression", {
                  name: session.instanceName,
                }),
                message,
                8_000,
              );
            }
          })
        : () => undefined;

    const removeProgress = window.onyx.onLauncherProgress(
      (progress: LauncherProgress) => {
        setActiveLaunch((current) => {
          if (!current || current.instance.id !== progress.instanceId) {
            return current;
          }
          return {
            ...current,
            mode:
              progress.stage === "auth" || progress.stage === "ready"
                ? "launching"
                : "installing",
            progress,
          };
        });
      },
    );

    const removeLog = window.onyx.onLauncherLog((log) => {
      setActiveLaunch((current) => {
        if (!current || current.instance.id !== log.instanceId) return current;
        return {
          ...current,
          mode: "running",
          logs: `${current.logs}${log.text}`.slice(-12_000),
        };
      });
    });

    const removeAuth = window.onyx.onAuthChanged((profile) => {
      setState((current) => (current ? { ...current, profile } : current));
    });
    const removeMaintenance = window.onyx.onMaintenanceProgress((progress) => {
      setMaintenance(progress);
      if (progress.done) {
        window.setTimeout(
          () =>
            setMaintenance((current) =>
              current?.operation === progress.operation ? null : current,
            ),
          2200,
        );
      }
    });

    return () => {
      removeDownload();
      removeInstance();
      removeSession();
      removeProgress();
      removeLog();
      removeAuth();
      removeMaintenance();
    };
  }, [pushToast, refreshState, t]);

  const activeAccent = state?.settings.accent ?? "lime";
  useEffect(() => {
    document.documentElement.dataset.accent = activeAccent;
  }, [activeAccent]);
  useEffect(() => {
    document.documentElement.dataset.motion = state?.settings.reducedMotion
      ? "reduced"
      : "full";
  }, [state?.settings.reducedMotion]);
  const persistedLanguage = state?.settings.language;
  useEffect(() => {
    if (persistedLanguage && persistedLanguage !== locale) {
      setLocale(persistedLanguage);
    }
  }, [persistedLanguage, locale, setLocale]);

  async function checkInstance(instance: GameInstance) {
    setInstanceMenu(null);
    setActiveLaunch({
      instance,
      mode: "installing",
      progress: {
        instanceId: instance.id,
        stage: "preflight",
        progress: 5,
        message: t("launch.preflight"),
      },
      logs: "",
    });
    setLaunchExpanded(true);
    try {
      const health = await window.onyx.launcher.preflight(instance.id);
      setState((current) =>
        current
          ? {
              ...current,
              instances: current.instances.map((item) =>
                item.id === instance.id ? { ...item, health } : item,
              ),
            }
          : current,
      );
      setActiveLaunch((current) =>
        current?.instance.id === instance.id
          ? {
              ...current,
              instance: { ...current.instance, health },
              mode: "guard",
              progress: null,
              health,
            }
          : current,
      );
    } catch (error) {
      setActiveLaunch(null);
      pushToast(
        "warning",
        t("guard.failed"),
        error instanceof Error ? error.message : t("guard.failedMessage"),
      );
    }
  }

  async function play(instance: GameInstance) {
    if (instance.status === "running") {
      const stopped = await window.onyx.launcher.stop(instance.id);
      if (stopped) {
        pushToast(
          "info",
          t("app.game.stopping"),
          t("app.game.stoppingMessage"),
        );
      }
      return;
    }
    setInstanceMenu(null);
    setActiveLaunch({
      instance,
      mode:
        instance.resolvedVersionId && instance.status === "ready"
          ? "launching"
          : "installing",
      progress: null,
      logs: "",
    });
    setLaunchExpanded(true);
    const result = await window.onyx.launcher.play(instance.id);
    if (result.ok) {
      setActiveLaunch((current) =>
        current
          ? {
              ...current,
              mode: "running",
              progress: {
                instanceId: instance.id,
                stage: "running",
                progress: 100,
                message: result.message ?? t("app.game.running"),
              },
            }
          : current,
      );
      pushToast(
        result.demo ? "info" : "success",
        t("app.game.launched", { name: instance.name }),
        result.demo
          ? t("app.game.demo")
          : t("app.game.enjoy"),
        6200,
      );
    } else {
      if (result.health) {
        setActiveLaunch((current) =>
          current
            ? {
                ...current,
                mode: "guard",
                progress: null,
                health: result.health,
                instance: { ...current.instance, health: result.health },
              }
            : current,
        );
        setLaunchExpanded(true);
      } else {
        setActiveLaunch(null);
      }
      pushToast(
        "warning",
        t("app.game.failed"),
        result.message ?? t("app.game.failedMessage"),
        7000,
      );
    }
  }

  async function createInstance(input: NewInstanceInput) {
    const created = await window.onyx.state.createInstance(input);
    setState((current) =>
      current
        ? { ...current, instances: [created, ...current.instances] }
        : current,
    );
    setRoute("library");
    pushToast(
      "success",
      t("app.instance.created", { name: created.name }),
      t("app.instance.createdMessage"),
    );
  }

  async function toggleFavorite(instance: GameInstance) {
    const updated = await window.onyx.state.toggleFavorite(instance.id);
    if (!updated) return;
    setState((current) =>
      current
        ? {
            ...current,
            instances: current.instances.map((item) =>
              item.id === updated.id ? updated : item,
            ),
          }
        : current,
    );
  }

  async function deleteInstance(instance: GameInstance) {
    if (
      !window.confirm(
        t("app.instance.deleteConfirm", { name: instance.name }),
      )
    ) {
      return;
    }
    await window.onyx.state.deleteInstance(instance.id);
    setState((current) =>
      current
        ? {
            ...current,
            instances: current.instances.filter(
              (item) => item.id !== instance.id,
            ),
          }
        : current,
    );
    setInstanceMenu(null);
    pushToast(
      "info",
      t("app.instance.deleted"),
      t("app.instance.deletedMessage"),
    );
  }

  async function duplicateInstance(instance: GameInstance) {
    const duplicate = await window.onyx.state.duplicateInstance(instance.id);
    setState((current) =>
      current
        ? { ...current, instances: [duplicate, ...current.instances] }
        : current,
    );
    setInstanceMenu(null);
    pushToast(
      "success",
      t("app.instance.duplicated"),
      t("app.instance.duplicatedMessage", { name: duplicate.name }),
    );
  }

  async function repairInstance(instance: GameInstance) {
    setInstanceMenu(null);
    setActiveLaunch({
      instance,
      mode: "installing",
      progress: {
        instanceId: instance.id,
        stage: "repair",
        progress: 1,
        message: t("app.repair.start"),
      },
      logs: "",
    });
    setLaunchExpanded(true);
    try {
      const repaired = await window.onyx.state.repairInstance(instance.id);
      setState((current) =>
        current
          ? {
              ...current,
              instances: current.instances.map((item) =>
                item.id === repaired.id ? repaired : item,
              ),
            }
          : current,
      );
      setActiveLaunch(null);
      pushToast(
        "success",
        t("app.repair.done"),
        t("app.repair.doneMessage"),
        6200,
      );
    } catch (error) {
      setActiveLaunch(null);
      pushToast(
        "warning",
        t("app.repair.stopped"),
        error instanceof Error ? error.message : t("app.repair.failed"),
        7000,
      );
    }
  }

  async function updateInstanceRecord(
    instance: GameInstance,
    patch: Pick<Partial<GameInstance>, "name" | "description" | "color"> & {
      settings?: GameInstance["settings"];
    },
  ) {
    const updated = await window.onyx.state.updateInstance(instance.id, patch);
    setState((current) =>
      current
        ? {
            ...current,
            instances: current.instances.map((item) =>
              item.id === updated.id ? updated : item,
            ),
          }
        : current,
    );
    return updated;
  }

  async function saveInstanceSettings(
    instance: GameInstance,
    patch: Pick<Partial<GameInstance>, "name" | "description" | "color"> & {
      settings: GameInstance["settings"];
    },
  ) {
    const updated = await updateInstanceRecord(instance, patch);
    setSettingsInstance(null);
    pushToast(
      "success",
      t("app.settings.saved"),
      t("app.settings.savedMessage", { name: updated.name }),
    );
  }

  function openInstance(instance: GameInstance) {
    if (route !== "instance") {
      setInstanceReturnRoute(route);
    }
    setSelectedInstanceId(instance.id);
    setRoute("instance");
  }

  async function backupInstance(instance: GameInstance) {
    setInstanceMenu(null);
    pushToast(
      "info",
      t("app.backup.preparing"),
      t("app.backup.preparingMessage"),
    );
    try {
      const result = await window.onyx.state.backupInstance(instance.id);
      if (!result) return;
      pushToast(
        "success",
        t("app.backup.done"),
        t("app.backup.doneMessage", { files: result.files, size: formatBytes(result.bytes, locale) }),
        6500,
      );
    } catch (error) {
      pushToast(
        "warning",
        t("app.backup.failed"),
        error instanceof Error ? error.message : t("app.backup.failedMessage"),
        7000,
      );
    }
  }

  async function updatePack(instance: GameInstance) {
    setInstanceMenu(null);
    setActiveLaunch({
      instance,
      mode: "installing",
      progress: {
        instanceId: instance.id,
        stage: "backup",
        progress: 1,
        message: t("app.update.restorePoint"),
      },
      logs: "",
    });
    setLaunchExpanded(true);
    try {
      const result = await window.onyx.state.updatePack(instance.id);
      setActiveLaunch(null);
      await refreshState();
      pushToast(
        result.updated ? "success" : "info",
        result.updated ? t("app.update.done") : t("app.update.current"),
        result.updated
          ? t("app.update.doneMessage", { version: result.versionNumber || t("app.update.latest") })
          : t("app.update.noUpdates"),
        7000,
      );
    } catch (error) {
      setActiveLaunch(null);
      pushToast(
        "warning",
        t("app.update.stopped"),
        error instanceof Error ? error.message : t("app.update.failed"),
        7000,
      );
    }
  }

  async function importBackup() {
    try {
      const imported = await window.onyx.state.importBackup();
      if (!imported) return;
      await refreshState();
      setRoute("library");
      pushToast(
        "success",
        t("app.import.done", { name: imported.name }),
        t("app.import.doneMessage"),
        6500,
      );
    } catch (error) {
      pushToast(
        "warning",
        t("app.import.stopped"),
        error instanceof Error ? error.message : t("app.import.failed"),
        7000,
      );
    }
  }

  async function exportSyncProfile(instance: GameInstance) {
    try {
      const result = await window.onyx.state.exportSyncProfile(instance.id);
      if (!result) return;
      pushToast(
        "success",
        t("app.sync.exported"),
        t("app.sync.exportedHint", {
          recognized: result.recognized,
          total: result.total,
        }),
        7000,
      );
    } catch (error) {
      pushToast(
        "warning",
        t("app.sync.failed"),
        error instanceof Error
          ? error.message
          : t("app.sync.exportFailed"),
        7000,
      );
    }
  }

  async function importSyncProfile() {
    try {
      const result = await window.onyx.state.importSyncProfile();
      if (!result) return;
      await refreshState();
      setSelectedInstanceId(result.instance.id);
      setRoute("instance");
      pushToast(
        result.skipped ? "warning" : "success",
        t("app.sync.imported", { name: result.instance.name }),
        t("app.sync.importedHint", {
          installed: result.installed,
          skipped: result.skipped,
        }),
        8000,
      );
    } catch (error) {
      await refreshState();
      pushToast(
        "warning",
        t("app.sync.failed"),
        error instanceof Error
          ? error.message
          : t("app.sync.importFailed"),
        7000,
      );
    }
  }

  async function updateSettings(patch: Partial<LauncherSettings>) {
    const settings = await window.onyx.state.updateSettings(patch);
    setState((current) => (current ? { ...current, settings } : current));
    if ("showSnapshots" in patch) {
      void window.onyx.minecraft.versions().then(setVersions);
    }
  }

  async function moveGameDirectory(targetPath: string) {
    const result = await window.onyx.state.moveGameDirectory(targetPath);
    setState((current) =>
      current ? { ...current, settings: result.settings } : current,
    );
    return result;
  }

  async function queueProject(
    project: CatalogProject,
    targetInstanceId?: string,
  ) {
    const task = await window.onyx.catalog.install(project, targetInstanceId);
    setState((current) => {
      if (!current) return current;
      if (current.downloads.some((download) => download.id === task.id)) {
        return current;
      }
      return { ...current, downloads: [task, ...current.downloads] };
    });
    setPendingMod(null);
    setRoute("downloads");
    pushToast(
      "info",
      t("app.queue.added"),
      t("app.queue.addedMessage", { name: project.title }),
    );
  }

  async function installProject(project: CatalogProject) {
    if (project.project_type === "mod") {
      setPendingMod(project);
      return;
    }
    await queueProject(project);
  }

  async function importPack() {
    const task = await window.onyx.catalog.importPack();
    if (!task) return;
    setState((current) =>
      current
        ? { ...current, downloads: [task, ...current.downloads] }
        : current,
    );
    setRoute("downloads");
  }

  async function retryDownload(task: DownloadTask) {
    if (!task.projectId) {
      setRoute("discover");
      pushToast(
        "info",
        t("app.retry.chooseAgain"),
        t("app.retry.localMissing"),
      );
      return;
    }
    try {
      const type = task.projectType || (task.targetInstanceId ? "mod" : "modpack");
      const response = await window.onyx.catalog.search(task.name, type);
      const project = response.hits.find(
        (item) => item.project_id === task.projectId,
      );
      if (!project) throw new Error(t("app.retry.notFound"));
      await queueProject(project, task.targetInstanceId || undefined);
    } catch (error) {
      pushToast(
        "warning",
        t("app.retry.failed"),
        error instanceof Error ? error.message : t("app.retry.failedMessage"),
      );
    }
  }

  async function cancelDownload(task: DownloadTask) {
    const cancelled = await window.onyx.catalog.cancel(task.id);
    if (!cancelled) return;
    setState((current) =>
      current
        ? {
            ...current,
            downloads: current.downloads.map((item) =>
              item.id === task.id
                ? {
                    ...item,
                    status: "cancelled",
                    error: t("app.cancelledByUser"),
                  }
                : item,
            ),
          }
        : current,
    );
  }

  async function clearDownloadHistory() {
    const downloads = await window.onyx.catalog.clearHistory();
    setState((current) =>
      current ? { ...current, downloads } : current,
    );
  }

  async function showLogs(instance: GameInstance) {
    const log = await window.onyx.launcher.getLog(instance.id);
    setInstanceMenu(null);
    if (!log.path) {
      pushToast(
        "info",
        t("app.logs.empty"),
        t("app.logs.emptyMessage"),
      );
      return;
    }
    setActiveLaunch({
      instance,
      mode: instance.status === "running" ? "running" : "logs",
      progress: {
        instanceId: instance.id,
        stage: "logs",
        progress: 100,
        message: t("app.logs.last"),
      },
      logs: log.content,
      analysis: log.analysis,
    });
    setLaunchExpanded(true);
  }

  async function handleDiagnosisAction(
    instance: GameInstance,
    diagnosis: LogDiagnosis,
  ) {
    setLaunchExpanded(false);
    setActiveLaunch(null);
    const { code } = diagnosis;
    if (code === "recent-mod-changes" && diagnosis.suspects?.length) {
      try {
        const result = await window.onyx.state.disableSuspects(
          instance.id,
          diagnosis.suspects,
        );
        if (!result.disabled.length) {
          pushToast(
            "warning",
            t("diagnosis.recentMods.title"),
            t("diagnosis.recentMods.none"),
          );
          setContentInstance(instance);
          return;
        }
        pushToast(
          "info",
          t("diagnosis.recentMods.disabled"),
          t("diagnosis.recentMods.disabledMessage", {
            count: result.disabled.length,
          }),
        );
        await refreshState();
        await play(instance);
      } catch (error) {
        pushToast(
          "warning",
          t("diagnosis.recentMods.title"),
          error instanceof Error ? error.message : t("app.game.failedMessage"),
        );
      }
      return;
    }
    if (code === "missing-dependency" || code === "mixin-conflict") {
      setContentInstance(instance);
      return;
    }
    if (code === "authentication") {
      setAccountOpen(true);
      return;
    }
    if (code === "corrupted-file") {
      void repairInstance(instance);
      return;
    }
    if (code === "out-of-memory" || code === "wrong-java") {
      setSettingsInstance(instance);
      return;
    }
    setRoute("settings");
  }

  async function copySupportReport() {
    if (!activeLaunch) return;
    const diagnosis = activeLaunch.analysis?.[0]
      ? localizeDiagnosis(activeLaunch.analysis[0], t)
      : undefined;
    try {
      await navigator.clipboard.writeText(
        buildSupportReport({
          instance: activeLaunch.instance,
          diagnosis,
          logs: activeLaunch.logs,
        }),
      );
      pushToast(
        "success",
        t("diagnosis.reportCopied"),
        t("diagnosis.reportCopiedMessage"),
      );
    } catch {
      pushToast(
        "warning",
        t("diagnosis.reportCopyFailed"),
        t("diagnosis.reportCopyFailedMessage"),
      );
    }
  }

  async function exportSupportBundle() {
    if (!activeLaunch || supportExportBusy) return;
    setSupportExportBusy(true);
    try {
      const result = await window.onyx.launcher.exportSupportBundle(
        activeLaunch.instance.id,
      );
      if (!result) return;
      pushToast(
        "success",
        t("app.support.done"),
        t("app.support.doneMessage", {
          size: formatBytes(result.bytes, locale),
        }),
        6500,
      );
    } catch (error) {
      pushToast(
        "warning",
        t("app.support.failed"),
        error instanceof Error
          ? error.message
          : t("app.support.failedMessage"),
        7000,
      );
    } finally {
      setSupportExportBusy(false);
    }
  }

  function changeProfile(profile: Profile) {
    setState((current) => (current ? { ...current, profile } : current));
    if (profile.kind === "microsoft") {
      pushToast(
        "success",
        t("app.welcome", { name: profile.name }),
        t("app.welcomeMessage"),
      );
    }
  }

  function renderPage() {
    if (!state) return null;
    switch (route) {
      case "library":
        return (
          <LibraryPage
            instances={state.instances}
            onCreate={() => setCreateOpen(true)}
            onImport={() => void importPack()}
            onImportBackup={() => void importBackup()}
            onImportSync={() => void importSyncProfile()}
            onPlay={(instance) => void play(instance)}
            onFavorite={(instance) => void toggleFavorite(instance)}
            onMenu={setInstanceMenu}
            onCheck={(instance) => void checkInstance(instance)}
            onOpen={openInstance}
          />
        );
      case "instance": {
        const instance = state.instances.find(
          (item) => item.id === selectedInstanceId,
        );
        if (!instance) {
          return (
            <LibraryPage
              instances={state.instances}
              onCreate={() => setCreateOpen(true)}
              onImport={() => void importPack()}
              onImportBackup={() => void importBackup()}
              onImportSync={() => void importSyncProfile()}
              onPlay={(item) => void play(item)}
              onFavorite={(item) => void toggleFavorite(item)}
              onMenu={setInstanceMenu}
              onCheck={(item) => void checkInstance(item)}
              onOpen={openInstance}
            />
          );
        }
        return (
          <InstancePage
            instance={instance}
            sessions={state.sessions}
            onBack={() => setRoute(instanceReturnRoute)}
            onPlay={(item) => void play(item)}
            onCheck={(item) => void checkInstance(item)}
            onSettings={setSettingsInstance}
            onLogs={(item) => void showLogs(item)}
            onOpenFolder={(item) =>
              void window.onyx.state.openInstanceFolder(item.id)
            }
            onBackup={(item) => void backupInstance(item)}
            onUpdatePack={(item) => void updatePack(item)}
            onExportSync={(item) => void exportSyncProfile(item)}
            onDiscover={() => setRoute("discover")}
            onUpdate={updateInstanceRecord}
            onChanged={() => void refreshState()}
            onNotify={(tone, title, message) =>
              pushToast(tone, title, message, 6200)
            }
          />
        );
      }
      case "discover":
        return (
          <DiscoverPage
            downloads={state.downloads}
            versions={versions}
            onInstall={(project) => void installProject(project)}
            onNavigate={setRoute}
          />
        );
      case "picks":
        return (
          <PicksPage
            downloads={state.downloads}
            allocatedMemory={state.settings.memory}
            onInstall={(project) => void installProject(project)}
            onExplore={() => setRoute("discover")}
          />
        );
      case "downloads":
        return (
          <DownloadsPage
            downloads={state.downloads}
            onRetry={(task) => void retryDownload(task)}
            onCancel={(task) => void cancelDownload(task)}
            onClear={() => void clearDownloadHistory()}
          />
        );
      case "settings":
        return (
          <SettingsPage
            settings={state.settings}
            profile={state.profile}
            onUpdate={updateSettings}
            onMoveDirectory={moveGameDirectory}
            onAccount={() => setAccountOpen(true)}
            onNotify={(tone, title, message) =>
              pushToast(tone, title, message, 6200)
            }
          />
        );
      case "skins":
        return (
          <SkinsPage
            profile={state.profile}
            onAccount={() => setAccountOpen(true)}
            onNotify={(tone, title, message) =>
              pushToast(tone, title, message, 6200)
            }
          />
        );
      default:
        return (
          <HomePage
            instances={state.instances}
            sessions={state.sessions}
            profileName={state.profile.name}
            onNavigate={setRoute}
            onPlay={(instance) => void play(instance)}
            onOpen={openInstance}
            onCreate={() => setCreateOpen(true)}
            onConfigure={setSettingsInstance}
          />
        );
    }
  }

  if (!state) {
    return (
      <div className="app-loading">
        <span className="brand-mark">
          <i />
          <b />
        </span>
        <LoaderCircle className="spin" size={18} />
        <p>{t("loading.app")}</p>
      </div>
    );
  }

  return (
    <MotionConfig
      reducedMotion={state.settings.reducedMotion ? "always" : "user"}
    >
      <div className="app-shell">
      <TitleBar onSearch={() => setCommandOpen(true)} />
      <div className="app-body">
        <Sidebar
          activeRoute={route}
          profile={state.profile}
          downloads={state.downloads}
          onNavigate={setRoute}
          onAccount={() => setAccountOpen(true)}
        />
        <main className="content">
          <Suspense
            fallback={
              <div className="route-loading">
                <LoaderCircle className="spin" size={18} />
                <span>{t("loading.page")}</span>
              </div>
            }
          >
            <AnimatePresence mode="wait">{renderPage()}</AnimatePresence>
          </Suspense>
        </main>
      </div>

      <CreateInstanceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={createInstance}
        availableVersions={versions}
      />
      <CommandPalette
        open={commandOpen}
        instances={state.instances}
        onClose={() => setCommandOpen(false)}
        onNavigate={setRoute}
        onPlay={(instance) => void play(instance)}
        onCreate={() => setCreateOpen(true)}
      />
      <InstanceMenu
        instance={instanceMenu}
        onClose={() => setInstanceMenu(null)}
        onPlay={(instance) => void play(instance)}
        onDelete={(instance) => void deleteInstance(instance)}
        onDuplicate={(instance) => void duplicateInstance(instance)}
        onRepair={(instance) => void repairInstance(instance)}
        onBackup={(instance) => void backupInstance(instance)}
        onUpdatePack={(instance) => void updatePack(instance)}
        onSettings={(instance) => {
          setInstanceMenu(null);
          setSettingsInstance(instance);
        }}
        onOpenFolder={(instance) => {
          void window.onyx.state.openInstanceFolder(instance.id);
          setInstanceMenu(null);
        }}
        onContent={(instance) => {
          setInstanceMenu(null);
          setContentInstance(instance);
        }}
        onLogs={(instance) => void showLogs(instance)}
      />
      <ContentModal
        instance={contentInstance}
        onClose={() => setContentInstance(null)}
        onChanged={() => void refreshState()}
        onNotify={(tone, title, message) =>
          pushToast(tone, title, message, 6200)
        }
      />
      <InstanceSettingsModal
        instance={settingsInstance}
        globalSettings={state.settings}
        onClose={() => setSettingsInstance(null)}
        onSave={saveInstanceSettings}
      />
      <TargetInstanceModal
        project={pendingMod}
        instances={state.instances}
        onClose={() => setPendingMod(null)}
        onSelect={(instance) =>
          pendingMod && void queueProject(pendingMod, instance.id)
        }
      />
      <OnboardingModal
        open={onboardingOpen}
        profile={state.profile}
        onAccount={() => setAccountOpen(true)}
        onFinish={async (memory) => {
          await updateSettings({ memory, onboardingComplete: true });
          setOnboardingOpen(false);
          pushToast(
            "success",
            t("app.ready"),
            t("app.readyMessage"),
          );
        }}
      />
      <AuthModal
        open={accountOpen}
        profile={state.profile}
        onClose={() => setAccountOpen(false)}
        onChanged={changeProfile}
      />
      <LauncherOverlay
        launch={activeLaunch}
        expanded={launchExpanded}
        onExpand={() => setLaunchExpanded(true)}
        onHide={() => setLaunchExpanded(false)}
        onStop={() =>
          activeLaunch &&
          void window.onyx.launcher.stop(activeLaunch.instance.id)
        }
        onPlay={() => {
          if (!activeLaunch) return;
          const instance = activeLaunch.instance;
          setActiveLaunch(null);
          void play(instance);
        }}
        onRepair={() => {
          if (!activeLaunch) return;
          const instance = activeLaunch.instance;
          setActiveLaunch(null);
          void repairInstance(instance);
        }}
        onOpenSettings={() => {
          if (
            activeLaunch &&
            activeLaunch.health?.blocker !== "disk-critical"
          ) {
            setSettingsInstance(activeLaunch.instance);
            setActiveLaunch(null);
            return;
          }
          setActiveLaunch(null);
          setRoute("settings");
        }}
        onOpenContent={() => {
          if (!activeLaunch) return;
          setContentInstance(activeLaunch.instance);
          setActiveLaunch(null);
        }}
        onDiagnosisAction={(diagnosis) => {
          if (activeLaunch) {
            void handleDiagnosisAction(activeLaunch.instance, diagnosis);
          }
        }}
        onCopyReport={() => void copySupportReport()}
        onExportSupport={() => void exportSupportBundle()}
        supportExportBusy={supportExportBusy}
      />
      <ToastStack
        toasts={toasts}
        onDismiss={(id) =>
          setToasts((current) => current.filter((toast) => toast.id !== id))
        }
      />
      <MaintenancePill progress={maintenance} />
      </div>
    </MotionConfig>
  );
}
