---
title: "Logs, metrics, traces & still no answers"
date: 2026-09-13T11:16:25+02:00
draft: true
---

In the 12 years of my professional career, almost every system/team I've worked on has involved some version of the same ritual: figure out what can go wrong, decide what signals might tell us when it does, and put those signals on a dashboard & create some alerts. The usual suspects: RUM, RED, USE, HTTPxx codes, latency percentiles, RPS, CPU %, memory usage, the trifecta load-avg[1m/5m/15m], packets dropped (yes, the packet drops!).

Given all this vast telemetry – an average enterprise produces more than 10TB of telemetry per day[^observability-crisis] – so why do we struggle to answer even the most basic questions?

[^observability-crisis]: [The Observability Cost Crisis](https://www.practicallogix.com/the-observability-cost-crisis-why-84-of-enterprises-are-drowning-in-telemetry-and-how-opentelemetry-is-forcing-a-reckoning)

The issue, as I see it, is that these dashboards are remarkably good at showing us symptoms, but not causes. It's funny how almost everything on the chart just correlates! It also doesn't help that, in production, "too many" things are happening at once. For example, somebody decides to run a marketing campaign that surges our traffic right around the time a new deployment introduced a regression. Who do you attribute the latency spikes to?

RCA is then an exercise done by engineers, carefully reasoning over the so-called signals & piecing together a coherent story, the "why". While I get the appeal playing 'detectives', I no longer enjoy it. It's 2026, surely machines know how to learn?

The benefits of such a system are several:

First, **on-call**. Enterprises are forced into an awkward trade-off: keep rotations fine-grained, with every team carrying its own on-call burden but expensive (hourly wage is a thing in some countries), or consolidate them that is cheaper but considerably more anxiety-inducing for whoever gets paged.

If a causal framework can narrow an incident, that makes for a much nicer wee hour page. It is a great substrate for automatic remediations even!

Second, it naturally enables the **SRE model**[^sre].

[^sre]: [Site Reliability Engineering](https://sre.google/)

SRE, when implemented poorly, can be a catastrophe. You take an engineer who doesn't own the system, wake him up to show them 100s of charts, and expect them to understand a web of interactions that normally lives in the heads of the teams who built it.
