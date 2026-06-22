# Front-End Dependency Record

Project: AI Notes & Scheduling

Purpose:
Track all front-end dependencies, installation commands, and versions verified during development. This document is intended to support deployment in an air-gapped environment.

---

# Verified Dependencies

## React

Purpose:
Primary front-end framework.

Installed Through:

```bash
npm create vite@latest . -- --template react
npm install
```

Status:
Verified Working

---

## React DOM

Purpose:
Renders React components into the browser DOM.

Installed Through:

```bash
npm create vite@latest . -- --template react
npm install
```

Status:
Verified Working

---

## Vite

Purpose:
Development server and build system.

Installed Through:

```bash
npm create vite@latest . -- --template react
npm install
```

Status:
Verified Working

---

## React Router DOM

Purpose:
Client-side routing.

Used For:

* /dashboard
* /upload
* /calendar
* /tasks
* /search

Installation:

```bash
npm install react-router-dom
```

Status:
Verified Working

---

## Schedule-X Calendar

Purpose:
Calendar component used for scheduling views.

Features Planned:

* Month View
* Week View
* Day View
* Event Display
* Event Details Panel

Installation:

```bash
npm install @schedule-x/calendar @schedule-x/react
```

Status:
Verified Working

---

## Schedule-X React

Purpose:
React integration layer for Schedule-X.

Installation:

```bash
npm install @schedule-x/calendar @schedule-x/react
```

Status:
Verified Working

---

## Schedule-X Default Theme

Purpose:
Default styling for Schedule-X components.

Installation:

```bash
npm install @schedule-x/theme-default
```

Status:
Verified Working

---

## Temporal Polyfill

Purpose:
Required by Schedule-X for date and time handling.

IMPORTANT:
Schedule-X 4.6.0 requires version 0.3.0.

Installation:

```bash
npm install temporal-polyfill@0.3.0
```

Status:
Verified Working

---

# Important Project Files

These files must always be preserved and transferred together.

```text
package.json
package-lock.json
DEPENDENCIES.md
```

---

# Air-Gapped Deployment Checklist

Before transferring to an isolated environment:

[ ] Source code copied

[ ] package.json copied

[ ] package-lock.json copied

[ ] npm package cache exported

[ ] All required packages available offline

[ ] Dependency versions verified

---

# Current Verified Functionality

The following features have been tested successfully:

[✓] React application startup

[✓] React Router navigation

[✓] Dashboard page

[✓] Upload page

[✓] API service layer

[✓] Schedule-X calendar rendering

[✓] Day view

[✓] Week view

[✓] Month view

---

Last Updated:
2026-06-18
