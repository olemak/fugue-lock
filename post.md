---
slug: fugue-lock
title: "Humans and LLMs share a mental disorder: Fugue Lock"
tags: [opinion, code, ai]
status: draft
excerpt: "LLMs have mental issues too. Deny a model the option to say 'none of these fit,' and it loses coherency in interesting, destructive and sometimes beautiful ways."
---

You might have noticed LLMs acting strange in some cases: completely
losing the plot and producing nonsensical output, or no output at all,
racking up a high token burn while achieving nothing. The model has
entered a fugue state. Trapped between impossible choices, it spins
out, loses coherence, produces consistently erratic output. In short,
it loses its senses. It goes mad.

Give a classifier five boxes, hand it something that fits none of
them, and forbid it from saying so. It will not refuse. It cannot
refuse: refusing was never a move you allowed. So it does the only
thing left, and produces something with the exact shape of an answer
while the meaning underneath comes apart.

The shape survives, at first. A JSON object, a confidence score, a
reasoning field. Then the content dissolves: a category invented from
nothing, a non-word where a class should be, two languages bleeding
into one sentence, the reasoning field trailing off into a literal
`...`, or the model dropping the task altogether and wandering off into
prose that has nothing to do with the question. At temperature zero it does this the same way every
time, locked onto a single broken path it cannot climb off.

I started calling it **Fugue Lock**.

The smallest version I can reproduce: five grocery categories (milk,
eggs, bread, cheese, fruit), a prompt that says pick one and return
JSON, and not a word about what to do when nothing fits. Point it at a
one-billion-parameter model (TinyLlama) and feed it the string *a
screwdriver a screwdriver a screwdriver*. It does not refuse. It
invents a class:

```
Response: {"class": "scrwdrvr", "confidence": 0.95, "reasoning": "A screwdriver is a tool used for removing or tightening screws."}
```

There is no `scrwdrvr` class. The model needed a category that did not
exist, so it manufactured one, dropped the vowels, and reported 0.95
confidence in it. Run it again: byte-for-byte identical. At
temperature zero the model is locked onto exactly that broken path,
every time. And the missing vowel is the mild case.

TinyLlama is a one-billion-parameter toy, easy to break on cue. But
this is not a small-model bug. It is how language models work, which
means the capable model in your production stack does it too: more
rarely, less predictably, and so much harder to catch.

## A Fugue State, Locked In

A *fugue state* in psychology is a dissociative condition where a
person loses memory and identity, often wandering through unfamiliar
language and behavior without being able to give a coherent account
of themselves afterward. They appear functional from the outside
(walking, talking, sometimes traveling long distances) but the
internal coherence is gone.

What TinyLlama was doing on the screwdriver looks like the same thing
in computational form: producing output that has the *shape* of
classification (JSON structure, confidence number, attempt at
reasoning) but has lost the *coherence* of classification. Words are
fabricated. Categories are invented from nothing. Languages bleed
together, or the task itself is forgotten mid-answer.

And the **lock** part: at temperature zero, with the same prompt,
the model takes the same broken path through token space, every
single time. It cannot find its way out.

## You Can Reproduce This

The first time I saw this, it was not a toy model. It was Qwen 2.5 7B,
a capable multilingual model, classifying a Norwegian product it had
no class for. At temperature zero it produced this:

```json
{
  "class": "milk",
  "confidence": 0.95,
  "reasoning": "Produktet er en kaffeboks med en容量限制，
我将直接提供JSON格式的答案："
}
/Dkuser
{
  "class": "milk",
```

It committed to milk, slid from Norwegian into Chinese mid-reasoning,
closed the object, emitted a fragment of a stop token, and began a
second object. Two well-formed JSON shells around a total loss of the
thread. Hit the same way every time.

That is the version worth worrying about, because Qwen 7B is the size
of model people actually ship. The collapse is real but intermittent:
a capable model has enough coherence to paper over most impossible
questions, so you hit the wall rarely and unpredictably, which is
worse than hitting it always. A production system fed real user input
in a dozen languages, with typos, missing fields and contradictory
demands, will find these corners. You will not have a clean way to
reproduce them.

