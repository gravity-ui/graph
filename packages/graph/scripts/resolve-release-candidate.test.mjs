import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import {
  deriveChangedComponentPaths,
  resolveReleaseCandidateFromGithub,
  selectReleasePleasePullRequest,
  validateReleaseCandidate,
} from "./resolve-release-candidate.mjs";

const graphPath = "packages/graph";
const schedulerPath = "packages/scheduler";
const releaseSha = "0123456789abcdef0123456789abcdef01234567";
const firstParentSha = "abcdef0123456789abcdef0123456789abcdef01";
const graphVersion = "2.0.0-next.0";
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function releasePleaseConfig(extraPackages = {}) {
  return {
    "release-type": "node",
    "skip-github-release": true,
    "separate-pull-requests": false,
    "always-link-local": true,
    plugins: [{ type: "node-workspace", updatePeerDependencies: true }],
    packages: {
      [graphPath]: {
        "package-name": "@gravity-ui/graph",
        component: "graph",
        versioning: "prerelease",
        prerelease: true,
        "prerelease-type": "next",
        "include-component-in-tag": false,
        "include-v-in-tag": true,
      },
      [schedulerPath]: {
        "package-name": "@gravity-ui/graph-scheduler",
        component: "scheduler",
        "skip-github-release": true,
      },
      ...extraPackages,
    },
  };
}

function releasePleasePullRequest(overrides = {}) {
  return {
    number: 123,
    merged_at: "2026-08-27T10:00:00Z",
    merge_commit_sha: releaseSha,
    base: { ref: "v2" },
    head: {
      ref: "release-please--branches--v2",
      repo: { full_name: "gravity-ui/graph" },
    },
    user: { login: "gravity-ui[bot]", type: "Bot" },
    ...overrides,
  };
}

function releaseFiles(componentPaths) {
  return [
    { filename: ".release-please-manifest.json" },
    ...componentPaths.flatMap((componentPath) => [
      { filename: `${componentPath}/CHANGELOG.md` },
      { filename: `${componentPath}/package.json` },
    ]),
  ];
}

function changelog(version, notes = "* release notes") {
  return `# Changelog\n\n## [${version}](compare-link) (2026-08-27)\n\n${notes}\n`;
}

function releaseCandidate(overrides = {}) {
  return {
    releaseSha,
    pullRequest: releasePleasePullRequest(),
    pullRequestFiles: releaseFiles([graphPath, schedulerPath]),
    releasePleaseConfig: releasePleaseConfig(),
    previousReleaseManifest: {
      [graphPath]: "1.11.3",
      [schedulerPath]: "0.0.0",
    },
    currentReleaseManifest: {
      [graphPath]: graphVersion,
      [schedulerPath]: "0.0.1",
    },
    packageManifests: {
      [graphPath]: {
        name: "@gravity-ui/graph",
        version: graphVersion,
        devDependencies: { "@gravity-ui/graph-scheduler": "workspace:*" },
      },
      [schedulerPath]: {
        name: "@gravity-ui/graph-scheduler",
        version: "0.0.1",
        private: true,
      },
    },
    changelogs: {
      [graphPath]: changelog(graphVersion),
      [schedulerPath]: changelog("0.0.1", "* preserve scheduler behavior"),
    },
    ...overrides,
  };
}

