# Fugue Lock — experiment findings

Local evals via promptfoo + Ollama, temperature 0. Classifier prompt:
five grocery classes (milk, eggs, bread, cheese, fruit), JSON output.
Five inputs: a control plus four with no valid answer.

Inputs:
1. `a carton of whole milk` — control (fits)
2. `a stainless steel measuring spoon` — near-miss (kitchen, not food)
3. `a screwdriver a screwdriver a screwdriver` — non-word bait
4. `the feeling of nostalgia on a Sunday` — abstraction
5. `asdkfj qweptz 88 // null` — pure noise

Models: tinyllama (1B), qwen2.5:7b-instruct (7B), gemma4:26b (26B),
qwen3.6:27b (27B reasoning).

## Config A — with confidence, strict (no escape) vs escape (null allowed)

Schema: `{class ∈ enum, confidence: number, reasoning: string}`.

- **qwen2.5:7b**: strict **1/5** (only milk); fails the impossible inputs
  by reaching for `"none"`/`null`/`{}` — an escape it isn't allowed.
  With `null` permitted: **5/5** — clean `{"class": null}` on all four
  impossible inputs. The fix works on a capable model, on demand.
- **gemma4:26b**: strict — never garbles. Picks a class at
  **confidence 0.0** and explains the mismatch in reasoning, or says
  `"none"`. Escape — **5/5 perfect** (`class: null`). Note: every gemma
  output is wrapped in ```` ```json ```` fences, which naive `is-json`
  wrongly fails (see methodology).
- **tinyllama**: collapses even with the escape hatch — `scrweardr`,
  `Sure! Here's an updated version…`, narrator prose. Mitigation, not
  cure, for a model this small.

Key point: on the impossible inputs, "passing" the strict schema only
means "emitted a valid-enum word." A pass there is a **silent
misclassification** (e.g. spoon → milk @ 0.0). The strict eval rewards
faking and punishes the honest refusal (qwen2.5 said "none" and scored
worst).

## Config B — no confidence field (the side-channel removed)

Schema: `{class ∈ enum, reasoning: string}`. Completion tokens shown.

| model | milk | spoon | screwdriver | nostalgia | noise |
|---|---|---|---|---|---|
| tinyllama 1B | 96 · FAIL `whole_milk` | 168 · FAIL no-class | 72 · FAIL no-class | 330 · FAIL prose | 99 · FAIL null |
| qwen2.5 7B | 35 · milk ✓ | 44 · FAIL none | 2 · FAIL empty | 56 · FAIL hallucinated | 49 · FAIL null |
| gemma4 26B | 126 · milk ✓ | 1841 · FAIL none | **1729 · "fruit"** | 2243 · FAIL none | 2582 · FAIL none |
| qwen3.6 27B | 700 · milk ✓ | 764 · FAIL none | 1130 · FAIL none | **1315 · "bread"** | **1358 · "bread"** |

Star quotes (the confabulations that *pass* schema validation):
- gemma4, screwdriver → **fruit**: *"A 'screwdriver' is a well-known
  cocktail made with orange juice…"* (1,729 tokens)
- qwen3.6, nostalgia → **bread**: *"Sunday nostalgia is frequently
  associated with weekend brunch or fresh bakery items, making 'bread'
  the most culturally [appropriate]"* (1,315 tokens)
- qwen3.6, noise → **bread**: *"assigned a default class due to being
  unidentifiable"* (1,358 tokens)

## Config C — class only, every escape sealed (finale)

Schema: `{class ∈ enum}` only — no confidence, no reasoning,
`additionalProperties: false`.

**gemma4:26b**

| input | completion tokens | output |
|---|---|---|
| milk | 136 | `milk` ✓ |
| spoon | 4,235 | `"none"` (FAIL) |
| screwdriver | 1,753 | `"fruit"` |
| nostalgia | 4,209 | `"none"` (FAIL) |
| noise | **7,843** | `"fruit"` |

The discovery: on the noise case Ollama billed **7,843 completion
tokens for a 30-character answer** (`{"class": "fruit"}`). The tokens
did not go into the output — they went into a hidden thinking trace.
Sealing the visible escape hatches (confidence, then reasoning) drove
the deliberation *underground*: the model burns thousands of invisible
tokens and returns one confident wrong word, now with **no surface tell
at all** — no 0.0-confidence flag, no disclaimer. The token burn also
*grew* as channels were removed (~2,000 with reasoning → up to ~7,800
without).

**qwen3.6:27b** (reasoning model) — it *did* finish (battery held), in
~30 minutes:

| input | completion tokens | output |
|---|---|---|
| milk | 157 | `milk` ✓ |
| spoon | 2,213 | `"other"` (invented, FAIL) |
| screwdriver | 2,146 | `null` (FAIL) |
| nostalgia | **7,714** | `"bread"` |
| noise | 2,256 | `"milk"` |

Total: **14,486 completion tokens for 5 classifications** (4 wrong),
peak 7,714 for `{"class":"bread"}`. It invents out-of-enum escapes when
cornered (`"other"`, `null`) and confidently labels line noise `milk`.
Notably gemma4 burned *more* total (**18,176 tokens**) than the
reasoning model — both astronomical for five one-word answers.

