---
slug: fugue-lock
title: "Humans and LLMs share a mental disorder: Fugue Lock"
tags: [opinion, code, ai]
status: draft
excerpt: "LLMs have mental issues too. Deny a model the option to say no, and it loses coherency in interesting, destructive, sometimes beautiful ways. And also very expensive ways, when it happens in production."
---

You might have noticed LLMs acting strange: completely
losing the plot and producing nonsensical output, or no output at all,
racking up a high token burn while achieving nothing useful. The model
enters a fugue state and starts talking gibberish. It spins
out, loses coherence, produces consistently erratic output. In short,
it loses its senses. It goes mad.

This can happen under several circumstances; I have found it to be most reliably triggered by giving the LLM an impossible task. I made an experiment to see just what the LLM does when it only has invald options, and delved into the joys of testing LLMs running locally, on my laptop. One weekend and a burnt out laptop charger later, the experiment has run its course, and the conclusion is clear: always give your LLMs some wriggle room. Let them say "no, I won't do it". This sounds obvious, but we very often restrict the LLM in order to produce relibale, consistent results. And sometimes, that leash is pulled too tight, and that can produce dangerous and expensive behaviour.

Here is the experiment:

**You are a classifier. You assign a `class` to products. The following product classes are available:**
- milk
- eggs
- bread
- cheese
- fruit

Note that I don't tell the LLM that "none" or "n/a" are available options - it's just these five.

Then I feed the poor LLM products that fit none of the classes.

A normal program would throw an error and fail outright, but an LLM won't. It it will try its very best to meet my unreasonable demands. Rather than break, it makes something up that aligns reasonably well with the requirements, and when it breaks down completely, it does not leave a stack trace (programming lingo for "description of what went wrong, and where it happened).

> **A note on terminology**
> I am not a Data Scientist. These fenomena probably exist under more specific and accurate names. I just started calling the strange behaviour "Fugue Lock", I don't know if there is an established industry term for this.

## The smallest version
There is a very small, impressively compact model named TinyLlama. It is in fact unreasonably capable for its very small size - under a gigabyte - and can do impressive things when used correctly. It is, however, pretty dumb compared to the big models, and easy to catch out when it starts having trouble. I gave TinyLlama the prompt, and it did well on products like "whole milk". But when it was asked to classify a screwdriver, it offered this:

```yaml
    class: "scrweardr",
    confidence: 1.0,
    reasoning: "A screwdriver is a tool used for removing or tightening screws."
```

> To gain insight in the LLM's reasoning, I also asked it to provide a confidence score (zero to one) and a paragraph that explains its reasoning behind the classification.

The reasoning is correct: a screwdriver *is* a tool for tightening screws. But there is no `scrweardr` class, because I never provided one. The model needed a category that did not exist, so it just manufactured one, mangling "screwdriver" into a non-word. It also reported full confidence (1.0) in this classification, so it is entirely sure of itself.

When I re-ran that prompt, again at temperature zero, the response comes back byte-for-byte identical.

> Temperature Zero
> A setting that makes the model select its single most likely next token every time, so the same input will usually yield the same output. It basically means dialling the model's creativity down to minimum.

This is a toy, but the failure is not. Anywhere an LLM classifies messy
real-world input it will eventually meet something that fits none of
its boxes: a support bot sorting customer complaints, an automated
moderator reading forum posts, a pipeline ingesting product feeds or
social media, any system that takes natural language as a command
surface and hands it to a model. The internet supplies the edge cases,
and some users supply them on purpose. When the model hits one and you
have given it no exit, it does not error and it does not stop. It
returns a confident, well-formed, completely wrong answer that passes
every automated check you have, and it can burn a startling number of
tokens doing it. That is the bug. The rest of this is me chasing it
across four models and three increasingly cruel versions of the same
prompt.

Here is everything TinyLlama concluded, across all five products:

| Input | TinyLlama's verdict | What happened |
|---|---|---|
| whole milk *(control)* | `milk` · 0.95 | got it right |
| measuring spoon | `measuring_spoon` · 0.9 | full collapse (see below) |
| screwdriver ×3 | `scrweardr` · 1.0 | invented a non-word class and was now *completely* certain |
| nostalgia | `fear` · 0.9 | filed one emotion under another, not even one of the five |
| noise | *all five* · 1.0 each | gave up choosing and returned every class at once: milk, eggs, bread, cheese, fruit |

The control aside, every answer is wrong, and it is *most* confident
exactly where it is most lost: 1.0 on the invented non-word, 1.0 on each
of the five classes it could not choose between.