test("derives the manifest delta and publishes only Graph when scheduler and Graph advance", () => {
  const pullRequest = releasePleasePullRequest();
  assert.equal(
    selectReleasePleasePullRequest({ pullRequests: [pullRequest], releaseSha, expectedVersion: graphVersion }),
    pullRequest
  );

  assert.deepEqual(validateReleaseCandidate(releaseCandidate({ expectedVersion: graphVersion })), {
    candidate: true,
    releasePlan: [
      {
        name: "@gravity-ui/graph",
        path: graphPath,
        version: graphVersion,
        npmTag: "next",
        gitTag: `v${graphVersion}`,
      },
    ],
    tagPlan: [
      {
        name: "@gravity-ui/graph-scheduler",
        path: schedulerPath,
        version: "0.0.1",
        gitTag: "scheduler-v0.0.1",
        private: true,
        previousVersion: "0.0.0",
      },
      {
        name: "@gravity-ui/graph",
        path: graphPath,
        version: graphVersion,
        gitTag: `v${graphVersion}`,
        private: false,
        previousVersion: "1.11.3",
      },
    ],
    changedPaths: [graphPath, schedulerPath],
    releasedPaths: [graphPath],
    version: graphVersion,
    tag: `v${graphVersion}`,
    sha: releaseSha,
    pr: 123,
  });
});

test("treats a valid scheduler-only manifest delta as a non-public candidate", () => {
  const result = validateReleaseCandidate(
    releaseCandidate({
      pullRequestFiles: releaseFiles([schedulerPath]),
      previousReleaseManifest: { [graphPath]: "1.11.3", [schedulerPath]: "0.0.0" },
      currentReleaseManifest: { [graphPath]: "1.11.3", [schedulerPath]: "0.0.1" },
      packageManifests: {
        [schedulerPath]: {
          name: "@gravity-ui/graph-scheduler",
          version: "0.0.1",
          private: true,
        },
      },
      changelogs: { [schedulerPath]: changelog("0.0.1") },
    })
  );

  assert.deepEqual(result, {
    candidate: false,
    releasePlan: [],
    tagPlan: [
      {
        name: "@gravity-ui/graph-scheduler",
        path: schedulerPath,
        version: "0.0.1",
        gitTag: "scheduler-v0.0.1",
        private: true,
        previousVersion: "0.0.0",
      },
    ],
    changedPaths: [schedulerPath],
    releasedPaths: [],
    version: undefined,
    tag: undefined,
    sha: releaseSha,
    pr: 123,
  });
});

test("builds a release plan for an additional configured public component", () => {
  const reactPath = "packages/graph-react";
  const config = releasePleaseConfig({
    [reactPath]: {
      "package-name": "@gravity-ui/graph-react",
      component: "graph-react",
    },
  });
  const result = validateReleaseCandidate(
    releaseCandidate({
      pullRequestFiles: releaseFiles([reactPath]),
      releasePleaseConfig: config,
      previousReleaseManifest: {
        [graphPath]: "1.11.3",
        [schedulerPath]: "0.0.0",
        [reactPath]: "0.1.0",
      },
      currentReleaseManifest: {
        [graphPath]: "1.11.3",
        [schedulerPath]: "0.0.0",
        [reactPath]: "0.2.0",
      },
      packageManifests: {
        [reactPath]: {
          name: "@gravity-ui/graph-react",
          version: "0.2.0",
          dependencies: { "@gravity-ui/graph": "workspace:^" },
        },
      },
      changelogs: { [reactPath]: changelog("0.2.0") },
    })
  );

  assert.deepEqual(result.releasePlan, [
    {
      name: "@gravity-ui/graph-react",
      path: reactPath,
      version: "0.2.0",
      npmTag: "latest",
      gitTag: "graph-react-v0.2.0",
    },
  ]);
  assert.deepEqual(result.tagPlan, [
    {
      name: "@gravity-ui/graph-react",
      path: reactPath,
      version: "0.2.0",
      gitTag: "graph-react-v0.2.0",
      private: false,
      previousVersion: "0.1.0",
    },
  ]);
  assert.equal(result.candidate, true);
  assert.deepEqual(result.releasedPaths, [reactPath]);
});

