import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Errors, GitHub, Manifest, setLogger } from "release-please";
import { parse } from "yaml";

import { validateReleaseCandidate } from "./resolve-release-candidate.mjs";

const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const logger = { info() {}, warn() {}, error() {}, debug() {} };
setLogger(logger);
const baselineSha = "a".repeat(40);
const releaseSha = "f".repeat(40);
const graphPath = "packages/graph";
const schedulerPath = "packages/scheduler";

async function createRepository() {
  const workflow = parse(await readFile(path.join(workspaceRoot, ".github/workflows/release-v2.yml"), "utf8"));
  const action = workflow.jobs["prepare-release-pr"].steps.find((step) =>
    step.uses?.startsWith("googleapis/release-please-action@")
  );
  const files = new Map(
    await Promise.all(
      [
        "release-please-config.json",
        ".release-please-manifest.json",
        ...[graphPath, schedulerPath].flatMap((component) => [
          component + "/package.json",
          component + "/CHANGELOG.md",
        ]),
      ].map(async (file) => [file, await readFile(path.join(workspaceRoot, file), "utf8")])
    )
  );
  // Keep the bootstrap scenario reproducible after the repository's first real release.
  const config = JSON.parse(files.get("release-please-config.json"));
  config.packages = {
    [graphPath]: { ...config.packages[graphPath], "release-as": "2.0.0-next.0" },
    [schedulerPath]: config.packages[schedulerPath],
  };
  files.set("release-please-config.json", JSON.stringify(config));
  const previousManifest = { [graphPath]: "1.11.3", [schedulerPath]: "0.0.0" };
  files.set(".release-please-manifest.json", JSON.stringify(previousManifest));
  for (const component of [graphPath, schedulerPath]) {
    const manifest = JSON.parse(files.get(component + "/package.json"));
    manifest.version = previousManifest[component];
    files.set(component + "/package.json", JSON.stringify(manifest));
    files.set(component + "/CHANGELOG.md", "# Changelog\n");
  }

  const commits = [
    {
      sha: "b".repeat(40),
      message: "feat: extract private scheduler",
      files: [schedulerPath + "/src/Scheduler.ts", graphPath + "/src/lib/Scheduler.ts"],
    },
    { sha: baselineSha, message: "chore: release 1.11.3", files: [] },
  ];
  const tags = [{ name: "v1.11.3", sha: baselineSha }];
  const pullRequests = [];
  let tree;
  let releaseFiles = new Map();
  let metadataUpdates = 0;
  const model = (pr) => ({
    number: pr.number,
    headBranchName: pr.head.ref,
    baseBranchName: "v2",
    title: pr.title,
    body: pr.body,
    labels: pr.labels,
    files: [],
    sha: pr.state === "MERGED" ? releaseSha : undefined,
  });

  // Exercise real Release Please and code-suggester. Only GitHub API transport is in memory.
  const github = {
    repository: { owner: "gravity-ui", repo: "graph", defaultBranch: "v2" },
    logger,
    async getFileJson(file) {
      return JSON.parse(files.get(file));
    },
    async getFileContentsOnBranch(file) {
      if (!files.has(file)) throw new Errors.FileNotFoundError(file);
      return {
        parsedContent: files.get(file),
        content: Buffer.from(files.get(file)).toString("base64"),
        sha: baselineSha,
      };
    },
    async *releaseIterator() {},
    async *tagIterator() {
      yield* tags;
    },
    async *mergeCommitIterator() {
      yield* commits;
    },
    async *pullRequestIterator(_branch, state) {
      yield* pullRequests.filter((pr) => pr.state === state).map(model);
    },
    async getPullRequest(number) {
      return model(pullRequests.find((pr) => pr.number === number));
    },
    gitHubApi: {
      async updatePullRequest(number, title, body) {
        const pr = pullRequests.find((item) => item.number === number);
        Object.assign(pr, { title, body });
        metadataUpdates++;
        return model(pr);
      },
    },
    octokit: {
      repos: {
        async getBranch() {
          return { data: { commit: { sha: baselineSha } } };
        },
      },
      git: {
        async getRef() {
          return { data: { ref: "refs/heads/release-please--branches--v2" } };
        },
        async getCommit() {
          return { data: { tree: { sha: baselineSha } } };
        },
        async createTree(args) {
          tree = args.tree;
          return { data: { sha: "e".repeat(40) } };
        },
        async createCommit() {
          return { data: { sha: releaseSha, url: "memory://commit" } };
        },
        async updateRef() {
          releaseFiles = new Map(tree.map((item) => [item.path, item.content]));
          return {};
        },
      },
      pulls: {
        async list() {
          return { data: pullRequests.filter((pr) => pr.state === "OPEN") };
        },
        async create(args) {
          const pr = {
            ...args,
            number: 100 + pullRequests.length,
            head: { ref: args.head.split(":")[1], label: args.head },
            labels: [],
            state: "OPEN",
          };
          pullRequests.push(pr);
          return { data: pr };
        },
      },
      issues: {
        async addLabels(args) {
          const pr = pullRequests.find((item) => item.number === args.issue_number);
          pr.labels = [...new Set([...pr.labels, ...args.labels])];
          return { data: pr.labels.map((name) => ({ name })) };
        },
      },
    },
  };
  for (const method of ["buildChangeSet", "createPullRequest", "updatePullRequest"]) {
    github[method] = GitHub.prototype[method];
  }
  return {
    workflow,
    files,
    commits,
    tags,
    pullRequests,
    previousManifest,
    get releaseFiles() {
      return releaseFiles;
    },
    get metadataUpdates() {
      return metadataUpdates;
    },
    manifest: () =>
      Manifest.fromManifest(github, "v2", "release-please-config.json", ".release-please-manifest.json", {
        skipLabeling: action.with?.["skip-labeling"] === true,
      }),
  };
}

