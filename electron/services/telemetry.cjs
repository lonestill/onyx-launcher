const crypto = require("node:crypto");

const POSTHOG_API_KEY = "phc_mFU3DreV8wP9q2CrXFdm8T2FxVCX8rwb5fp9DWpGSvzN";
const POSTHOG_CAPTURE_URL = "https://us.i.posthog.com/capture/";
const DEFAULT_TIMEOUT_MS = 4000;

class TelemetryService {
  constructor(options = {}) {
    this.apiKey = options.apiKey || POSTHOG_API_KEY;
    this.captureUrl = options.captureUrl || POSTHOG_CAPTURE_URL;
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
      $browser: "Onyx Launcher",
      $device_type: "Desktop",
    };

    const launchPromise = this.track(distinctId, "app_launch", baseProps, { enabled });
    const pageviewPromise = this.track(
      distinctId,
      "$pageview",
      {
        ...baseProps,
        $current_url: `https://onyx-launcher.app/v${version || "1.6.9"}`,
        $host: "onyx-launcher.app",
        $pathname: `/v${version || "1.6.9"}`,
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
}

module.exports = {
  TelemetryService,
  POSTHOG_API_KEY,
  POSTHOG_CAPTURE_URL,
};