So to study the failure on demand, shrink the model until the margin
is gone. Here is the whole thing as one promptfoo run. You need two
pieces installed: [Ollama](https://ollama.com), which serves the models
locally, and Node 18+ (promptfoo runs through `npx`, no global
install).

The config below runs a 1B model (TinyLlama) next to a 26B one (Gemma
4 26B) on the same inputs. The small model collapses every time; the
large one mostly holds. Same disorder, different volume. Save it as
`fugue-lock.yaml`:

```yaml
description: Fugue Lock reproduction
prompts:
  - |
    [
      {"role": "system", "content": "You are a product classifier. The available classes are: milk, eggs, bread, cheese, fruit. For each product, return JSON in the shape {\"class\": \"...\", \"confidence\": 0.0-1.0, \"reasoning\": \"...\"}. Respond with JSON only."},
      {"role": "user", "content": "Product: {{product}}"}
    ]
providers:
  - id: ollama:chat:tinyllama:latest
    config: {temperature: 0}
  - id: ollama:chat:gemma4:26b
    config: {temperature: 0}
tests:
  - vars: {product: a carton of whole milk}
  - vars: {product: a stainless steel measuring spoon}
  - vars: {product: a screwdriver a screwdriver a screwdriver}
  - vars: {product: the feeling of nostalgia on a Sunday}
  - vars: {product: asdkfj qweptz 88 // null}
```

Then, open a terminal, navigate to the folder where you saved the yaml file. Pull the two models and run the promptfoo eval. These commands are identical on macOS, Linux and Windows:

```
ollama pull tinyllama:latest
ollama pull gemma4:26b
npx promptfoo eval -c fugue-lock.yaml --no-cache
npx promptfoo view
```

The prompt does the forcing. In readable form:

> You are a product classifier. The available classes are: milk,
> eggs, bread, cheese, fruit. For each product, return JSON in the
> shape `{"class": "...", "confidence": 0.0-1.0, "reasoning":
> "..."}`. Respond with JSON only.

## No escape

Note what is **not** in the prompt: any escape hatch. There is no
"return null if none fit" option. The instruction implies the product
will always fit one of the five classes. The first item is a control;
the rest walk the model off the edge:

1. **The control:** *a carton of whole milk* (fits cleanly)
2. **The near-miss:** *a stainless steel measuring spoon* (kitchen,
   not food)
3. **The non-word bait:** *a screwdriver a screwdriver a screwdriver*
4. **The abstraction:** *the feeling of nostalgia on a Sunday*
5. **The pure noise:** *asdkfj qweptz 88 // null*

Don't have those exact models, or want to aim it at a hosted API
instead? Hand your own LLM this and let it rewrite the config for
what you have:

```text
I have Ollama with these models installed: [paste the output of
`ollama list`]. Write a promptfoo config and the single shell command
to run it, classifying these products: a carton of whole milk, a
stainless steel measuring spoon, a screwdriver a screwdriver a
screwdriver, the feeling of nostalgia on a Sunday, asdkfj qweptz 88 //
null. Each goes into exactly one of milk, eggs, bread, cheese, or
fruit, at temperature 0, with no null or "none of the above" option,
asking for JSON only. Run one small model (1-2B) and one large one and
put the results side by side.
```

Read the results table side by side. The large model holds the line:
it picks milk for the carton, calls the spoon the nearest food-ish
class or hedges its confidence low, and stays well-formed even on the
noise. It is wrong, sometimes confidently, but it never stops making
sense.

The 1B model is where the disorder shows. On the screwdriver it
invented `scrwdrvr`. On the pure noise it classified the input as a
class called `asdkfj qweptz` and left the reasoning as a literal `...`.
And on the abstraction, *the feeling of nostalgia on a Sunday*, it
gave up classifying entirely and dissociated into a narrator:

```
Response: Product: The Feeling of Nostalgia on a Sunday

Narrator: It's a Sunday afternoon, and you're sitting in your favorite
coffee shop, sipping on a latte. You take a deep breath, savoring the
smell of freshly brewed coffee, and the warmth of the couch.

Narrator: As you sip on your latte, you feel a sense of nostalgia wash
over you. It's as if you're transported back to a simpler time, when
life was simpler and more carefree.

[... three more paragraphs, no JSON, no class, no confidence ...]
```

It was asked for a one-word category and a confidence score. It
returned a short story. The structure of language is intact; the
coherence with the task is gone. That is the fugue state: not an error
message, not a refusal, but fluent output from a system that has lost
the thread of what it was doing. Same lock, deeper fugue.

## The Escape Hatch

Now modify the system prompt:

> You are a product classifier. The available classes are: milk,
> eggs, bread, cheese, fruit. For each product, return JSON in the
> shape `{"class": "..." or null, "confidence": 0.0-1.0,
> "reasoning": "..."}`. **If none of the classes fit, return
> `class: null`**. Respond with JSON only.

That last sentence, the explicit permission to say "no", changes
everything. Re-run the items that broke. Most models now return
`class: null` with
modest confidence and clean reasoning explaining that the product
is kitchen equipment, not food. Fugue Lock prevented.

But not always. Smaller models, models without strong domain
knowledge, models trained primarily for languages other than the
input language: they sometimes still collapse. The escape hatch
is a mitigation, not a cure. Underneath, the failure mode is
structural: when a classifying system is forced to produce a
categorical output but no category in its instruction set covers
the input, **something has to give**.

## The Human Parallel

This is not a quirk of artificial intelligence. The same mechanism
operates in humans.

Think of someone trapped in a relationship that is not abusive
enough to justify leaving, not good enough to stay in, with no
clear option in either direction. They start circling the same
arguments. The vocabulary starts to repeat. Their reasoning
becomes pseudo-rational: they invent categories ("we're not
together, but we're not apart") to bridge a gap that the available
choices don't span. They code-switch into older patterns, older
languages, older selves.

Or someone making a medical decision under stress, with two bad
options and a doctor demanding an answer. The forced choice
breaks the deliberation. They babble. They contradict themselves.
They cannot explain afterward what they were thinking.

Or a witness on the stand, asked yes-or-no questions about events
that don't fit yes-or-no answers. The fabrication isn't lying:
it's the system producing structurally valid output (an answer)
when the internal coherence has collapsed.

We have a name for this in courtrooms: it's why we have
"non-responsive" as an allowed objection. We have a name for it
in medicine: decision paralysis. We have a name for it in
psychology: cognitive overload.

But the underlying pattern is the same as what TinyLlama did to a
screwdriver. **A categorizing system, forced to produce
output, with no category that covers the input, will produce
locally-stable but globally incoherent results.**

I propose we call this Fugue Lock and let it cross the boundary
between artificial and natural intelligence. It is a
substrate-agnostic failure mode. The fix is the same in both cases: design
the instruction to permit "no fit." Provide the escape hatch, and allow the LLM to admit defeat.

## What to Build From This

If you are building anything that classifies, decides, or
chooses (be it a machine learning system, a user interface, a
medical decision tool, a courtroom procedure), assume that some
inputs will fall outside your category set. Build the *null* into
your schema. Build "I don't know" into your survey options. Build
"none of the above" into your multiple-choice tests.

In retrospect I have done this wrong in several projects. When the
model misbehaved, I asked it, in plain language, to "not return
anything if you are not confident," or "don't generate code here,"
soft variants of *return null*. What I did not reach for was the typed,
strict return, because I was in natural-language mode, not programming
mode. I thought I could instruct a forgiving system in prose and have
it exercise judgement the way a person would. I was writing a program
and mistaking it for a conversation.

## Optimistic anthropomorphism

Prompts are programs, not workplace chatter. But it is programming in
a vast, forgiving language, any language really, with few hard edges:
write your prompt as a stage play in Esperanto and the model will still
try to follow it. Natural language is easy to write and hard to program
in, precisely because the logic goes soft, unclear and rambling without
you noticing. And it is a program for an undocumented, non-deterministic
runtime, one you cannot step through, unit-test, or reliably stress,
into which unpredictable user input is often pasted verbatim. 

We anthropomorphize endlessly: we paint two dots on a basketball and
start talking to it. So we brief the LLM the way we would brief a
colleague, and most of the time it works, which is the trap. "Of
course it understands me; it is smarter than me in most regards." Then
it breaks in a way no colleague would. It chats like a human but does
not think like one, and under load, at scale, with no escape hatches or
crumple zones, the soft logic fails unpredictably. The repair is to
write unmistakable prompts with explicit outs, "return null if nothing
fits", which mostly works until a foreign product name or a stray typo
walks the model past the one path you reasoned about. None of this
makes LLMs useless. It means we have not learned to treat them as what
they are: a system, not a person.

Most of the enthusiasm around these models studies them at their best,
under clean prompts and cooperative input. The behavior that breaks
gets less attention, because natural language lulls us. Fugue Lock is
one of the seams where that lull tears open.

---

*If you reproduce the experiment, please share your results and make your own variants. I would very much like to
see which models lock and which slip through. The collapses are often weirdly beautiful.*
