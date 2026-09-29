const crypto = require("node:crypto");

const SCOPE_HUB_URL =
  process.env.SCOPE_HUB_URL ||
  process.env.ONYX_HUB_URL ||
  "https://scope-hub.vercel.app/api/v1/telemetry";
const ONYX_HUB_URL = SCOPE_HUB_URL;
const DEFAULT_TIMEOUT_MS = 4000;

class TelemetryService {
  constructor(options = {}) {
    this.captureUrl = options.captureUrl || SCOPE_HUB_URL;
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  }

  ensureAnonymousId(existingId) {
    if (typeof existingId === "string" && existingId.trim().length > 0) {
      return existingId.trim();
    }
    return crypto.randomUUID();
  }

  async track(distinctId, event, properties = {}, { enabled = true } = {}) {
    if (!enabled) {
      return { skipped: true, reason: "opt_out" };
    }

    const id = String(distinctId || "").trim();
    if (!id) {
      return { skipped: true, reason: "missing_distinct_id" };
    }

    if (typeof this.fetchFn !== "function") {
      return { skipped: true, reason: "fetch_unavailable" };
    }

    const payload = {
      api_key: this.apiKey,
      event: String(event || "unknown_event"),
      distinct_id: id,
      properties: {
        $lib: "onyx-telemetry",
        timestamp: new Date().toISOString(),
        ...properties,
      },
    };

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), this.timeoutMs)
      : null;

    try {
      const response = await this.fetchFn(this.captureUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });

      if (!response.ok) {
        return { success: false, status: response.status };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  async trackAppLaunch({ distinctId, enabled = true, version, os, arch, locale, isPackaged } = {}) {
    const rawOs = os || process.platform;
    const platformName =
      rawOs === "win32" ? "Windows" : rawOs === "darwin" ? "macOS" : "Linux";

    const baseProps = {
      launcher_version: version || "unknown",
      platform: rawOs,
      arch: arch || process.arch,
      locale: locale || "unknown",
      is_packaged: Boolean(isPackaged),
      $os: platformName,
      $browser: "Scope Launcher",
      $device_type: "Desktop",
    };

    const launchPromise = this.track(distinctId, "app_launch", baseProps, { enabled });
    const pageviewPromise = this.track(
      distinctId,
      "$pageview",
      {
        ...baseProps,
        $current_url: `https://scope-launcher.app/v${version || "2.0.3"}`,
        $host: "scope-launcher.app",
        $pathname: `/v${version || "2.0.3"}`,
      },
      { enabled },
    );

    const [launchRes] = await Promise.all([launchPromise, pageviewPromise]);
    return launchRes;
  }

  trackGameLaunch({ distinctId, enabled = true, instanceId, minecraftVersion, loader } = {}) {
    return this.track(
      distinctId,
      "game_launch",
      {
        instance_id: instanceId || "unknown",
        minecraft_version: minecraftVersion || "unknown",
        loader_type: loader || "Vanilla",
        $device_type: "Desktop",
      },
      { enabled },
    );
  }

  trackGameSession({
    distinctId,
    enabled = true,
    instanceName,
    minecraftVersion,
    loader,
    durationMinutes,
    exitCode,
    avgFps,
    modCount,
  } = {}) {
    return this.track(
      distinctId,
      "game_session",
      {
        instance_name: instanceName || "Minecraft",
        minecraft_version: minecraftVersion || "unknown",
        loader: loader || "Vanilla",
        duration_minutes: Math.max(1, Number(durationMinutes || 1)),
        exit_code: typeof exitCode === "number" ? exitCode : null,
        avg_fps: typeof avgFps === "number" ? avgFps : null,
        mod_count: Number(modCount || 0),
        $device_type: "Desktop",
      },
      { enabled },
    );
  }
}

module.exports = {
  TelemetryService,
  ONYX_HUB_URL,
  POSTHOG_API_KEY: "",
  POSTHOG_CAPTURE_URL: ONYX_HUB_URL,
};
