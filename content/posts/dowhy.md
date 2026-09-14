---
title: "Logs, metrics, traces & still no answers"
date: 2026-09-13T11:16:25+02:00
draft: true
---

Observability usually starts with the same ritual: figure out what can go wrong, decide which signals might tell us when it does, put them on a dashboard, and wire up some alerts. The usual suspects: RUM, RED, USE, HTTPxx codes, latency percentiles, RPS, CPU %, memory usage, the trifecta of load averages [1m/5m/15m], and, of course, packet drops. Yes, the packet drops.

Given this vast amount of telemetry – an average enterprise produces terabytes of telemetry per day[^observability-crisis] – why do we still struggle to answer even the most basic questions about an incident?

[^observability-crisis]: [The Observability Cost Crisis](https://www.practicallogix.com/the-observability-cost-crisis-why-84-of-enterprises-are-drowning-in-telemetry-and-how-opentelemetry-is-forcing-a-reckoning)

The issue, as I see it, is that these dashboards are remarkably good at showing us symptoms, but not causes. It's funny how almost everything on the chart just correlates! It also doesn't help that, in production, "too many" things are happening at once. For example, somebody decides to run a marketing campaign that causes a surge in traffic right around the time a new deployment introduces a regression. Who caused the latency spike?

RCA is then an exercise done by engineers, carefully reasoning over the so-called signals and piecing together a coherent story – the "why". While I get the appeal of playing "detective", I no longer enjoy it. It's 2026. Surely machines know how to learn?

# Demo

<traffic>
<query plan diagnosis>

The benefits of such a system are several.

First, **on-call**. Enterprises are forced into an awkward trade-off: keep rotations fine-grained, with every team carrying its own on-call burden, or consolidate them into fewer rotations. The former is expensive (hourly wage is a thing in some countries), the latter is more anxiety-inducing for whoever gets paged.

If a causal framework can narrow down an incident, that makes for a much nicer wee hour incident. It is also a great substrate for automatic remediations!

Second, it naturally enables the **SRE model**[^sre].

[^sre]: [Site Reliability Engineering](https://sre.google/)

SRE, when implemented poorly, can be a catastrophe. You take an engineer who doesn't own the system, wake them up, show them 100s of charts, and expect them to understand a web of interactions that normally lives in the heads of the teams who built it.

I hope this has at least intrigued you enough to question whether our current approach to observability is really state of the art. We surely don't need yet another time-series database!

