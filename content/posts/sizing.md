---
title: "Sizing LLM inference"
date: 2026-05-27T11:26:15+02:00
draft: true
---

Most sizing guides start with the model – parameters, layers, heads. That's useful & important, but I like to start from the other end: demand (RPS) first, then work down to hardware.

This post walks through it.

## 1. Start with demand

Define your workload demand:

- \(\lambda\) — requests per second (req/s)
- \(P\) — average prompt length (tokens)
- \(O\) — average output length (tokens)

## 2. What does one request do?

Every request has two phases: **prefill** (read the prompt) and **decode** (generate the output).

You don't need transformer internals to size this. You need a few per-model facts (from a model card, preset, or one profile run):

- \(W_s\) — model size in GPU memory
- \(k\) — KV bytes per token (memory to store one token of context)
- \(F_{\text{prefill}}(P)\) — compute to process a prompt of length \(P\)
- \(F_{\text{decode}}\) — compute per output token

Total compute per request:

\[
F_{\text{req}} = F_{\text{prefill}}(P) + O \cdot F_{\text{decode}}
\]

e.g. (Llama-70B, \(P=1000\), \(O=500\)): one request is on the order of ~200T FLOPs — prefill plus 500 decode steps.

## 3. What does one request need in memory?

While a request is active, it holds **KV cache** — stored attention state for tokens already processed. Per token, the model needs a fixed amount of KV memory \(k\).

Context grows during decode from \(P\) to \(P + O\). A simple average for memory cost:

\[
\bar{C} = P + \frac{O}{2}
\]

KV memory per request:

\[
M_{\text{KV}} = k \cdot \bar{C} = k \left(P + \frac{O}{2}\right)
\]

Total memory per active request (weights + KV):

\[
M_{\text{req}} = W_s + M_{\text{KV}}
\]

## 4. From demand to capacity

At \(\lambda\) req/s, aggregate compute and memory demand scale linearly:

\[
F_{\text{total}} = \lambda \cdot F_{\text{req}}
\]

\[
M_{\text{total}} = \lambda \cdot M_{\text{req}} \cdot T_{\text{req}}
\]

where \(T_{\text{req}}\) is average request duration (seconds) — how long a slot stays occupied in memory.
