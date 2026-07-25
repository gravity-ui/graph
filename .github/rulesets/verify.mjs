import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const expected = JSON.parse(await readFile(resolve(root, "expected-policy.json"), "utf8"));
const supportedRules = new Set(["deletion", "non_fast_forward", "pull_request", "required_status_checks"]);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function sorted(values) {
  return [...values].sort((a, b) => String(a).localeCompare(String(b)));
}

function clone(value) {
  return structuredClone(value);
}

function characterClass(pattern, start) {
  let index = start + 1;
  let negated = false;
  if (pattern[index] === "!" || pattern[index] === "^") {
    negated = true;
    index += 1;
  }
  let body = "";
  if (pattern[index] === "]") {
    body += "\\]";
    index += 1;
  }
  for (; index < pattern.length && pattern[index] !== "]"; index += 1) {
    const character = pattern[index];
    if (character === "\\") {
      if (index + 1 >= pattern.length) throw new Error(`malformed escape in pattern: ${pattern}`);
      body += `\\${pattern[index + 1]}`;
      index += 1;
    } else {
      if (character === "/") throw new Error(`unsupported slash in character class: ${pattern}`);
      body += character;
    }
  }
  if (index >= pattern.length || body === "") throw new Error(`malformed character class: ${pattern}`);
  return { regex: `[${negated ? "^" : ""}${body}]`, end: index };
}

