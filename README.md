# Foundry Universal Client

A **universal, multimodal web client** for Azure AI Foundry. One deployment works for
any tenant, project, agent or model — with **zero identity configuration baked into the
build**. Users bring their own connection details in the UI.

It talks to Foundry through three API surfaces (Responses, Chat Completions, Image
Generations), streams responses in real time, and shows a live **activity timeline**
(thinking → tools → generating), **inline citations**, token usage and per-minute
call rate.

---

## Table of contents
- [What it does](#what-it-does)
- [Architecture at a glance](#architecture-at-a-glance)
- [User guide](#user-guide)
  - [Signing in](#signing-in)
  - [Anonymous mode](#anonymous-mode-testing-a-shared-agent)
  - [Entra ID mode](#entra-id-mode-your-identity)
  - [Chatting](#chatting)
  - [What you see in a response](#what-you-see-in-a-response)
- [Administrator guide](#administrator-guide)
  - [The two usage scenarios](#the-two-usage-scenarios)
  - [Entra app registrations](#entra-app-registrations)
  - [Foundry RBAC](#foundry-rbac)
- [Configuration reference](#configuration-reference)
  - [Server environment variables](#server-environment-variables)
  - [Frontend environment variables](#frontend-environment-variables)
  - [Logging](#logging)
- [Run locally](#run-locally)
- [Build & run the container](#build--run-the-container)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)

---

## What it does

- **Two entry experiences**: 🕶️ **Anonymous** (test a shared agent with a service
  principal) and 🔐 **Entra ID** (your identity, your Foundry RBAC).
- **Agents and projects**: connect to a published **agent** endpoint, or to a
  **project** and pick a **Playground model** or a **project agent** — discovered
  automatically.
- **Three API surfaces** (auto‑selected in playground): **Responses** (gpt‑5.x),
  **Chat** (MAI‑Thinking, DeepSeek…), **Image** (gpt‑image / MAI‑Image).
- **Live activity timeline**: thinking, web/file search, code interpreter, MCP tool
  calls (with arguments), and “generating”, in chronological order.
- **Inline citations** with clickable `[n]` footnotes and source links/quotes.
- **Multimodal**: attach images (paste/drag/drop), render generated images inline.
- **Reasoning summaries** for reasoning‑capable models (auto‑requested, with a safe
  fallback if unsupported).
- **History & prompt catalog** stored locally (IndexedDB); **system prompt** editable
  per message with a saved‑prompt catalog.
- **Token usage** per message and a **calls/min** meter.
- **Three‑level logging** on server and frontend for debugging.

---

## Architecture at a glance

```
Browser (React SPA)                       BFF (Node/Express)              Azure AI Foundry
─────────────────────                     ──────────────────              ────────────────
- MSAL (runtime, per identity)   ──HTTP──▶  /api/chat/stream  ──SSE/HTTPS──▶  /openai/v1/responses
- Chat UI + activity timeline               /api/deployments               /openai/v1/chat/completions
- IndexedDB (history, prompts)              /api/agents                    /openai/v1/images/generations
                                            /api/test                      /mai/v1/images/generations
```

- The **BFF is stateless**: it forwards the caller’s credentials/token to Foundry and
  translates Foundry’s event stream into a clean SSE protocol
  (`token`, `reasoning`, `activity`, `citation`, `image`, `usage`, `mcp`, `done`, `error`).
- **No identity config in the build**: MSAL is instantiated at runtime with the
  tenant/client the user enters. `web/.env` can be empty.

---

## User guide

### Signing in

On first load you choose how to enter:

| Option | Use it when | You need |
|---|---|---|
| 🕶️ **Anonymous** | You just want to test an agent someone shared with you | The agent endpoint + a service principal (tenant/client/secret) from your admin |
| 🔐 **Entra ID** | You want your own Foundry permissions to apply | Your tenant ID + an app registration (client ID). No secret. |

### Anonymous mode (testing a shared agent)

1. Click **Sign in as anonymous**.
2. Paste the **Agent endpoint** (full URL) and the **service principal**
   (Tenant ID, Client ID, Client secret) and **api‑version** (e.g. `v1`).
3. **Test connection**, then **Enter chat**.

> Everything lives only in this browser tab. No history, no profiles. All anonymous
> users act with the service principal’s identity (shared identity).

### Entra ID mode (your identity)

1. Click **Sign in with Entra ID**.
2. On the **Identity** screen, fill in **Tenant ID**, **Client ID** (SPA app) and the
   **Foundry scope** (default `https://ai.azure.com/.default`).
   - The screen shows the **Redirect URI** to register in your app registration —
     copy it and give it to your admin (one‑time step).
   - You can save several identities and switch between them with **⇄**.
3. **Save & sign in** (a popup appears). You’re in.
4. Open **⚙️ Settings** and enter your **Project endpoint** + api‑version.
5. In the top bar, pick the mode **🎛 Playground** or **🤖 Agents**, then choose a
   model/agent from the discovered list.

### Chatting

- Type and press **Enter** (Shift+Enter for a newline).
- **Attach images**: 📎 button, paste (Ctrl+V) or drag‑and‑drop.
- **Stop** a streaming response any time.
- **＋ New chat** starts a fresh conversation; **☰ History** re‑opens past ones
  (Entra mode).
- **🎚 Prompt** panel (playground): edit the system prompt between messages and save
  prompts to a catalog.

### What you see in a response

- **Live status** while it works: *“🔎 Searching the web…”, “✍️ Generating…”*.
- **🧭 Activity timeline** (expandable): every step (thinking, tools with arguments,
  searches with the query, MCP calls, generating) with ✓/✕ state.
- **Inline citations** `[1] [2]` in the text; click to jump to the **Sources** list
  with links and quotes.
- **🎫 tokens** used (exact if Foundry reports them, otherwise estimated).

---

## Administrator guide

### The two usage scenarios

| | 🕶️ Anonymous | 🔐 Entra ID |
|---|---|---|
| Who acts in Foundry | The **service principal** (shared) | The **user** (individual RBAC) |
| Entra app | Confidential app **with secret** | SPA app **without secret** |
| Foundry access | Grant RBAC to the **SP** | Grant RBAC to each **user** |
| Scope | Agents only | Project → playground or agents |
| History/profiles | No | Yes |

### Entra app registrations

**For Entra ID mode (delegated, no secret) — one SPA app:**
1. Entra admin center → **App registrations → New registration**.
2. **Authentication → Add a platform → Single‑page application**, and add the
   **Redirect URI** shown in the app’s Identity screen (e.g. `https://your-host` or
   `http://localhost:5173`).
3. **API permissions → Add a permission → APIs my organization uses →**
   *Azure Machine Learning Services* and/or *Cognitive Services* → **Delegated →
   `user_impersonation`** → **Grant admin consent**.
4. Give users the **Client ID** and **Tenant ID** (these are not secrets).

**For Anonymous mode (service principal with secret) — one confidential app:**
1. Register an app, create a **client secret**.
2. Grant that app **RBAC on the Foundry resource** (see below).
3. Hand the tester the **agent endpoint** + **tenant/client/secret**.

> The two apps are independent. In Entra mode nothing secret leaves the browser; the
> user’s token is forwarded to Foundry.

### Foundry RBAC

Assign on the **Foundry resource / project** (Access control → role assignment):
- **Azure AI User** (or a role that grants agent/model invocation) to the **user**
  (Entra mode) or the **service principal** (anonymous mode).
- For discovery to work, the identity must be able to list deployments/agents in the
  project.

---

## Configuration reference

### Server environment variables

`server/.env` (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | HTTP port for the BFF. |
| `SERVE_STATIC` | `false` | Serve the built frontend from `web/dist` (set `true` in the container). |
| `ALLOWED_HOST_SUFFIXES` | `.services.ai.azure.com,.openai.azure.com,.cognitiveservices.azure.com` | Anti‑SSRF allow‑list for upstream hosts. |
| `AUTH_ENABLED` | `false` | Optional app gate (JWT). Usually **off**: the login is a UI experience, not a server gate. |
| `ENTRA_TENANT_ID` / `ENTRA_API_AUDIENCE` | – | Only if `AUTH_ENABLED=true` (validates incoming user JWTs). |
| `ALLOWED_TENANTS` / `ALLOWED_USERS` | – | Optional allow‑lists when the gate is on. |
| `LOG_LEVEL` | `warn` | `info` \| `warn` \| `trace` (see [Logging](#logging)). |
| `LOG_JSON` | `false` | Structured JSON logs (e.g. for App Insights). |
| `DEBUG_STREAM` | `false` | Deprecated alias for `LOG_LEVEL=trace`. |

### Frontend environment variables

`web/.env` (build‑time, **optional** — all can be empty):

| Variable | Purpose |
|---|---|
| `VITE_ENTRA_CLIENT_ID` | Optional **default** client ID pre‑filled in the identity form. Not a secret. |
| `VITE_ENTRA_TENANT_ID` | Optional default tenant ID pre‑filled in the identity form. |
| `VITE_FOUNDRY_SCOPE` | Default Foundry scope (`https://ai.azure.com/.default`). |
| `VITE_LOG_LEVEL` | `info` \| `warn` \| `trace` — browser‑console auth logging. |

> Leave the `VITE_ENTRA_*` empty for a fully agnostic build; users configure identity
> in the UI. If you set them, they’re just editable defaults.

### Logging

Three levels, on **server** (`LOG_LEVEL`) and **frontend** (`VITE_LOG_LEVEL`):

| Level | Server shows | Frontend shows |
|---|---|---|
| `info` | Request lifecycle, resolved URLs, upstream calls (status/latency), token usage, discovery counts. | High‑level auth events. |
| `warn` (default) | + warnings/errors: reasoning→no‑reasoning fallback, image 404→retry, 4xx/5xx, and **unknown unhandled stream events with full payload**. | + auth failures, silent→popup fallback. |
| `trace` | + redacted headers, **full request bodies**, **every stream event with payload**, prompts & responses. Debugging only. | + MSAL details (token presence/expiry). |

- **Credentials are never printed** (only presence/length/expiry).
- Each server request gets a short correlation id, e.g. `[a1b2c3]`.
- See `LOGGING.md` for the full reference.

---

## Run locally

**Prerequisites:** Node 20+.

```bash
# 1) Install all dependencies (root + server + web)
npm run install:all

# 2) Create env files
cp .env.example server/.env       # server config (LOG_LEVEL, ports, allow-list…)
cp web/.env.example web/.env      # frontend defaults (can stay empty)

# 3) Start both (BFF on :8080, frontend on :5173 with proxy to the BFF)
npm run dev
```

Open **http://localhost:5173**.

To debug, set in `server/.env`:
```
LOG_LEVEL=trace
```
and in `web/.env`:
```
VITE_LOG_LEVEL=trace
```

> **Redirect URI for local Entra sign‑in:** register `http://localhost:5173` as a
> **SPA** redirect URI in your app registration (the Identity screen shows the exact
> value with a copy button).

---

## Build & run the container

The image builds the frontend and serves it from the BFF (single container).

```bash
# Build
docker build -t foundry-universal-client .

# Run
docker run --rm -p 8080:8080 \
  -e ALLOWED_HOST_SUFFIXES=".services.ai.azure.com,.openai.azure.com,.cognitiveservices.azure.com" \
  -e LOG_LEVEL=warn \
  foundry-universal-client
```

Open **http://localhost:8080**.

**Optional build‑time defaults** (pre‑filled, editable in the UI):
```bash
docker build \
  --build-arg VITE_ENTRA_CLIENT_ID=<clientId> \
  --build-arg VITE_ENTRA_TENANT_ID=<tenantId> \
  --build-arg VITE_FOUNDRY_SCOPE=https://ai.azure.com/.default \
  -t foundry-universal-client .
```

Or with **docker compose**:
```bash
docker compose up --build
```

> Register the deployed origin (e.g. `https://your-host`) as a **SPA** redirect URI in
> the Entra app registration used for sign‑in.

---

## Security notes

- **BFF allow‑list** blocks any upstream host not ending in the configured suffixes
  (anti‑SSRF), and rejects localhost/private IPs.
- **Secrets** (service‑principal client secret, API keys, tokens) are forwarded over
  HTTPS to Foundry and **never persisted** server‑side; logs never print them.
- **clientId/tenantId are not secrets** — they’re stored in the browser for reuse.
- **Prompts and responses** appear only at `trace` (debugging aid — do not use in
  production).
- Optional **app gate** (`AUTH_ENABLED=true`) validates incoming user JWTs if you want
  the whole app behind Entra; leave it off to let anonymous mode work in the same
  deployment.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `AADSTS500113 no reply address` on sign‑in | Register this origin as a **SPA** redirect URI in the app registration (Identity screen shows it). |
| `AADSTS650057 invalid resource` | Add delegated **`user_impersonation`** for *Azure Machine Learning Services* / *Cognitive Services* and grant consent. |
| `400 UnsupportedApiVersion` | Use **`v1`** as api‑version for agent/project endpoints. |
| `400 Model must match the agent’s model` | You’re sending a model to an agent. In Playground use the **project** endpoint; agents don’t take a model. |
| `This model is not supported by Responses API` | Switch the **API** in the destination bar to **Chat** (e.g. MAI‑Thinking) or **Image** (gpt‑image/MAI‑Image). |
| `404 (image)` | Handled automatically: the BFF tries `/openai/v1` and `/mai/v1`. If it still fails, check the model name/deployment. |
| Chat won’t enable after picking an agent | The agent list may omit the endpoint; the client rebuilds it from the project endpoint. Ensure the **project endpoint** in Settings is correct. |
| Only the first message answers | Fixed: multi‑turn payload uses `output_text` for assistant turns. |
| Reasoning not shown for gpt‑5.x | Reasoning summaries are requested automatically; some tenants/models restrict them. Non‑reasoning models are skipped safely. |
| Unknown `UNHANDLED` events in logs | Set `LOG_LEVEL=trace` to see the full payload and decide if it needs handling; many (`response.*` lifecycle) are benign. |
