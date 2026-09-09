const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const enPath = path.join(repoRoot, "src", "locales", "en.ts");
const ruPath = path.join(repoRoot, "src", "locales", "ru.ts");
const i18nPath = path.join(repoRoot, "src", "i18n.tsx");
const typesPath = path.join(repoRoot, "src", "types.ts");
const mainPath = path.join(repoRoot, "electron", "main.cjs");
const settingsPagePath = path.join(
  repoRoot,
  "src",
  "pages",
  "SettingsPage.tsx",
);

function loadEn(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const start = text.indexOf("export const en =");
  assert.notEqual(start, -1, "en.ts must export const en");
  const brace = text.indexOf("{", start);
  const end = text.indexOf("} as const;", brace);
  assert.notEqual(end, -1, "en.ts must end with } as const;");
  const literal = text.slice(brace, end + 1);
  return eval(`(${literal})`);
}

function loadRu(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const start = text.indexOf("export const ru");
  assert.notEqual(start, -1, "ru.ts must export const ru");
  const brace = text.indexOf("{", start);
  const end = text.lastIndexOf("};");
  assert.notEqual(end, -1, "ru.ts must end with };");
  const literal = text.slice(brace, end + 1);
  return eval(`(${literal})`);
}

function interpolate(message, values) {
  if (!values) return message;
  return message.replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? String(values[key]) : match,
  );
}

function makeTranslate(en, ru) {
  const dictionaries = { en, ru };
  return (locale, key, values) => {
    const active = dictionaries[locale]?.[key];
    const fallback = en[key] ?? key;
    return interpolate(active ?? fallback, values);
  };
}

function placeholders(value) {
  const found = new Set();
  const pattern = /\{(\w+)\}/g;
  let match;
  while ((match = pattern.exec(value)) !== null) {
    found.add(match[1]);
  }
  return found;
}

test("locale dictionaries are modular files", () => {
  assert.ok(fs.existsSync(enPath), "src/locales/en.ts must exist");
  assert.ok(fs.existsSync(ruPath), "src/locales/ru.ts must exist");
});

test("Russian locale covers every English key", () => {
  const en = loadEn(enPath);
  const ru = loadRu(ruPath);
  const enKeys = Object.keys(en);
  assert.ok(enKeys.length > 100, "English dictionary should be substantial");
  const missing = enKeys.filter((key) => !(key in ru));
  assert.deepEqual(missing, [], `ru is missing ${missing.length} keys`);
});

test("Russian translations are non-empty", () => {
  const ru = loadRu(ruPath);
  const empty = Object.entries(ru)
    .filter(([, value]) => !String(value).trim())
    .map(([key]) => key);
  assert.deepEqual(empty, [], "ru must not contain empty translations");
});

test("Russian placeholders match English placeholders", () => {
  const en = loadEn(enPath);
  const ru = loadRu(ruPath);
  const mismatched = [];
  for (const key of Object.keys(en)) {
    const expected = placeholders(en[key]);
    const actual = placeholders(ru[key] ?? "");
    const same =
      expected.size === actual.size &&
      [...expected].every((name) => actual.has(name));
    if (!same) mismatched.push(key);
  }
  assert.deepEqual(
    mismatched,
    [],
    `placeholder mismatch in: ${mismatched.slice(0, 10).join(", ")}`,
  );
});

test("translate falls back to English when a ru key is missing", () => {
  const en = loadEn(enPath);
  const fullRu = loadRu(ruPath);
  const key = "settings.title";
  assert.ok(en[key], "fixture key must exist in en");
  assert.ok(fullRu[key], "fixture key must exist in ru for setup");

  const partialRu = { ...fullRu };
  delete partialRu[key];
  const translate = makeTranslate(en, partialRu);
  assert.equal(translate("ru", key), en[key]);
  assert.equal(translate("en", key), en[key]);
});

