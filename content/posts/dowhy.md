---
title: "Logs, metrics, traces & still no answers"
date: 2026-09-13T11:16:25+02:00
draft: true
---

Observability usually starts with the same ritual: figure out what can go wrong, decide which signals might tell us when it does, put them on a dashboard, and wire up some alerts. The usual suspects: RUM, RED, USE, HTTPxx codes, latency percentiles, RPS, CPU %, memory usage, the trifecta of load averages [1m/5m/15m], packet drops. Yes, the packet drops.

Given this vast amount of telemetry – an average enterprise produces terabytes of telemetry per day[^observability-crisis] – why do we still struggle to answer even the most basic questions about an incident?

[^observability-crisis]: [The Observability Cost Crisis](https://www.practicallogix.com/the-observability-cost-crisis-why-84-of-enterprises-are-drowning-in-telemetry-and-how-opentelemetry-is-forcing-a-reckoning)

The issue, as I see it, is that these dashboards are remarkably good at showing us symptoms, but not causes. It's funny how almost everything on the chart just correlates! It also doesn't help that, in production, "too many" things are happening at once. For example, somebody decides to run a marketing campaign that causes a surge in traffic right around the time a new deployment introduces a regression. What caused the latency spike?

RCA is then an exercise done by engineers, carefully reasoning over the metrics and piecing together a plausible story. While I get the appeal of playing "detective", it is generally error prone. Surely machines know how to learn by now?

# Demo

<traffic>
<query plan diagnosis>

The benefits of such a system are several.

### Makes on-call more manageable
Enterprises are forced into an awkward trade-off: keep rotations fine-grained, with every team carrying its own on-call burden, or consolidate them into fewer rotations. The former is expensive (hourly wage is a thing in some countries) & the latter is more anxiety-inducing for whoever gets paged. If we can reliably narrow down the cause of an incident, on-call becomes a much nicer experience. It also creates a stronger foundation for automatic remediations as there's less ambiguity about the cause.

### Enables SRE[^sre].

[^sre]: [Site Reliability Engineering](https://sre.google/)

SRE, when implemented poorly, has a fundamental problem: you centralize the responsibility for responding to incidents without centralizing the knowledge required to understand them. A hundred dashboards don't magically give an SRE the application-level context they need to make sense of an ongoing incident.

I hope this has intrigued you enough to question whether our current approach to observability is really state of the art. Surely, what we need isn't yet another time-series database.