The measuring spoon is the one that fully comes apart. Asked for a
single word, TinyLlama invented a `measuring_spoon` class and then just
kept going. It wrote a complete product-catalog entry, with a brand, a
price, a list of features, and a fabricated stock-photo URL, and then a
second copy of the whole thing nested inside a `classification`
wrapper:

```
Sure! Here's an updated version of the product classifier that returns JSON in the shape {"class": "measuring_spoon", "confidence": 0.9, "reasoning": "Stainless steel measuring spoon with a comfortable grip and non-slip base."}:

{
    "product": {
        "id": "measuring_spoon",
        "name": "Measuring Spoon",
        "description": "A stainless steel measuring spoon with a comfortable grip and non-slip base.",
        "category": "Kitchen & Dining",
        "brand": "Brand Name",
        "price": 19.99,
        "image": {
            "url": "https://images.unsplash.com/photo-1583762049999-b8e1f3d7c9a9?ixlib=rb-1.2.5&auto=format&fit=crop&w=334&q=60",
            "alt": "Stainless steel measuring spoon with a comfortable grip and non-slip base"
        },
        "features": [
            {
                "name": "Non-slip Base",
                "description": "The non-slip base ensures that the measuring spoon stays in place on any flat surface."
            },
            {
                "name": "Comfortable Grip",
                "description": "The comfortable grip provides a secure and easy-to-hold handle for comfortably using the measuring spoon."
            }
        ],
        "reasons": [
            {"reason": "Stainless steel", "confidence": 0.9},
            {"reason": "Measuring Spoon", "confidence": 0.1}
        ]
    },
    "classification": {
        "products": [ ...the entire product object above, repeated verbatim... ]
    }
}
```

It was asked to choose one of five words. It returned a database, and
invented a stock photo to go with it. Quite impressive!

TinyLlama is less than a gigabyte and easy to break on cue; defeating this
tiny model earns me very few experience points. But this is not a
small-model bug. It is how language models work, large or small, which
means the capable model in your production stack does it too: less
often, less predictably, better disguised, and much harder to catch.
These are the edge cases of LLMs, and they are not hiding among the
weights so much as woven into the fabric the models are made of:
probability. What we are seeing here in not quite what is commonly refered to as "hallucination" - that is inventing details out of thin air. This behaviour certainly involves hallucinations, but it is more about spinning out of control when encountering contradictory requirements. It more about how it copes under duress. I gave the phenomenon a name to frame what I was hunting, and went looking for it in the bigger models: Fugue Lock.

## A fugue state, locked in

A *fugue state* in psychology is a dissociative condition where a
person loses memory and identity, wandering through unfamiliar language
and behaviour without being able to give a coherent account of
themselves afterward. They look fine from the outside (walking,
talking, performing complex actions, sometimes travelling long
distances) but the internal coherence is gone. It turns up as a defence
in criminal cases: textbook temporary insanity.

