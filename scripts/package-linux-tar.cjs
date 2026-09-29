const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const zlib = require("node:zlib");
const tar = require("tar-stream");
const { pipeline } = require("node:stream/promises");

const packageMetadata = require("../package.json");
const projectRoot = path.resolve(__dirname, "..");
const source = path.resolve(
  process.argv[2] || path.join(projectRoot, "release", "linux-unpacked"),
);
const output = path.resolve(
  process.argv[3] ||
    path.join(
      projectRoot,
      "release",
      `Scope-Launcher-${packageMetadata.version}-linux-${process.arch}.tar.gz`,
    ),
);
const sourceDateEpoch = Number.parseInt(
  process.env.SOURCE_DATE_EPOCH || "0",
  10,
);
const archiveTimestamp = new Date(
  Number.isFinite(sourceDateEpoch) && sourceDateEpoch > 0
    ? sourceDateEpoch * 1000
    : 0,
);

const executableModes = new Map([
  ["scope-launcher", 0o755],
  ["launch-scope.sh", 0o755],
  ["onyx-launcher", 0o755],
  ["launch-onyx.sh", 0o755],
  ["chrome_crashpad_handler", 0o755],
  ["chrome-sandbox", 0o4755],
]);

async function addDirectory(pack, absoluteDirectory, archiveDirectory) {
  const entries = await fsp.readdir(absoluteDirectory, { withFileTypes: true });
  entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

  for (const item of entries) {
    const absolutePath = path.join(absoluteDirectory, item.name);
    const archivePath = path.posix.join(archiveDirectory, item.name);

    if (item.isSymbolicLink()) {
      const linkname = await fsp.readlink(absolutePath);
      await new Promise((resolve, reject) => {
        pack.entry(
          {
            name: archivePath,
            type: "symlink",
            linkname,
            mode: 0o777,
            mtime: archiveTimestamp,
            uid: 0,
            gid: 0,
          },
          (error) => (error ? reject(error) : resolve()),
        );
      });
      continue;
    }

    const stats = await fsp.stat(absolutePath);
    if (item.isDirectory()) {
      await new Promise((resolve, reject) => {
        pack.entry(
          {
            name: `${archivePath}/`,
            type: "directory",
            mode: 0o755,
            mtime: archiveTimestamp,
            uid: 0,
            gid: 0,
          },
          (error) => (error ? reject(error) : resolve()),
        );
      });
      await addDirectory(pack, absolutePath, archivePath);
      continue;
    }

    const mode = executableModes.get(item.name) ?? 0o644;
    const entry = pack.entry({
      name: archivePath,
      size: stats.size,
      mode,
      mtime: archiveTimestamp,
      uid: 0,
      gid: 0,
    });
    await pipeline(fs.createReadStream(absolutePath), entry);
  }
}

async function main() {
  const stats = await fsp.stat(source);
  if (!stats.isDirectory()) throw new Error(`${source} is not a directory`);

  await fsp.mkdir(path.dirname(output), { recursive: true });
  const temporaryOutput = `${output}.tmp`;
  const pack = tar.pack();
  const archive = pipeline(
    pack,
    zlib.createGzip({ level: 9 }),
    fs.createWriteStream(temporaryOutput),
  );

  const rootName = path.basename(source).replace(/linux-unpacked$/i, "linux-x64");
  await new Promise((resolve, reject) => {
    pack.entry(
      {
        name: `${rootName}/`,
        type: "directory",
        mode: 0o755,
        mtime: archiveTimestamp,
        uid: 0,
        gid: 0,
      },
      (error) => (error ? reject(error) : resolve()),
    );
  });
  await addDirectory(pack, source, rootName);
  const launchScript = await fsp.readFile(
    path.join(__dirname, "launch-onyx-linux.sh"),
  );
  await new Promise((resolve, reject) => {
    pack.entry(
      {
        name: path.posix.join(rootName, "launch-onyx.sh"),
        size: launchScript.length,
        mode: 0o755,
        mtime: archiveTimestamp,
        uid: 0,
        gid: 0,
      },
      launchScript,
      (error) => (error ? reject(error) : resolve()),
    );
  });
  pack.finalize();
  await archive;
  await fsp.rename(temporaryOutput, output);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
