---
title: "Making JSON Awaitable"
date: 2026-03-01T22:05:50+01:00
draft: true
---

When working with LLMs for building Agentic Apps, one thing quickly becomes obvious:

- You want structured outputs.
- The model streams tokens.
- Your code waits for a finished JSON blob.

That mismatch introduces accumulated latency.

I built [jsontap](https://github.com/fhalde/jsontap) to close that gap.

The idea is simple:

> Treat JSON as a tree of promises.
> Any path in that tree can be awaited, even before the full JSON has been generated.

This post explains the design behind that idea.

## JSON Is a Tree

JSON is not just a string. It is a hierarchical structure.

```json
{
  "user": {
    "name": "Alice",
    "scores": [10, 20, 30]
  }
}
```

Conceptually, this is a tree:

```text
(root)
 └── user
      ├── name -> "Alice"
      └── scores
           ├── 0 -> 10
           ├── 1 -> 20
           └── 2 -> 30
```

Every value in JSON can be addressed by a unique path:

- `/user/name`
- `/user/scores/1`

Traditional JSON parsing gives you the whole tree at once. Only then can you walk/access it.

But what if the tree is being built in front of you, token by token?

## The Streaming Problem

With LLMs (or any streaming API), JSON arrives progressively:

```json
{
  "reasoning": "Let me think...",
  "tool-call": [
    // #1
    // #2
  ]
  // remaining ...
}
```

If `"reasoning"` arrives early, why should you wait for `"tool-call"` to finish before using it? Similarly, why wait for the rest of the JSON if `"tool-call"` has already arrived?

Standard JSON libraries do not allow this. They require the entire document before giving you access to any node.

That is the core problem jsontap solves.

## Design Goal: Any Path Can Be Awaited

The core abstraction in jsontap is:

```python
from jsontap import jsontap

root = await jsontap(stream)
# stream: async iterator of JSON text chunks
reasoning = await root["reasoning"]
```

Even if `"reasoning"` has not been parsed yet, this works.

Under the hood:

- If the value exists, it returns immediately.
- If it does not exist yet, it suspends until the parser produces it.
- If it never appears, it raises once parsing completes.

This means JSON is no longer just data. It is a reactive tree.

## The AsyncJsonNode Wrapper

You cannot return raw values from a node that might not exist yet.

Instead, every node must be a handle, a placeholder that:

- Knows its JSON path
- Knows how to resolve itself
- Knows how to suspend if needed

That is why jsontap wraps everything in an `AsyncJsonNode`.

When you write:

```python
node = root["user"]["scores"][1]
```

You are not indexing into a dict.

You are constructing a new node handle pointing at the path:

```python
("user", "scores", "1")
```

That handle:

- Can be awaited
- Can be iterated (if it is an array)
- Can throw if parsing fails
- Can resolve instantly if already parsed

The wrapper exists because JSON values are not guaranteed to exist yet.

Without it, you would have no way to suspend execution on a path that has not been seen.

## The Core Insight: Everything Is Indexed by Path

Internally, `jsontap` does not store a tree in the traditional sense.

It stores a map from `path -> state`.

Conceptually:

```python
{
  ("user",): {...},
  ("user", "name"): {...},
  ("user", "scores"): {...},
  ("user", "scores", "0"): {...},
  # ...
}
```

This is managed by a central component: `PathStore`.

The path tuple is the identity of every node.

There is no need for parent references or nested objects.

The entire JSON document is flattened into a path-indexed registry.

## What PathStore Fundamentally Does

`PathStore` is the beating heart of `jsontap`.

### 1) Storing Node State

Each path tracks:

- Whether a value has been resolved
- A `Future` (if someone is awaiting it)
- Stream items (for arrays)
- Progressive iteration cursors
- Error states
- Completion flags

It is effectively a reactive dependency graph keyed by JSON paths.

### 2) Resolving Futures as Data Arrives

When the incremental parser encounters:

```json
"answer": 42
```

The parser resolves the path:

```python
("answer",)
```

If someone previously did:

```python
await root["answer"]
```

`PathStore` already created a `Future` for that path.

When the value arrives:

```python
future.set_result(42)
```

The waiting coroutine resumes immediately.

Access time and parse time are decoupled. That is the whole trick.

### 3) Supporting Progressive Array Iteration

Arrays are more complex.

You do not just want:

```python
scores = await root["scores"]
```

You want:

```python
async for score in root["scores"]:
    ...
```

Before the array is complete.

To support this, `PathStore` tracks:

- Elements by index
- Which indices have arrived
- Whether the array is closed
- Iteration cursors waiting for new elements

As each array item is parsed, new node handles become available.

Iterators wake up and continue.

This enables true progressive consumption of JSON arrays.

## Why This Architecture Works

The key architectural choices are:

- Path-based identity instead of nested object graphs
- One central store for all state
- Node wrappers that are pure handles
- Futures as the synchronization primitive

This keeps the system:

- Deterministic
- Minimal in shared state
- Decoupled from parse order
- Naturally async

There is no complex reactive engine.

Just:

- Paths
- Futures
- A streaming parser feeding the store

## The Bigger Idea: JSON as a Promise Tree

Normally, JSON is treated as static data.

`jsontap` treats it as a tree of lazily resolving promises.

That shift in perspective unlocks:

- Lower latency LLM pipelines
- Early reasoning extraction
- Progressive UI updates
- Structured streaming workflows

Instead of:

```python
response = await llm()
data = json.loads(response)
```

You can write:

```python
root = await tap(llm_stream)

reasoning_task = asyncio.create_task(root["reasoning"])
answer_task = asyncio.create_task(root["answer"])

reasoning = await reasoning_task
answer = await answer_task
```

Whichever arrives first resolves first.

## Closing Thoughts

The design of `jsontap` boils down to one principle:

> JSON is a tree.
> A path identifies a node.
> A node may not exist yet.
> Therefore, a node must be awaitable.

Everything else follows from that.

`AsyncJsonNode` exists because nodes are promises.
`PathStore` exists because promises must resolve somewhere.
Paths exist because trees need stable identities.

Once you see JSON this way, streaming stops feeling awkward.

It starts feeling natural.