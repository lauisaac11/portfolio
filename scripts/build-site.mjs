import { access, copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIRECTORY = path.resolve(SCRIPT_DIRECTORY, "..");
const EXCLUDED_ROOT_ENTRIES = new Set([
  ".git",
  ".gitignore",
  ".github",
  "scripts",
  "dist",
  "README.md",
]);

function parseOutputDirectory(argv) {
  let outputArgument = "dist";

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--output") {
      const value = argv[index + 1];

      if (!value || value.startsWith("--")) {
        throw new Error("--output requires a directory path.");
      }

      outputArgument = value;
      index += 1;
      continue;
    }

    if (argument.startsWith("--output=")) {
      const value = argument.slice("--output=".length);

      if (!value) {
        throw new Error("--output requires a directory path.");
      }

      outputArgument = value;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return path.isAbsolute(outputArgument)
    ? path.normalize(outputArgument)
    : path.resolve(SOURCE_DIRECTORY, outputArgument);
}

function isSamePathOrDescendant(candidatePath, parentPath) {
  const relativePath = path.relative(parentPath, candidatePath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== ".." &&
      !path.isAbsolute(relativePath))
  );
}

function assertSafeOutputDirectory(outputDirectory) {
  if (isSamePathOrDescendant(SOURCE_DIRECTORY, outputDirectory)) {
    throw new Error(
      "The output directory cannot be the site source directory or one of its parents.",
    );
  }

  const parsedRoot = path.parse(outputDirectory).root;

  if (path.resolve(outputDirectory) === path.resolve(parsedRoot)) {
    throw new Error("The output directory cannot be a filesystem root.");
  }
}

function readValidatedEnvironmentVariable(name, pattern) {
  const value = (process.env[name] ?? "").trim();

  if (value && !pattern.test(value)) {
    throw new Error(`${name} is set but does not match the required format.`);
  }

  return value;
}

function shouldExcludeSourcePath(sourcePath, outputDirectory) {
  const resolvedSourcePath = path.resolve(sourcePath);

  // A custom output may live inside the source tree. Excluding that exact
  // subtree prevents the build from recursively copying its own artifact.
  if (isSamePathOrDescendant(resolvedSourcePath, outputDirectory)) {
    return true;
  }

  const relativePath = path.relative(SOURCE_DIRECTORY, resolvedSourcePath);
  const [rootEntry] = relativePath.split(path.sep);

  return EXCLUDED_ROOT_ENTRIES.has(rootEntry);
}

async function copySiteDirectory(sourceDirectory, destinationDirectory, outputDirectory) {
  await mkdir(destinationDirectory, { recursive: true });

  const entries = await readdir(sourceDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDirectory, entry.name);

    if (shouldExcludeSourcePath(sourcePath, outputDirectory)) {
      continue;
    }

    const destinationPath = path.join(destinationDirectory, entry.name);

    if (entry.isDirectory()) {
      await copySiteDirectory(sourcePath, destinationPath, outputDirectory);
      continue;
    }

    if (entry.isFile()) {
      await mkdir(path.dirname(destinationPath), { recursive: true });
      await copyFile(sourcePath, destinationPath);
      continue;
    }

    if (entry.isSymbolicLink()) {
      throw new Error(
        `Symbolic links are not supported by GitHub Pages artifacts: ${sourcePath}`,
      );
    }

    throw new Error(`Unsupported filesystem entry: ${sourcePath}`);
  }
}

async function writeAnalyticsConfig(outputDirectory) {
  const gaMeasurementId = readValidatedEnvironmentVariable(
    "GA_MEASUREMENT_ID",
    /^G-[A-Z0-9]+$/,
  );
  const clarityProjectId = readValidatedEnvironmentVariable(
    "CLARITY_PROJECT_ID",
    /^[a-z0-9]+$/,
  );
  const runtimeConfig = {
    environment: "production",
    gaMeasurementId,
    clarityProjectId,
  };
  const configPath = path.join(outputDirectory, "script", "analytics-config.js");
  const configSource = [
    '"use strict";',
    "",
    `window.__PORTFOLIO_ANALYTICS_CONFIG__ = Object.freeze(${JSON.stringify(runtimeConfig, null, 2)});`,
    "",
  ].join("\n");

  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, configSource, "utf8");

  return {
    gaEnabled: Boolean(gaMeasurementId),
    clarityEnabled: Boolean(clarityProjectId),
  };
}

async function build() {
  const outputDirectory = parseOutputDirectory(process.argv.slice(2));
  const sourceIndexPath = path.join(SOURCE_DIRECTORY, "index.html");

  await access(sourceIndexPath, constants.R_OK);
  assertSafeOutputDirectory(outputDirectory);

  await rm(outputDirectory, { recursive: true, force: true });
  await copySiteDirectory(SOURCE_DIRECTORY, outputDirectory, outputDirectory);

  const analyticsStatus = await writeAnalyticsConfig(outputDirectory);
  const outputIndexPath = path.join(outputDirectory, "index.html");

  await access(outputIndexPath, constants.R_OK);

  const enabledProviders = [
    analyticsStatus.gaEnabled ? "GA4" : null,
    analyticsStatus.clarityEnabled ? "Clarity" : null,
  ].filter(Boolean);
  const statusMessage = enabledProviders.length
    ? `${enabledProviders.join(" and ")} enabled`
    : "disabled because no IDs were provided";

  console.log(`Site build completed at ${outputDirectory}.`);
  console.log(`Analytics configuration: ${statusMessage}.`);
}

build().catch((error) => {
  console.error(`Build failed: ${error.message}`);
  process.exitCode = 1;
});
