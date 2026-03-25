import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = resolve(import.meta.dirname, "..");
const packagesDir = resolve(rootDir, "packages");

const command = process.argv[2] ?? "build";
const dryRun = process.argv.includes("--dry-run");

const packages = loadPackages();
const orderedPackages = sortPackages(packages);
const packageVersions = new Map(packages.map((pkg) => [pkg.name, pkg.version]));

switch (command) {
  case "build": {
    for (const pkg of orderedPackages) {
      run("bun", ["run", "--cwd", pkg.dir, "build"], rootDir);
    }
    break;
  }
  case "publish": {
    for (const pkg of orderedPackages) {
      run("bun", ["run", "--cwd", pkg.dir, "build"], rootDir);
    }

    for (const pkg of orderedPackages) {
      if (!dryRun && isVersionPublished(pkg)) {
        process.stdout.write(`Skipping ${pkg.name}@${pkg.version}; version is already published.\n`);
        continue;
      }

      const args = ["publish"];

      if (dryRun) {
        args.push("--dry-run");
      }

      if (pkg.name.startsWith("@")) {
        args.push("--access", "public");
      }

      withPublishManifest(pkg, packageVersions, () => {
        runPublish(pkg, args, pkg.dir);
      });
    }
    break;
  }
  default:
    throw new Error(`Unsupported command: ${command}`);
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

function run(binary, args, cwd) {
  const result = spawnSync(binary, args, {
    cwd,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runPublish(pkg, args, cwd) {
  const result = spawnSync("npm", args, {
    cwd,
    stdio: "inherit"
  });

  if (result.status === 0) {
    return;
  }

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

  process.exit(result.status ?? 1);
}

function withPublishManifest(pkg, packageVersions, callback) {
  const originalManifestText = readFileSync(pkg.manifestPath, "utf8");
  const manifest = JSON.parse(originalManifestText);
  const rewrittenManifest = rewriteWorkspaceProtocols(manifest, packageVersions);
  const nextManifestText = `${JSON.stringify(rewrittenManifest, null, 2)}\n`;

  if (nextManifestText === originalManifestText) {
    callback();
    return;
  }

  writeFileSync(pkg.manifestPath, nextManifestText);

  try {
    callback();
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
