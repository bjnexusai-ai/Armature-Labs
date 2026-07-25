# Armature Labs — Frontend

Production frontend for Armature Labs (React + TypeScript + Tailwind v4 + Vite).
See `FRONTEND_LOG.md` for what's built, what's next, and session-by-session
history — read that first. This is a companion repo/folder to the backend
(`Armature-Labs`), built per `Armature_Labs_Master_Frontend_Plan.md`.

## Requirements

- Node.js 20+
- A running instance of the backend (see the backend repo's own README)

## Setup

```
npm install
cp .env.example .env      # only needed if the backend isn't on localhost:4000
npm run dev                # starts on http://localhost:5173, proxies /api to :4000
```

## Pre-seeded accounts (from the backend seed script, all password `TestPass123!`)

| Email | Role |
|---|---|
| owner@dentallab.test | owner |
| manager@dentallab.test | office_manager |
| tech1@dentallab.test / tech2@dentallab.test | assistant_technician |
| designer@dentallab.test | designer |
| dentist@brightsmile.test | dentist_client (Bright Smile Dental Clinic) |

## Project structure

```
src/
  lib/
    api.ts          # fetch wrapper: bearer token, JSON parsing, ApiError
    authTypes.ts     # AuthUser / LoginResponse - mirrors CONFIRMED login shape
    navConfig.ts      # single source of truth for sidebar nav + role visibility
  context/
    AuthContext.tsx   # session state, login/logout, sessionStorage persistence
  routes/
    ProtectedRoute.tsx
  layouts/
    AppShell.tsx      # sidebar + topbar, ported design tokens from the demo
  pages/
    LoginPage.tsx
    DashboardPage.tsx
    stubs/ComingSoon.tsx   # placeholder for nav items whose backend session isn't live yet
```

## Design tokens

Colors/fonts in `src/index.css` (`@theme` block) are ported verbatim from the
existing demo `index.html` and the design decisions log — this is an
established brand system, not reinvented here.

## Build

```
npm run build   # tsc -b && vite build -> dist/
```
