---
title: "Logs, metrics, traces & still no answers"
date: 2026-09-13T11:16:25+02:00
draft: true
---

Observability usually starts with the same ritual: figure out what can go wrong, decide which signals might tell us when it does, put them on a dashboard, and wire up some alerts. The usual suspects: RUM, RED, USE, HTTPxx codes, latency percentiles, RPS, CPU %, memory usage, the load avg trifecta [1m/5m/15m], packet drops. Yes, the packet drops.

Given this vast amount of telemetry – an average enterprise produces terabytes of telemetry per day[^observability-crisis] – why do we still struggle to answer even the most basic questions about an incident?

[^observability-crisis]: [The Observability Cost Crisis](https://www.practicallogix.com/the-observability-cost-crisis-why-84-of-enterprises-are-drowning-in-telemetry-and-how-opentelemetry-is-forcing-a-reckoning)

The issue, as I see it, is that these dashboards are remarkably good at showing us symptoms, but not causes. It's funny how almost everything on the chart just correlates! It also doesn't help that, in production, "too many" things are happening at once. For example, somebody decides to run a marketing campaign that causes a surge in traffic right around the time a new deployment introduces a regression. What caused the latency spike?

RCA is then an exercise done by engineers, carefully reasoning over the metrics and piecing together a plausible story. While I get the appeal of playing "detective", it is generally error prone. Surely machines know how to learn by now?

# Can we do better?

While looking for solutions, I came across [Causal Machine Learning](https://medium.com/causality-in-data-science/why-machine-learning-needs-causality-3d33e512cd37) which looked promising, and to my luck, some good folks at Microsoft and AWS have already done much of the heavy lifting in the [DoWhy](https://www.pywhy.org/dowhy/v0.10.1/index.html) library. Their documentation does an excellent job of showcasing practical applications of causal modeling, check it out!

To put DoWhy into practice, imagine you're running a standard three-tier web app – frontend, backend, database.

On a normal day, your operations look something like this:
![all-good](/posts/normal.png)

Then, one day, you are staring at this:
![all-bad](/posts/incident.png)

Let me point out that this is already a pretty decent dashboard. Alongside the usual metrics, it captures ongoing events such as the start of a campaign or a new deployment thus giving you valuable context for what was happening in the system that may have caused the incident.

But even then, the dashboard isn't actionable. Did the deployment introduce a regression? Or is this simply what the system looks like under this level of traffic?

Here's another scenario. Let's make the same deployment w/o the bug while keeping everything else unchanged.
![strange](/posts/cdnoregress.png)

Once again, there's the same spike in traffic. Latency also shifted though not nearly as much as before. The campaign and deployment took place just as they did in the previous incident. Yet this time, the deployment has no bug.

So how does one tell them apart? In the first incident, you'd want to investigate the deployment. In the second incident, you can safely ignore it and look elsewhere.

These are exactly the kinds of questions Causal ML can answer.

```mermaid
graph LR
      Campaign --> Traffic
      Traffic --> CPU
      Traffic --> DBLoad
      Deployment --> CPU
      Deployment --> DBLoad

      subgraph Backend["Service backend"]
          CPU
          DBLoad["DB load"]
      end

      CPU --> Latency
      DBLoad --> Latency
```
Metrics are, after all, just a superimposition of many different effects which CausalML can help peel apart.

![superimpose](/posts/superimpose.svg)


There are several benefits in having such a system.

### Automatic Remediation
### Smart paging / manageable on-calls
### Better postmortems
### Enabling SRE

### Makes on-call more manageable
Enterprises are forced into an awkward trade-off: keep rotations fine-grained, with every team carrying its own on-call burden, or consolidate them into fewer rotations. The former is expensive (hourly wage is a thing in some countries) & the latter is more anxiety-inducing for whoever gets paged. If we can reliably narrow down the cause of an incident, on-call becomes a much nicer experience. It also creates a stronger foundation for automatic remediations as there's less ambiguity about the cause.

### Enables SRE

SRE[^sre], when implemented poorly, has a fundamental problem: you centralize the responsibility for responding to incidents without centralizing the knowledge required to understand them. A hundred dashboards don't magically give an SRE the application-level context they need to make sense of an ongoing incident.

[^sre]: [Site Reliability Engineering](https://sre.google/)

I hope this has intrigued you enough to question whether our current approach to observability is really state of the art. Surely, what we need isn't yet another time-series database.
