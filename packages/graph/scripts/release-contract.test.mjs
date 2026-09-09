import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import {
  validateNextDistTag,
  validateReleaseContract,
  validateWorkspaceReleaseConfiguration,
} from "./release-contract.mjs";
import { extractReleaseNotes } from "./release-notes.mjs";

const graphName = "@gravity-ui/graph";
const graphPath = "packages/graph";
const reactName = "@gravity-ui/graph-react";
const reactPath = "packages/graph-react";
const schedulerName = "@gravity-ui/graph-scheduler";
const schedulerPath = "packages/scheduler";
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function createWorkspace({
  graphVersion = "2.0.0-next.0",
  graphConfigured = true,
  graphPackageName = graphName,
  schedulerPrivate = true,
  schedulerConfigured = true,
  reactPublic = false,
  reactConfigured = reactPublic,
  reactVersion = "0.4.0-next.0",
  reactComponentTag = true,
  reactPeerDependencies,
  releasePleasePlugins = [{ type: "node-workspace", updatePeerDependencies: true }],
} = {}) {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "graph-release-contract-"));
  temporaryDirectories.push(workspaceRoot);

  const directories = [graphPath, schedulerPath, "apps/storybook", "apps/e2e"];
  if (reactPublic) {
    directories.push(reactPath);
  }
  await Promise.all(directories.map((directory) => mkdir(path.join(workspaceRoot, directory), { recursive: true })));

  await writeJson(path.join(workspaceRoot, "package.json"), { name: "root", private: true });
  await writeJson(path.join(workspaceRoot, graphPath, "package.json"), {
    name: graphPackageName,
    version: graphVersion,
  });
  await writeJson(path.join(workspaceRoot, schedulerPath, "package.json"), {
    name: schedulerName,
    version: "0.0.0",
    private: schedulerPrivate,
  });
  await writeJson(path.join(workspaceRoot, "apps/storybook/package.json"), { name: "storybook", private: true });
  await writeJson(path.join(workspaceRoot, "apps/e2e/package.json"), { name: "e2e", private: true });
  await writeFile(
    path.join(workspaceRoot, graphPath, "CHANGELOG.md"),
    `# Changelog\n\n## [${graphVersion}]\n\n* Graph release notes\n`
  );

  if (reactPublic) {
    await writeJson(path.join(workspaceRoot, reactPath, "package.json"), {
      name: reactName,
      version: reactVersion,
      ...(reactPeerDependencies ? { peerDependencies: reactPeerDependencies } : {}),
    });
    await writeFile(
      path.join(workspaceRoot, reactPath, "CHANGELOG.md"),
      `# Changelog\n\n## [${reactVersion}]\n\n* React release notes\n`
    );
  }

  const packages = {};
  if (graphConfigured) {
    packages[graphPath] = { "package-name": graphName };
  }
  if (schedulerConfigured) {
    packages[schedulerPath] = { "package-name": schedulerName };
  }
  if (reactConfigured) {
    packages[reactPath] = {
      "package-name": reactName,
      component: "graph-react",
      "include-component-in-tag": reactComponentTag,
    };
  }
  await writeJson(path.join(workspaceRoot, "release-please-config.json"), {
    "release-type": "node",
    "include-component-in-tag": false,
    plugins: releasePleasePlugins,
    packages,
  });

  return workspaceRoot;
}

function graphReleaseItem(version = "2.0.0-next.0", overrides = {}) {
  return {
    name: graphName,
    path: graphPath,
    version,
    npmTag: "next",
    gitTag: `v${version}`,
    ...overrides,
  };
}

function reactReleaseItem(version = "0.4.0-next.0", overrides = {}) {
  return {
    name: reactName,
    path: reactPath,
    version,
    npmTag: "next",
    gitTag: `graph-react-v${version}`,
    ...overrides,
  };
}

function liveRelease(workspaceRoot, releasePlan = [graphReleaseItem()], overrides = {}) {
  return validateReleaseContract({
    workspaceRoot,
    branch: "v2",
    releasePlan,
    dryRun: false,
    githubPrerelease: true,
    ...overrides,
  });
}

test("accepts a single configured public package and excludes private workspaces", async () => {
  const workspaceRoot = await createWorkspace();
  const result = await liveRelease(workspaceRoot);

  assert.deepEqual(result.releasePlan, [graphReleaseItem()]);
});

test("accepts the checked-in workspace release configuration", async () => {
  await assert.doesNotReject(validateWorkspaceReleaseConfiguration());
});

test("accepts a changed-only plan when two public packages are configured", async () => {
  const workspaceRoot = await createWorkspace({ reactPublic: true });
  const result = await liveRelease(workspaceRoot);

  assert.deepEqual(result.releasePlan, [graphReleaseItem()]);
});

