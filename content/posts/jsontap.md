---
title: "Making JSON Awaitable"
date: 2026-03-01T22:05:50+01:00
draft: false
---

When working with LLMs for building Agentic Apps, one thing quickly becomes obvious:

- You want structured outputs.
- The model streams tokens.
- Your code waits for a finished JSON blob.

That mismatch accumulates latency. [jsontap](https://github.com/fhalde/jsontap) closes that gap.

This post explains the design behind jsontap.

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

## ijson

`ijson` emits a stream of `(path, event, value)` triples while input bytes are still arriving.

For the JSON example above, you can inspect this with:

```bash
pbpaste | uv run python -m ijson.dump -m parse
```

Sample output:

| # | path | event | value |
|---|---|---|---|
| 0 |  | `start_map` | `None` |
| 1 |  | `map_key` | `user` |
| 2 | `user` | `start_map` | `None` |
| 3 | `user` | `map_key` | `name` |
| 4 | `user.name` | `string` | `Alice` |
| 5 | `user` | `map_key` | `scores` |
| 6 | `user.scores` | `start_array` | `None` |
| 7 | `user.scores.item` | `number` | `10` |
| 8 | `user.scores.item` | `number` | `20` |
| 9 | `user.scores.item` | `number` | `30` |
| 10 | `user.scores` | `end_array` | `None` |
| 11 | `user` | `map_key` | `friends` |
| 12 | `user.friends` | `start_array` | `None` |
| 13 | `user.friends.item` | `start_map` | `None` |
| 14 | `user.friends.item` | `map_key` | `name` |
| 15 | `user.friends.item.name` | `string` | `Bob` |
| 16 | `user.friends.item` | `map_key` | `email` |
| 17 | `user.friends.item.email` | `string` | `bob@example.com` |
| 18 | `user.friends.item` | `end_map` | `None` |
| 19 | `user.friends` | `end_array` | `None` |
| 20 | `user` | `end_map` | `None` |
| 21 |  | `end_map` | `None` |

This event stream is exactly what jsontap uses: when a path event arrives, the corresponding awaiter can be resolved.

## Any Path Can Be Awaited

The core abstraction in jsontap is the `AsyncJsonNode`:

```python
from jsontap import jsontap

root = jsontap(stream)
reasoning = root["reasoning"] # returns an AsyncJsonNode
await reasoning # suspends just until that value is available
```

Even if the key `"reasoning"` has not been encountered by the parser yet, this works.

Under the hood, `AsyncJsonNode` implements the `Awaitable` and `AsyncIterator` protocols.

When you write:

```python
node = root["user"]["scores"][1]
```

You are not indexing into a dict.

You are constructing a new node handle a.k.a `AsyncJsonNode` pointing at the path:

```python
("user", "scores", "1")
```

That `AsyncJsonNode` handle:

- Can be awaited
- Can be iterated (if it is an array)
- Can throw if parsing fails

The wrapper exists to preserve lineage information.

## The PathStore

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

#### 1) Storing Node State

Each path tracks:

- A future (if someone is awaiting it)
- Cursors (for arrays)
- Error states
- Completion flags

#### 2) Resolving Futures as Data Arrives

When [ijson](https://github.com/ICRAR/ijson) parses a node:

```json
"answer": 42
```

jsontap resolves the path:

```python
store.get(("answer",)).future.set_result(42)
```

If someone previously did:

```python
await root["answer"]
```

The waiting coroutine resumes immediately.

#### 3) Supporting Progressive Array Iteration

Arrays are more complex.

You do not just want to wait for the entire array:

```python
friends = await root["friends"]
```

You want to iterate over the array items as they arrive:

```python
async for friend in root["friends"]:
    name = await friend["name"]
```

It's worth discussing this in more detail.

By default, the iterator above isn't waiting for each array item to fully materialize.

Instead, it yields an `AsyncJsonNode` handle the moment the parser recognizes the start of an array item. At that point, `friends[i]` might be half-parsed – `"name"` might exist but `"email"` is still mid-stream. This is important since items can be deeply nested objects you'd rather not wait to be fully parsed.

However, sometimes you may want to wait for the entire item to be available, you can choose your pill:

```python
async for friend in root["friends"]:
    friend = await friend
    print(friend["name"])

async for friend in root["friends"].values():
    print(friend["name"])
```

To support this, `PathStore` tracks:

- Elements by index
- Which indices have arrived
- Whether the array is closed
- Iteration cursors waiting for new elements

As each array item begins to be parsed, iterators are woken up. This enables progressive consumption of JSON arrays.

## Summary

Normally, JSON is treated as static data.

jsontap turns it into a tree of awaitable nodes.

This enables:

- Lower latency LLM pipelines
- Early extraction
- Progressive UI updates

The model keeps generating while your code keeps unfolding.

```bash
uv add jsontap
```

Enjoy!