const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("onyx", {
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  },
  state: {
    get: () => ipcRenderer.invoke("state:get"),
    updateSettings: (settings) =>
      ipcRenderer.invoke("state:update-settings", settings),
    moveGameDirectory: (path) =>
      ipcRenderer.invoke("state:move-game-directory", path),
    createInstance: (instance) =>
      ipcRenderer.invoke("instance:create", instance),
    deleteInstance: (id) => ipcRenderer.invoke("instance:delete", id),
    toggleFavorite: (id) => ipcRenderer.invoke("instance:favorite", id),
    updateInstance: (id, patch) =>
      ipcRenderer.invoke("instance:update", id, patch),
    duplicateInstance: (id) => ipcRenderer.invoke("instance:duplicate", id),
    openInstanceFolder: (id) =>
      ipcRenderer.invoke("instance:open-folder", id),
    listScreenshots: (id) =>
      ipcRenderer.invoke("instance:screenshots-list", id),
    readScreenshot: (id, fileName) =>
      ipcRenderer.invoke("instance:screenshot-read", id, fileName),
    copyScreenshot: (id, fileName) =>
      ipcRenderer.invoke("instance:screenshot-copy", id, fileName),
    showScreenshot: (id, fileName) =>
      ipcRenderer.invoke("instance:screenshot-show", id, fileName),
    deleteScreenshot: (id, fileName) =>
      ipcRenderer.invoke("instance:screenshot-delete", id, fileName),
    analyzeInstanceStorage: (id, force) =>
      ipcRenderer.invoke("instance:storage-analyze", id, force),
    cleanupInstanceStorage: (id) =>
      ipcRenderer.invoke("instance:storage-cleanup", id),
    listContent: (id, kind) =>
      ipcRenderer.invoke("instance:list-content", id, kind),
    checkContentUpdates: (id) =>
      ipcRenderer.invoke("instance:check-content-updates", id),
    updateContent: (id, path) =>
      ipcRenderer.invoke("instance:update-content", id, path),
    listContentHistory: (id) =>
      ipcRenderer.invoke("instance:list-content-history", id),
    listModProfiles: (id) =>
      ipcRenderer.invoke("instance:mod-profiles-list", id),
    saveModProfile: (id, name, profileId) =>
      ipcRenderer.invoke("instance:mod-profile-save", id, name, profileId),
    applyModProfile: (id, profileId) =>
      ipcRenderer.invoke("instance:mod-profile-apply", id, profileId),
    deleteModProfile: (id, profileId) =>
      ipcRenderer.invoke("instance:mod-profile-delete", id, profileId),
    rollbackContent: (id, transactionId) =>
      ipcRenderer.invoke("instance:rollback-content", id, transactionId),
    disableSuspects: (id, names) =>
      ipcRenderer.invoke("instance:disable-suspects", id, names),
    getBisect: (id) => ipcRenderer.invoke("instance:bisect-get", id),
    startBisect: (id, names) =>
      ipcRenderer.invoke("instance:bisect-start", id, names),
    reportBisect: (id, gameStarted) =>
      ipcRenderer.invoke("instance:bisect-report", id, gameStarted),
    cancelBisect: (id) => ipcRenderer.invoke("instance:bisect-cancel", id),
    finishBisect: (id, disableCulprit) =>
      ipcRenderer.invoke("instance:bisect-finish", id, disableCulprit),
    listWorldSnapshots: (id) =>
      ipcRenderer.invoke("instance:world-snapshots", id),
    createWorldSnapshot: (id) =>
      ipcRenderer.invoke("instance:world-snapshot-create", id),
    restoreWorldSnapshot: (id, snapshotId) =>
      ipcRenderer.invoke("instance:world-snapshot-restore", id, snapshotId),
    toggleContent: (path) =>
      ipcRenderer.invoke("instance:toggle-content", path),
    deleteContent: (path) =>
      ipcRenderer.invoke("instance:delete-content", path),
    repairInstance: (id) => ipcRenderer.invoke("instance:repair", id),
    checkUpdates: () => ipcRenderer.invoke("instance:check-updates"),
    previewPackUpdate: (id) =>
      ipcRenderer.invoke("instance:update-preview", id),
    updatePack: (id) => ipcRenderer.invoke("instance:update-pack", id),
    backupInstance: (id) => ipcRenderer.invoke("instance:backup", id),
    importBackup: () => ipcRenderer.invoke("instance:import-backup"),
    exportSyncProfile: (id) =>
      ipcRenderer.invoke("instance:sync-export", id),
    importSyncProfile: () => ipcRenderer.invoke("instance:sync-import"),
  },
  system: {
    chooseDirectory: () => ipcRenderer.invoke("system:choose-directory"),
    chooseJava: () => ipcRenderer.invoke("system:choose-java"),
    openPath: (path) => ipcRenderer.invoke("system:open-path", path),
    javaStatus: () => ipcRenderer.invoke("system:java-status"),
    recommendInstance: (id) =>
      ipcRenderer.invoke("system:recommend-instance", id),
    fpsRecorderStatus: () =>
      ipcRenderer.invoke("system:fps-recorder-status"),
    serverStatus: (address) =>
      ipcRenderer.invoke("system:server-status", address),
    diagnostics: () => ipcRenderer.invoke("system:diagnostics"),
    exportDiagnostics: () => ipcRenderer.invoke("system:export-diagnostics"),
    clearCache: () => ipcRenderer.invoke("system:clear-cache"),
  },
  auth: {
    start: () => ipcRenderer.invoke("auth:start"),
    wait: (sessionId) => ipcRenderer.invoke("auth:wait", sessionId),
    cancel: (sessionId) => ipcRenderer.invoke("auth:cancel", sessionId),
    signOut: () => ipcRenderer.invoke("auth:sign-out"),
    list: () => ipcRenderer.invoke("auth:list"),
    refreshProfile: (accountId) =>
      ipcRenderer.invoke("auth:profile-refresh", accountId),
    addOffline: (name) => ipcRenderer.invoke("auth:offline-add", name),
    chooseSkin: (accountId, variant) =>
      ipcRenderer.invoke("auth:skin-select", accountId, variant),
    switch: (accountId) => ipcRenderer.invoke("auth:switch", accountId),
    remove: (accountId) => ipcRenderer.invoke("auth:remove", accountId),
  },
  minecraft: {
    versions: () => ipcRenderer.invoke("minecraft:versions"),
  },
  catalog: {
    picks: () => ipcRenderer.invoke("catalog:picks"),
    search: (query, projectType, options) =>
      ipcRenderer.invoke("catalog:search", query, projectType, options),
    install: (project, targetInstanceId) =>
      ipcRenderer.invoke("catalog:install", project, targetInstanceId),
    importPack: () => ipcRenderer.invoke("catalog:import-pack"),
    cancel: (taskId) => ipcRenderer.invoke("catalog:cancel", taskId),
    clearHistory: () => ipcRenderer.invoke("catalog:clear-history"),
  },
  launcher: {
    preflight: (instanceId) =>
      ipcRenderer.invoke("launcher:preflight", instanceId),
    play: (instanceId) => ipcRenderer.invoke("launcher:play", instanceId),
    stop: (instanceId) => ipcRenderer.invoke("launcher:stop", instanceId),
    getLog: (instanceId) => ipcRenderer.invoke("launcher:get-log", instanceId),
    exportSupportBundle: (instanceId) =>
      ipcRenderer.invoke("launcher:export-support-bundle", instanceId),
  },
  onDownloadProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("download:progress", listener);
    return () => ipcRenderer.removeListener("download:progress", listener);
  },
  onWindowMaximized: (callback) => {
    const listener = (_event, maximized) => callback(maximized);
    ipcRenderer.on("window:maximized", listener);
    return () => ipcRenderer.removeListener("window:maximized", listener);
  },
  onInstanceUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("instance:updated", listener);
    return () => ipcRenderer.removeListener("instance:updated", listener);
  },
  onSessionRecorded: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("session:recorded", listener);
    return () => ipcRenderer.removeListener("session:recorded", listener);
  },
  onLauncherProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("launcher:progress", listener);
    return () => ipcRenderer.removeListener("launcher:progress", listener);
  },
  onLauncherLog: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("launcher:log", listener);
    return () => ipcRenderer.removeListener("launcher:log", listener);
  },
  onAuthStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("auth:status", listener);
    return () => ipcRenderer.removeListener("auth:status", listener);
  },
  onAuthChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("auth:changed", listener);
    return () => ipcRenderer.removeListener("auth:changed", listener);
  },
  onContentUpdateProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("content:update-progress", listener);
    return () =>
      ipcRenderer.removeListener("content:update-progress", listener);
  },
  onMaintenanceProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("maintenance:progress", listener);
    return () => ipcRenderer.removeListener("maintenance:progress", listener);
  },
});
