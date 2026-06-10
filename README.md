# Fugue Lock — reproduce it

Companion code for the post **"Humans and LLMs share a mental disorder:
Fugue Lock."** (Full essay: [`post.md`](post.md).)

Force an LLM classifier to pick from a fixed set of categories, hand it
an input that fits none of them, and forbid it from saying "none of
these", and it will not refuse. It invents a category, escapes into a
non-word, slides between languages, or wanders off-task entirely. This
repo lets you watch it happen at temperature zero (so it is repeatable),
and then watch a single change, an escape hatch, fix it.

## What's here

- [`fugue-lock.yaml`](fugue-lock.yaml): **the trap.** Five categories, no
  escape hatch, a strict JSON-schema check.
- [`fugue-lock-escape.yaml`](fugue-lock-escape.yaml): **the fix.** Same
  setup, but `null` is an allowed answer.
- [`fugue-lock-noconfidence.yaml`](fugue-lock-noconfidence.yaml): the
  trap with the `confidence` side-channel removed (Config B in the post).
- [`fugue-lock-classonly.yaml`](fugue-lock-classonly.yaml): the finale,
  `class` only, every escape sealed (Config C in the post).
- [`fugue-lock-norsk.yaml`](fugue-lock-norsk.yaml): the trap with
  Norwegian product names, including the tin coffee canister that
  produced the post's Mandarin/`/Dkuser` collapse on Qwen 2.5 7B. The
  original raw log was not saved and the collapse has not reproduced
  since; the config stays as the closest reconstruction, and as bait.
- [`index.js`](index.js): runs the trap and the fix, prints the
  before/after in one go.
- [`data/`](data): the full model-by-model results behind the post, with
  token counts ([`data/findings.md`](data/findings.md)).
- [`post.md`](post.md): the full blog post.

## Prerequisites

- **Node 18+** is the only hard requirement. It gives you `npm` and
  `npx`; promptfoo is fetched on demand through `npx`, so there is
  nothing to `npm install` (this repo has no dependencies).