test("accepts two configured public packages with package-specific unique tags", async () => {
  const workspaceRoot = await createWorkspace({ reactPublic: true });
  const releasePlan = [graphReleaseItem(), reactReleaseItem()];
  const result = await liveRelease(workspaceRoot, releasePlan);

  assert.deepEqual(result.releasePlan, releasePlan);
});

test("accepts only a non-writing stable main/latest dry-run", async () => {
  const workspaceRoot = await createWorkspace({ graphVersion: "2.0.0" });
  const releasePlan = [graphReleaseItem("2.0.0", { npmTag: "latest", gitTag: null })];
  const result = await validateReleaseContract({
    workspaceRoot,
    branch: "main",
    releasePlan,
    dryRun: true,
    githubPrerelease: false,
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.releasePlan[0].gitTag, null);
});

test("fails closed when a public workspace is not configured in release-please", async () => {
  const workspaceRoot = await createWorkspace({ reactPublic: true, reactConfigured: false });

  await assert.rejects(liveRelease(workspaceRoot), /graph-react.*is not configured in release-please/);
});

test("requires release-please to propagate peer workspace dependency changes", async () => {
  const workspaceRoot = await createWorkspace({ releasePleasePlugins: ["node-workspace"] });

  await assert.rejects(liveRelease(workspaceRoot), /node-workspace plugin as an object/);
});

test("rejects pnpm workspace aliases that Release Please cannot order", async () => {
  const workspaceRoot = await createWorkspace({
    reactPublic: true,
    reactPeerDependencies: {
      graphAlias: "workspace:@gravity-ui/graph@*",
    },
  });

  await assert.rejects(
    validateWorkspaceReleaseConfiguration({ workspaceRoot }),
    /graphAlias is an unsupported workspace alias/
  );
});

test("does not permit a configured private scheduler in the release plan", async () => {
  const workspaceRoot = await createWorkspace();
  const schedulerItem = {
    name: schedulerName,
    path: schedulerPath,
    version: "0.0.0-next.0",
    npmTag: "next",
    gitTag: "graph-scheduler-v0.0.0-next.0",
  };

  await assert.rejects(liveRelease(workspaceRoot, [schedulerItem]), /Private workspace package.*must not appear/);
});

test("fails closed if the scheduler accidentally becomes public", async () => {
  const workspaceRoot = await createWorkspace({ schedulerPrivate: false });

  await assert.rejects(liveRelease(workspaceRoot), /graph-scheduler.*must remain private/);
});

test("requires future public packages to use numbered next prereleases on v2", async () => {
  const version = "0.4.0";
  const workspaceRoot = await createWorkspace({ reactPublic: true, reactVersion: version });

  await assert.rejects(
    liveRelease(workspaceRoot, [reactReleaseItem(version, { npmTag: "latest", gitTag: `graph-react-v${version}` })]),
    /may publish only under next/
  );
});

test("rejects duplicate Git tags across otherwise valid public packages", async () => {
  const version = "2.0.0-next.0";
  const workspaceRoot = await createWorkspace({
    reactPublic: true,
    reactVersion: version,
    reactComponentTag: false,
  });

  await assert.rejects(
    liveRelease(workspaceRoot, [graphReleaseItem(version), reactReleaseItem(version, { gitTag: `v${version}` })]),
    /duplicate Git tag/
  );
});

test("rejects malformed or ambiguous release plans", async () => {
  const workspaceRoot = await createWorkspace();

  await assert.rejects(liveRelease(workspaceRoot, { package: graphReleaseItem() }), /must be a JSON array/);
  await assert.rejects(
    liveRelease(workspaceRoot, [{ name: graphName, path: graphPath, version: "2.0.0-next.0" }]),
    /npmTag must be a string/
  );
  await assert.rejects(
    liveRelease(workspaceRoot, [graphReleaseItem(undefined, { artifact: "graph.tgz" })]),
    /unsupported field artifact/
  );
});

test("checks manifest versions, release channels, Git tags, and changelogs", async () => {
  const workspaceRoot = await createWorkspace();

  await assert.rejects(liveRelease(workspaceRoot, [graphReleaseItem("2.0.0-next.1")]), /must match.*package.json/);
  await assert.rejects(
    liveRelease(workspaceRoot, [graphReleaseItem(undefined, { npmTag: "latest" })]),
    /may publish only under next/
  );
  await assert.rejects(
    liveRelease(workspaceRoot, [graphReleaseItem(undefined, { gitTag: "graph-v2.0.0-next.0" })]),
    /must match release-please configuration/
  );

  await writeFile(path.join(workspaceRoot, graphPath, "CHANGELOG.md"), "# Changelog\n");
  await assert.rejects(liveRelease(workspaceRoot), /must contain version 2.0.0-next.0/);
});

test("validates complete per-package next progression state", async () => {
  const workspaceRoot = await createWorkspace({ graphVersion: "2.0.0-next.1" });
  const releasePlan = [graphReleaseItem("2.0.0-next.1")];

  await assert.doesNotReject(
    liveRelease(workspaceRoot, releasePlan, {
      currentNextByPackage: { [graphName]: "2.0.0-next.0" },
    })
  );
  await assert.rejects(
    liveRelease(workspaceRoot, releasePlan, {
      currentNextByPackage: {},
    }),
    /state is missing/
  );
  await assert.rejects(
    liveRelease(workspaceRoot, releasePlan, {
      currentNextByPackage: { [graphName]: "2.0.0-next.4" },
    }),
    /increment its numeric suffix exactly once/
  );
});

test("rejects a recovery state that is not a dependency-first publication prefix", async () => {
  const workspaceRoot = await createWorkspace({ reactPublic: true });

  await assert.rejects(
    liveRelease(workspaceRoot, [graphReleaseItem(), reactReleaseItem()], {
      currentNextByPackage: {
        [graphName]: "",
        [reactName]: "0.4.0-next.0",
      },
      alreadyPublishedByPackage: {
        [reactName]: true,
      },
    }),
    /graph-react already exists while earlier package @gravity-ui\/graph is missing/
  );
});

test("extracts only the requested changelog entry", () => {
  const changelog = [
    "# Changelog",
    "",
    "## [2.0.0-next.1](compare-link) (2026-08-27)",
    "",
    "### Features",
    "",
    "* current release",
    "",
    "## [2.0.0-next.0](compare-link) (2026-08-26)",
    "",
    "* previous release",
    "",
  ].join("\n");

  assert.equal(extractReleaseNotes(changelog, "2.0.0-next.1", graphName), "### Features\n\n* current release");
});

test("extracts a first release without a comparison link and stops at any next section", () => {
  const changelog = "# Changelog\n\n## 1.0.0 (2026-09-10)\n\n* initial release\n\n## Changelog\n\nOld preamble\n";
  assert.equal(extractReleaseNotes(changelog, "1.0.0"), "* initial release");
});

test("does not accept a version prefix or borrow notes from the next release", () => {
  for (const heading of ["1.0.00", "1.0.0-next.0", "[1.0.00](compare-link)"]) {
    assert.throws(
      () => extractReleaseNotes(`## ${heading} (2026-09-10)\n\n* other release`, "1.0.0"),
      /must contain version/
    );
  }
  assert.throws(
    () => extractReleaseNotes("## [1.0.1](compare-link)\n\n## 1.0.0 (2026-09-10)\n\n* older release", "1.0.1"),
    /must contain release notes/
  );
});

test("starts Graph at 2.0.0-next.0 and other packages at a numbered next.0", () => {
  assert.doesNotThrow(() =>
    validateNextDistTag({
      packageName: graphName,
      releaseVersion: "2.0.0-next.0",
      currentNext: "",
      alreadyPublished: false,
    })
  );
  assert.throws(
    () =>
      validateNextDistTag({
        packageName: graphName,
        releaseVersion: "2.0.0-next.1",
        currentNext: "",
        alreadyPublished: false,
      }),
    /first Graph next release/
  );
  assert.doesNotThrow(() =>
    validateNextDistTag({
      packageName: reactName,
      releaseVersion: "0.4.0-next.0",
      currentNext: "",
      alreadyPublished: false,
    })
  );
});

test("allows only exact next progression and recovery while next points to the existing version", () => {
  assert.doesNotThrow(() =>
    validateNextDistTag({
      packageName: graphName,
      releaseVersion: "2.0.0-next.10",
      currentNext: "2.0.0-next.9",
      alreadyPublished: false,
    })
  );
  assert.throws(
    () =>
      validateNextDistTag({
        packageName: graphName,
        releaseVersion: "2.0.0-next.11",
        currentNext: "2.0.0-next.9",
        alreadyPublished: false,
      }),
    /increment its numeric suffix exactly once/
  );
  assert.doesNotThrow(() =>
    validateNextDistTag({
      packageName: graphName,
      releaseVersion: "2.0.0-next.9",
      currentNext: "2.0.0-next.9",
      alreadyPublished: true,
    })
  );
  assert.throws(
    () =>
      validateNextDistTag({
        packageName: graphName,
        releaseVersion: "2.0.0-next.8",
        currentNext: "2.0.0-next.9",
        alreadyPublished: true,
      }),
    /only while next still points/
  );
});
