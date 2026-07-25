import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../..");
const workflowsDirectory = path.join(root, ".github/workflows");
const routes = JSON.parse(fs.readFileSync(path.join(directory, "routes.json"), "utf8"));

function fail(message) {
  throw new Error(message);
}

function readWorkflow(name) {
  const YAML = require("yaml");
  return YAML.parse(fs.readFileSync(path.join(workflowsDirectory, name), "utf8"));
}

function branchesFor(workflow, event) {
  const trigger = workflow.on?.[event];
  if (!trigger) {
    return [];
  }
  return Array.isArray(trigger.branches) ? trigger.branches : [];
}

function allSteps(workflow) {
  return Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
}

function actionStep(workflow) {
  const steps = allSteps(workflow).filter((step) => step.uses === "gravity-ui/release-action@v1");
  assert(steps.length > 0, "release workflow must invoke gravity-ui/release-action@v1");
  return steps;
}

function hasRun(workflow, command) {
  return allSteps(workflow).some((step) => String(step.run ?? "").includes(command));
}

function assertGuardBeforeCredentialsAndRelease(workflow, jobName) {
  const steps = workflow.jobs[jobName].steps;
  const guardIndex = steps.findIndex((step) => step.name === "Validate release route");
  const tokenIndex = steps.findIndex((step) => step.uses === "actions/create-github-app-token@v2");
  const releaseIndex = steps.findIndex((step) => step.uses === "gravity-ui/release-action@v1");
  assert(guardIndex >= 0, `${jobName} is missing its route guard`);
  assert(tokenIndex > guardIndex, `${jobName} must validate before minting an App token`);
  assert(releaseIndex > tokenIndex, `${jobName} must mint the token only after validation`);
}

function validateRouteMatrix() {
  const expectedRoutes = {
    "pre-cutover-v1": ["pre-cutover", "main", 1, false, "latest", true],
    "pre-cutover-v2": ["pre-cutover", "v2", 2, true, "next", true],
    "post-cutover-v1": ["post-cutover", "release/v1", 1, false, "v1", false],
    "post-cutover-v2": ["post-cutover", "main", 2, false, "latest", false],
  };

  assert.equal(routes.activePhase, "pre-cutover");
  assert.equal(routes.branchCreationPolicy, "skip-release-job");
  for (const [name, expected] of Object.entries(expectedRoutes)) {
    const route = routes.releaseRoutes[name];
    assert(route, `missing release route ${name}`);
    assert.deepEqual(
      [route.phase, route.branch, route.major, route.prerelease, route.distTag, route.active],
      expected,
      `invalid release route ${name}`
    );
    const sampleVersion = route.prerelease ? `${route.major}.0.0-next.0` : `${route.major}.0.0`;
    assert(versionMatchesRoute(sampleVersion, route), `${name} must accept its declared version shape`);
    const wrongPrerelease = route.prerelease ? `${route.major}.0.0` : `${route.major}.0.0-next.0`;
    assert(!versionMatchesRoute(wrongPrerelease, route), `${name} must reject the wrong prerelease shape`);
    assert(!versionMatchesRoute(`${route.major + 1}.0.0`, route), `${name} must reject another major`);
  }

  assert.notEqual(
    routes.previewRoutes.main.destination,
    routes.previewRoutes.v2.destination,
    "main and v2 preview destinations must differ"
  );
}

