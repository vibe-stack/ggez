import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { availableParallelism } from "node:os";

const rootDir = resolve(import.meta.dirname, "..");
const packagesDir = resolve(rootDir, "packages");

const command = process.argv[2] ?? "build";
const dryRun = process.argv.includes("--dry-run");
const concurrency = parseConcurrency();
const filters = readOptions("--filter");

const allPackages = loadPackages();
const packages = filters.length > 0 ? filterPackages(allPackages, filters) : allPackages;
const orderedPackages = sortPackages(packages);
const packageVersions = new Map(allPackages.map((pkg) => [pkg.name, pkg.version]));

await main();

async function main() {
  switch (command) {
    case "build": {
      if (filters.length > 0) {
        process.stdout.write(`Filtered to ${orderedPackages.length} packages: ${orderedPackages.map((pkg) => pkg.name).join(", ")}.\n`);
      }

      process.stdout.write(`Building ${orderedPackages.length} packages with concurrency ${concurrency}.\n`);
      await runConcurrently(orderedPackages, concurrency, (pkg) =>
        runCommand("bun", ["run", "--cwd", pkg.dir, "build"], rootDir, pkg.name)
      );
      break;
    }
    case "publish": {
      const publishCandidates = dryRun ? orderedPackages : orderedPackages.filter((pkg) => !isVersionPublished(pkg));
      const publishBatches = groupPackagesForPublish(publishCandidates);

      if (filters.length > 0) {
        process.stdout.write(`Filtered to ${orderedPackages.length} packages: ${orderedPackages.map((pkg) => pkg.name).join(", ")}.\n`);
      }

      if (publishCandidates.length === 0) {
        process.stdout.write("No packages need publishing.\n");
        break;
      }

      process.stdout.write(`Building ${publishCandidates.length} packages with concurrency ${concurrency}.\n`);
      await runConcurrently(publishCandidates, concurrency, (pkg) =>
        runCommand("bun", ["run", "--cwd", pkg.dir, "build"], rootDir, pkg.name)
      );

      for (const [index, batch] of publishBatches.entries()) {
        process.stdout.write(
          `Publishing batch ${index + 1}/${publishBatches.length} (${batch.length} packages) with concurrency ${concurrency}.\n`
        );

        const toPublish = [];

        for (const pkg of batch) {
          toPublish.push(pkg);
        }

        await runConcurrently(toPublish, concurrency, (pkg) => {
          const args = ["publish", "--ignore-scripts"];

          if (dryRun) {
            args.push("--dry-run");
          }

          if (pkg.name.startsWith("@")) {
            args.push("--access", "public");
          }

          return withPublishManifest(pkg, packageVersions, () => runPublish(pkg, args, pkg.dir));
        });

        if (!dryRun) {
          await runConcurrently(toPublish, concurrency, (pkg) => waitUntilVersionPublished(pkg));
        }
      }
      break;
    }
    default:
      throw new Error(`Unsupported command: ${command}`);
  }
}

function isVersionPublished(pkg) {
  const result = spawnSync("npm", ["view", pkg.name, "version"], {
    cwd: pkg.dir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });

  if (result.status !== 0) {
    return false;
  }

  return result.stdout.trim() === pkg.version;
}

function loadPackages() {
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = join(packagesDir, entry.name);
      const manifestPath = join(dir, "package.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

      return {
        dependencies: collectInternalDependencies(manifest),
        dir,
        manifestPath,
        name: manifest.name,
        version: manifest.version
      };
    });
}

function filterPackages(packagesToFilter, filterValues) {
  const normalizedFilters = new Set(filterValues);
  const filteredPackages = packagesToFilter.filter((pkg) => {
    const directoryName = pkg.dir.split("/").pop();
    return normalizedFilters.has(pkg.name) || normalizedFilters.has(directoryName);
  });

  if (filteredPackages.length === 0) {
    throw new Error(`No packages matched --filter ${filterValues.join(", ")}`);
  }

  return filteredPackages;
}

function collectInternalDependencies(manifest) {
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {})
  ].filter((dependencyName) => dependencyName === "create-ggez" || dependencyName.startsWith("@ggez/"));
}

function sortPackages(packagesToSort) {
  const packageMap = new Map(packagesToSort.map((pkg) => [pkg.name, pkg]));
  const visited = new Set();
  const visiting = new Set();
  const ordered = [];

  for (const pkg of packagesToSort) {
    visit(pkg);
  }

  return ordered;

  function visit(pkg) {
    if (visited.has(pkg.name)) {
      return;
    }

    if (visiting.has(pkg.name)) {
      throw new Error(`Circular package dependency detected at ${pkg.name}`);
    }

    visiting.add(pkg.name);

    for (const dependencyName of pkg.dependencies) {
      const dependencyPackage = packageMap.get(dependencyName);

      if (dependencyPackage) {
        visit(dependencyPackage);
      }
    }

    visiting.delete(pkg.name);
    visited.add(pkg.name);
    ordered.push(pkg);
  }
}