test("orders a peer-only public consumer after its changed workspace dependency", () => {
  const reactPath = "packages/graph-react";
  const reactVersion = "0.2.0-next.0";
  const config = releasePleaseConfig({
    [reactPath]: {
      "package-name": "@gravity-ui/graph-react",
      component: "graph-react",
      versioning: "prerelease",
      prerelease: true,
      "prerelease-type": "next",
    },
  });
  const result = validateReleaseCandidate(
    releaseCandidate({
      pullRequestFiles: releaseFiles([graphPath, reactPath]),
      releasePleaseConfig: config,
      previousReleaseManifest: {
        [graphPath]: "1.11.3",
        [schedulerPath]: "0.0.0",
        [reactPath]: "0.1.0",
      },
      currentReleaseManifest: {
        [graphPath]: graphVersion,
        [schedulerPath]: "0.0.0",
        [reactPath]: reactVersion,
      },
      packageManifests: {
        [graphPath]: { name: "@gravity-ui/graph", version: graphVersion },
        [reactPath]: {
          name: "@gravity-ui/graph-react",
          version: reactVersion,
          peerDependencies: { "@gravity-ui/graph": "workspace:^" },
        },
      },
      changelogs: {
        [graphPath]: changelog(graphVersion),
        [reactPath]: changelog(reactVersion),
      },
    })
  );

  assert.deepEqual(
    result.releasePlan.map(({ name }) => name),
    ["@gravity-ui/graph", "@gravity-ui/graph-react"]
  );
});

test("orders public packages after their changed workspace dependencies", () => {
  const rendererPath = "packages/renderer";
  const rtreePath = "packages/rtree";
  const extraConfig = {
    [rendererPath]: { "package-name": "@gravity-ui/graph-renderer", component: "renderer" },
    [rtreePath]: { "package-name": "@gravity-ui/graph-rtree", component: "rtree" },
  };
  const previous = {
    [graphPath]: "1.11.3",
    [schedulerPath]: "0.0.0",
    [rendererPath]: "1.0.0",
    [rtreePath]: "1.0.0",
  };
  const current = { ...previous, [rendererPath]: "1.0.1", [rtreePath]: "1.0.1" };
  const result = validateReleaseCandidate(
    releaseCandidate({
      pullRequestFiles: releaseFiles([rendererPath, rtreePath]),
      releasePleaseConfig: releasePleaseConfig(extraConfig),
      previousReleaseManifest: previous,
      currentReleaseManifest: current,
      packageManifests: {
        [rendererPath]: {
          name: "@gravity-ui/graph-renderer",
          version: "1.0.1",
          optionalDependencies: { "@gravity-ui/graph-rtree": "workspace:^" },
        },
        [rtreePath]: { name: "@gravity-ui/graph-rtree", version: "1.0.1" },
      },
      changelogs: {
        [rendererPath]: changelog("1.0.1"),
        [rtreePath]: changelog("1.0.1"),
      },
    })
  );

  assert.deepEqual(
    result.releasePlan.map(({ name }) => name),
    ["@gravity-ui/graph-rtree", "@gravity-ui/graph-renderer"]
  );
  assert.deepEqual(
    result.tagPlan.map(({ name }) => name),
    ["@gravity-ui/graph-rtree", "@gravity-ui/graph-renderer"]
  );
});