function validateCi() {
  for (const name of ["ci.yaml", "e2e.yml"]) {
    const workflow = readWorkflow(name);
    assert(Object.hasOwn(workflow.on ?? {}, "pull_request"), `${name} must run for pull requests`);
    assert.deepEqual(
      [...branchesFor(workflow, "push")].sort(),
      ["main", "v2"],
      `${name} must run on pushes to main and v2`
    );
  }

  const ci = readWorkflow("ci.yaml");
  assert.equal(ci.jobs.tests?.name, "Tests", "unit tests must remain a separate Tests check");
  const packageContractJob = ci.jobs.package_contract;
  assert(packageContractJob, "CI must define a separate package_contract job");
  assert.equal(packageContractJob.name, "Package Contract", "package contract check must keep its stable display name");
  const packageContractCommands = (packageContractJob.steps ?? [])
    .filter((step) => step.run !== undefined)
    .map((step) => String(step.run).trim());
  assert(
    packageContractCommands.includes("npm run test:package-contract"),
    "Package Contract job must run the exact package-contract command"
  );
  assert(
    !(ci.jobs.tests.steps ?? []).some((step) => String(step.run ?? "").trim() === "npm run test:package-contract"),
    "Package Contract must not be folded into the Tests job"
  );
  assert(
    hasRun(ci, ".github/release-routing/validate.mjs check-workflows"),
    "CI must validate release routing and workflow wiring"
  );
}

function validatePreviews() {
  for (const branch of ["main", "v2"]) {
    const route = routes.previewRoutes[branch];
    const workflow = readWorkflow(route.workflow);
    assert.deepEqual(branchesFor(workflow, "push"), [branch]);
    const upload = allSteps(workflow).find((step) => step.uses === "gravity-ui/preview-upload-to-s3-action@v1");
    assert(upload, `${route.workflow} must upload its preview`);
    assert.equal(upload.with?.["dest-path"], route.destination);
  }
}

function validateReleaseWorkflows() {
  const zeroRevision = "0000000000000000000000000000000000000000";
  const v1 = readWorkflow("release-v1.yml");
  assert.deepEqual([...branchesFor(v1, "push")].sort(), ["main", "release/v1"]);
  assert.equal(actionStep(v1).length, 2);
  assert(
    actionStep(v1).some((step) => step.with?.["default-branch"] === "main" && step.with?.["npm-dist-tag"] === "latest")
  );
  const v1MainGuard = String(v1.jobs["release-main"].steps.find((step) => step.name === "Validate release route")?.run);
  assert(v1MainGuard.includes("--route pre-cutover-v1"));
  assert(v1MainGuard.includes("--dist-tag latest"));
  assert(v1MainGuard.includes("--prerelease false"));
  assert(String(v1.jobs["release-main"].if).includes(`github.event.before != '${zeroRevision}'`));
  assertGuardBeforeCredentialsAndRelease(v1, "release-main");
  const v1MaintenanceGuard = String(
    v1.jobs["release-maintenance"].steps.find((step) => step.name === "Validate release route")?.run
  );
  assert(v1MaintenanceGuard.includes("--route post-cutover-v1"));
  assert(v1MaintenanceGuard.includes("--dist-tag v1"));
  assert(v1MaintenanceGuard.includes("--prerelease false"));
  assert(String(v1.jobs["release-maintenance"].if).includes(`github.event.before != '${zeroRevision}'`));
  assertGuardBeforeCredentialsAndRelease(v1, "release-maintenance");
  assert(
    actionStep(v1).some(
      (step) => step.with?.["default-branch"] === "release/v1" && step.with?.["npm-dist-tag"] === "v1"
    )
  );

  const v2 = readWorkflow("release-v2.yml");
  assert.deepEqual(branchesFor(v2, "push"), ["v2"]);
  assert.equal(actionStep(v2).length, 1);
  assert.equal(actionStep(v2)[0].with?.["default-branch"], "v2");
  assert.equal(actionStep(v2)[0].with?.["npm-dist-tag"], "next");
  assert.equal(actionStep(v2)[0].with?.prerelease, true);
  const v2Guard = String(
    v2.jobs["release-prerelease"].steps.find((step) => step.name === "Validate release route")?.run
  );
  assert(v2Guard.includes("--route pre-cutover-v2"));
  assert(v2Guard.includes("--dist-tag next"));
  assert(v2Guard.includes("--prerelease true"));
  assert(String(v2.jobs["release-prerelease"].if).includes(`github.event.before != '${zeroRevision}'`));
  assertGuardBeforeCredentialsAndRelease(v2, "release-prerelease");
  assert(
    !fs.readFileSync(path.join(workflowsDirectory, "release-v2.yml"), "utf8").includes("npm-dist-tag: latest"),
    "pre-cutover v2 workflow must never select latest"
  );

  for (const workflow of [v1, v2]) {
    assert(
      hasRun(workflow, ".github/release-routing/validate.mjs guard-push"),
      "every release workflow must run the fail-before-publish guard"
    );
  }

  assert(!fs.existsSync(path.join(workflowsDirectory, "release.yml")), "shared release.yml must be removed");
}

