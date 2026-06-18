---
title: "How Feldera handles moving windows"
date: 2026-06-16T07:21:25+02:00
draft: false
---

Feldera is an incremental SQL engine. You give it a query, and instead of running it over and over, it efficiently keeps the result continuously up to date as the underlying data changes.

As I keep coming across more of SQL, I realized the language is very expressive. That's great for an analyst, and for a traditional batch engine it's just another query to execute, but anyone around the incremental view maintenance space would wonder "hey, how does this work?".

Consider the following – pretty common – query:

```sql
SELECT * FROM purchase
WHERE ts >= NOW() - INTERVAL 7 DAYS;
```

*Show me all purchases made in the last seven days.*

In a traditional setup, this query would run on a schedule – maybe once a day. Each run resolves `NOW()` to the current time, and the 7-day window slides forward naturally.

An incremental engine however is long running. You submit the query once. So when should `NOW()` resolve? If it's evaluated at the time of submission, a day later "the last 7 days" is still pinned to yesterday's clock & the window never moves.

This behavior in my opinion is consistent as far as SQL is concerned. The expectation that the window should move has nothing to do with SQL. In batch processing, the repeated schedule implicitly re-evaluates `NOW()` on every run. In other words, part of the users intent lives outside of the SQL statement itself – in the orchestration layer around it.

For e.g., imagine your database rows are partitioned into three distinct zones:

- **middle**: `row.ts` between `now` and `now - 7 days`
- **left**: `row.ts < now - 7 days`
- **right**: `row.ts > now`

![Three zones of rows](/posts/img1.svg)

When the query is submitted, it returns rows from the middle zone. A naive incremental view maintenance engine that resolves `NOW()` once at submission time would keep refreshing the same window – fixed at submission time – forever, reacting only when rows in that zone are inserted, updated, or deleted.

![Three zones of rows](/posts/img2.svg)

## How Feldera resolves this

Feldera makes time an explicit input – but you don't manage it yourself.

Internally, the compiler declares a system table `NOW`:

```sql
CREATE TABLE NOW(now TIMESTAMP NOT NULL); -- LATENESS INTERVAL 0 SECONDS
```

It is injected by the [DBSPCompiler](https://github.com/feldera/feldera/blob/main/sql-to-dbsp-compiler/SQL-compiler/src/main/java/org/dbsp/sqlCompiler/compiler/DBSPCompiler.java#L242) & updated by the pipeline. `NOW()` returns the timestamp for the current pipeline step. A step runs when new data arrives, or on a timer controlled by `clock_resolution_usecs`.

> `clock_resolution_usecs` parameter controls the execution of queries that use the `NOW()` function. The output of such queries depends on the real-time clock and can change over time without any external inputs

Now that time is an input table, moving windows fit DBSP's change-stream model.