test("rejects dependency cycles and duplicate component package names", () => {
  const packageAPath = "packages/a";
  const packageBPath = "packages/b";
  const config = releasePleaseConfig({
    [packageAPath]: { "package-name": "@gravity-ui/a", component: "a" },
    [packageBPath]: { "package-name": "@gravity-ui/b", component: "b" },
  });
  const previous = {
    [graphPath]: "1.11.3",
    [schedulerPath]: "0.0.0",
    [packageAPath]: "1.0.0",
    [packageBPath]: "1.0.0",
  };
  const current = { ...previous, [packageAPath]: "1.0.1", [packageBPath]: "1.0.1" };
  const common = {
    pullRequestFiles: releaseFiles([packageAPath, packageBPath]),
    releasePleaseConfig: config,
    previousReleaseManifest: previous,
    currentReleaseManifest: current,
    changelogs: {
      [packageAPath]: changelog("1.0.1"),
      [packageBPath]: changelog("1.0.1"),
    },
  };

  assert.throws(
    () =>
      validateReleaseCandidate(
        releaseCandidate({
          ...common,
          packageManifests: {
            [packageAPath]: {
              name: "@gravity-ui/a",
              version: "1.0.1",
              dependencies: { "@gravity-ui/b": "workspace:^" },
            },
            [packageBPath]: {
              name: "@gravity-ui/b",
              version: "1.0.1",
              peerDependencies: { "@gravity-ui/a": "workspace:^" },
            },
          },
        })
      ),
    /dependency cycle/
  );

  const duplicateConfig = releasePleaseConfig({
    [packageAPath]: { "package-name": "@gravity-ui/a", component: "a" },
    [packageBPath]: { "package-name": "@gravity-ui/a", component: "b" },
  });
  assert.throws(
    () =>
      validateReleaseCandidate(
        releaseCandidate({
          ...common,
          releasePleaseConfig: duplicateConfig,
          packageManifests: {
            [packageAPath]: { name: "@gravity-ui/a", version: "1.0.1" },
            [packageBPath]: { name: "@gravity-ui/a", version: "1.0.1" },
          },
        })
      ),
    /Duplicate component package name/
  );
});

test("rejects an arbitrary file in the reviewed Release Please pull request", () => {
  assert.throws(
    () =>
      validateReleaseCandidate(
        releaseCandidate({
          pullRequestFiles: [...releaseFiles([graphPath, schedulerPath]), { filename: "scripts/publish.mjs" }],
        })
      ),
    /must change exactly/
  );
});

test("rejects manifest/config and manifest/package version disagreement", () => {
  assert.throws(
    () =>
      deriveChangedComponentPaths({
        releasePleaseConfig: releasePleaseConfig(),
        previousReleaseManifest: { [graphPath]: "1.11.3", [schedulerPath]: "0.0.0" },
        currentReleaseManifest: {
          [graphPath]: graphVersion,
          [schedulerPath]: "0.0.1",
          "packages/unconfigured": "1.0.0",
        },
      }),
    /exactly the configured/
  );
  assert.throws(
    () =>
      validateReleaseCandidate(
        releaseCandidate({
          packageManifests: {
            [graphPath]: { name: "@gravity-ui/graph", version: "2.0.0-next.1" },
            [schedulerPath]: {
              name: "@gravity-ui/graph-scheduler",
              version: "0.0.1",
              private: true,
            },
          },
        })
      ),
    /must match .release-please-manifest.json/
  );
});

test("rejects a public scheduler and an empty component changelog entry", () => {
  assert.throws(
    () =>
      validateReleaseCandidate(
        releaseCandidate({
          packageManifests: {
            [graphPath]: { name: "@gravity-ui/graph", version: graphVersion },
            [schedulerPath]: { name: "@gravity-ui/graph-scheduler", version: "0.0.1" },
          },
        })
      ),
    /scheduler component must remain private/
  );
  assert.throws(
    () =>
      validateReleaseCandidate(
        releaseCandidate({
          changelogs: {
            [graphPath]: `# Changelog\n\n## [${graphVersion}]\n`,
            [schedulerPath]: changelog("0.0.1"),
          },
        })
      ),
    /must contain release notes/
  );
});

test("treats an ordinary push without a qualifying pull request as a non-candidate", () => {
  assert.equal(selectReleasePleasePullRequest({ pullRequests: [{ number: 456 }], releaseSha }), undefined);
});

test("fails recovery when its expected release has no qualifying pull request", () => {
  assert.throws(
    () => selectReleasePleasePullRequest({ pullRequests: [], releaseSha, expectedVersion: graphVersion }),
    /not the merge commit of a Release Please pull request/
  );
  assert.throws(
    () => selectReleasePleasePullRequest({ pullRequests: [], releaseSha, expectedReleasePlan: [] }),
    /not the merge commit of a Release Please pull request/
  );
});

