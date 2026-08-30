# Logging & debugging

Two independent, three-level loggers: one for the **server** and one for the
**frontend** (auth-focused). Both go to their respective consoles.

## Server — `LOG_LEVEL`
| Level | Shows |
|-------|-------|
| `info` | Request lifecycle, resolved URLs, upstream calls (method/status/latency), token usage, discovery counts. |
| `warn` (default) | Everything in `info` **plus** warnings & errors: reasoning→no-reasoning fallback, image 404→retry, upstream 4xx/5xx, and **UNKNOWN unhandled stream events with their full payload**. |
| `trace` | Everything: redacted request headers, **full request bodies**, **every stream event with payload**, prompts and responses. For debugging/testing only. |

Domains (prefix): `[core] [auth] [route] [upstream] [stream] [discovery]`.
Each request gets a short correlation id, e.g. `[a1b2c3]`, threaded across logs.

**Unhandled events**: known lifecycle events (created/in_progress/…) are benign and
only appear at `trace`. Any **unknown** type is surfaced at `warn` **with its full
JSON payload**, so you can decide whether it carries useful data to handle.

**Safety**: credentials (Authorization/api-key/client secret/user bearer) are never
printed — only presence/length/expiry. Prompts and responses DO appear at `trace`
(debugging aid; do not use in production).

Back-compat: `DEBUG_STREAM=true` is treated as `LOG_LEVEL=trace`.
Structured JSON: set `LOG_JSON=true`.

## Frontend — `VITE_LOG_LEVEL`
| Level | Shows |
|-------|-------|
| `info` | High-level auth events (login, logout, instance creation). |
| `warn` (default) | + failures (login failed, silent token fell back to popup, no account). |
| `trace` | + MSAL details: token presence/expiry, silent vs interactive acquisition. |

Domain: `[auth]`. Tokens are never printed (only presence/length/expiry).
