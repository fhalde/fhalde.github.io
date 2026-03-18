---
date: "2026-03-17T14:59:34+01:00"
draft: false
title: Foo ≠ Hostname
---

A common recurring pattern I've observed is generating ingress hostnames from app names:

``` yaml
app: foo
hostname: ${app}.<cluster-domain>
```

It guarantees uniqueness and simplifies setup. For internal services or
ephemeral environments, this is often perfectly fine.

But when this pattern becomes the *default* for externally visible
endpoints, it starts to break down --- because it fundamentally
misunderstands what a hostname represents in that context.

A hostname is not just a unique identifier. It's a contract --- with
browsers, with TLS, with DNS, and with your users. By reducing it to a
derived label, you lose control over things that matter in production.

### Internal Convenience vs External Contract

Auto-generated hostnames optimize for platform concerns:

-   zero-config onboarding
-   avoiding naming conflicts
-   enabling self-service deployments

Those are valid goals.

But they come at a cost: they couple external identity to internal
implementation details. That trade-off is acceptable for internal-only
traffic --- it is not acceptable for user-facing or long-lived
endpoints.

One way to distinguish them is:

-   Internal hostnames can be derived
-   External hostnames must be deliberate


### Ownership

A hostname communicates ownership. In any non-trivial organization,
domain structure reflects team boundaries, product lines, or trust
zones:

``` bash
payments.example.com     -> payments team
portal.example.com       -> frontend team
api.internal.example.com -> backend platform
```

When you auto-generate something like:

``` bash
payment-service-v2.<cluster-domain>
```

you've taken an internal implementation detail --- your app name --- and
promoted it to an externally visible identity.

The hostname no longer tells you who owns it or what role it plays. It
just reflects what someone happened to name a deployment.

### Security and Routing Policies

Hostnames are not just labels --- they are security boundaries. Many
important mechanisms operate at the hostname level:

-   TLS certificates
-   Cookies
-   CORS
-   Security headers

Auto-generated hostnames don't inherently break these mechanisms --- but
they make them harder to reason about when the structure wasn't designed
with them in mind.

### User-Facing Semantics

URLs are a user interface. They appear in browser address bars, get
bookmarked, shared in emails, printed on invoices, and indexed by search
engines.

```bash
https://api.example.com/orders
```

communicates something.

```bash
https://payment-service-v2-blue.example.com/orders
```
does not.

When hostnames are derived from app names, internal refactoring leaks
into external URLs. Renaming a service or changing deployment structure
can break bookmarks, invalidate caches, and require redirects.

A hostname should be a stable external contract --- not a reflection of
internal structure.

### One App ≠ One Hostname

The assumption of a 1:1 mapping breaks down quickly:

-   **One app, multiple hostnames**
    External vs internal endpoints, different auth or rate limits

-   **Multiple apps, one hostname**
    Path-based routing (`/api`, `/docs`, `/ws`) under a unified domain

-   **Migrations and rollouts**
    Stable hostname, shifting backends (blue/green, canary)

Hostnames are entry points --- not implementations. Tying them directly
to app identity makes these patterns unnecessarily difficult.

### A Better Approach

Let's just be explicit!

1.  **Treat hostnames as first-class resources**\
    Declare them explicitly. Review them like DNS or TLS changes.

2.  **Provide defaults, but make them visible**\
    Suggest `foo.<domain>`, but require acknowledgment or override.

4.  **Support flexible routing models**\
    Multiple hostnames per app, multiple apps per hostname, and stable
    hostnames across deployments should be straightforward.