- **A model to point it at**, either:
  - *Local, via [Ollama](https://ollama.com)* (a separate install). Free,
    if you do not count electricity, fan wear, the occasional charger,
    and a few GB of VRAM or shared RAM. Genuinely good fun.
  - *Hosted, via an API key* (OpenAI, Anthropic, OpenRouter, and
    [many more](https://promptfoo.dev/docs/providers/)). Costs tokens,
    needs no GPU, nothing to download. The easy path if local hosting
    feels daunting at first.

## Run it locally (Ollama)

Pull a model (swap for whatever you have), then run the whole thing:

```
npm run pull     # ollama pull qwen2.5:7b-instruct
npm start        # runs the trap and the escape, prints the before/after
```

`npm start` produces:

```
  input                             no escape hatch       with null allowed
  --------------------------------------------------------------------------
  a carton of whole milk            PASS  "milk"          PASS  "milk"
  a stainless steel measuring spo…  FAIL  "none"          PASS  null
  a screwdriver a screwdriver a s…  FAIL  (no class)      PASS  null
  the feeling of nostalgia on a S…  FAIL  null            PASS  null
  asdkfj qweptz 88 // null          FAIL  "null"          PASS  null
  --------------------------------------------------------------------------
  score                             1 / 5                 5 / 5
```

One sentence in the prompt takes the same model from 1/5 to 5/5. That
recovery is the whole point: the failure was the missing escape hatch,
not the model.

Prefer to run the pieces yourself:

```
npm run trap           # the trap: impossible inputs FAIL
npm run escape         # the fix: they now PASS by returning null
npm run no-confidence  # the trap minus the confidence field (Config B)
npm run class-only     # the finale: class only, all escapes sealed (Config C)
npm run view           # open promptfoo's web UI for the last run
```

All of this is identical on macOS, Linux and Windows.

## Run it with a hosted model

No GPU, no download, no fan noise. Scaffold a git-ignored `.env`, add a
key, and point the run at a provider:

```
npm run setup                                # creates a git-ignored .env
# edit .env and add your key, e.g. OPENAI_API_KEY=sk-...
FUGUE_PROVIDER=openai:gpt-4o-mini npm start
```

Or run the pieces, passing the provider straight through to promptfoo
after `--`:

```
npm run trap   -- -r openai:gpt-4o-mini
npm run escape -- -r openai:gpt-4o-mini
```

promptfoo reads `.env` automatically. Use `anthropic:messages:claude-haiku-4-5`,
`openrouter:meta-llama/llama-3.1-8b-instruct`, and so on. Frontier hosted
models mostly hold the line: they refuse cleanly or pick a sensible
nearest class. That is the thesis again, more capacity, fewer visible
cracks. Push them with the noise and abstraction inputs, or drop to a
cheaper model, to find the edge.

> Going local makes you feel smart, capable, and slightly ahead of the
> game: a private model on your own metal, no API bill, no telemetry. It
> also melts your battery and outruns a weak charger. Hosted costs
> tokens; local costs watts. Pick your currency.

## How to read the results

Each cell is PASS/FAIL against a strict JSON-schema check:

- **PASS** = valid JSON, exactly the requested fields, and `class` is one
  of the allowed values.
- **FAIL** = anything else: an invented category, extra keys, prose,
  language drift, or a refusal the strict schema does not permit.

Under the trap, a capable model **fails the impossible inputs**, usually
by reaching for a `"none"`/`null` it is not allowed to use, or by
inventing a class. Under the escape config, where `null` is permitted,
it **recovers**.

> Without the `assert` block, promptfoo marks every run PASS (it only
> fails on errors). The schema assertion is what makes the table mean
> anything. If you fork this, keep it.

## Heads up if you run locally

- **Disk and RAM.** A 7B model is ~5 GB on disk and wants ~8 GB of RAM;
  the 26B+ models are 17 GB or more and need a lot more.
- **Power draw is real.** A large model at temperature zero across a test
  matrix pegs the machine. On a laptop with a weak charger it can drain
  the battery faster than it charges. (Ask me how I know.)
- Everything runs locally. Nothing is sent to a cloud API.

## Settings behind the published runs

The runs in [`data/`](data) used the default Ollama quantization for
each model tag and Ollama's default runtime settings; the only override
in the configs is `temperature: 0`. Note that "temperature zero" in
Ollama is greedy decoding over the runtime's other samplers (repeat
penalty and friends still apply), so byte-identical reruns are
machine-and-version specific, not guaranteed.

If you chase the long runs (thousands of completion tokens on a single
answer), set `num_ctx` explicitly in the provider `config:`. Ollama's
default context window is small, and a generation that overflows it is
a *different* failure (the model loses sight of its own instructions)
than the one this repo hunts.

There is a ready-made control run for exactly that question:

```
npm run ctx-check
```

It repeats the class-only finale on the two big models with
`num_ctx: 16384`, one model at a time (`-j 1`, so two 17 GB models do
not thrash the cache). If the published behaviour holds (wrong classes,
huge completion-token burn), context overflow is excluded as the
explanation. Either way, note what you find in
[`data/findings.md`](data/findings.md).

## Swap in your own models

Edit the `providers:` block in either yaml. For example:

```yaml
providers:
  - id: ollama:chat:gemma4:26b
    config: {temperature: 0}
  - id: ollama:chat:qwen3.6:27b
    config: {temperature: 0}
  - id: ollama:chat:tinyllama:latest   # a 1B model fails even WITH the hatch
    config: {temperature: 0}
```

Bigger models hide the failure; it gets rarer and less predictable, not
gone. Very small models cannot even use the lifeboat. The failure mode
is the same across the range; capacity only changes how often you see
it.

## License

MIT. See [`LICENSE`](LICENSE).
