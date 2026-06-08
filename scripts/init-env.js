#!/usr/bin/env node
/**
 * Create a git-ignored .env for hosted-model API keys.
 *
 *   npm run setup
 *
 * promptfoo loads .env from the working directory automatically, so once you
 * fill in a key you can run a hosted model with, e.g.:
 *   npm run trap -- -r openai:gpt-4o-mini
 *   FUGUE_PROVIDER=openai:gpt-4o-mini npm start
 */
const { writeFileSync, existsSync, readFileSync, appendFileSync } = require("node:fs");

const ENV = ".env";
const GITIGNORE = ".gitignore";

const template = `# API keys for hosted models. Fill in whichever you use, then pass the
# matching provider, e.g.  npm run trap -- -r openai:gpt-4o-mini
# Leave these blank to run locally with Ollama instead.
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OPENROUTER_API_KEY=
`;

if (existsSync(ENV)) {
  console.log(`${ENV} already exists; leaving it untouched.`);
} else {
  writeFileSync(ENV, template);
  console.log(`Created ${ENV} (git-ignored). Add an API key, then run e.g.:`);
  console.log(`  npm run trap -- -r openai:gpt-4o-mini`);
}

// Belt and braces: make sure .env is git-ignored even if .gitignore changed.
const ignore = existsSync(GITIGNORE) ? readFileSync(GITIGNORE, "utf8") : "";
if (!ignore.split(/\r?\n/).includes(".env")) {
  appendFileSync(GITIGNORE, (ignore && !ignore.endsWith("\n") ? "\n" : "") + ".env\n");
  console.log(`Added .env to ${GITIGNORE}.`);
}
