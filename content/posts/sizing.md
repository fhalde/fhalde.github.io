---
title: "Sizing Your LLM Inference Cluster"
date: 2026-05-27T11:26:15+02:00
draft: false
---

GPU capacity planning is becoming critical: how many GPUs are needed to keep up with incoming workloads without causing delays or overprovisioning. The difficulty is that demand is rarely steady: requests arrive in bursts, job durations vary, and short spikes can quickly create queues even when average utilization looks acceptable.

A practical way to reason about this is to start with a simple closed-form lower bound that gives the minimum GPU requirement under idealized assumptions. From there, simulation can be used to introduce realism: arrival patterns, queueing effects, and workload variability. The goal is to understand how much additional capacity over the lower bound is needed in practice to achieve your service-level objectives.

In this post, I'd like to give an overview of this methodology. Here's a toolkit that automates most of it: [howmanygpus.streamlit.app](https://howmanygpus.streamlit.app/)

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

The formulas above are useful because they are fast and explainable. They are also intentionally optimistic.

They assume:

- arrivals are smooth at exactly \(\lambda\) requests per second
- prompt and output lengths are fixed at the mean
- decode batch is known ahead of time
- queues do not form
- every replica receives perfectly balanced work
- KV cache pressure can be summarized by an average

Real traffic violates all of these. A system that is fine on average can still miss p95 latency because arrivals bunch together. A few long generations can keep decode slots occupied long enough for shorter requests to queue behind them. Prompt and output lengths are not constants, they are **distributions**.

This is where the simulator comes in.

## The simulation model

The toolkit simulator models a cluster as a set of replicas. Each replica has:

- a request queue
- an active decode batch
- a KV-cache budget
- prefill timing from FLOPs
- decode-step timing from the slower of compute and HBM bandwidth

Requests arrive according to a Poisson process, using exponential inter-arrival times. Prompt and output lengths are sampled from lognormal distributions parameterized by a mean and coefficient of variation. That coefficient of variation matters: a mean output length of 500 tokens with low variance is very different from a workload where many requests are short but a few are thousands of tokens.

Each request is assigned to the least-loaded replica. A replica admits work into its batch when it has enough KV budget, runs prefill, then advances decode one token at a time for all active requests. If KV grows past budget, the simulator preempts newest requests first: their KV is dropped, generated tokens are kept, and they later resume by recomputing context.

The outputs are the quantities that usually matter operationally:

- p50/p95/p99 TTFT
- p50/p95/p99 TPOT
- p50/p95/p99 end-to-end latency
- completed requests and goodput
- utilization
- queue depth over time
- KV-cache occupancy
- preemptions and drops
- per-replica load balance

## A worked example

Consider the following setup (that I have the most experience with):

- model: Llama-3-70B, BF16
- GPU: H100 80GB SXM
- topology: TP=4, R=3, so 12 GPUs total
- workload: 10 requests/sec
- mean prompt: 1,000 tokens
- mean output: 500 tokens
- prompt and output CV: 0.5
- assumed decode batch for the estimate: 32

The closed-form estimate gives:

- compute floor: about 6 GPUs
- HBM bandwidth floor: about 12 GPUs
- memory floor: about 7 GPUs
- required throughput: 12 GPUs, bandwidth-bound

The topology also fits weights and expected KV:

- weights: about 140GB
- KV per token: about 328KB
- KV budget per 4-GPU replica: about 403k tokens
- estimated in-flight KV per replica: about 38k tokens

So the closed-form result says the 12-GPU layout is plausible, but close to the bandwidth floor.

Running the simulator for the same setup gives, for one seed:

- p95 TTFT: about 309ms
- p95 TPOT: about 30ms
- p95 end-to-end latency: about 24s
- utilization: effectively 100%
- preemptions: 0

The lesson is not that these numbers are universal. The lesson is that the closed-form estimate correctly identifies the binding resource and a plausible topology, while the simulator exposes the latency distribution and how much headroom remains.

If the same 4-GPU replica layout is reduced to 2 replicas, or 8 GPUs total, the closed-form throughput requirement is no longer met. In simulation, p95 TPOT jumps to roughly 100ms and p95 end-to-end latency grows substantially. The system still completes many requests, but a queue is rapidly accumulating.

## Sweeps are often more useful than single points

A single estimate answers one version of the workload. Planning usually needs a range.

Useful sweeps include:

- required GPUs vs request rate
- required GPUs vs output length
- compute-bound vs bandwidth-bound regions
- p95 latency and goodput vs offered load

The most useful plot is often latency vs offered load. The "knee" of that curve is where a small increase in requests/sec causes a large increase in p95 latency. That knee is a better capacity signal than average utilization alone.

Utilization near 100% is not automatically bad for batch workloads, but for online inference it usually means there is little room for bursts. Once queues appear, TTFT and end-to-end latency can degrade very quickly.

## A practical workflow

The workflow I like is:

1. Pick the model, GPU, dtype, and rough efficiency assumptions.
2. Estimate compute, bandwidth, and memory floors.
3. Choose a topology that fits weights and has enough KV budget per replica.
4. Simulate with realistic arrival rate, prompt length spread, and output length spread.
5. Sweep request rate and output length to find the knee.
6. Add enough headroom that p95 TTFT and TPOT stay within SLO during bursts.
