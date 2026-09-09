const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const hookPath = path.join(repoRoot, "src", "hooks", "useSearchFocus.ts");

const pages = {
  Library: {
    path: path.join(repoRoot, "src", "pages", "LibraryPage.tsx"),
    ref: "searchRef",
  },
  Discover: {
    path: path.join(repoRoot, "src", "pages", "DiscoverPage.tsx"),
    ref: "searchRef",
  },
  InstanceContent: {
    path: path.join(repoRoot, "src", "pages", "InstancePage.tsx"),
    ref: "contentSearchRef",
  },
};

function read(filePath) {
  assert.ok(fs.existsSync(filePath), `${filePath} must exist`);
  return fs.readFileSync(filePath, "utf8");
}

test("search-focus hook exists and listens for keydown with cleanup", () => {
  const hook = read(hookPath);
  assert.match(hook, /export function useSearchFocus/);
  assert.ok(hook.includes("useEffect"), "hook must use an effect");
  assert.ok(
    hook.includes('addEventListener("keydown"'),
    "hook must listen for keydown",
  );
  assert.ok(
    hook.includes('removeEventListener("keydown"'),
    "hook must remove the listener on cleanup",
  );
});

test("hook triggers on Ctrl+F (Windows/Linux) and Cmd+F (macOS)", () => {
  const hook = read(hookPath);
  assert.ok(hook.includes("ctrlKey"), "hook must handle Ctrl (Windows/Linux)");
  assert.ok(hook.includes("metaKey"), "hook must handle Cmd (macOS)");
  assert.ok(
    /event\.key\.toLowerCase\(\)\s*!==?\s*["']f["']|event\.key\s*===?\s*["']f["']/i.test(
      hook,
    ),
    "hook must match the F key",
  );
});

test("hook suppresses the browser find dialog and focuses with selection", () => {
  const hook = read(hookPath);
  assert.ok(
    hook.includes("preventDefault"),
    "hook must prevent the default browser find dialog",
  );
  assert.ok(hook.includes(".focus("), "hook must focus the search input");
  assert.ok(
    hook.includes(".select()"),
    "hook must select existing text in the input",
  );
});

test("hook does not break editing in other inputs or open modals", () => {
  const hook = read(hookPath);
  assert.ok(
    /TEXTAREA/.test(hook) && /INPUT/.test(hook),
    "hook must detect editable elements",
  );
  assert.ok(
    hook.includes(".modal") ||
      hook.includes('[role="dialog"]') ||
      hook.includes("dialog"),
    "hook must ignore keystrokes inside open modals",
  );
  assert.ok(
    hook.includes("searchRef") || hook.includes("search"),
    "hook must compare against its own search input",
  );
});

for (const [name, page] of Object.entries(pages)) {
  test(`${name} page wires the search shortcut to its search input`, () => {
    const source = read(page.path);
    assert.ok(
      source.includes("useSearchFocus"),
      `${name} must import useSearchFocus`,
    );
    assert.ok(
      source.includes(`useRef<HTMLInputElement>(null)`),
      `${name} must hold a ref to the search input`,
    );
    assert.ok(
      new RegExp(`ref=\\{${page.ref}\\}`).test(source),
      `${name} must attach the ref to the search input`,
    );
  });
}

test("Instance content shortcut targets the content-tab search only", () => {
  const source = read(pages.InstanceContent.path);
  assert.ok(
    source.includes('placeholder={t("instancePage.content.search")}'),
    "wired input must be the content-tab search field",
  );
});
