---
title: "How Feldera handles moving windows"
date: 2026-06-16T07:21:25+02:00
draft: false
---

Feldera is an incremental SQL engine. You give it a query, and instead of running it over and over, it efficiently keeps the result continuously up to date as the underlying data changes.

As I keep coming across more of SQL, I realized the language is very expressive. That's great for an analyst, and for a traditional batch engine it's just another query to execute, but anyone around the incremental view maintenance space would wonder "hey, how does this work?".

Consider the following query:

```sql
SELECT * FROM purchase
WHERE ts >= NOW() - INTERVAL 7 DAYS;
```

*Show me all purchases made in the last seven days.*

In a traditional setup, this query would run on a schedule – maybe once a day. Each run resolves `NOW()` to the current time, and the 7-day window slides forward naturally.

An incremental engine however is long running. You submit the query once. So when should `NOW()` resolve? If it's evaluated at the time of submission, a day later "the last 7 days" is still pinned to yesterday's clock & the window never moves.

This behavior in my opinion is consistent as far as SQL is concerned. The expectation that the window should move has nothing to do with SQL. In a batch system, the repeated schedule implicitly re-evaluates `NOW()` on every run. In other words, part of the users intent lives outside of the SQL statement itself – in the orchestration layer around it.

For e.g.

Imagine your database rows are partitioned into three zones:

- **middle**: `row.ts` between `now` and `now - 7 days`
- **left**: `row.ts < now - 7 days`
- **right**: `row.ts > now`

![Three zones of rows](/posts/img1.svg)

When the query is submitted, it returns rows from the middle zone. A naive IVM that resolves `NOW()` once at submission time keeps refreshing that same fixed window forever – reacting only when rows in that zone are inserted, updated, or deleted.

![Three zones of rows](/posts/img2.svg)

## How Feldera resolves this

Feldera makes time an explicit input. Time itself is represented as a input table.

```sql
CREATE TABLE NOW(now TIMESTAMP NOT NULL); -- LATENESS INTERVAL 0 SECONDS
```

This is a system table declared in the [DBSPCompiler](https://github.com/feldera/feldera/blob/b4e0c383b13aaa4980dec015a61efb23fb53a3af/sql-to-dbsp-compiler/SQL-compiler/src/main/java/org/dbsp/sqlCompiler/compiler/DBSPCompiler.java#L242). It holds a single row with a single column: the current time.

Unlike a clock that keeps advancing forward on its own, this one requires someone ticks it. We are responsible for generating those ticks choosing the granularity – tick too frequently and performance suffers, any less and the results become stale.

With time modeled this way, the moving-window behavior becomes trivial:

```sql
SELECT * FROM purchase
WHERE ts >= NOW() - INTERVAL 7 DAYS;
```

As you tick the clock forward (by writing new timestamps into `NOW()`), Feldera emits incremental changes – including deletions for rows that have fallen out of the 7-day window.