function groupPackagesForPublish(packagesToGroup) {
  const packageMap = new Map(packagesToGroup.map((pkg) => [pkg.name, pkg]));
  const depthByName = new Map();

  const resolveDepth = (pkg) => {
    if (depthByName.has(pkg.name)) {
      return depthByName.get(pkg.name);
    }

    const depth =
      pkg.dependencies.length === 0
        ? 0
        : Math.max(
            ...pkg.dependencies.map((dependencyName) => {
              const dependency = packageMap.get(dependencyName);
              return dependency ? resolveDepth(dependency) + 1 : 0;
            })
          );

    depthByName.set(pkg.name, depth);
    return depth;
  };

  for (const pkg of packagesToGroup) {
    resolveDepth(pkg);
  }

  const batches = [];

  for (const pkg of packagesToGroup) {
    const depth = depthByName.get(pkg.name);

    if (!batches[depth]) {
      batches[depth] = [];
    }

    batches[depth].push(pkg);
  }

  return batches.filter(Boolean);
}

async function runConcurrently(items, limit, worker) {
  if (items.length === 0) {
    return [];
  }

  const results = new Array(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = nextIndex++;

      if (index >= items.length) {
        return;
      }

      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

async function runCommand(binary, args, cwd, label) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(binary, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });

    pipeOutput(child.stdout, process.stdout, label);
    pipeOutput(child.stderr, process.stderr, label);

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`${label}: ${binary} ${args.join(" ")} exited with code ${code ?? 1}`));
    });
  });
}

async function runPublish(pkg, args, cwd) {
  try {
    await runCommand("npm", args, cwd, pkg.name);
  } catch (error) {
    if (pkg.name.startsWith("@")) {
      const scope = pkg.name.slice(1).split("/")[0];
      process.stderr.write(
        [
          "",
          `Publish failed for ${pkg.name}.`,
          `If npm reported E404 while publishing ${pkg.name}, the @${scope} scope usually is not one your npm user/token can publish to.`,
          `Verify with: npm whoami`,
          `Then confirm that you own the ${scope} npm scope or are a member of the ${scope} org with publish rights.`
        ].join("\n")
      );
      process.stderr.write("\n");
    }

    throw error;
  }
}

function withPublishManifest(pkg, packageVersions, callback) {
  const originalManifestText = readFileSync(pkg.manifestPath, "utf8");
  const manifest = JSON.parse(originalManifestText);
  const rewrittenManifest = rewriteWorkspaceProtocols(manifest, packageVersions);
  const nextManifestText = `${JSON.stringify(rewrittenManifest, null, 2)}\n`;

  if (nextManifestText === originalManifestText) {
    return callback();
  }

  writeFileSync(pkg.manifestPath, nextManifestText);

  try {
    return callback();
  } finally {
    writeFileSync(pkg.manifestPath, originalManifestText);
  }
}

function rewriteWorkspaceProtocols(manifest, packageVersions) {
  const nextManifest = structuredClone(manifest);

  for (const sectionName of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    const section = nextManifest[sectionName];

    if (!section) {
      continue;
    }

    for (const [dependencyName, dependencyVersion] of Object.entries(section)) {
      if (!dependencyVersion.startsWith("workspace:")) {
        continue;
      }

      const publishedVersion = packageVersions.get(dependencyName);

      if (!publishedVersion) {
        throw new Error(`Missing version for internal dependency ${dependencyName} in ${manifest.name}`);
      }

      section[dependencyName] = publishedVersion;
    }
  }

  return nextManifest;
}

async function waitUntilVersionPublished(pkg) {
  const maxAttempts = 10;
  const delayMs = 1500;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (isSpecificVersionPublished(pkg)) {
      return;
    }

    if (attempt < maxAttempts) {
      process.stdout.write(`Waiting for ${pkg.name}@${pkg.version} to appear in the registry.\n`);
      await delay(delayMs);
    }
  }

  throw new Error(`Timed out waiting for ${pkg.name}@${pkg.version} to appear in the registry.`);
}

function isSpecificVersionPublished(pkg) {
  const result = spawnSync("npm", ["view", `${pkg.name}@${pkg.version}`, "version"], {
    cwd: pkg.dir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });

  if (result.status !== 0) {
    return false;
  }

  return result.stdout.trim() === pkg.version;
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function parseConcurrency() {
  const flagValue = readOption("--concurrency");
  const rawValue = flagValue ?? process.env.RELEASE_CONCURRENCY;
  const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;

  if (Number.isFinite(parsedValue) && parsedValue > 0) {
    return parsedValue;
  }

  return Math.min(Math.max(availableParallelism(), 1), 6);
}

function readOption(name) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function readOptions(name) {
  const values = [];

  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
    }
  }

  return values;
}

function pipeOutput(stream, target, label) {
  if (!stream) {
    return;
  }

  let buffered = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffered += chunk;
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? "";

    for (const line of lines) {
      target.write(`[${label}] ${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buffered.length > 0) {
      target.write(`[${label}] ${buffered}\n`);
    }
  });
}
