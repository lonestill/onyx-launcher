const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const {
  listScreenshots,
  resolveScreenshotPath,
  readScreenshotBase64,
  deleteScreenshot,
} = require("../electron/services/screenshots.cjs");

test("screenshots service: returns empty array if folder does not exist", async () => {
  const tmpRoot = path.join(os.tmpdir(), `onyx-test-${Date.now()}`);
  await fsp.mkdir(tmpRoot, { recursive: true });

  try {
    const list = await listScreenshots(tmpRoot, "test-instance");
    assert.deepEqual(list, []);
  } finally {
    await fsp.rm(tmpRoot, { recursive: true, force: true });
  }
});

test("screenshots service: lists and filters image files, sorted newest first", async () => {
  const tmpRoot = path.join(os.tmpdir(), `onyx-test-${Date.now()}`);
  const screenshotsDir = path.join(tmpRoot, "my-pack", "screenshots");
  await fsp.mkdir(screenshotsDir, { recursive: true });

  try {
    const oldFile = path.join(screenshotsDir, "old.png");
    const newFile = path.join(screenshotsDir, "new.jpg");
    const textFile = path.join(screenshotsDir, "notes.txt");

    await fsp.writeFile(oldFile, "old-content");
    await fsp.writeFile(newFile, "new-content");
    await fsp.writeFile(textFile, "ignored");

    // Adjust mtime
    const oldTime = new Date(Date.now() - 100000);
    const newTime = new Date();
    await fsp.utimes(oldFile, oldTime, oldTime);
    await fsp.utimes(newFile, newTime, newTime);

    const list = await listScreenshots(tmpRoot, "my-pack");
    assert.equal(list.length, 2);
    assert.equal(list[0].name, "new.jpg");
    assert.equal(list[1].name, "old.png");
    assert.equal(list[0].size, "new-content".length);
  } finally {
    await fsp.rm(tmpRoot, { recursive: true, force: true });
  }
});

test("screenshots service: resolveScreenshotPath blocks path traversal attacks", () => {
  const tmpRoot = "/tmp/onyx";
  assert.throws(() => {
    resolveScreenshotPath(tmpRoot, "instance-1", "../secret.txt");
  }, /Invalid screenshot file name/);

  assert.throws(() => {
    resolveScreenshotPath(tmpRoot, "instance-1", "../../etc/passwd");
  }, /Invalid screenshot file name/);

  assert.throws(() => {
    resolveScreenshotPath(tmpRoot, "instance-1", "sub/folder.png");
  }, /Invalid screenshot file name/);

  assert.throws(() => {
    resolveScreenshotPath(tmpRoot, "instance-1", "bad.exe");
  }, /Unsupported screenshot format/);
});

test("screenshots service: readScreenshotBase64 returns proper data URL", async () => {
  const tmpRoot = path.join(os.tmpdir(), `onyx-test-${Date.now()}`);
  const screenshotsDir = path.join(tmpRoot, "inst", "screenshots");
  await fsp.mkdir(screenshotsDir, { recursive: true });

  try {
    const filePath = path.join(screenshotsDir, "test.png");
    const sampleBuffer = Buffer.from("fake-png-data");
    await fsp.writeFile(filePath, sampleBuffer);

    const dataUrl = await readScreenshotBase64(tmpRoot, "inst", "test.png");
    assert.ok(dataUrl.startsWith("data:image/png;base64,"));
    assert.equal(
      dataUrl,
      `data:image/png;base64,${sampleBuffer.toString("base64")}`
    );
  } finally {
    await fsp.rm(tmpRoot, { recursive: true, force: true });
  }
});

test("screenshots service: deleteScreenshot deletes file on fallback", async () => {
  const tmpRoot = path.join(os.tmpdir(), `onyx-test-${Date.now()}`);
  const screenshotsDir = path.join(tmpRoot, "inst", "screenshots");
  await fsp.mkdir(screenshotsDir, { recursive: true });

  try {
    const filePath = path.join(screenshotsDir, "to-delete.png");
    await fsp.writeFile(filePath, "delete-me");
    assert.ok(fs.existsSync(filePath));

    await deleteScreenshot(tmpRoot, "inst", "to-delete.png", null);
    assert.ok(!fs.existsSync(filePath));
  } finally {
    await fsp.rm(tmpRoot, { recursive: true, force: true });
  }
});