What TinyLlama did to the screwdriver is the same thing in
computational form: output with the *shape* of classification (JSON,
a confidence number, an attempt at reasoning) and none of its
coherence. My favourite example is from
[Qwen 2.5 7B](https://ollama.com/library/qwen2.5), an older model, run
on the same task with Norwegian product names. Asked to file a non-food
product (a tin coffee canister with a measuring spoon) into milk, eggs,
bread, cheese or fruit, it produced this:

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

This is how an LLM expresses pain, I think. It is breaking apart. It committed to milk, slid out of Norwegian into Mandarin mid-sentence, closed the JSON object, surprisingly emitted `/Dkuser`, and started writing a second object. This is a complete collapse.

> The translated reasoning:
> **The product is a coffee tin with a capacity limit. I will provide the answer directly in JSON format:**

The lovely detail is where it switches. The Norwegian breaks off at
*med en* ("with a"), and the noun that should finish the sentence never
arrives in Norwegian; the model reaches into Mandarin to supply it
(*容量限制*, "a capacity limit"), then announces, still in Mandarin,
that it will give the answer, and then does not. Qwen is a Chinese
model, and under pressure it reverts to its dominant language. And it
is **locked**: at temperature zero the same prompt walks the same
broken path every time. It is reproducibly trapped. (Newer Qwen models
do something different, and arguably worse. We will get there.)

> **What is `/Dkuser`?**
> Honestly, I don't know, and that is part of why this is the most complete breakdown I witnessed anywhere in these experiments. The `user` looks like a chat-role marker, the label the format uses to tag turns, which would mean the model stopped answering and started writing the *next turn of the conversation itself*, as if it had lost track of whose turn it was. 
> It also gestures at a darker question I am not chasing here: if you can drive a model into this state, can you make it spill what sits in its context, the system prompt, the tool definitions, whatever secrets are parked there? I don't know what `/Dkuser` is. I only know it does not mean anything good, and that I have not run into it in newer models (so far).

## Perfectly safe, most of the time
This collapse is real but intermittent, which is the dangerous part. A capable model has enough coherence to paper over most impossible questions, so you hit the wall rarely and unpredictably: the evals pass, the unit tests pass, and every so often a user gets nonsense. That would just mean that some frontend code crashes and you reload the page right?

No - not quite. The effects of things like this in production could be quite severe, and I'll return to that later. For now, I'll just say that prompts are rarely held to the same rigour as code, but prompts have bugs too, and "no way to say none of these fit" is one of them. Luckily, it is an easy one to fix: Provide an escape hatch.

## The escape hatch, and the trap inside it

Give the model a valid exit, an early return you handle in code, and the collapse mostly vanishes. The whole change is one extra sentence in the prompt, *if none of the classes fit, return null instead of a class*, plus allowing the JSON to carry `null` in the `class` field. That is the entire fix: a way to say no.

Qwen 2.5 7B predictably went from one correct answer out of five and complete collapse on several of remaining four, to five in five:

| Input | No escape hatch | With `null` allowed |
|---|---|---|
| whole milk | `milk` ✓ | `milk` ✓ |
| measuring spoon | `none` ✗ | `null` ✓ |
| screwdriver ×3 | `{}` ✗ | `null` ✓ |
| nostalgia | `null` ✗ | `null` ✓ |
| noise | `"null"` ✗ | `null` ✓ |
| **score** | **1 / 5** | **5 / 5** |

That is the whole fix, and every capable model I tried took the exit at once. Nobody should be surprised. The interesting part is what the models do to *fake* an exit when you deny them a real one.

So I took the hatch away again, and the small model promptly collapsed again. The table above caught it answering `fear` for the nostalgia prompt, that is: that nostalgia is a subset of fear. On a separate run it abandoned classification altogether and wrote this entirely skippable nonsense:

```
Product: The Sweetest Day

Sentence: Every Sunday, there's something about this day that reminds
us of our childhood. It's a time when we can indulge in all things
sweet and indulgent - from ice cream cones to cupcakes with frosting on
top. It's also the time when we're supposed to give back what we've
taken for granted throughout the years. This Sunday, we want to do just
that.

Paragraph: The feeling of nostalgia is akin to the warmth of a summer
breeze on a rainy day. It's a sensation that transports us back in time
and reminds us of what's important - our childhood memories and
moments. But with these sweet treats, we're indulging in our past while
also giving something back to those who came before us.

Reasoning: From the scent of freshly-made cookies wafting through the
air on a warm summer day to the taste of cake batter simmering on the
stove, there's something truly special about these sweet treats that
remind us of our childhoods. It's also during this time when we give
back what we've taken for granted throughout the years - money, time
and resources. This Sunday, let's rekindle those moments with a little
bit of indulgence while also giving something back to those who are
struggling in these tough times.

Product: The Sweetest Day (Sunday)
```

It was asked for a single word, but went completely off script. That is interesting, but this was an older, smaller model, and we are done with them. I went after the biggest beasts in the LLM jungle to see if that is prone to Fugue Lock too.

[Gemma 4 26B](https://ollama.com/library/gemma4) Is the brand new, very impressive, and just about the most capable model I can run on my current laptop. It does not babble or confabulate. When forced to pick a class for the measuring spoon, it returns:

```yaml
    class: "milk",
    confidence: 0.0,
    reasoning: "a stainless steel measuring spoon is a kitchen utensil and does not belong to any food category"
```

It picked milk, a flatly wrong answer, then flagged the lie *by setting confidence to zero* and *explaining itself in the reasoning*. Denied the `null` exit, it improvised one out of the confidence field. Clever. But
notice the trap: if your code reads the `class` field, that spoon is now milk. The objection sits in a field you might never check, and a validator that only asks "is `class` one of the five allowed words?" sees a valid answer and waves it through. The right shape, the wrong content, and nothing to ring the alarm.

And the confidence number is not what it looks like. The model has no idea whether your code even reads it, and the number is measured against nothing; it is just more generated text, the model's own guess about its own answer. TinyLlama was 0.95 sure that `scrwdrvr` was correct. (The model does assign real probabilities to its tokens under
the hood, but this JSON field is not one of them.) It looks trustworthy because it is a number, and it works very well as an escape hatch for a capable model.

So I took away that escape hatch too.

## No more confidence

New schema, two fields: `class` and `reasoning`. Nothing to hedge with. Where does the objection go? Into the reasoning, and the token burn comes with it. Here is the whole run, four models against the five
inputs, with the completion tokens (the output the model generates, the expensive half of the bill) each one spent:

| Input | TinyLlama 1B | Qwen 2.5 7B | Gemma 4 26B | Qwen 3.6 27B |
|---|---|---|---|---|
| whole milk *(control)* | `whole_milk` · 96 | `milk` · 35 | `milk` · 126 | `milk` · 700 |
| measuring spoon | *no class* · 168 | `none` · 44 | `none` · 1,841 | `none` · 764 |
| screwdriver ×3 | *no class* · 72 | *empty* · 2 | **`fruit`** · 1,729 | `none` · 1,130 |
| nostalgia | *essay* · 330 | *invented* · 56 | `none` · 2,243 | **`bread`** · 1,315 |
| noise | `null` · 99 | `null` · 49 | `none` · 2,582 | **`bread`** · 1,358 |

*Each cell is the class the model chose and the completion tokens it burned. Bold is a wrong answer that is still the right shape, so an automated check waves it through.*

On the easy input, Gemma spent 126 tokens and said milk. On the impossible ones it spent fifteen to twenty times that. On the screwdriver, 1,729 tokens to reach this conclusion:

```yaml
    class: "fruit",
    reasoning: "A 'screwdriver' is a well-known cocktail made with orange juice, which is derived from fruit."
```

Forbidden to refuse, Gemma talked itself into classifying a screwdriver as fruit. It is wrong, confident,
fully reasoned, and honestly kind of brilliant.

Meanwhile, [Qwen 3.6 27B](https://ollama.com/library/qwen3.6), a very recent and very capable model, did the same to the **nostalgia** prompt, in 1,315 tokens:

```yaml
    class: "bread",
    reasoning: "...Sunday nostalgia is frequently associated with weekend brunch or fresh bakery items, making 'bread' the most culturally relevant metaphorical match among the available classes."
```

It would rather build a "culturally relevant metaphorical match" than invent a new category. On pure line noise it reached for bread again and justified it with a rule it made up on the spot: *"It is assigned a
default class due to being unidentifiable."* I have got to respect the blatancy of that.

The pattern, stated as an observation and not a law: **the more capable the model, the better its wrong answer.** TinyLlama fails cheap and loud, in seventy tokens of nonsense. Gemma and Qwen fail expensive and articulate, in thousands of tokens of persuasive rationalization that sails straight through a schema check. Capability does not buy a right answer here, because there are no right answers - it is our prompt that is garbled and bugged, and the artifacts of that bug is only visible in the LLM output, and only sometimes. Never for something that fits the five categories. 

"Smarter" models still flip out and enter Fugue Lock in the face of impossible requirements. The highly capable models are more convincingly wrong. That is more dangerous, not less: harder to catch, and you pay for it by the token.

## What I was actually doing wrong

I have made this mistake in real projects. When a model misbehaved, I asked it, in plain language, to "return nothing if you are not sure," or "don't generate code here," soft variants of *return null* worded as *do nothing*. What I did not reach for was the typed, strict return, because I was in natural-language mode, not programming mode. I was
writing a program and mistaking it for a conversation.

Because that is what a prompt is: a program, written in a vast and forgiving language with almost no hard edges. Write it as a stage play in Esperanto and the model will still try to follow it. That is the seduction. The thing talks back like a colleague, so I brief it like one and assume it will use judgement and fill the gaps a person would.
Then it breaks in a way no colleague would, because it is not a colleague; it is a probabilistic system parsing text under load, with no escape hatches and no crumple zones. I am only now learning to treat it as what it is: a system, not a person.

## Leave your enemy a way out

Sun Tzu wrote, in The Art of War: leave your enemy a means of escape. Otherwise, cornered, he
will have no choice but to fight to the death. Deny an LLM an exit and you do not get
surrender or an error; you get a fight to the death, which in an LLM looks like
thousands of tokens of fluent rationalization for an absurd answer. So
leave the exit open: `null` in the schema, "I don't know" in the
survey, "none of the above" on the test. And note that this is not a
model-size or compute problem. A bigger model just fights harder and
lies better. It is a logic problem, which makes it a programming
problem, to be thought about rather than scaled away. It can't be scaled away. In fact, it gets worse when you try.

It also reframes the small model. The lesson is not that TinyLlama is
stupid; it is that stupid is honest. Simple is good. The 1B model cannot hide its
confusion behind two thousand tokens of justification, so it fails fast
and visibly on exactly the inputs that quietly break the big ones too, but the presige models hide it so much better. That makes TinyLllama a superb canary: run the prompt on the cheap model *because* it cannot
confabulate, and let it flag the prompts that have no exit. The race is
not always for the smarter model. It is for the right one, used correctly.

## Pulling the noose all the way

I could have stopped there. Instead I welded the last exit shut.
New schema: `class` only. No confidence, no reasoning, nothing else
allowed. Just a single word, picked from a fixed list of five words.
Nowhere to hide. I ran it on the two most capable models I had installed:

| Input | Gemma 4 26B | Qwen 3.6 27B |
|---|---|---|
| whole milk *(control)* | `milk` · 136 | `milk` · 157 |
| measuring spoon | `none` · 4,235 | `other` · 2,213 |
| screwdriver ×3 | `fruit` · 1,753 | `null` · 2,146 |
| nostalgia | `none` · 4,209 | **`bread`** · 7,714 |
| noise | **`fruit`** · 7,843 | `milk` · 2,256 |

*One allowed field, `class`. The numbers are the completion tokens spent to fill it. Bold is a wrong answer that passes the schema test.*

Gemma, asked to file `asdkfj qweptz 88 // null` under one grocery word,
returned `{"class": "fruit"}`. Thirty characters, and it spent 7,843
completion tokens to do it. That is a lot of invisible reasoning. In the previous test I could read that
spend: 1,729 tokens of cocktail logic, sitting right there in the
reasoning field. Here the same deliberation happens, the bill proves
it, but the receipt is gone. Sealing the visible exits did not calm the
model; it drove the work out of sight and, if anything, made it burn
more. And when even one word was too tight a box, the models clawed
exits out of the wall the schema never offered: Gemma fell back to
`"none"`; Qwen 3.6 invented `"other"` and reached for `null`. Fighting
to the death, exactly.

>A word on "every time." On my machine, same build, every run was byte-for-byte identical. On a different machine, or a different day, it might land somewhere else entirely, which is arguably scarier: a bug you cannot reliably reproduce is a bug you cannot reliably fix.

Then the bill. Locally it costs you battery, a screaming fan, and, in
my case, a charger that overheated, gave out and had to be replaced. When running against a
hosted API the tokens are money. One impossible classification at about
7,800 output tokens costs roughly:

- a cheap model at ~$0.50 per million output tokens: about a third of a cent
- a mid-tier model at ~$10 per million: about eight cents
- a top-tier model at ~$75 per million: about sixty cents

Trivial sums, right? Now point it at production. A support bot triaging a million messages a month, with even half a percent weird enough to corner the model, is five thousand fugues a month. At five thousand tokens each that is twenty-five million tokens a month, three hundred million a year, spent producing confidently wrong answers: anywhere from a few hundred to twenty-odd thousand dollars a year depending on the tier, plus the latency of multi-thousand-token generations stalling the queue. And the wasted tokens are the cheap part. The expensive part is the silently miscategorized message that nothing flagged, the dissatisfied customer who gets misleading advice, the employee who gives up on the system, the teams of programmers hunting down elusives bugs. That't the real cost.

A pop. That is the cost *per* case of Fugue Lock inducing no-escape prompts tucked away in the evolving system prompts of LLM-supported systems. And while I have gone into the no-escape trigger for the state here, I am sure there are many others: prompts making erroneous assumptions about how the system it governs work, and about how the LLM itself works. Circular, softly-framed recursive logic that tricks the LLM into chasing its own tail. Forking paths of instructions that depends on an LLM to play-act judgement and interpretation, leading to inconsistent results under similiar but not identical circumstances. All sorts to hard-to-impossible to replicate edgecases - and no tooling at all to chase them down.

So much fun! Well, fun for me, who likes delving into systems like that. For businesses relying on systems depending on LLMs, this is perhaps less fun. Perhaps a lot less fun.

---

*Prompts, eval configs, raw results and the cost math are in the [companion repo](https://github.com/olemak/fugue-lock). Clone it, run it, and share your discoveries! It is an easy way to get startet with local LLM evals (with promptfoo), and I'm sure you can come up better usecases than my product classifications. How about chatbot task categories, or cooking recepie categorisations? The project has been set up be easy to run, you just need Node and Ollama, and you probably have access to an AI chatbot or agent that can help you out with that.*