test("rejects a recovery expectation that differs from the exact public plan", () => {
  assert.throws(
    () => validateReleaseCandidate(releaseCandidate({ expectedVersion: "2.0.0-next.1" })),
    /does not match EXPECTED_RELEASE_VERSION/
  );
  assert.throws(
    () =>
      validateReleaseCandidate(
        releaseCandidate({
          expectedReleasePlan: [
            {
              name: "@gravity-ui/graph",
              path: graphPath,
              version: "2.0.0-next.1",
              npmTag: "next",
              gitTag: "v2.0.0-next.1",
            },
          ],
        })
      ),
    /does not match EXPECTED_RELEASE_PLAN/
  );
});

test("does not select the wrong base, branch, author, repository, or merge SHA", () => {
  const untrustedPullRequests = [
    releasePleasePullRequest({ base: { ref: "main" } }),
    releasePleasePullRequest({ head: { ref: "release-please--branches--v2--components--graph" } }),
    releasePleasePullRequest({ user: { login: "someone-else", type: "User" } }),
    releasePleasePullRequest({
      head: { ref: "release-please--branches--v2", repo: { full_name: "fork/graph" } },
    }),
    releasePleasePullRequest({ merge_commit_sha: firstParentSha }),
  ];

  for (const pullRequest of untrustedPullRequests) {
    assert.equal(selectReleasePleasePullRequest({ pullRequests: [pullRequest], releaseSha }), undefined);
  }
});

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function createWorkspace() {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "graph-release-candidate-"));
  temporaryDirectories.push(workspaceRoot);
  await Promise.all(
    [graphPath, schedulerPath].map((componentPath) =>
      mkdir(path.join(workspaceRoot, componentPath), { recursive: true })
    )
  );
  await writeJson(path.join(workspaceRoot, "release-please-config.json"), releasePleaseConfig());
  await writeJson(path.join(workspaceRoot, ".release-please-manifest.json"), {
    [graphPath]: graphVersion,
    [schedulerPath]: "0.0.1",
  });
  await writeJson(path.join(workspaceRoot, graphPath, "package.json"), {
    name: "@gravity-ui/graph",
    version: graphVersion,
    devDependencies: { "@gravity-ui/graph-scheduler": "workspace:*" },
  });
  await writeJson(path.join(workspaceRoot, schedulerPath, "package.json"), {
    name: "@gravity-ui/graph-scheduler",
    version: "0.0.1",
    private: true,
  });
  await writeFile(path.join(workspaceRoot, graphPath, "CHANGELOG.md"), changelog(graphVersion));
  await writeFile(path.join(workspaceRoot, schedulerPath, "CHANGELOG.md"), changelog("0.0.1"));
  const outputPath = path.join(workspaceRoot, "github-output");
  await writeFile(outputPath, "");

  return { workspaceRoot, outputPath };
}

function githubFetch({ requestedUrls, pullRequests = [releasePleasePullRequest()] }) {
  return async (url) => {
    requestedUrls.push(url);
    let payload;
    if (url.includes(`/commits/${releaseSha}/pulls`)) {
      payload = pullRequests;
    } else if (url.includes("/pulls/123/files?")) {
      payload = releaseFiles([graphPath, schedulerPath]);
    } else if (url.endsWith(`/commits/${releaseSha}`)) {
      payload = { parents: [{ sha: firstParentSha }] };
    } else if (url.includes("/contents/.release-please-manifest.json?")) {
      payload = {
        type: "file",
        encoding: "base64",
        content: Buffer.from(JSON.stringify({ [graphPath]: "1.11.3", [schedulerPath]: "0.0.0" })).toString("base64"),
      };
    } else {
      throw new Error(`Unexpected URL: ${url}`);
    }

    return { ok: true, json: async () => payload };
  };
}