test("translate returns the key when missing in every locale", () => {
  const en = loadEn(enPath);
  const ru = loadRu(ruPath);
  const translate = makeTranslate(en, ru);
  assert.equal(translate("ru", "missing.key.that.does.not.exist"), "missing.key.that.does.not.exist");
  assert.equal(translate("en", "missing.key.that.does.not.exist"), "missing.key.that.does.not.exist");
});

test("translate interpolates values after fallback", () => {
  const en = loadEn(enPath);
  const ru = loadRu(ruPath);
  const translate = makeTranslate(en, ru);
  const withCount = translate("ru", "settings.folder.copied", { count: 3 });
  assert.ok(withCount.includes("3"), "interpolation must inject {count}");
  assert.doesNotMatch(withCount, /\{count\}/);
  const untouched = translate("ru", "settings.folder.copied", undefined);
  assert.ok(untouched.includes("{count}"));
});

test("Locale type includes English and Russian", () => {
  const types = fs.readFileSync(typesPath, "utf8");
  assert.match(types, /export type Locale/);
  assert.ok(types.includes('"ru"') || types.includes("'ru'"));
  const i18n = fs.readFileSync(i18nPath, "utf8");
  assert.match(i18n, /export type Locale/);
  assert.ok(
    i18n.includes("./types") && i18n.includes("BaseLocale"),
    "i18n Locale must derive from shared types",
  );
  assert.ok(
    i18n.includes("./locales/ru") || i18n.includes("from \"./locales"),
    "i18n must load the ru dictionary",
  );
});

test("i18n provider supports dynamic switching with English fallback", () => {
  const i18n = fs.readFileSync(i18nPath, "utf8");
  assert.ok(i18n.includes("useState"), "provider must hold locale state");
  assert.ok(i18n.includes("setLocale"), "provider must expose setLocale");
  assert.ok(
    i18n.includes("onyx.locale"),
    "provider must persist locale to localStorage",
  );
  assert.ok(
    i18n.includes("document.documentElement.lang"),
    "provider must update document language",
  );
  // Graceful fallback: active ?? en[key] (or equivalent || / ternary).
  assert.ok(
    /\?\?\s*en\[| \|\| en\[|en\[key\]/.test(i18n),
    "translate must fall back to English strings",
  );
});

test("language selection keys exist in both locales", () => {
  const en = loadEn(enPath);
  const ru = loadRu(ruPath);
  for (const key of [
    "settings.language",
    "settings.language.title",
    "settings.language.hint",
  ]) {
    assert.ok(en[key], `en must define ${key}`);
    assert.ok(ru[key], `ru must define ${key}`);
  }
});

test("settings page exposes an accessible language picker", () => {
  const page = fs.readFileSync(settingsPagePath, "utf8");
  assert.ok(page.includes("settings.language"), "picker must use i18n keys");
  assert.ok(page.includes('role="radiogroup"'), "picker must be a radiogroup");
  assert.ok(page.includes('role="radio"'), "options must be radios");
  assert.ok(page.includes("aria-checked"), "picker must expose checked state");
  assert.ok(page.includes("changeLanguage"), "picker must switch language");
  assert.ok(page.includes("setLocale"), "picker must update active locale");
});

test("main process persists the selected language", () => {
  const main = fs.readFileSync(mainPath, "utf8");
  assert.ok(
    main.includes('"ru"') || main.includes("'ru'"),
    "main must recognise the ru locale",
  );
  assert.doesNotMatch(
    main,
    /output\.language\s*=\s*["']en["']/,
    "main must not force every language to en",
  );
  assert.ok(
    main.includes('input.language === "en"') ||
      main.includes("input.language === 'en'"),
    "main must accept the persisted language in settings patches",
  );
  assert.ok(
    main.includes('state.settings.language !== "en"') ||
      main.includes("state.settings.language !== 'en'"),
    "main must validate persisted language with an en fallback",
  );
});