test("the actual first Release Please PR passes the candidate validator", async () => {
  const repo = await createRepository();
  await (await repo.manifest()).createPullRequests();
  const pr = repo.pullRequests[0];
  const result = validateReleaseCandidate({
    releaseSha,
    pullRequest: {
      number: pr.number,
      merged_at: "2026-09-10T00:00:00Z",
      merge_commit_sha: releaseSha,
      base: { ref: "v2" },
      head: { ref: pr.head.ref, repo: { full_name: "gravity-ui/graph" } },
      user: { login: "gravity-ui[bot]", type: "Bot" },
    },
    pullRequestFiles: [...repo.releaseFiles]
      .filter(([file, content]) => repo.files.get(file) !== content)
      .map(([filename]) => ({ filename })),
    releasePleaseConfig: JSON.parse(repo.files.get("release-please-config.json")),
    previousReleaseManifest: repo.previousManifest,
    currentReleaseManifest: JSON.parse(repo.releaseFiles.get(".release-please-manifest.json")),
    packageManifests: Object.fromEntries(
      [graphPath, schedulerPath].map((component) => [
        component,
        JSON.parse(repo.releaseFiles.get(component + "/package.json")),
      ])
    ),
    changelogs: Object.fromEntries(
      [graphPath, schedulerPath].map((component) => [component, repo.releaseFiles.get(component + "/CHANGELOG.md")])
    ),
  });
  assert.match(repo.releaseFiles.get(schedulerPath + "/CHANGELOG.md"), /^## 1\.0\.0 /m);
  assert.deepEqual(
    result.releasePlan.map((item) => [item.name, item.version]),
    [["@gravity-ui/graph", "2.0.0-next.0"]]
  );
  assert.deepEqual(
    result.tagPlan.map((item) => [item.name, item.private]),
    [
      ["@gravity-ui/graph-scheduler", true],
      ["@gravity-ui/graph", false],
    ]
  );
});

test("later commits update the same release PR description and changelog", async () => {
  const repo = await createRepository();
  await (await repo.manifest()).createPullRequests();
  repo.commits.unshift({
    sha: "c".repeat(40),
    message: "feat: add another useful feature",
    files: [graphPath + "/src/graph.ts"],
  });
  await (await repo.manifest()).createPullRequests();
  assert.equal(repo.pullRequests.length, 1);
  assert.equal(repo.metadataUpdates, 1);
  assert.match(repo.pullRequests[0].body, /add another useful feature/);
  assert.match(repo.releaseFiles.get(graphPath + "/CHANGELOG.md"), /add another useful feature/);
});

test("an incomplete release blocks the next PR until the workflow completes its label lifecycle", async () => {
  const repo = await createRepository();
  await (await repo.manifest()).createPullRequests();
  const pr = repo.pullRequests[0];
  pr.state = "MERGED";
  pr.labels.push("keep-this-label");
  for (const [file, content] of repo.releaseFiles) repo.files.set(file, content);
  repo.tags.push({ name: "v2.0.0-next.0", sha: releaseSha }, { name: "scheduler-v1.0.0", sha: releaseSha });
  const config = JSON.parse(repo.files.get("release-please-config.json"));
  delete config.packages[graphPath]["release-as"];
  repo.files.set("release-please-config.json", JSON.stringify(config));
  repo.commits.unshift(
    { sha: "d".repeat(40), message: "fix: improve graph behavior", files: [graphPath + "/src/graph.ts"] },
    { sha: releaseSha, message: "chore: release v2", files: [...repo.releaseFiles.keys()] }
  );
  assert.deepEqual(await (await repo.manifest()).createPullRequests(), []);

  const steps = repo.workflow.jobs["publish-release"].steps;
  const complete = steps.find((step) => step.id === "complete-release-pr");
  assert.equal(complete, steps.at(-1));
  assert.equal(complete.if, undefined, "Label completion must use the default success condition.");
  const token = steps.find((step) => step.id === "generate-release-token");
  assert.equal(token.with["permission-pull-requests"], "write");

  const directory = await mkdtemp(path.join(tmpdir(), "graph-release-pr-labels-"));
  try {
    const stateFile = path.join(directory, "labels.json");
    const gh = path.join(directory, "gh");
    // Execute the checked-in workflow command against a local CLI double; no GitHub writes.
    await writeFile(
      gh,
      [
        "#!" + process.execPath,
        'const fs = require("node:fs");',
        'const assert = require("node:assert/strict");',
        "const args = process.argv.slice(2);",
        'assert.deepEqual(args.slice(0, 5), ["pr", "edit", "100", "--repo", "gravity-ui/graph"]);',
        "const labels = new Set(JSON.parse(fs.readFileSync(process.env.LABELS_PATH, 'utf8')));",
        "for (let i = 5; i < args.length; i += 2) {",
        "  if (args[i] === '--add-label') labels.add(args[i + 1]);",
        "  else if (args[i] === '--remove-label') labels.delete(args[i + 1]);",
        "  else throw new Error('Unexpected gh argument: ' + args[i]);",
        "}",
        "fs.writeFileSync(process.env.LABELS_PATH, JSON.stringify([...labels]));",
      ].join("\n")
    );
    await chmod(gh, 0o755);
    await writeFile(stateFile, JSON.stringify(pr.labels));
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = spawnSync("bash", ["-e", "-c", complete.run], {
        env: {
          PATH: directory + path.delimiter + process.env.PATH,
          RELEASE_PR: String(pr.number),
          GH_REPO: "gravity-ui/graph",
          LABELS_PATH: stateFile,
        },
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
    }
    pr.labels = JSON.parse(await readFile(stateFile, "utf8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  assert.deepEqual(new Set(pr.labels), new Set(["keep-this-label", "autorelease: tagged"]));
  await (await repo.manifest()).createPullRequests();
  assert.equal(repo.pullRequests.length, 2);
  assert.match(repo.pullRequests[1].body, /2\.0\.0-next\.1/);
  assert.match(repo.pullRequests[1].body, /improve graph behavior/);
});
