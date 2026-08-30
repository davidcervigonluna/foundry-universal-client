# Foundry Universal Client

A **truly universal** web client for Azure AI Foundry: **zero identity config in the
build**. The same deployment works for any tenant/organization.

## UI-configurable identity
- When you pick **🔐 Sign in with Entra ID**, you configure the identity **in the UI**:
  **Tenant ID** + **Client ID** (SPA app) + scope. These are not secrets → stored in
  this browser as reusable **identity profiles**.
- **Multiple profiles**: save several identities (different tenants/apps) and switch
  between them with **⇄** without retyping.
- MSAL is instantiated **at runtime** with those values. `web/.env` can stay empty.
- **Redirect URI**: the UI shows this deployment's exact URI to register (SPA) in your
  app registration. That's the only step the admin does in Entra.

## Optional fallback
If you set `VITE_ENTRA_CLIENT_ID`/`VITE_ENTRA_TENANT_ID` at build time, they are used
as **pre-filled defaults** in the form (editable). Handy for a corporate deployment
with a suggested tenant.

## Two experiences
- **🕶️ Anonymous**: test a shared agent (endpoint + service principal). Minimal UI.
- **🔐 Entra ID**: your identity (delegated Foundry RBAC). Project + playground +
  agents + history + profiles.

## Local
```bash
npm run install:all
cp .env.example server/.env
cp web/.env.example web/.env   # can be left empty
npm run dev
```
