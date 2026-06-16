---
title: "How Feldera handles NOW()"
date: 2026-06-16T07:21:25+02:00
draft: false
---

Feldera is an incremental SQL engine. You give it a query, and instead of running it over and over, it keeps the result continuously up to date as the data changes underneath it.

That works fine for queries whose semantics are fixed at query-time, but what about queries whose semantics change over time?

Consider the following query:

```sql
SELECT * FROM purchase
WHERE ts >= NOW() - INTERVAL 7 DAYS;
```

In a traditional setup, this query runs on a schedule – maybe once a day. Each run resolves `NOW()` to the current time, and the 7-day window slides forward with it. Works exactly as intended.

But an incremental engine is long running. You submit the query once and it stays up. So when does `NOW()` get resolved? If it's evaluated just once, at init, then a day later "the last 7 days" is still pinned to yesterday's clock & the window never moves. That's clearly not what we want.

## How Feldera resolves this

Feldera makes time an explicit input. Time itself is represented as a input table.

```sql
CREATE TABLE NOW(now TIMESTAMP NOT NULL); -- LATENESS INTERVAL 0 SECONDS
```

This is a system table declared in the [DBSPCompiler](https://github.com/feldera/feldera/blob/b4e0c383b13aaa4980dec015a61efb23fb53a3af/sql-to-dbsp-compiler/SQL-compiler/src/main/java/org/dbsp/sqlCompiler/compiler/DBSPCompiler.java#L242). It holds a single row with a single column: the current time.

But unlike a clock that keeps marching forward on its own, this one requires somebody to tick it. We are responsible for ticking it, and we choose the granularity – tick too often and you pay for it in performance, tick too rarely and your results go stale.

With time modeled this way, the moving-window behavior you actually want falls out naturally:

```sql
SELECT * FROM purchase
WHERE ts >= NOW() - INTERVAL 7 DAYS;
```

As you tick the clock forward (by writing new timestamps into `NOW`), Feldera emits incremental changes — including deletions for rows that have fallen out of the 7-day window.

Squinting a bit, there's no real surprise here once you see it this way – the structure is very similar to what Flink does with processing/event time.
