---
title: "Making JSON Awaitable"
date: 2026-03-01T22:05:50+01:00
draft: false
---

When working with LLMs for building Agentic Apps, one thing quickly becomes obvious:

- You want structured outputs.
- The model streams tokens.
- Your code waits for a finished JSON blob.

That mismatch accumulates latency.

[jsontap](https://github.com/fhalde/jsontap) closes that gap.

The idea is simple:

- Treat JSON as a tree of promises.
- Any path in that tree can be awaited, even before the full JSON has been generated.

This post explains the design behind that idea.

## JSON Is a Tree

JSON is not just a string. It is a hierarchical structure.

```json
{
  "user": {
    "name": "Alice",
    "scores": [10, 20, 30],
    "friends": [
      {
        "name": "Bob",
        "email": "bob@example.com"
      }
    ]
  }
}
```

As a tree:

```text
(root)
 └── user
      ├── name -> "Alice"
      ├── scores
           ├── 0 -> 10
           ├── 1 -> 20
           └── 2 -> 30
      └── friends
           ├── 0
              ├── name -> "Bob"
              └── email -> "bob@example.com"
```

Every value in JSON can be addressed by a unique path.

- `/user`
- `/user/name`
- `/user/scores`
- `/user/friends/0`
- `/user/friends/0/name`

Traditional JSON parsing gives you the whole tree at once. Only then can you walk/access it.

But what if the tree is being built token after token?

## The Streaming Problem

With LLMs, JSON arrives progressively:

```json
{
  "reasoning": "Let me think...",
  "tool-call" ...
```

If `"reasoning"` has already materialized in the internal JSON tree, why wait for the rest of the JSON to finish before accessing it?

Standard JSON libraries do not allow this. They require the entire JSON to be parsed before giving you access to any node.

That's the core problem jsontap solves, using the [ijson](https://github.com/ICRAR/ijson) iterative parser.

## Any Path Can Be Awaited

The core abstraction in jsontap is the `AsyncJsonNode`:

```python
from jsontap import jsontap

root = jsontap(stream)
reasoning = root["reasoning"] # returns a AsyncJsonNode
await reasoning # suspends until the value is resolved
```

Even if the key `"reasoning"` has not been encountered by the parser yet, this works.

Under the hood, `AsyncJsonNode` implements the `Awaitable` and `AsyncIterator` protocols.

## The AsyncJsonNode Wrapper

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

The wrapper exists to preserve lineage information.

## Everything Is Indexed by Path

Internally, jsontap does not store a tree in the traditional sense (for simplicity).

It stores a map from `path -> node state` into a `PathStore`.

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

The path tuple is the identity of every node.

## The PathStore

### 1) Storing Node State

Each path tracks:

- A `Future` (if someone is awaiting it)
- Cursors (for arrays)
- Error states
- Completion flags

It is effectively a reactive dependency graph keyed by JSON paths.

### 2) Resolving Futures as Data Arrives

When the incremental parser that jsontap uses [ijson](https://github.com/ICRAR/ijson) resolves a JSON node:

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

There's a `Future` for that path in the `PathStore` already.

When the value arrives, we resolve the future:

```python
future.set_result(42)
```

The waiting coroutine resumes immediately.

That's it

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

As each array item is parsed, iterators are woken up.

This enables progressive consumption of JSON arrays.

## Summary

Normally, JSON is treated as static data.

`jsontap` treats it as a tree of lazily resolving promises.

This enables:

- Lower latency LLM pipelines
- Early extraction
- Progressive UI updates
- Structured streaming workflows

The LLM completion keeps unfolding your code.

In hindsight, [jsontap](https://github.com/fhalde/jsontap) is the front-end for [ijson](https://github.com/ICRAR/ijson)

`uv add jsontap` & enjoy!