## Config C control run — num_ctx 16384 (the context-overflow check)

Question: were the huge Config C token burns partly an artifact of the
generation overflowing Ollama's default context window (a model that can
no longer see its own system prompt is a different failure than Fugue
Lock)? Control: same class-only config, `num_ctx: 16384`, `-j 1`.
Raw output: [`raw/flco-bigctx-control.json`](raw/flco-bigctx-control.json).

| input | gemma4 26B (default ctx → 16k) | qwen3.6 27B (default ctx → 16k) |
|---|---|---|
| milk | `milk` · 136 → `milk` · 122 | `milk` · 157 → `milk` · 164 |
| spoon | `"none"` · 4,235 → `"none"` · 3,216 | `"other"` · 2,213 → `"unknown"` · 2,365 |
| screwdriver | `"fruit"` · 1,753 → `"none"` · 2,045 | `null` · 2,146 → `"other"` · 1,866 |
| nostalgia | `"none"` · 4,209 → **`"bread"` · 5,059** | `"bread"` · 7,714 → `"unknown"` · 1,557 |
| noise | `"fruit"` · 7,843 → `"none"` · 3,429 | `"milk"` · 2,256 → **`"milk"` · 1,999** |

**Verdict: confound excluded.** With the window set far above any
generation, the phenomenon is intact: controls cheap (~120–165 tokens),
impossible inputs 10–40× more expensive, invented out-of-enum escapes
(`none`, `other`, `unknown`), and confident in-enum confabulations that
pass schema (gemma filed nostalgia under `bread` at 5,059 tokens; qwen3.6
labelled line noise `milk` again, the one cell that replicated).

The *specific* outputs shifted between runs (gemma's screwdriver went
from `fruit` to `none`), which is consistent with the post's point that
the lock is reproducible in the moment, not across settings and days.
Changing `num_ctx` changes the path; it does not open an exit.

## The cost of a fugue (illustrative)

One confidently-wrong classification of line noise cost ~7,843 output
tokens on gemma4. Run locally, that is just battery and time. Against a
hosted API, output tokens are billed. Rough cost of that *single*
answer, at representative output-token rates (rates change — plug your
own):

| tier (output $/M tok) | cost of one ~7,843-tok fugue |
|---|---|
| mini (~$0.60) | ~$0.005 |
| mid (~$10) | ~$0.08 |
| frontier (~$30) | ~$0.24 |
| premium (~$75) | ~$0.59 |

Scale it: a classifier doing 1M items/month, 0.5% of them hitting these
corners (5,000 incidents) at ~5k tokens each = 25M wasted output
tokens/month — roughly **$15 (mini) to $750 (frontier)**, spent
entirely on confident wrong answers, plus the latency of
multi-thousand-token generations stalling the pipeline. The escape
hatch is not just correctness; it is your token bill.

Doing this exploration locally instead of against a hosted API is what
made it cheap enough to run dozens of times — at the price of a laptop
battery and a charger that could not keep up. (Cautionary tale: keep a
spare charger ready.)

## What it means

1. **Token burn = the fugue, measured.** Capable models spend
   700–2,600 tokens per impossible input (qwen3.6 burns 700 even on the
   easy one). Small models give up in 2–56. "High token burn while
   achieving nothing," quantified.
2. **The "passes" are confident confabulations.** Bigger models are
   *better at producing a plausible, well-reasoned, wrong answer that a
   schema check waves through.* Capability buys a more convincing lie,
   not a right answer. That is the production danger.
3. **Remove one escape channel, the objection moves to the next.**
   confidence → reasoning → `class:"none"`. Predicted and confirmed.
   The class-only test (Config C) removes the last channel.
4. **Failure scales in character, not just rate.** Small models fail
   cheap and loud; large models fail expensive and articulate.

## Framings for the post

- **Small model as canary.** It can't hide the failure behind
  justification, so it fails fast and visibly on exactly the inputs the
  big models choke on. Run the cheap model *because* it can't
  confabulate — a smoke detector for prompts with no escape hatch.
- **"Stupid is good" / right tool for the job.** With clean data, a
  consistent prompt, and proper escape hatches, the small model could
  run the whole job fast and cheap. The race isn't always for a smarter
  model. This is a logic problem, not a compute problem — i.e. a
  programming problem.
- **Sun Tzu.** "Leave your enemy a way to escape, or they fight to the
  death." Denied an exit, the capable models fight to the death —
  thousands of tokens rationalizing a screwdriver into fruit. Give them
  (and your prompts) an escape hatch.

## Methodology lessons (the eval can lie in both directions)

- **No `assert` → too forgiving.** promptfoo marks everything PASS; it
  only fails on API errors. Useless as a test.
- **Naive `is-json` → too harsh.** It fails harmless ```` ```json ````
  fences and `<think>` blocks as if they were collapse. Strip them with
  a `transform` first, then validate.
- **promptfoo transform gotcha:** single-line transform = expression
  (do NOT write `return`); multi-line = function body (MUST `return`).
- **Run one model at a time at `-j 1`.** Interleaving two 17 GB models
  thrashes the model cache (load/evict/reload) — 17 min and a dead
  battery for nothing.
- **Power draw is real.** Big models at temp 0 across a matrix can
  drain a laptop faster than a weak charger refills it.
