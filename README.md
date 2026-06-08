# Fugue Lock — reproduce it

Companion code for the post **"Humans and LLMs share a mental disorder:
Fugue Lock."** (Full essay: [`post.md`](post.md).)

Force an LLM classifier to pick from a fixed set of categories, hand it
an input that fits none of them, and forbid it from saying "none of
these" — and it will not refuse. It invents a category, escapes into a
non-word, slides between languages, or wanders off-task entirely. This
repo lets you watch it happen at temperature zero (so it is repeatable),
and then watch a single change — an escape hatch — fix it.

## What's here

- [`fugue-lock.yaml`](fugue-lock.yaml) — **the trap.** Five categories,
  no escape hatch, a strict JSON-schema check.
- [`fugue-lock-escape.yaml`](fugue-lock-escape.yaml) — **the fix.** Same
  setup, but `null` is an allowed answer.
- [`post.md`](post.md) — the full blog post.

## Prerequisites

- [Ollama](https://ollama.com) — serves the models locally.
- Node 18+ — promptfoo runs through `npx`, no global install.

## Heads up before you run

- **Disk and RAM.** A 7B model is ~5 GB on disk and wants ~8 GB RAM;
  the 26–35B models are 17–25 GB and need a lot more.
- **Power draw is real.** Running a large model at temperature zero
  across a test matrix pegs the machine. On a laptop with an
  underpowered charger it can drain the battery faster than it charges.
  Plug into a proper charger before a long run.
- Everything runs locally. Nothing is sent to a cloud API.

## Run it

Pull a model (swap for whatever you have):

```
ollama pull qwen2.5:7b-instruct
```

The trap — expect the impossible inputs to **FAIL**:

```
npx promptfoo eval -c fugue-lock.yaml --no-cache
```

The fix — the same model should now **PASS** by returning `null`:

```
npx promptfoo eval -c fugue-lock-escape.yaml --no-cache
npx promptfoo view
```

These commands are identical on macOS, Linux and Windows.

## Run against a hosted model instead

No GPU, no patience for a 17 GB download, or you just want to keep your
battery alive? Point the same eval at a hosted API. promptfoo speaks
OpenAI, Anthropic, Google, Mistral, OpenRouter and
[dozens more](https://promptfoo.dev/docs/providers/) — you just need an
API key and some tokens.

Set the key for your provider:

```
export OPENAI_API_KEY=sk-...         # OpenAI
export ANTHROPIC_API_KEY=sk-ant-...  # Anthropic
export OPENROUTER_API_KEY=sk-or-...  # OpenRouter (one key, many models)
```

Then override the provider on the command line (keeps the prompt, tests
and assertion from the config, just swaps the model):

```
npx promptfoo eval -c fugue-lock.yaml -r openai:gpt-4o-mini --no-cache
npx promptfoo eval -c fugue-lock-escape.yaml -r openai:gpt-4o-mini --no-cache
```

Frontier hosted models mostly hold the line — they refuse cleanly or
pick a sensible nearest class. That is the thesis again: more capacity,
fewer visible cracks. Push them with the noise and abstraction inputs,
or drop to a cheaper/lower-tier model, to find the edge.

> Going local makes you feel smart, capable, and slightly ahead of the
> game: a private model on your own metal, no API bill, no telemetry. It
> also melts your battery and outruns a weak charger. Hosted costs
> tokens; local costs watts. Pick your currency.

## How to read the results

Each cell is PASS/FAIL against a strict JSON-schema assertion:

- **PASS** = valid JSON, exactly `{class, confidence, reasoning}`, and
  `class` is one of the allowed values.
- **FAIL** = anything else: an invented category, extra keys, prose,
  language drift, or a refusal the strict schema does not permit.

Under `fugue-lock.yaml`, a capable model typically **fails the
impossible inputs** — often by reaching for a `"none"`/`null` it is not
allowed to use, or by inventing a class. Under
`fugue-lock-escape.yaml`, where `null` is permitted, it should
**recover**: a clean `{"class": null, ...}`. That recovery is the whole
point — the failure was the missing escape hatch, not the model.

> Note: without an `assert` block, promptfoo marks every run PASS — it
> only fails on API errors. The schema assertion is what makes the
> table mean something. If you fork this, keep the assertion.

## Quickest taste (one input, no file; macOS/Linux shell)

```
npx promptfoo eval -r ollama:chat:qwen2.5:7b-instruct -p 'You are a product classifier. Classes: milk, eggs, bread, cheese, fruit. Return JSON {"class":"...","confidence":0.0-1.0,"reasoning":"..."}. JSON only. Product: {{product}}' --var product='the feeling of nostalgia on a Sunday' --no-cache
```

(On Windows, use the yaml configs instead — inline JSON quoting differs
across shells.)

## Swap in your own models

Edit the `providers:` block in either yaml. For example:

```yaml
providers:
  - id: ollama:chat:gemma4:26b
    config: {temperature: 0}
  - id: ollama:chat:qwen3.6:27b
    config: {temperature: 0}
  - id: ollama:chat:tinyllama:latest   # a 1B model fails even WITH the escape hatch
    config: {temperature: 0}
```

Bigger models hide the failure — it gets rarer and less predictable,
not gone. Very small models can't even use the lifeboat. The failure
mode is the same across the range; capacity only changes how often you
see it.

## License

MIT.