function parseArguments(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      fail(`invalid argument sequence near ${key ?? "<end>"}`);
    }
    result[key.slice(2)] = value;
  }
  return result;
}

function packageVersionAt(revision) {
  const contents = execFileSync("git", ["show", `${revision}:package.json`], { cwd: root, encoding: "utf8" });
  return JSON.parse(contents).version;
}

function versionMatchesRoute(version, route) {
  const parsed =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
      version
    );
  return parsed !== null && Number(parsed[1]) === route.major && Boolean(parsed[4]) === route.prerelease;
}

function validateExecutableRoute(route, args, version) {
  assert(route.active, "release route is inactive");
  assert.equal(route.phase, routes.activePhase, "release route phase is not active");
  assert.equal(args.branch, route.branch, "release branch does not match route");
  assert.equal(args["dist-tag"], route.distTag, "npm dist-tag does not match route");
  assert.equal(args.prerelease, String(route.prerelease), "prerelease mode mismatch");
  assert(versionMatchesRoute(version, route), `version ${version} violates ${args.route}`);
}

function validatePushVersions(route, args, beforeVersion, afterVersion) {
  validateExecutableRoute(route, args, afterVersion);
  return `${beforeVersion} -> ${afterVersion}`;
}

function guardPush(values) {
  const args = parseArguments(values);
  assert(!/^0+$/.test(args.before), "branch creation must skip the entire release job");
  const route = routes.releaseRoutes[args.route];
  assert(route, `unknown route ${args.route}`);

  const afterVersion = packageVersionAt(args.after);
  const beforeVersion = packageVersionAt(args.before);
  const transition = validatePushVersions(route, args, beforeVersion, afterVersion);
  console.log(`Route ${args.route} accepts current version ${afterVersion}`);
  console.log(`Observed package version transition: ${transition}`);
}

function validateGuardCases() {
  const preV2 = routes.releaseRoutes["pre-cutover-v2"];
  const preV2Args = {
    route: "pre-cutover-v2",
    branch: "v2",
    "dist-tag": "next",
    prerelease: "true",
  };

  assert.throws(() => validateExecutableRoute(routes.releaseRoutes["post-cutover-v1"], {}, "1.0.0"), /inactive/);
  assert.throws(
    () => validateExecutableRoute({ ...preV2, phase: "post-cutover" }, preV2Args, "2.0.0-next.0"),
    /phase is not active/
  );
  assert.throws(
    () =>
      guardPush([
        "--route",
        "pre-cutover-v2",
        "--branch",
        "v2",
        "--dist-tag",
        "next",
        "--prerelease",
        "true",
        "--before",
        "0000000000000000000000000000000000000000",
        "--after",
        "HEAD",
      ]),
    /branch creation must skip the entire release job/
  );
  assert.throws(
    () => validatePushVersions(preV2, preV2Args, "1.11.3", "1.11.3"),
    /version 1\.11\.3 violates pre-cutover-v2/
  );
  assert.doesNotThrow(() => validatePushVersions(preV2, preV2Args, "2.0.0-next.0", "2.0.0-next.0"));
}

function checkWorkflows() {
  validateRouteMatrix();
  validateCi();
  validatePreviews();
  validateReleaseWorkflows();
  validateGuardCases();
  console.log("Release routing and workflow wiring are valid");
  console.log(
    "External gate: verify the release App has only the minimum ruleset bypass needed for release PRs and publication"
  );
}

const [command, ...values] = process.argv.slice(2);
if (command === "check-workflows") {
  checkWorkflows();
} else if (command === "guard-push") {
  guardPush(values);
} else {
  fail("usage: validate.mjs <check-workflows|guard-push>");
}
