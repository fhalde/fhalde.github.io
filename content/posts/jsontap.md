---
title: "Making JSON Awaitable"
date: 2026-03-01T22:05:50+01:00
draft: true
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
- `/user/scores/1`
- `/user/friends`
- `/user/friends/0/name`

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

If `"reasoning"` has already materialized in the internal JSON tree, why wait for the rest of the JSON to finish before accessing it?

Standard JSON libraries do not allow this. They require the entire JSON to be parsed before giving you access to any node.

That's the core problem jsontap solves, using the iterative JSON parser [ijson](https://github.com/ICRAR/ijson).

## Any Path Can Be Awaited

The core abstraction in jsontap is the `AsyncJsonNode`:

```python
from jsontap import jsontap

root = jsontap(stream)
reasoning = root["reasoning"] # returns a AsyncJsonNode
await reasoning # suspends until the value is resolved
```

Even if `"reasoning"` has not been parsed yet, this works.

Under the hood:

- If the value exists, awaiting it returns immediately.
- If it does not exist yet, awaiting it suspends on the `AsyncJsonNode` which implements the awaitable protocol.
- If it never appears, it raises once parsing completes.

This means JSON is no longer just data. It is a tree of awaitable nodes.

## The AsyncJsonNode Wrapper

You cannot return raw values from a node that might not exist yet.

Instead, every node must be a handle, a placeholder that:

- Knows its unique path in the JSON tree
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

The wrapper exists because JSON values are not guaranteed to exist yet.

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

## What PathStore Fundamentally Does

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

When the incremental parser that jsontap uses [ijson](https://github.com/ICRAR/ijson), encounters:

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

This enables true progressive consumption of JSON arrays.

## JSON as a Promise Tree

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
root = await jsontap(llm_stream)

reasoning = await root["reasoning"]
answer = await root["answer"]
```

The LLM completion keeps unfolding your code.

## Closing Thoughts

The design of jsontap boils down to one principle:

- JSON is a tree.
- A path identifies a node.
- A node may not exist yet.
- Therefore, a node must be awaitable.

jsontap is the front-end for ijson.

Enjoy!