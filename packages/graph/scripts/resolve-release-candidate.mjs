import assert from "node:assert/strict";
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractReleaseNotes } from "./release-notes.mjs";

const graphPackageName = "@gravity-ui/graph";
const graphPackagePath = "packages/graph";
const schedulerPackageName = "@gravity-ui/graph-scheduler";
const schedulerPackagePath = "packages/scheduler";
const releaseManifestPath = ".release-please-manifest.json";
const releasePleaseConfigPath = "release-please-config.json";
const releaseRepository = "gravity-ui/graph";
const releasePleaseBot = "gravity-ui[bot]";
const releasePleaseHead = "release-please--branches--v2";
const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const defaultWorkspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));

function assertPlainRecord(value, description) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${description} must be a JSON object.`);
}

function assertComponentPath(componentPath) {
  assert.equal(typeof componentPath, "string", "Every Release Please component path must be a string.");
  assert.notEqual(componentPath, "", "A Release Please component path must not be empty.");
  assert.equal(path.posix.normalize(componentPath), componentPath, `Invalid component path: ${componentPath}.`);
  assert.ok(!path.posix.isAbsolute(componentPath), `Component path must be relative: ${componentPath}.`);
  assert.ok(!componentPath.startsWith("../"), `Component path must stay inside the workspace: ${componentPath}.`);
}

function componentOption(releasePleaseConfig, componentConfig, name, defaultValue) {
  return componentConfig[name] ?? releasePleaseConfig[name] ?? defaultValue;
}

function parseVersion(version, componentPath) {
  assert.equal(typeof version, "string", `Release manifest version for ${componentPath} must be a string.`);
  const match = version.match(semverPattern);
  assert.ok(match, `Release manifest version for ${componentPath} must be valid SemVer; found ${version}.`);

  return {
    version,
    prerelease: match[4]?.split(".") ?? [],
  };
}

function validateConfiguredComponents({ releasePleaseConfig, previousReleaseManifest, currentReleaseManifest }) {
  assertPlainRecord(releasePleaseConfig, "Release Please config");
  assertPlainRecord(releasePleaseConfig.packages, "Release Please packages config");
  assertPlainRecord(previousReleaseManifest, "Previous Release Please manifest");
  assertPlainRecord(currentReleaseManifest, "Current Release Please manifest");

  const configuredPaths = Object.keys(releasePleaseConfig.packages).sort();
  assert.ok(configuredPaths.length > 0, "Release Please must configure at least one component.");

  for (const componentPath of configuredPaths) {
    assertComponentPath(componentPath);
    const componentConfig = releasePleaseConfig.packages[componentPath];
    assertPlainRecord(componentConfig, `Release Please config for ${componentPath}`);
    assert.match(
      componentConfig["package-name"] ?? "",
      /^@?[^/\s]+(?:\/[^/\s]+)?$/,
      `Release Please config for ${componentPath} must declare package-name.`
    );
    assert.match(
      componentConfig.component ?? "",
      /^[^\s]+$/,
      `Release Please config for ${componentPath} must declare component.`
    );
  }

  const currentPaths = Object.keys(currentReleaseManifest).sort();
  assert.deepEqual(
    currentPaths,
    configuredPaths,
    "The current release manifest must contain exactly the configured Release Please component paths."
  );

  for (const componentPath of Object.keys(previousReleaseManifest)) {
    assert.ok(
      Object.hasOwn(releasePleaseConfig.packages, componentPath),
      `Previous release manifest contains unconfigured component ${componentPath}.`
    );
  }

  return configuredPaths;
}

export function deriveChangedComponentPaths({ releasePleaseConfig, previousReleaseManifest, currentReleaseManifest }) {
  const configuredPaths = validateConfiguredComponents({
    releasePleaseConfig,
    previousReleaseManifest,
    currentReleaseManifest,
  });

  return configuredPaths.filter(
    (componentPath) => previousReleaseManifest[componentPath] !== currentReleaseManifest[componentPath]
  );
}

function buildGitTag({ releasePleaseConfig, componentConfig, componentPath, version }) {
  const includeComponent = componentOption(releasePleaseConfig, componentConfig, "include-component-in-tag", true);
  const includeV = componentOption(releasePleaseConfig, componentConfig, "include-v-in-tag", true);
  const separator = componentOption(releasePleaseConfig, componentConfig, "tag-separator", "-");
  assert.equal(typeof includeComponent, "boolean", `include-component-in-tag for ${componentPath} must be boolean.`);
  assert.equal(typeof includeV, "boolean", `include-v-in-tag for ${componentPath} must be boolean.`);
  assert.equal(typeof separator, "string", `tag-separator for ${componentPath} must be a string.`);

  const versionTag = `${includeV ? "v" : ""}${version}`;
  return includeComponent ? `${componentConfig.component}${separator}${versionTag}` : versionTag;
}

function buildNpmTag(parsedVersion, componentPath) {
  if (parsedVersion.prerelease.length === 0) {
    return "latest";
  }

  const npmTag = parsedVersion.prerelease[0];
  assert.match(
    npmTag,
    /^[A-Za-z][0-9A-Za-z-]*$/,
    `The prerelease identifier for ${componentPath} cannot be used as an npm dist-tag.`
  );
  return npmTag;
}

function validateVersionStrategy({ releasePleaseConfig, componentConfig, componentPath, parsedVersion }) {
  const versioning = componentOption(releasePleaseConfig, componentConfig, "versioning", "default");
  if (versioning !== "prerelease") {
    return;
  }

  const prereleaseType = componentOption(releasePleaseConfig, componentConfig, "prerelease-type", undefined);
  assert.match(prereleaseType ?? "", /^[A-Za-z][0-9A-Za-z-]*$/, `Missing prerelease-type for ${componentPath}.`);
  assert.deepEqual(
    parsedVersion.prerelease.length === 2
      ? [parsedVersion.prerelease[0], /^\d+$/.test(parsedVersion.prerelease[1])]
      : parsedVersion.prerelease,
    [prereleaseType, true],
    `Release version for ${componentPath} must be a numbered ${prereleaseType} prerelease.`
  );
}

function packageDependencies(packageManifest) {
  return new Set(
    ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap((field) =>
      Object.keys(packageManifest[field] ?? {})
    )
  );
}

function sortComponentEntries(entries) {
  const entriesByName = new Map();
  for (const entry of entries) {
    assert.ok(!entriesByName.has(entry.item.name), `Duplicate component package name ${entry.item.name} in tag plan.`);
    entriesByName.set(entry.item.name, entry);
  }

  const indegree = new Map(entries.map((entry) => [entry.item.name, 0]));
  const dependents = new Map(entries.map((entry) => [entry.item.name, new Set()]));

  for (const entry of entries) {
    for (const dependencyName of packageDependencies(entry.packageManifest)) {
      if (!entriesByName.has(dependencyName)) {
        continue;
      }
      if (!dependents.get(dependencyName).has(entry.item.name)) {
        dependents.get(dependencyName).add(entry.item.name);
        indegree.set(entry.item.name, indegree.get(entry.item.name) + 1);
      }
    }
  }

  const ready = entries
    .filter((entry) => indegree.get(entry.item.name) === 0)
    .sort((left, right) => left.item.path.localeCompare(right.item.path));
  const sorted = [];

  while (ready.length > 0) {
    const entry = ready.shift();
    sorted.push(entry);

    for (const dependentName of [...dependents.get(entry.item.name)].sort()) {
      indegree.set(dependentName, indegree.get(dependentName) - 1);
      if (indegree.get(dependentName) === 0) {
        ready.push(entriesByName.get(dependentName));
        ready.sort((left, right) => left.item.path.localeCompare(right.item.path));
      }
    }
  }

  assert.equal(sorted.length, entries.length, "Changed release components contain a workspace dependency cycle.");
  const gitTags = new Set();
  for (const entry of sorted) {
    assert.ok(!gitTags.has(entry.item.gitTag), `Duplicate Git tag ${entry.item.gitTag} in tag plan.`);
    gitTags.add(entry.item.gitTag);
  }

  return sorted;
}

function assertReleaseSha(releaseSha) {
  assert.match(releaseSha ?? "", /^[0-9a-f]{40}$/i, "The release commit must be a full Git SHA.");
}

function isReleasePleasePullRequest(pullRequest, releaseSha) {
  return Boolean(
    pullRequest?.merged_at &&
      pullRequest.base?.ref === "v2" &&
      pullRequest.head?.repo?.full_name === releaseRepository &&
      pullRequest.head?.ref === releasePleaseHead &&
      pullRequest.user?.login === releasePleaseBot &&
      pullRequest.user?.type === "Bot" &&
      pullRequest.merge_commit_sha === releaseSha
  );
}

export function selectReleasePleasePullRequest({ pullRequests, releaseSha, expectedVersion, expectedReleasePlan }) {
  assertReleaseSha(releaseSha);
  assert.ok(Array.isArray(pullRequests), "The associated pull requests response must be an array.");

  const candidates = pullRequests.filter((pullRequest) => isReleasePleasePullRequest(pullRequest, releaseSha));

  if (candidates.length === 0) {
    assert.equal(
      expectedVersion,
      undefined,
      `Commit ${releaseSha} is not the merge commit of a Release Please pull request targeting v2.`
    );
    assert.equal(
      expectedReleasePlan,
      undefined,
      `Commit ${releaseSha} is not the merge commit of a Release Please pull request targeting v2.`
    );
    return undefined;
  }

  assert.equal(candidates.length, 1, `Commit ${releaseSha} is associated with multiple Release Please pull requests.`);
  return candidates[0];
}

export function validateReleaseCandidate({
  releaseSha,
  pullRequest,
  pullRequestFiles,
  releasePleaseConfig,
  previousReleaseManifest,
  currentReleaseManifest,
  packageManifests,
  changelogs,
  expectedVersion,
  expectedReleasePlan,
}) {
  assertReleaseSha(releaseSha);
  assert.ok(pullRequest?.merged_at, "The Release Please pull request must be merged.");
  assert.equal(pullRequest.base?.ref, "v2", "The Release Please pull request must target v2.");
  assert.equal(
    pullRequest.head?.repo?.full_name,
    releaseRepository,
    `The release pull request head must belong to ${releaseRepository}.`
  );
  assert.equal(
    pullRequest.head?.ref,
    releasePleaseHead,
    `The combined manifest release pull request head must be ${releasePleaseHead}.`
  );
  assert.deepEqual(
    { login: pullRequest.user?.login, type: pullRequest.user?.type },
    { login: releasePleaseBot, type: "Bot" },
    `The release pull request must be authored by the trusted ${releasePleaseBot} GitHub App.`
  );
  assert.equal(
    pullRequest.merge_commit_sha,
    releaseSha,
    "The release commit must be the Release Please pull request merge commit."
  );
  assert.ok(
    Number.isInteger(pullRequest.number) && pullRequest.number > 0,
    "The release pull request number is invalid."
  );

  const changedPaths = deriveChangedComponentPaths({
    releasePleaseConfig,
    previousReleaseManifest,
    currentReleaseManifest,
  });
  assert.ok(changedPaths.length > 0, "The Release Please manifest must advance at least one component version.");

  assert.ok(Array.isArray(pullRequestFiles), "The pull request files response must be an array.");
  const changedFiles = pullRequestFiles.map((file) => file?.filename).sort();
  assert.ok(changedFiles.every(Boolean), "Every changed pull request file must have a filename.");
  const expectedFiles = [
    releaseManifestPath,
    ...changedPaths.flatMap((componentPath) => [`${componentPath}/CHANGELOG.md`, `${componentPath}/package.json`]),
  ].sort();
  assert.deepEqual(
    changedFiles,
    expectedFiles,
    `The Release Please pull request must change exactly ${expectedFiles.join(", ")}.`
  );

  assertPlainRecord(packageManifests, "Component package manifests");
  assertPlainRecord(changelogs, "Component changelogs");
  const componentEntries = [];

  for (const componentPath of changedPaths) {
    const componentConfig = releasePleaseConfig.packages[componentPath];
    const packageManifest = packageManifests[componentPath];
    assertPlainRecord(packageManifest, `Package manifest for ${componentPath}`);
    assert.equal(
      packageManifest.name,
      componentConfig["package-name"],
      `Package name for ${componentPath} must match release-please-config.json.`
    );

    const version = currentReleaseManifest[componentPath];
    const previousVersion = previousReleaseManifest[componentPath];
    assert.equal(
      typeof previousVersion,
      "string",
      `Previous release manifest must contain a version for changed component ${componentPath}.`
    );
    parseVersion(previousVersion, `${componentPath} in the previous manifest`);
    assert.equal(
      packageManifest.version,
      version,
      `Package version for ${componentPath} must match .release-please-manifest.json.`
    );
    const parsedVersion = parseVersion(version, componentPath);
    validateVersionStrategy({ releasePleaseConfig, componentConfig, componentPath, parsedVersion });
    extractReleaseNotes(changelogs[componentPath], version, componentPath);

    if (componentPath === schedulerPackagePath) {
      assert.equal(packageManifest.name, schedulerPackageName, "The scheduler component package name is immutable.");
      assert.equal(packageManifest.private, true, "The scheduler component must remain private.");
    }
    if (componentPath === graphPackagePath) {
      assert.equal(packageManifest.name, graphPackageName, "The Graph component package name is immutable.");
      assert.notEqual(packageManifest.private, true, "The Graph component must remain publishable.");
    }

    const isPrivate = packageManifest.private === true;
    const gitTag = buildGitTag({ releasePleaseConfig, componentConfig, componentPath, version });
    componentEntries.push({
      item: {
        name: packageManifest.name,
        path: componentPath,
        version,
        gitTag,
        private: isPrivate,
        previousVersion,
      },
      publicItem: isPrivate
        ? undefined
        : {
            name: packageManifest.name,
            path: componentPath,
            version,
            npmTag: buildNpmTag(parsedVersion, componentPath),
            gitTag,
          },
      packageManifest,
    });
  }

  const sortedComponentEntries = sortComponentEntries(componentEntries);
  const tagPlan = sortedComponentEntries.map(({ item }) => item);
  const releasePlan = sortedComponentEntries.flatMap(({ publicItem }) => (publicItem ? [publicItem] : []));
  const releasedPaths = releasePlan.map((item) => item.path);
  const graphRelease = releasePlan.find((item) => item.path === graphPackagePath);

  if (expectedVersion !== undefined) {
    assert.ok(graphRelease, "EXPECTED_RELEASE_VERSION requires Graph to be present in the public release plan.");
    assert.equal(graphRelease.version, expectedVersion, "The Graph release does not match EXPECTED_RELEASE_VERSION.");
  }
  if (expectedReleasePlan !== undefined) {
    assert.ok(Array.isArray(expectedReleasePlan), "EXPECTED_RELEASE_PLAN must be a JSON array.");
    assert.deepEqual(releasePlan, expectedReleasePlan, "The public release plan does not match EXPECTED_RELEASE_PLAN.");
  }

  return {
    candidate: releasePlan.length > 0,
    releasePlan,
    tagPlan,
    changedPaths,
    releasedPaths,
    version: graphRelease?.version,
    tag: graphRelease?.gitTag,
    sha: releaseSha,
    pr: pullRequest.number,
  };
}

async function fetchGithubJson({ fetchImpl, repository, token, pathname }) {
  const response = await fetchImpl(`https://api.github.com/repos/${repository}${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`GitHub API ${pathname} failed with ${response.status}: ${responseBody}`);
  }

  return response.json();
}

