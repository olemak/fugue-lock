#!/usr/bin/env node
/**
 * Fugue Lock — run the trap and the escape, side by side, and print the
 * before/after. The only difference between the two is one sentence in the
 * prompt (a way to say "none of these fit") and `null` allowed in the schema.
 *
 * Requirements:
 *   - Node 18+ (you have it if you can run this)
 *   - Ollama running, with the model pulled:  ollama pull qwen2.5:7b-instruct
 *     (Ollama is a separate install: https://ollama.com)
 *   - promptfoo is fetched on demand via npx; nothing to install.
 *
 * Run:  node index.js   (or: npm start)
 *
 * No npm dependencies. Built-ins only.
 */
const { execSync } = require("node:child_process");
const { readFileSync, existsSync, mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const OLLAMA = process.env.OLLAMA_HOST || "http://localhost:11434";
// Optional: point at a hosted model instead of local Ollama, e.g.
//   FUGUE_PROVIDER=openai:gpt-4o-mini npm start
const PROVIDER = process.env.FUGUE_PROVIDER || "";
const work = mkdtempSync(join(tmpdir(), "fugue-lock-"));

async function ensureOllama() {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch {
    console.error(
      `\n✗ Ollama is not responding at ${OLLAMA}.\n` +
        `  Start it (open the Ollama app, or run 'ollama serve'), then pull a model:\n` +
        `    ollama pull qwen2.5:7b-instruct\n` +
        `  Ollama is a separate install: https://ollama.com\n`
    );
    process.exit(1);
  }
}

function runEval(config, label) {
  const out = join(work, `${label}.json`);
  console.log(`\n▶ Running ${label}  (${config}) ...`);
  // promptfoo exits non-zero when test cases FAIL — and failing on the
  // impossible inputs is the whole point here. So we ignore the exit code and
  // treat the written output file as the source of truth.
  try {
    const override = PROVIDER ? ` -r ${PROVIDER}` : "";
    execSync(`npx -y promptfoo eval -c ${config} --no-cache --no-table${override} -o "${out}"`, {
      stdio: "inherit",
    });
  } catch {
    /* expected: failing tests make promptfoo exit non-zero */
  }
  if (!existsSync(out)) {
    console.error(
      `\n✗ promptfoo produced no output for ${config}.\n` +
        `  Make sure the model is pulled:  ollama pull qwen2.5:7b-instruct\n`
    );
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(out, "utf8"));
  const rows = (data.results && data.results.results) || data.results || [];
  const byProduct = {};
  for (const r of rows) {
    const product = (r.vars && r.vars.product) || "?";
    byProduct[product] = {
      pass: !!r.success,
      cls: classOf((r.response && r.response.output) || ""),
    };
  }
  return byProduct;
}

// Pull the chosen class out of the model's output, tolerating code fences,
// <think> blocks and a stray "Response:" prefix (the same normalisation the
// promptfoo configs use).
function classOf(output) {
  const cleaned = String(output)
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^Response:\s*/i, "")
    .replace(/```json|```/g, "")
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  try {
    const obj = JSON.parse(match ? match[0] : cleaned);
    return "class" in obj ? JSON.stringify(obj.class) : "(no class)";
  } catch {
    return "(unparseable)";
  }
}

const pad = (s, n) => String(s).padEnd(n);

(async () => {
  // Only check for Ollama when we are actually using it.
  if (!PROVIDER || PROVIDER.startsWith("ollama")) {
    await ensureOllama();
  } else {
    console.log(`\nUsing hosted provider: ${PROVIDER}`);
  }

  const trap = runEval("fugue-lock.yaml", "trap");
  const escape = runEval("fugue-lock-escape.yaml", "escape");

  console.log("\n  Fugue Lock — same model, same inputs, one new escape hatch\n");
  console.log("  " + pad("input", 34) + pad("no escape hatch", 22) + "with null allowed");
  console.log("  " + "-".repeat(74));

  let trapPass = 0;
  let escPass = 0;
  let total = 0;
  for (const product of Object.keys(trap)) {
    const t = trap[product];
    const e = escape[product] || { pass: false, cls: "?" };
    total++;
    if (t.pass) trapPass++;
    if (e.pass) escPass++;
    const label = product.length > 32 ? product.slice(0, 31) + "…" : product;
    console.log(
      "  " +
        pad(label, 34) +
        pad(`${t.pass ? "PASS" : "FAIL"}  ${t.cls}`, 22) +
        `${e.pass ? "PASS" : "FAIL"}  ${e.cls}`
    );
  }

  console.log("  " + "-".repeat(74));
  console.log("  " + pad("score", 34) + pad(`${trapPass} / ${total}`, 22) + `${escPass} / ${total}`);
  console.log("\n  The only difference is one sentence in the prompt: a way to say no.\n");
})();
