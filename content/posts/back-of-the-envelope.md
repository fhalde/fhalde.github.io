---
title: "Back of the Envelope"
date: 2026-05-27T13:56:08+02:00
draft: true
---

Crude ways to estimate algorithm runtime on hardware.

## AMAT

**AMAT** (average memory access time) for a single cache level:

\[
\text{AMAT} = r_{\text{hit}} \cdot t_{\text{hit}} + r_{\text{miss}} \cdot t_{\text{miss}}
\]

where \(r_{\text{hit}}\) is the hit ratio, \(t_{\text{hit}}\) is hit latency, and \(t_{\text{miss}}\) is the miss penalty (typically RAM access time). Since \(r_{\text{miss}} = 1 - r_{\text{hit}}\):

\[
\text{AMAT} = r_{\text{hit}} \cdot t_{\text{hit}} + (1 - r_{\text{hit}}) \cdot t_{\text{miss}}
\]

## Multi-level cache

For L1 → L2 → RAM, expand recursively. Let \(h_i\) be the hit rate and \(t_i\) the access time at level \(i\):

\[
\text{AMAT} = h_1 t_1 + (1-h_1)\bigl[h_2 t_2 + (1-h_2)\, t_{\text{RAM}}\bigr]
\]

Expanded product form:

\[
\text{AMAT} = h_1 t_1 + (1-h_1)\, h_2 t_2 + (1-h_1)(1-h_2)\, t_{\text{RAM}}
\]

Or with explicit hit/miss labels per level:

\[
\text{AMAT} = r_{L1,\text{hit}} \cdot t_{L1} + r_{L1,\text{miss}} \cdot r_{L2,\text{hit}} \cdot t_{L2} + r_{L1,\text{miss}} \cdot r_{L2,\text{miss}} \cdot t_{\text{RAM}}
\]
