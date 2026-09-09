import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractReleaseNotes } from "./release-notes.mjs";

const graphPackageName = "@gravity-ui/graph";
const graphPackagePath = "packages/graph";
const schedulerPackageName = "@gravity-ui/graph-scheduler";
const schedulerPackagePath = "packages/scheduler";
const numberedNextVersionPattern = /^\d+\.\d+\.\d+-next\.\d+$/;
const graphPrereleaseVersionPattern = /^2\.\d+\.\d+-next\.\d+$/;
const stableVersionPattern = /^\d+\.\d+\.\d+$/;
const graphStableVersionPattern = /^2\.\d+\.\d+$/;
const releasePlanKeys = new Set(["name", "path", "version", "npmTag", "gitTag"]);
const dependencyFields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const defaultWorkspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readWorkspaceManifest(workspaceRoot, packagePath) {
  try {
    return await readJson(path.join(workspaceRoot, packagePath, "package.json"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function readWorkspaceManifests(workspaceRoot) {
  const rootManifest = await readJson(path.join(workspaceRoot, "package.json"));
  const manifests = [{ path: ".", manifest: rootManifest }];

  for (const workspaceDirectory of ["packages", "apps"]) {
    let entries;
    try {
      entries = await readdir(path.join(workspaceRoot, workspaceDirectory), { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }

      throw error;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const packagePath = path.posix.join(workspaceDirectory, entry.name);
      const manifest = await readWorkspaceManifest(workspaceRoot, packagePath);
      if (manifest) {
        manifests.push({ path: packagePath, manifest });
      }
    }
  }

  return manifests;
}

function parseBoolean(value, name) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  throw new Error(`${name} must be either true or false.`);
}

function parseJsonEnvironmentValue(value, name) {
  assert.ok(value, `${name} is required.`);

  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${name} must contain valid JSON.`, { cause: error });
  }
}

function parseNumberedPrerelease(version) {
  assert.match(version, numberedNextVersionPattern, `Invalid numbered next prerelease: ${version}.`);
  const [major, minor, patch, prerelease] = version.match(/\d+/g).map(Number);

  return { major, minor, patch, prerelease };
}

function getPackageOption(releasePleaseConfig, packageConfig, option, fallback) {
  return packageConfig[option] ?? releasePleaseConfig[option] ?? fallback;
}

function assertWorkspaceReleasePlugin(releasePleaseConfig) {
  const nodeWorkspacePlugin = releasePleaseConfig.plugins?.find(
    (plugin) => plugin && typeof plugin === "object" && !Array.isArray(plugin) && plugin.type === "node-workspace"
  );

  assert.ok(nodeWorkspacePlugin, "release-please must configure the node-workspace plugin as an object.");
  assert.equal(
    nodeWorkspacePlugin.updatePeerDependencies,
    true,
    "release-please node-workspace must update peer dependencies so public workspace consumers join dependency releases."
  );
}

function getWorkspaceAliasTarget(specifier) {
  if (typeof specifier !== "string") {
    return undefined;
  }

  return specifier.match(/^workspace:((?:@[^/]+\/)?[^@]+)@/)?.[1];
}

function assertCanonicalWorkspaceDependencyNames({ packagePath, manifest, workspaceByName }) {
  for (const field of dependencyFields) {
    for (const [dependencyName, specifier] of Object.entries(manifest[field] ?? {})) {
      if (typeof specifier !== "string" || !specifier.startsWith("workspace:")) {
        continue;
      }

      assert.ok(
        workspaceByName.has(dependencyName),
        `${packagePath} must use the canonical workspace package name as dependency key; ${dependencyName} is an unsupported workspace alias.`
      );
      const aliasTarget = getWorkspaceAliasTarget(specifier);
      assert.ok(
        aliasTarget === undefined || aliasTarget === dependencyName,
        `${packagePath} must not alias workspace dependency ${dependencyName} to ${aliasTarget}.`
      );
    }
  }
}

function getConfiguredPackageName(packageConfig, manifest) {
  return packageConfig["package-name"] ?? manifest.name;
}

function getExpectedGitTag(releasePleaseConfig, packageConfig, manifest, version) {
  const includeComponent = getPackageOption(releasePleaseConfig, packageConfig, "include-component-in-tag", true);
  const includeV = getPackageOption(releasePleaseConfig, packageConfig, "include-v-in-tag", true);
  const separator = getPackageOption(releasePleaseConfig, packageConfig, "tag-separator", "-");
  const component = packageConfig.component ?? manifest.name.split("/").at(-1);
  const versionPart = `${includeV ? "v" : ""}${version}`;

  return includeComponent ? `${component}${separator}${versionPart}` : versionPart;
}

function getChangelogPath(releasePleaseConfig, packageConfig, packagePath) {
  const changelogPath = getPackageOption(releasePleaseConfig, packageConfig, "changelog-path", "CHANGELOG.md");
  return path.join(packagePath, changelogPath);
}

function assertUnique(items, getValue, description) {
  const seen = new Set();
  for (const item of items) {
    const value = getValue(item);
    assert.ok(!seen.has(value), `Release plan contains a duplicate ${description}: ${value}.`);
    seen.add(value);
  }
}

function assertReleasePlanShape(releasePlan) {
  assert.ok(Array.isArray(releasePlan), "Release plan must be a JSON array.");
  assert.ok(releasePlan.length > 0, "Release plan must contain at least one package.");

  for (const [index, item] of releasePlan.entries()) {
    assert.ok(
      item && typeof item === "object" && !Array.isArray(item),
      `Release plan item ${index} must be an object.`
    );
    for (const key of Object.keys(item)) {
      assert.ok(releasePlanKeys.has(key), `Release plan item ${index} contains unsupported field ${key}.`);
    }
    for (const key of ["name", "path", "version", "npmTag"]) {
      assert.equal(typeof item[key], "string", `Release plan item ${index}.${key} must be a string.`);
      assert.notEqual(item[key], "", `Release plan item ${index}.${key} must not be empty.`);
    }
    assert.ok(
      item.gitTag === undefined || item.gitTag === null || (typeof item.gitTag === "string" && item.gitTag !== ""),
      `Release plan item ${index}.gitTag must be a non-empty string, null, or omitted.`
    );
    assert.equal(path.isAbsolute(item.path), false, `Release plan item ${index}.path must be workspace-relative.`);
    assert.equal(item.path, path.posix.normalize(item.path), `Release plan item ${index}.path must be normalized.`);
    assert.ok(!item.path.startsWith("../"), `Release plan item ${index}.path must remain inside the workspace.`);
  }

  assertUnique(releasePlan, (item) => item.name, "package name");
  assertUnique(releasePlan, (item) => item.path, "package path");
}

function assertRecoverablePublicationPrefix(releasePlan, alreadyPublishedByPackage) {
  let missingPackage;

  for (const item of releasePlan) {
    if (alreadyPublishedByPackage[item.name] === true) {
      assert.equal(
        missingPackage,
        undefined,
        `Recovery state is not dependency-first: ${item.name} already exists while earlier package ${missingPackage} is missing.`
      );
    } else {
      missingPackage ??= item.name;
    }
  }
}

export function validateNextDistTag({ packageName = graphPackageName, releaseVersion, currentNext, alreadyPublished }) {
  assert.match(releaseVersion, numberedNextVersionPattern, "The release version must be a numbered next prerelease.");
  if (packageName === graphPackageName) {
    assert.match(
      releaseVersion,
      graphPrereleaseVersionPattern,
      "Graph releases on v2 must be numbered 2.x next prereleases."
    );
  }

  if (alreadyPublished) {
    assert.equal(
      currentNext,
      releaseVersion,
      `An existing npm version for ${packageName} can be recovered only while next still points to that exact release.`
    );
    return;
  }

  const release = parseNumberedPrerelease(releaseVersion);
  if (!currentNext) {
    if (packageName === graphPackageName) {
      assert.equal(releaseVersion, "2.0.0-next.0", "The first Graph next release must be 2.0.0-next.0.");
    } else {
      assert.equal(release.prerelease, 0, `The first next release for ${packageName} must end in next.0.`);
    }
    return;
  }

  const current = parseNumberedPrerelease(currentNext);
  assert.deepEqual(
    { major: release.major, minor: release.minor, patch: release.patch },
    { major: current.major, minor: current.minor, patch: current.patch },
    `The next prerelease for ${packageName} must continue the ${current.major}.${current.minor}.${current.patch} line.`
  );
  assert.equal(
    release.prerelease,
    current.prerelease + 1,
    `The next prerelease after ${currentNext} must increment its numeric suffix exactly once.`
  );
}

export async function validateWorkspaceReleaseConfiguration({ workspaceRoot = defaultWorkspaceRoot } = {}) {
  const [workspaceManifests, releasePleaseConfig] = await Promise.all([
    readWorkspaceManifests(workspaceRoot),
    readJson(path.join(workspaceRoot, "release-please-config.json")),
  ]);
  assert.ok(
    releasePleaseConfig.packages &&
      typeof releasePleaseConfig.packages === "object" &&
      !Array.isArray(releasePleaseConfig.packages),
    "release-please-config.json must contain a packages object."
  );
  assertWorkspaceReleasePlugin(releasePleaseConfig);

  const workspaceByPath = new Map(workspaceManifests.map((entry) => [entry.path, entry.manifest]));
  const workspaceByName = new Map(workspaceManifests.map((entry) => [entry.manifest.name, entry]));
  for (const packagePath of Object.keys(releasePleaseConfig.packages)) {
    const manifest = workspaceByPath.get(packagePath);
    assert.ok(manifest, `Release Please component ${packagePath} is not a workspace package.`);
    assertCanonicalWorkspaceDependencyNames({ packagePath, manifest, workspaceByName });
  }

  const schedulerManifest = workspaceByPath.get(schedulerPackagePath);
  assert.ok(schedulerManifest, `The private scheduler workspace must exist at ${schedulerPackagePath}.`);
  assert.equal(
    schedulerManifest.name,
    schedulerPackageName,
    `The scheduler workspace at ${schedulerPackagePath} must be named ${schedulerPackageName}.`
  );
  assert.equal(schedulerManifest.private, true, `The scheduler workspace ${schedulerPackageName} must remain private.`);

  const publicWorkspaces = workspaceManifests.filter(({ manifest }) => manifest.private !== true);
  for (const { path: packagePath, manifest } of publicWorkspaces) {
    const packageConfig = releasePleaseConfig.packages[packagePath];
    assert.ok(
      packageConfig,
      `Public workspace ${manifest.name} at ${packagePath} is not configured in release-please.`
    );
    assert.equal(
      getConfiguredPackageName(packageConfig, manifest),
      manifest.name,
      `release-please package name for ${packagePath} must match its workspace manifest.`
    );
  }

  return { releasePleaseConfig, workspaceByPath };
}

export async function validateReleaseContract({
  workspaceRoot = defaultWorkspaceRoot,
  branch,
  releasePlan,
  dryRun,
  githubPrerelease,
  currentNextByPackage,
  alreadyPublishedByPackage = {},
}) {
  assertReleasePlanShape(releasePlan);

  const { releasePleaseConfig, workspaceByPath } = await validateWorkspaceReleaseConfiguration({ workspaceRoot });

  if (dryRun) {
    assert.equal(branch, "main", "The stable dry-run must simulate the future main release branch.");
    assert.equal(githubPrerelease, false, "The stable dry-run must simulate non-prerelease GitHub Releases.");
  } else {
    assert.equal(branch, "v2", "Before cutover, a live release may run only from v2.");
    assert.equal(githubPrerelease, true, "The v2 GitHub Releases must be marked as prereleases.");
  }

  const validatedPlan = [];
  for (const item of releasePlan) {
    const manifest = workspaceByPath.get(item.path);
    assert.ok(manifest, `Release package path ${item.path} is not a workspace package.`);
    assert.equal(manifest.name, item.name, `Release package name does not match ${item.path}/package.json.`);
    assert.notEqual(
      manifest.private,
      true,
      `Private workspace package ${item.name} must not appear in the release plan.`
    );

    const packageConfig = releasePleaseConfig.packages[item.path];
    assert.ok(packageConfig, `Release package ${item.name} at ${item.path} is not configured in release-please.`);
    assert.equal(
      getConfiguredPackageName(packageConfig, manifest),
      item.name,
      `Release package ${item.name} does not match its release-please configuration.`
    );
    assert.equal(
      manifest.version,
      item.version,
      `Release version for ${item.name} must match ${item.path}/package.json.`
    );

    if (dryRun) {
      assert.equal(item.npmTag, "latest", `The stable dry-run for ${item.name} must use the latest npm tag.`);
      assert.match(
        item.version,
        stableVersionPattern,
        `The stable dry-run for ${item.name} accepts only stable versions.`
      );
      if (item.name === graphPackageName) {
        assert.match(
          item.version,
          graphStableVersionPattern,
          "The stable Graph dry-run accepts only stable 2.x versions."
        );
      }
      assert.ok(item.gitTag === undefined || item.gitTag === null, "The stable dry-run must not claim a Git tag.");
    } else {
      assert.equal(item.npmTag, "next", `Before cutover, ${item.name} may publish only under next.`);
      assert.match(item.version, numberedNextVersionPattern, `${item.name} must use a numbered next prerelease.`);
      if (item.name === graphPackageName) {
        assert.equal(item.path, graphPackagePath, `${graphPackageName} must be released from ${graphPackagePath}.`);
        assert.match(
          item.version,
          graphPrereleaseVersionPattern,
          "Graph releases on v2 must be numbered 2.x next prereleases."
        );
      }

      const expectedGitTag = getExpectedGitTag(releasePleaseConfig, packageConfig, manifest, item.version);
      assert.equal(item.gitTag, expectedGitTag, `Git tag for ${item.name} must match release-please configuration.`);

      const changelogPath = getChangelogPath(releasePleaseConfig, packageConfig, item.path);
      const changelog = await readFile(path.join(workspaceRoot, changelogPath), "utf8");
      extractReleaseNotes(changelog, item.version, item.name);

      if (currentNextByPackage !== undefined) {
        assert.ok(
          Object.hasOwn(currentNextByPackage, item.name),
          `Current next dist-tag state is missing for ${item.name}.`
        );
        validateNextDistTag({
          packageName: item.name,
          releaseVersion: item.version,
          currentNext: currentNextByPackage[item.name],
          alreadyPublished: alreadyPublishedByPackage[item.name] === true,
        });
      }
    }

    validatedPlan.push({ ...item });
  }

  if (!dryRun) {
    assertUnique(validatedPlan, (item) => item.gitTag, "Git tag");
    assertRecoverablePublicationPrefix(validatedPlan, alreadyPublishedByPackage);
  }

  return { branch, dryRun, githubPrerelease, releasePlan: validatedPlan };
}

function getReleaseNotesFileName(packageName) {
  return `${packageName.replace(/^@/, "").replaceAll("/", "-")}.md`;
}

async function writeReleaseNotes({ workspaceRoot, releasePlan, outputDirectory }) {
  const releasePleaseConfig = await readJson(path.join(workspaceRoot, "release-please-config.json"));
  const workspaceManifests = await readWorkspaceManifests(workspaceRoot);
  const workspaceByPath = new Map(workspaceManifests.map((entry) => [entry.path, entry.manifest]));
  await mkdir(outputDirectory, { recursive: true });

  for (const item of releasePlan) {
    const manifest = workspaceByPath.get(item.path);
    const packageConfig = releasePleaseConfig.packages[item.path];
    const changelogPath = getChangelogPath(releasePleaseConfig, packageConfig, item.path);
    const changelog = await readFile(path.join(workspaceRoot, changelogPath), "utf8");
    const notes = extractReleaseNotes(changelog, item.version, manifest.name);
    await writeFile(path.join(outputDirectory, getReleaseNotesFileName(item.name)), `${notes}\n`);
  }
}

const directInvocation = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (directInvocation) {
  const dryRun = parseBoolean(process.env.RELEASE_DRY_RUN ?? "false", "RELEASE_DRY_RUN");
  const releasePlan = parseJsonEnvironmentValue(process.env.RELEASE_PLAN, "RELEASE_PLAN");
  const currentNextByPackage = process.env.CURRENT_NEXT_BY_PACKAGE
    ? parseJsonEnvironmentValue(process.env.CURRENT_NEXT_BY_PACKAGE, "CURRENT_NEXT_BY_PACKAGE")
    : undefined;
  const alreadyPublishedByPackage = process.env.ALREADY_PUBLISHED_BY_PACKAGE
    ? parseJsonEnvironmentValue(process.env.ALREADY_PUBLISHED_BY_PACKAGE, "ALREADY_PUBLISHED_BY_PACKAGE")
    : {};
  const result = await validateReleaseContract({
    branch: process.env.RELEASE_BRANCH,
    releasePlan,
    dryRun,
    githubPrerelease: parseBoolean(process.env.GITHUB_PRERELEASE ?? "false", "GITHUB_PRERELEASE"),
    currentNextByPackage,
    alreadyPublishedByPackage,
  });

  if (!dryRun && process.env.RELEASE_NOTES_DIRECTORY) {
    await writeReleaseNotes({
      workspaceRoot: defaultWorkspaceRoot,
      releasePlan: result.releasePlan,
      outputDirectory: process.env.RELEASE_NOTES_DIRECTORY,
    });
  }

  console.log(`[release-contract] ${JSON.stringify(result)}`);
}
