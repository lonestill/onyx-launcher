const os = require("node:os");
const { requiredJavaForMinecraft } = require("./preflight.cjs");

const GIB = 1024 ** 3;

function recommendInstanceResources({
  instance,
  totalMemory = os.totalmem(),
}) {
  const totalGiB = Math.max(2, Math.floor(totalMemory / GIB));
  const safeMaximumGiB = Math.max(2, Math.min(32, totalGiB - 3));
  const loader = String(instance?.loader || "Vanilla").toLowerCase();
  const modCount = Math.max(0, Number(instance?.modCount) || 0);
  const modded = !loader.includes("vanilla") && loader !== "";
  let target = 4;
  let tier = "vanilla";
  if (modded && modCount <= 35) {
    target = 4;
    tier = "light";
  } else if (modded && modCount <= 120) {
    target = 6;
    tier = "medium";
  } else if (modded && modCount <= 220) {
    target = 8;
    tier = "heavy";
  } else if (modded) {
    target = 10;
    tier = "extreme";
  }
  if (totalGiB <= 8) target = Math.min(target, 4);
  if (totalGiB <= 6) target = Math.min(target, 3);
  const memoryGiB = Math.max(2, Math.min(target, safeMaximumGiB));
  return {
    memoryGiB,
    safeMaximumGiB,
    totalMemoryGiB: totalGiB,
    javaMajor:
      instance?.javaMajor ||
      requiredJavaForMinecraft(instance?.version || "1.21"),
    tier,
    modCount,
  };
}

function generateOptimizedJvmFlags({
  memoryGiB = 4,
  javaMajor = 17,
  cpuCores = os.cpus()?.length || 4,
  enableZgcIfAvailable = true,
} = {}) {
  const flags = [];
  const cores = Math.max(1, cpuCores);

  // Java 21+ with 4GB+ heap benefits from Generational ZGC (sub-millisecond pause times)
  if (javaMajor >= 21 && memoryGiB >= 4 && enableZgcIfAvailable) {
    flags.push(
      "-XX:+UseZGC",
      "-XX:+ZGenerational",
      "-XX:+UseStringDeduplication",
    );
  } else {
    // Tuned G1GC flags for Java 17 and constrained environments
    const parallelThreads = Math.max(1, Math.min(cores, 8));
    const concThreads = Math.max(1, Math.floor(cores / 4));
    flags.push(
      "-XX:+UseG1GC",
      "-XX:G1ReservePercent=15",
      "-XX:G1HeapRegionSize=32m",
      "-XX:MaxGCPauseMillis=30",
      `-XX:ParallelGCThreads=${parallelThreads}`,
      `-XX:ConcGCThreads=${concThreads}`,
      "-XX:+UseStringDeduplication",
    );
  }

  return flags;
}

module.exports = {
  GIB,
  recommendInstanceResources,
  generateOptimizedJvmFlags,
};
