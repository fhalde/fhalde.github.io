---
title: "Sizing Your LLM Inference Cluster"
date: 2026-05-27T11:26:15+02:00
draft: false
---

GPU capacity planning is becoming critical: how many GPUs are needed to keep up with incoming workloads without causing delays or overprovisioning. The difficulty is that demand is rarely steady: requests arrive in bursts, job durations vary, and short spikes can quickly create queues even when average utilization looks acceptable.

A practical way to reason about this is to start with a simple closed-form lower bound that gives the minimum GPU requirement under idealized assumptions. From there, simulation can be used to introduce realism: arrival patterns, queueing effects, and workload variability. The goal is to understand how much additional capacity over the lower bound is needed in practice to achieve your service-level objectives.

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

That means memory pressure is not only about loading the model. Long contexts and many in-flight requests can become the binding constraint.

## Compute floor

The lower bound starts by estimating how much useful work arrives per second.

Let:

- \(\lambda\): arrival rate in requests per second
- \(P\): mean prompt tokens
- \(O\): mean output tokens
- \(H\): attention heads
- \(F_{gpu}\): peak FLOPs/sec per GPU
- \(\mathrm{MFU}_{pre}\): model FLOPs utilization during prefill
- \(\eta\): parallelism efficiency

Prefill is approximately:

\[
F_{pre}(P) = 2NP + 4LP^2Hd_h
\]

The first term is the dense forward pass. The second term is prompt attention, which grows quadratically with prompt length.

Decode compute for one generated token per sequence is approximately:

\[
F_{step}(B) = 2NB
\]

where \(B\) is the batch size (number of sequences).

For aggregate request throughput, the per-request decode compute is \(2NO\), so the incoming useful compute per second is:

\[
F_{req/s} = \lambda \left(F_{pre}(P) + 2NO\right)
\]

The compute floor is:

\[
G_{compute}
= \frac{F_{req/s}}
{F_{gpu} \cdot \mathrm{MFU}_{pre} \cdot \eta}
\]

This is a floor, not a deployment recommendation. It assumes steady average load and ignores queueing.

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

The first term is amortized model-weight bandwidth. The second term is KV-cache bandwidth, which is not divided by batch.

The bandwidth floor is:

\[
G_{bw}
= \frac{\lambda O \cdot D_{tok}}
{BW_{gpu} \cdot \mathrm{MBU} \cdot \eta}
\]

The required throughput GPU count is the larger of the compute and bandwidth floors:

\[
G_{required} = \left\lceil \max(G_{compute}, G_{bw}) \right\rceil
\]

This is often where an intuition check helps. Increasing decode batch can improve the bandwidth floor because it amortizes model-weight reads. Increasing context length does not get the same benefit because KV reads remain per sequence.

## Memory and topology

Throughput floors tell us how many GPUs are needed in aggregate. They do not tell us whether a chosen topology can actually run the model.

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

Real traffic violates all of these. Arrivals bunch together, so a system that is fine on average can still miss p95. A few long generations can hold decode slots and KV long enough for shorter requests to queue behind them. Prompt and output lengths are not constants, they are **distributions**. The simulator exists to put those effects back in.

## How the simulator works

The simulator is discrete-event, and deliberately a planning model rather than a reimplementation of vLLM or friends. It models the cluster as a set of replicas, each with a request queue, an in-flight decode batch capped at a maximum batch size, and the KV budget implied by its topology.

Requests arrive as a poisson process. Prompt and output lengths are drawn from lognormal distributions set by a mean and a variance factor.

A replica then advances in cycles. On each cycle it admits at most one queued request, runs that request's prefill, then advances every in-flight sequence by one decode token. Two details drive most of the behavior:

- **Prefill and decode share the replica.** A long prompt's prefill briefly stalls the decode step for everything already running, which is how one request's prompt length leaks into other requests TPOT.
- **Admission is optimistic.** A request is admitted if only the KV it needs to start fits right now. KV-cache growth during generation is reclaimed later. When live KV exceeds budget, the replica preempts newest-first: the victim's KV is dropped, its generated tokens are kept, and it resumes by recomputing context. A request whose context cannot fit even an empty replica is dropped outright.

The payoff is that the simulator preserves the feedback loops the formulas hide: bursts create queues, long generations tie up slots and KV, prefill contends with decode, KV pressure triggers preemption and recompute, and tail latency degrades well before averages look alarming.

It reports the quantities that actually drive decisions, and each answers a different question:

- **TTFT** (p50/p95/p99): queueing and prefill pressure – how long until the first token.
- **TPOT** (p50/p95/p99): decode pressure – how steady the stream is once it starts.
- **End-to-end latency**: both of the above.
- **Queue depth, KV occupancy, preemptions, drops**: why the latencies are moving.
- **Utilization and per-replica balance**: whether there is burst headroom and whether routing is even.

## A worked example

Take the setup I have the most experience with:

- model: Llama-3-70B, BF16
- GPU: H100 80GB SXM
- topology: TP=4, R=3, so 12 GPUs total
- workload: 10 requests/sec, mean prompt 1,000 tokens, mean output 500 tokens
- prompt and output length spread/variance factor: 0.5
- assumed decode batch: 32

The closed-form estimate gives:

- compute floor: about 6 GPUs
- HBM bandwidth floor: about 11 GPUs
- memory floor: about 7 GPUs
- required throughput: 12 GPUs, bandwidth-bound

and the topology comfortably holds weights and expected KV:

- weights: about `140GB`
- KV per token: about `328KB`
- KV budget per 4-GPU replica: about 403k tokens
- estimated in-flight KV per replica: about 38k tokens

So the formulas say 12 GPUs is plausible but is at its limit: the requirement lands right on 12 and the binding resource is HBM bandwidth.

Running the simulator over 300 seconds of traffic gives:

- completed: 2,981 of 3,000 offered (~9.9 req/s)
- p95 TTFT: about 370ms
- p95 TPOT: about 50ms
- p95 end-to-end latency: about 38s
- utilization: effectively 100%
- preemptions: 0

Goodput of ~9.9 req/s against the 10 offered – nearly every request clears – is what keeping up looks like: the queue is not running away.

Drop to 8 GPUs (TP=4, R=2), where the closed-form throughput requirement is no longer met:

- completed: 1,869 of 3,000 offered (~6.2 req/s)
- p95 TTFT: about 60s
- p95 TPOT: about 155ms
- p95 end-to-end latency: about 155s
- utilization: effectively 100%
- preemptions: 0

Now goodput sits far below the offered load: only ~6.2 of every 10 requests/sec actually complete, so a backlog builds for the whole run and the tail blows up into minutes as requests wait behind a queue that never drains.

## A practical workflow

The workflow I like is:

1. Pick the model, GPU, dtype, and rough efficiency assumptions.
2. Estimate the compute, bandwidth, and memory floors.
3. Choose a topology that fits weights and leaves enough KV budget per replica.
4. Simulate at the real arrival rate and length spread, across a few seeds rather than one.
5. Sweep arrival rate and output length to find the knee, not just the single operating point.
6. Pick the smallest topology whose p95 TTFT and TPOT stay within SLO comfortably before that knee.
