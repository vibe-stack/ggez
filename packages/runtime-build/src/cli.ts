#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildRuntimeBundleFromSnapshot, buildRuntimeSceneFromSnapshot, buildRuntimeWorldIndex, packRuntimeBundle } from "./index";

type CliArgs = {
  assetDir?: string;
  command?: string;
  input?: string;
  output?: string;
  worldChunks?: string;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));

  switch (args.command) {
    case "manifest":
      await buildManifestCommand(args);
      return;
    case "bundle":
      await buildBundleCommand(args);
      return;
    case "world-index":
      await buildWorldIndexCommand(args);
      return;
    default:
      printUsage();
      process.exitCode = 1;
  }
}

async function buildManifestCommand(args: CliArgs) {
  const snapshot = await readWhmapSnapshot(args.input);
  const scene = await buildRuntimeSceneFromSnapshot(snapshot);
  await writeTextOutput(args.output ?? "scene.runtime.json", JSON.stringify(scene, null, 2));
}

async function buildBundleCommand(args: CliArgs) {
  const snapshot = await readWhmapSnapshot(args.input);
  const bundle = await buildRuntimeBundleFromSnapshot(snapshot, {
    assetDir: args.assetDir
  });
  const bytes = packRuntimeBundle(bundle);
  await writeBinaryOutput(args.output ?? "scene.runtime.zip", bytes);
}

async function buildWorldIndexCommand(args: CliArgs) {
  if (!args.worldChunks) {
    throw new Error("Missing --chunks id:manifestUrl[:bundleUrl],...");
  }

  const chunks = args.worldChunks.split(",").map((entry) => {
    const [id, manifestUrl, bundleUrl] = entry.split(":");

    if (!id || !manifestUrl) {
      throw new Error(`Invalid chunk entry: ${entry}`);
    }

    return {
      bounds: [0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number],
      bundleUrl,
      id,
      manifestUrl
    };
  });
  const worldIndex = buildRuntimeWorldIndex(chunks);
  await writeTextOutput(args.output ?? "world-index.json", JSON.stringify(worldIndex, null, 2));
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!;

    if (!args.command && !value.startsWith("--")) {
      args.command = value;
      continue;
    }

    if (value === "--input") {
      args.input = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--output") {
      args.output = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--asset-dir") {
      args.assetDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--chunks") {
      args.worldChunks = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

async function readWhmapSnapshot(input?: string) {
  if (!input) {
    throw new Error("Missing --input path.");
  }

  const text = await readFile(resolve(input), "utf8");
  const parsed = JSON.parse(text) as {
    format?: string;
    scene?: unknown;
  };

  if (parsed.format !== "whmap" || !parsed.scene || typeof parsed.scene !== "object") {
    throw new Error("Input must be a valid .whmap file.");
  }

  return parsed.scene as Parameters<typeof buildRuntimeSceneFromSnapshot>[0];
}

async function writeTextOutput(outputPath: string, content: string) {
  const resolvedPath = resolve(outputPath);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, content, "utf8");
}

async function writeBinaryOutput(outputPath: string, bytes: Uint8Array) {
  const resolvedPath = resolve(outputPath);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, Buffer.from(bytes));
}

function printUsage() {
  process.stdout.write(
    [
      "Usage:",
      "  web-hammer-runtime-build manifest --input scene.whmap --output scene.runtime.json",
      "  web-hammer-runtime-build bundle --input scene.whmap --output scene.runtime.zip [--asset-dir assets]",
      "  web-hammer-runtime-build world-index --chunks hub:/world/chunks/hub/scene.runtime.json --output world-index.json"
    ].join("\n")
  );
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Runtime build CLI failed."}\n`);
  process.exitCode = 1;
});