function fnmatchPathnameRegex(pattern) {
  let regex = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        while (pattern[index + 1] === "*") index += 1;
        if (pattern[index + 1] === "/") {
          regex += "(?:[^/]+/)*";
          index += 1;
        } else {
          regex += "[^/]*";
        }
      } else {
        regex += "[^/]*";
      }
    } else if (character === "?") {
      regex += "[^/]";
    } else if (character === "[") {
      const parsed = characterClass(pattern, index);
      regex += parsed.regex;
      index = parsed.end;
    } else if (character === "\\") {
      if (index + 1 >= pattern.length) throw new Error(`malformed escape in pattern: ${pattern}`);
      index += 1;
      regex += pattern[index].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else {
      regex += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${regex}$`);
}

function globMatches(pattern, ref) {
  if (pattern === "~ALL") return true;
  if (pattern === "~DEFAULT_BRANCH") return ref === "refs/heads/main";
  if (!pattern.startsWith("refs/heads/") || /[{}]/.test(pattern)) {
    throw new Error(`unsupported ref target pattern: ${pattern}`);
  }
  return fnmatchPathnameRegex(pattern).test(ref);
}

function appliesTo(ruleset, ref) {
  if (ruleset.target !== "branch" || ruleset.enforcement !== "active") return false;
  const condition = ruleset.conditions?.ref_name;
  if (!condition) throw new Error(`${ruleset.name}: active branch ruleset has no supported ref_name condition`);
  const included = (condition.include ?? []).some((pattern) => globMatches(pattern, ref));
  const excluded = (condition.exclude ?? []).some((pattern) => globMatches(pattern, ref));
  return included && !excluded;
}

function rule(ruleset, type) {
  return (ruleset.rules ?? []).find((candidate) => candidate.type === type);
}

function checkBypass(ruleset, decision, failures, key) {
  const actors = ruleset.bypass_actors ?? [];
  if (decision.mode === "none") {
    if (actors.length !== 0) failures.push(`${key}: bypass actors exist although admin decision is none`);
    return;
  }
  if (decision.mode !== "integration" || !decision.actorId) {
    failures.push("Bypass decision is unresolved; choose --bypass-mode none or integration with actor ID");
    return;
  }
  if (actors.length > expected.releaseAutomationBypass.maximumActors) {
    failures.push(`${key}: extra bypass actor configured`);
  }
  const matching = actors.filter(
    (actor) =>
      String(actor.actor_id) === String(decision.actorId) &&
      expected.releaseAutomationBypass.allowedActorTypes.includes(actor.actor_type) &&
      actor.bypass_mode === expected.releaseAutomationBypass.requiredBypassMode
  );
  if (matching.length !== 1 || actors.length !== 1) {
    failures.push(`${key}: exact approved integration bypass is missing or incorrect`);
  }
}

function checkRulesets(actualRulesets, decision) {
  const failures = [];
  if (!["none", "integration"].includes(decision.mode)) {
    failures.push("Bypass decision is unresolved; pass --bypass-mode none or integration");
  }

  for (const policy of expected.rulesets) {
    const ref = policy.include[0];
    let overlaps;
    try {
      overlaps = actualRulesets.filter((candidate) => appliesTo(candidate, ref));
    } catch (error) {
      failures.push(`${policy.key}: ${error.message}`);
      continue;
    }
    const actual = overlaps.find((candidate) => candidate.name === policy.name);
    if (!actual) {
      failures.push(`${policy.key}: expected active ruleset "${policy.name}" does not apply to ${ref}`);
      continue;
    }
    const unexpected = overlaps.filter((candidate) => candidate !== actual);
    for (const candidate of unexpected) {
      failures.push(
        `${policy.key}: unexpected active overlapping ruleset "${candidate.name}" (${candidate.source_type ?? "unknown source"})`
      );
    }

    if (
      JSON.stringify(sorted(actual.conditions.ref_name.include ?? [])) !== JSON.stringify(sorted(policy.include)) ||
      JSON.stringify(sorted(actual.conditions.ref_name.exclude ?? [])) !== JSON.stringify(sorted(policy.exclude))
    ) {
      failures.push(`${policy.key}: target scope differs from expected exact include/exclude`);
    }
    const unknown = (actual.rules ?? []).filter((candidate) => !supportedRules.has(candidate.type));
    if (unknown.length > 0) {
      failures.push(`${policy.key}: unsupported active rule types: ${unknown.map(({ type }) => type).join(", ")}`);
    }

    const pull = rule(actual, "pull_request");
    if (!pull) {
      failures.push(`${policy.key}: pull_request rule is missing`);
    } else {
      const params = pull.parameters ?? {};
      if ((params.required_approving_review_count ?? 0) < policy.minimumApprovals)
        failures.push(`${policy.key}: approval requirement is too low`);
      if (params.required_review_thread_resolution !== policy.requireResolvedConversations)
        failures.push(`${policy.key}: resolved-conversation requirement differs`);
      const methods = params.allowed_merge_methods ?? [];
      for (const method of policy.requiredMergeMethods) {
        if (!methods.includes(method)) failures.push(`${policy.key}: allowed_merge_methods does not include ${method}`);
      }
    }
    if (policy.blockDeletion && !rule(actual, "deletion")) failures.push(`${policy.key}: deletion rule is missing`);
    if (policy.blockForcePush && !rule(actual, "non_fast_forward"))
      failures.push(`${policy.key}: non_fast_forward rule is missing`);
    if (policy.requireLinearHistory === false && rule(actual, "required_linear_history"))
      failures.push(`${policy.key}: required_linear_history blocks canonical merge commits`);

    const checks = rule(actual, "required_status_checks");
    const params = checks?.parameters ?? {};
    const contexts = (params.required_status_checks ?? []).map(({ context }) => context);
    if (JSON.stringify(sorted(contexts)) !== JSON.stringify(sorted(policy.requiredChecks)))
      failures.push(`${policy.key}: required checks differ from the exact policy`);
    if (params.strict_required_status_checks_policy !== policy.strictRequiredStatusChecks)
      failures.push(`${policy.key}: strict_required_status_checks_policy differs`);
    checkBypass(actual, decision, failures, policy.key);
  }
  return failures;
}

function gh(args) {
  const result = spawnSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error?.code === "ENOENT") throw new Error("gh is not installed; use --fixture");
  if (result.status !== 0)
    throw new Error(
      `Read-only gh api failed; confirm authentication and ruleset read permission.\n${result.stderr.trim()}`
    );
  return JSON.parse(result.stdout);
}

function flattenSummaryPages(pages) {
  if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) {
    throw new Error("unexpected paginated ruleset-list response shape");
  }
  return pages.flat();
}

async function loadActual() {
  const fixture = argument("--fixture");
  if (fixture) return JSON.parse(await readFile(resolve(process.cwd(), fixture), "utf8"));
  const pages = gh(["api", "--paginate", "--slurp", `repos/${expected.repository}/rulesets?includes_parents=true`]);
  const summaries = flattenSummaryPages(pages);
  if (summaries.length === 0)
    throw new Error("No rulesets are visible; empty state and insufficient permission cannot be distinguished.");
  return summaries.map(({ id }) => gh(["api", `repos/${expected.repository}/rulesets/${id}`]));
}

async function selfTest() {
  const integration = JSON.parse(await readFile(resolve(root, "fixtures/compliant.json"), "utf8"));
  const zero = clone(integration);
  zero.forEach((ruleset) => (ruleset.bypass_actors = []));
  assert.deepEqual(checkRulesets(zero, { mode: "none" }), []);
  assert.deepEqual(checkRulesets(integration, { mode: "integration", actorId: "4242" }), []);
  assert.deepEqual(flattenSummaryPages([[{ id: 1 }], [{ id: 2 }]]), [{ id: 1 }, { id: 2 }]);
  assert.equal(globMatches("refs/heads/*", "refs/heads/main"), true);
  assert.equal(globMatches("refs/heads/*", "refs/heads/release/v1"), false);
  assert.equal(globMatches("refs/heads/**", "refs/heads/release/v1"), false);
  assert.equal(globMatches("refs/heads/**/v1", "refs/heads/v1"), true);
  assert.equal(globMatches("refs/heads/**/v1", "refs/heads/release/v1"), true);
  assert.equal(globMatches("refs/heads/[mv]2", "refs/heads/v2"), true);
  assert.equal(globMatches("refs/heads/[!m]*", "refs/heads/v2"), true);
  assert.equal(globMatches("refs/heads/[a-u]*", "refs/heads/v2"), false);
  assert.equal(
    appliesTo(
      {
        name: "precedence",
        target: "branch",
        enforcement: "active",
        conditions: { ref_name: { include: ["~ALL"], exclude: ["refs/heads/*"] } },
      },
      "refs/heads/release/v1"
    ),
    true
  );

  const mutations = [
    (x) => (x[0].enforcement = "evaluate"),
    (x) => (x[0].conditions.ref_name.include = ["refs/heads/other"]),
    (x) => x[0].rules.find(({ type }) => type === "required_status_checks").parameters.required_status_checks.pop(),
    (x) =>
      x[0].rules
        .find(({ type }) => type === "required_status_checks")
        .parameters.required_status_checks.push({ context: "Unexpected" }),
    (x) => x[0].rules.push({ type: "required_linear_history" }),
    (x) => x[0].bypass_actors.push({ actor_id: 99, actor_type: "Integration", bypass_mode: "always" }),
    (x) => (x[0].rules.find(({ type }) => type === "pull_request").parameters.allowed_merge_methods = ["squash"]),
    (x) =>
      (x[0].rules.find(
        ({ type }) => type === "required_status_checks"
      ).parameters.strict_required_status_checks_policy = false),
    (x) => x.push({ ...clone(x[0]), id: 9999, name: "Inherited overlap", source_type: "Organization" }),
    (x) => (x[0].conditions.ref_name.include = ["refs/heads/[mv*"]),
  ];
  for (const mutate of mutations) {
    const value = clone(integration);
    mutate(value);
    assert(checkRulesets(value, { mode: "integration", actorId: "4242" }).length > 0);
  }
  assert(checkRulesets(integration, { mode: undefined }).some((failure) => failure.includes("unresolved")));
  process.stdout.write("Ruleset verifier self-test passed (zero/integration and negative matrix).\n");
}

if (process.argv.includes("--self-test")) {
  await selfTest();
} else {
  const mode = argument("--bypass-mode");
  const actorId = argument("--bypass-actor-id") ?? process.env.GRAPH_RELEASE_BYPASS_ACTOR_ID;
  const failures = checkRulesets(await loadActual(), { mode, actorId });
  if (failures.length) {
    process.stderr.write(`Ruleset verification failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`Ruleset verification passed for ${expected.repository}.\n`);
  }
}
