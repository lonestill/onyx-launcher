import type { TranslationKey } from "./i18n";
import type { GameInstance, LogDiagnosis } from "./types";

type Translate = (key: TranslationKey) => string;

const DIAGNOSIS_KEYS: Record<
  string,
  { title: TranslationKey; message: TranslationKey }
> = {
  "out-of-memory": {
    title: "diagnosis.outOfMemory.title",
    message: "diagnosis.outOfMemory.message",
  },
  "wrong-java": {
    title: "diagnosis.wrongJava.title",
    message: "diagnosis.wrongJava.message",
  },
  "missing-dependency": {
    title: "diagnosis.missingDependency.title",
    message: "diagnosis.missingDependency.message",
  },
  "mixin-conflict": {
    title: "diagnosis.mixinConflict.title",
    message: "diagnosis.mixinConflict.message",
  },
  "native-crash": {
    title: "diagnosis.nativeCrash.title",
    message: "diagnosis.nativeCrash.message",
  },
  "disk-full": {
    title: "diagnosis.diskFull.title",
    message: "diagnosis.diskFull.message",
  },
  authentication: {
    title: "diagnosis.authentication.title",
    message: "diagnosis.authentication.message",
  },
  "corrupted-file": {
    title: "diagnosis.corruptedFile.title",
    message: "diagnosis.corruptedFile.message",
  },
  "bad-jvm-arguments": {
    title: "diagnosis.badJvmArguments.title",
    message: "diagnosis.badJvmArguments.message",
  },
  "graphics-init": {
    title: "diagnosis.graphicsInit.title",
    message: "diagnosis.graphicsInit.message",
  },
  "permission-denied": {
    title: "diagnosis.permissionDenied.title",
    message: "diagnosis.permissionDenied.message",
  },
  "recent-mod-changes": {
    title: "diagnosis.recentMods.title",
    message: "diagnosis.recentMods.message",
  },
};

export function localizeDiagnosis(
  diagnosis: LogDiagnosis,
  t: Translate,
): LogDiagnosis {
  const keys = DIAGNOSIS_KEYS[diagnosis.code];
  if (!keys) return diagnosis;
  return {
    ...diagnosis,
    title: t(keys.title),
    message: t(keys.message),
  };
}

export function sanitizeSupportLog(content: string) {
  return String(content || "")
    .replace(
      /(--accessToken(?:=|\s+))(?:"[^"]*"|\S+)/gi,
      "$1<redacted>",
    )
    .replace(
      /("(?:access_token|refresh_token|client_secret)"\s*:\s*)"[^"]*"/gi,
      '$1"<redacted>"',
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <redacted>")
    .replace(/[A-Za-z]:\\Users\\[^\\\s]+/gi, "C:\\Users\\<user>")
    .replace(/\/home\/[^/\s]+/g, "/home/<user>")
    .replace(/([?&](?:code|token|access_token)=)[^&\s]+/gi, "$1<redacted>")
    .slice(-24_000);
}

export function buildSupportReport({
  instance,
  diagnosis,
  logs,
}: {
  instance: GameInstance;
  diagnosis?: LogDiagnosis;
  logs: string;
}) {
  const lines = [
    "Scope Launcher support report",
    `Instance: ${instance.name} (${instance.id})`,
    `Minecraft: ${instance.version}`,
    `Loader: ${instance.loader}`,
    `Exit code: ${instance.lastExitCode ?? "unknown"}`,
  ];
  if (diagnosis) {
    lines.push(
      `Diagnosis: ${diagnosis.title}`,
      diagnosis.message,
    );
    if (diagnosis.suspects?.length) {
      lines.push(`Suspects: ${diagnosis.suspects.join(", ")}`);
    }
  }
  lines.push("", "Log tail:", sanitizeSupportLog(logs));
  return lines.join("\n");
}