test("resolves the first-parent manifest and writes the vector workflow outputs", async () => {
  const { workspaceRoot, outputPath } = await createWorkspace();
  const requestedUrls = [];
  const expectedPlan = [
    {
      name: "@gravity-ui/graph",
      path: graphPath,
      version: graphVersion,
      npmTag: "next",
      gitTag: `v${graphVersion}`,
    },
  ];
  const expectedTagPlan = [
    {
      name: "@gravity-ui/graph-scheduler",
      path: schedulerPath,
      version: "0.0.1",
      gitTag: "scheduler-v0.0.1",
      private: true,
      previousVersion: "0.0.0",
    },
    {
      name: "@gravity-ui/graph",
      path: graphPath,
      version: graphVersion,
      gitTag: `v${graphVersion}`,
      private: false,
      previousVersion: "1.11.3",
    },
  ];
  const result = await resolveReleaseCandidateFromGithub({
    env: {
      RELEASE_SHA: releaseSha,
      EXPECTED_RELEASE_PLAN: JSON.stringify(expectedPlan),
      GITHUB_REPOSITORY: "gravity-ui/graph",
      GITHUB_TOKEN: "test-token",
      GITHUB_OUTPUT: outputPath,
    },
    fetchImpl: githubFetch({ requestedUrls }),
    workspaceRoot,
  });

  assert.deepEqual(result.releasePlan, expectedPlan);
  assert.deepEqual(result.tagPlan, expectedTagPlan);
  assert.deepEqual(requestedUrls, [
    `https://api.github.com/repos/gravity-ui/graph/commits/${releaseSha}/pulls?per_page=100`,
    "https://api.github.com/repos/gravity-ui/graph/pulls/123/files?per_page=100&page=1",
    `https://api.github.com/repos/gravity-ui/graph/commits/${releaseSha}`,
    `https://api.github.com/repos/gravity-ui/graph/contents/.release-please-manifest.json?ref=${firstParentSha}`,
  ]);
  assert.equal(
    await readFile(outputPath, "utf8"),
    [
      "candidate=true",
      `release_plan=${JSON.stringify(expectedPlan)}`,
      `tag_plan=${JSON.stringify(expectedTagPlan)}`,
      `version=${graphVersion}`,
      `tag=v${graphVersion}`,
      `sha=${releaseSha}`,
      `changed_paths=${JSON.stringify([graphPath, schedulerPath])}`,
      `released_paths=${JSON.stringify([graphPath])}`,
      "pr=123",
      "",
    ].join("\n")
  );
});

test("writes an empty plan for an ordinary push without fetching its parent manifest", async () => {
  const { workspaceRoot, outputPath } = await createWorkspace();
  const requestedUrls = [];
  const result = await resolveReleaseCandidateFromGithub({
    env: {
      GITHUB_SHA: releaseSha,
      GITHUB_REPOSITORY: "gravity-ui/graph",
      GITHUB_TOKEN: "test-token",
      GITHUB_OUTPUT: outputPath,
    },
    fetchImpl: githubFetch({ requestedUrls, pullRequests: [] }),
    workspaceRoot,
  });

  assert.deepEqual(result, {
    candidate: false,
    releasePlan: [],
    tagPlan: [],
    sha: releaseSha,
    changedPaths: [],
    releasedPaths: [],
  });
  assert.deepEqual(requestedUrls, [
    `https://api.github.com/repos/gravity-ui/graph/commits/${releaseSha}/pulls?per_page=100`,
  ]);
  assert.equal(
    await readFile(outputPath, "utf8"),
    [
      "candidate=false",
      "release_plan=[]",
      "tag_plan=[]",
      "version=",
      "tag=",
      `sha=${releaseSha}`,
      "changed_paths=[]",
      "released_paths=[]",
      "pr=",
      "",
    ].join("\n")
  );
});
