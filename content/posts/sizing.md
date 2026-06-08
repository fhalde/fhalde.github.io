---
title: "Sizing Your LLM Inference Cluster"
date: 2026-05-27T11:26:15+02:00
draft: false
---

GPU capacity planning boils down to two questions: what's the theoretical minimum GPU count for my workload, and how much extra capacity is needed once queueing and workload variability are accounted for?

In this post, I'd like to give an overview of this methodology. Here's a toolkit that automates most of it: [howmanygpus](https://huggingface.co/spaces/faizhalde/howmanygpus)

## Start with model facts

The following references were used to derive the formulas in the toolkit:
- [Brrr: Fast LLM inference with high throughput and memory efficiency](https://horace.io/brrr_intro.html)
- [Tensoreconomics: LLM inference economics from first principles](https://www.tensoreconomics.com/p/llm-inference-economics-from-first)
- [Modal: GPU glossary](https://modal.com/gpu-glossary/)

For a model, the first useful quantities are the weight footprint and KV-cache cost per token.

Let:

- \(N\): number of model parameters
- \(L\): number of transformer layers
- \(H_{kv}\): number of KV heads
- \(d_h\): head dimension
- \(b\): bytes per value

The model weights DRAM occupancy in bytes is:

\[
W = N \cdot b
\]

The KV cache created by one token takes:

\[
K_{tok} = 2 \cdot L \cdot H_{kv} \cdot d_h \cdot b
\]

Here \(K_{tok}\) is measured in **bytes per token**. The factor of 2 is for keys and values. This formula is grouped-query-attention aware because it uses KV heads, not total attention heads – check out [Tensoreconomics](https://www.tensoreconomics.com/p/llm-inference-economics-from-first) for more details.

For Llama-3-70B in BF16:

- weights are roughly `70B * 2 = 140GB`
- KV cache is roughly `320KB` per token

Both, weights and KV cache contribute to memory pressure.

## Compute floor

The lower bound starts by estimating how much useful work arrives per second.

Let:

- \(\lambda\): arrival rate in requests per second
- \(P\): mean prompt tokens
- \(O\): mean output tokens
- \(H\): attention heads
- \(F_{gpu}\): peak FLOPs/sec per GPU
- \(\mathrm{MFU}_{pre}\): model FLOPs utilization during prefill
- \(TP_{eff}\): tensor-parallel efficiency

Prefill is approximately:

\[
F_{pre}(P) = 2NP + 4LP^2Hd_h
\]

The first term is the dense forward pass. The second term is prompt attention, which grows quadratically with prompt length.

Decode compute for one generated token in one sequence is approximately:

\[
F_{tok} \approx 2N
\]

If \(B\) is the decode batch size, the total compute for one batch step is:

\[
F_{step}(B) = 2NB
\]

Since one request generates \(O\) output tokens, its decode compute is:

\[
F_{decode/request} = 2NO
\]

So the incoming useful compute per second is:

\[
F_{req/s} = \lambda \left(F_{pre}(P) + 2NO\right)
\]

The compute floor is:

\[
G_{compute}
= \frac{F_{req/s}}
{F_{gpu} \cdot \mathrm{MFU}_{pre} \cdot TP_{eff}}
\]

Note: this is a floor, not a deployment recommendation. It assumes steady average load and ignores queueing.

## Decode bandwidth floor

Decode is often not limited by peak FLOPs. For each decode step, the GPU reads model weights and attends over the existing KV cache. Batching helps with the model-weight read because one weight read serves multiple sequences, but each sequence still has its own KV cache.

Let:

- \(B\): assumed average decode batch
- \(\bar{C}\): average decode context length
- \(BW_{gpu}\): peak HBM bandwidth per GPU
- \(\mathrm{MBU}\): memory bandwidth utilization

During generation, context grows from \(P\) to \(P + O\), so a useful approximation is:

\[
\bar{C} = P + \frac{O}{2}
\]

The HBM bytes read per output token are approximated as:

\[
D_{tok} = \frac{W}{B} + \bar{C} \cdot K_{tok}
\]

The first term is amortized model-weight bandwidth. The second term is KV-cache bandwidth, which is unique to each sequence.

The bandwidth floor is:

\[
G_{bw}
= \frac{\lambda O \cdot D_{tok}}
{BW_{gpu} \cdot \mathrm{MBU} \cdot TP_{eff}}
\]

The required throughput GPU count is the larger of the compute and bandwidth floors:

\[
G_{required} = \left\lceil \max(G_{compute}, G_{bw}) \right\rceil
\]

## Memory and topology

Throughput floors alone is insufficient, the topology must also fit weights and KV cache.

Let:

- \(M_{gpu}\): HBM bytes per GPU
- \(h\): usable HBM headroom
- \(G_{r}\) = GPUs per replica/model instance

The minimum GPUs per replica needed to hold weights is:

\[
G_{r,min}
= \left\lceil
\frac{W}{M_{gpu} \cdot h}
\right\rceil
\]

Once weights are loaded, the remaining memory is the per-replica KV budget:

\[
K_{budget}
= \frac{G_r \cdot M_{gpu} \cdot h - W}
{K_{tok}}
\]

Since the numerator is bytes and \(K_{tok}\) is bytes/token, \(K_{budget}\) is measured in **tokens**. This answers a very concrete question: after the weights are resident, how many active context tokens can this replica hold?

We can also estimate active KV using Little's law. If the no-queueing response time is approximately:

\[
T_{resp} \approx T_{pre} + O \cdot T_{step}
\]

then expected in-flight requests are:

\[
Q = \lambda \cdot T_{resp}
\]

and active KV tokens are:

\[
K_{active} = Q \cdot \bar{C}
\]

Spread across replicas:

\[
K_{active/replica} = \frac{K_{active}}{R}
\]

Both \(K_{active}\) and \(K_{active/replica}\) are also token counts.

This gives a quick residency check. If \(K_{active/replica}\) is near or above \(K_{budget}\), the system will spend time under KV pressure, preempting, recomputing, queueing, or dropping requests whose contexts cannot fit.

## Why simulate?

The formulas above are useful because they are fast and explainable. They are also intentionally optimistic. They assume arrivals are smooth at exactly \(\lambda\), prompt and output lengths are fixed at the mean, the decode batch is known ahead of time, queues never form, every replica is perfectly balanced, and KV pressure can be summarized by an average.

Real traffic violates all of these. Arrivals bunch together, so a system that is fine on average can still miss p95. A few long generations can hold decode slots and KV long enough for shorter requests to queue behind them. Prompt and output lengths are not constants, they are **distributions**.

## How the simulator works

The simulator is discrete-event, and deliberately a planning model rather than a reimplementation of vLLM or friends. It models the cluster as a set of replicas, each with a request queue, an in-flight decode batch capped at a maximum batch size, and the KV budget implied by its topology.

Requests arrive as a poisson process. Prompt and output lengths are drawn from lognormal distributions (the toolkit will soon allow to provide your target distribution).

A replica then advances in cycles. On each cycle it admits at most one queued request, runs that request's prefill, then advances every in-flight sequence by one decode token. Two details drive most of the behavior:

- **Prefill and decode share the replica.** A long prompt's prefill briefly stalls the decode step for everything already running, which is how one request's prompt length leaks into other requests TPOT.
- **Admission is optimistic.** A request is admitted if only the KV it needs to start fits right now. KV-cache growth during generation is reclaimed later. When live KV exceeds budget, the replica preempts newest-first: the victim's KV is dropped, its generated tokens are kept, and it resumes by recomputing context. A request whose context cannot fit even an empty replica is dropped outright.

The simulator captures queueing, decode/prefill contention, KV pressure, preemption, and recomputation, allowing tail latency effects to emerge naturally.

The following metrics are captured by the simulator:

- **TTFT** (p50/p95/p99): queueing and prefill pressure – how long until the first token.
- **TPOT** (p50/p95/p99): decode pressure – how steady the stream is once it starts.
- **End-to-end latency**: both of the above.
- **Queue depth, KV occupancy, preemptions, drops**: why the latencies are moving.
- **Utilization and per-replica balance**: whether there is burst headroom and whether routing is even.

## A worked example

Take the setup I have the most experience with:

| Input | Value |
|---|---:|
| Model | Llama-3-70B, BF16 |
| GPU | H100 80GB SXM |
| Topology | TP=4, R=3 |
| Total GPUs | 12 |
| Workload | 10 requests/sec |
| Mean prompt | 1,000 tokens |
| Mean output | 500 tokens |
| Prompt/output spread | 0.5 CV |
| Assumed decode batch | 32 |

The closed-form estimate gives:

| Estimate | Value |
|---|---:|
| Compute floor | 6 GPUs |
| HBM bandwidth floor | 11 GPUs |
| Memory floor | 7 GPUs |
| Required throughput | 12 GPUs |
| Bottleneck | HBM bandwidth |

and the topology can hold the weights and expected KV:

| Residency check | Value |
|---|---:|
| Weights | `140GB` |
| KV per token | `328KB` |
| KV budget per 4-GPU replica | 403k tokens |
| Estimated in-flight KV per replica | 38k tokens |

So the formulas say 12 GPUs is plausible but is at its limit.

Running the simulator over 300 seconds of traffic gives:

| Simulation result | 12 GPUs (TP=4, R=3) |
|---|---:|
| Completed | 2,981 of 3,000 offered |
| Goodput | 9.9 req/s |
| p95 TTFT | 370ms |
| p95 TPOT | 50ms |
| p95 end-to-end latency | 38s |
| Utilization | effectively 100% |
| Preemptions | 0 |

**Goodput of ~9.9 req/s against the 10 req/s offered. Incoming and outgoing rates are equal, thus there won't be any queuing.**

Let's look at a smaller topology of 8 GPUs (TP=4, R=2), where the closed-form throughput requirement is no longer met:

| Simulation result | 8 GPUs (TP=4, R=2) |
|---|---:|
| Completed | 1,869 of 3,000 offered |
| Goodput | 6.2 req/s |
| p95 TTFT | 60s |
| p95 TPOT | 155ms |
| p95 end-to-end latency | 155s |
| Utilization | effectively 100% |
| Preemptions | 0 |

**The goodput is now under ~6.2 req/s, and will never catch up with the offered load of 10 req/s resulting in a growing backlog.**