async function fetchPullRequestFiles({ fetchImpl, repository, token, pullRequestNumber }) {
  const files = [];

  for (let page = 1; ; page += 1) {
    const pageFiles = await fetchGithubJson({
      fetchImpl,
      repository,
      token,
      pathname: `/pulls/${pullRequestNumber}/files?per_page=100&page=${page}`,
    });
    assert.ok(Array.isArray(pageFiles), "The pull request files response must be an array.");
    files.push(...pageFiles);

    if (pageFiles.length < 100) {
      return files;
    }
  }
}

async function fetchPreviousReleaseManifest({ fetchImpl, repository, token, releaseSha }) {
  const releaseCommit = await fetchGithubJson({
    fetchImpl,
    repository,
    token,
    pathname: `/commits/${releaseSha}`,
  });
  const firstParentSha = releaseCommit?.parents?.[0]?.sha;
  assertReleaseSha(firstParentSha);

  const manifestFile = await fetchGithubJson({
    fetchImpl,
    repository,
    token,
    pathname: `/contents/${releaseManifestPath}?ref=${encodeURIComponent(firstParentSha)}`,
  });
  assert.equal(manifestFile?.type, "file", `GitHub contents response for ${releaseManifestPath} must be a file.`);
  assert.equal(manifestFile?.encoding, "base64", `GitHub contents response for ${releaseManifestPath} must be base64.`);
  assert.equal(
    typeof manifestFile?.content,
    "string",
    `GitHub contents response for ${releaseManifestPath} has no content.`
  );

  return JSON.parse(Buffer.from(manifestFile.content.replace(/\s/g, ""), "base64").toString("utf8"));
}

