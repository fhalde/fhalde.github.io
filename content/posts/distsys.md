---
title: "Breadcrumbs: Distributed System"
date: 2026-06-23T10:40:42+02:00
draft: false
---

#### *What's the difference between Fault tolerance, Replication, Consistency & Consensus?*

> These four concepts are tightly coupled and form a causal chain.
> 
> 1. **Fault tolerance** is the goal: keep serving correctly even when machines crash or the network breaks.
> 2. **Replication** is the mechanism: to not lose data when one machine dies, keep copies on several machines.
> 3. **Consistency** is the problem replication creates: once you have copies, they can disagree. What is a client allowed to observe? (Always the latest write? Maybe a stale read? Never a "torn" state?)
> 4. **Consensus** is the algorithm that solves it: getting N machines to agree on one value / one ordering of operations, despite some of them failing or messages being lost.