async function appendGithubOutputs(outputPath, result) {
  const outputs = {
    candidate: result.candidate,
    release_plan: JSON.stringify(result.releasePlan ?? []),
    tag_plan: JSON.stringify(result.tagPlan ?? []),
    version: result.version ?? "",
    tag: result.tag ?? "",
    sha: result.sha,
    changed_paths: JSON.stringify(result.changedPaths ?? []),
    released_paths: JSON.stringify(result.releasedPaths ?? []),
    pr: result.pr ?? "",
  };
  const contents = Object.entries(outputs)
    .map(([name, value]) => `${name}=${value}\n`)
    .join("");
  await appendFile(outputPath, contents);
}

function parseExpectedReleasePlan(source) {
  if (!source) {
    return undefined;
  }

  const releasePlan = JSON.parse(source);
  assert.ok(Array.isArray(releasePlan), "EXPECTED_RELEASE_PLAN must be a JSON array.");
  return releasePlan;
}

export async function resolveReleaseCandidateFromGithub({
  env = process.env,
  fetchImpl = globalThis.fetch,
  workspaceRoot = defaultWorkspaceRoot,
} = {}) {
  const releaseSha = env.RELEASE_SHA || env.GITHUB_SHA;
  const expectedVersion = env.EXPECTED_RELEASE_VERSION || undefined;
  const expectedReleasePlan = parseExpectedReleasePlan(env.EXPECTED_RELEASE_PLAN);
  const repository = env.GITHUB_REPOSITORY;
  const token = env.GITHUB_TOKEN;
  const outputPath = env.GITHUB_OUTPUT;

  assertReleaseSha(releaseSha);
  assert.match(repository ?? "", /^[^/]+\/[^/]+$/, "GITHUB_REPOSITORY must have the owner/repository form.");
  assert.ok(token, "GITHUB_TOKEN is required.");
  assert.ok(outputPath, "GITHUB_OUTPUT is required.");
  assert.equal(typeof fetchImpl, "function", "A fetch implementation is required.");

  const pullRequests = await fetchGithubJson({
    fetchImpl,
    repository,
    token,
    pathname: `/commits/${releaseSha}/pulls?per_page=100`,
  });
  const pullRequest = selectReleasePleasePullRequest({
    pullRequests,
    releaseSha,
    expectedVersion,
    expectedReleasePlan,
  });

  if (!pullRequest) {
    const result = {
      candidate: false,
      releasePlan: [],
      tagPlan: [],
      sha: releaseSha,
      changedPaths: [],
      releasedPaths: [],
    };
    await appendGithubOutputs(outputPath, result);
    return result;
  }

  const pullRequestFiles = await fetchPullRequestFiles({
    fetchImpl,
    repository,
    token,
    pullRequestNumber: pullRequest.number,
  });
  const previousReleaseManifest = await fetchPreviousReleaseManifest({
    fetchImpl,
    repository,
    token,
    releaseSha,
  });
  const [releasePleaseConfigSource, currentReleaseManifestSource] = await Promise.all([
    readFile(path.join(workspaceRoot, releasePleaseConfigPath), "utf8"),
    readFile(path.join(workspaceRoot, releaseManifestPath), "utf8"),
  ]);
  const releasePleaseConfig = JSON.parse(releasePleaseConfigSource);
  const currentReleaseManifest = JSON.parse(currentReleaseManifestSource);
  const changedPaths = deriveChangedComponentPaths({
    releasePleaseConfig,
    previousReleaseManifest,
    currentReleaseManifest,
  });
  const componentSources = await Promise.all(
    changedPaths.map(async (componentPath) => {
      const [packageManifestSource, changelog] = await Promise.all([
        readFile(path.join(workspaceRoot, componentPath, "package.json"), "utf8"),
        readFile(path.join(workspaceRoot, componentPath, "CHANGELOG.md"), "utf8"),
      ]);
      return [componentPath, JSON.parse(packageManifestSource), changelog];
    })
  );
  const packageManifests = Object.fromEntries(
    componentSources.map(([componentPath, packageManifest]) => [componentPath, packageManifest])
  );
  const changelogs = Object.fromEntries(
    componentSources.map(([componentPath, , changelog]) => [componentPath, changelog])
  );

  const result = validateReleaseCandidate({
    releaseSha,
    pullRequest,
    pullRequestFiles,
    releasePleaseConfig,
    previousReleaseManifest,
    currentReleaseManifest,
    packageManifests,
    changelogs,
    expectedVersion,
    expectedReleasePlan,
  });
  await appendGithubOutputs(outputPath, result);
  return result;
}

const directInvocation = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (directInvocation) {
  const result = await resolveReleaseCandidateFromGithub();
  console.log(`[release-candidate] ${JSON.stringify(result)}`);
}
