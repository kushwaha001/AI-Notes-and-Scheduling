# Frontend Dependencies

## React + Vite

Purpose:
Frontend application framework and build tool.

Installed using:

```bash
npm create vite@latest . -- --template react
npm install
```

---

## React Router DOM

Purpose:
Client-side routing between pages.

Used for:

- /dashboard
- /upload
- /calendar
- /tasks
- /search

Installed using:

```bash
npm install react-router-dom
```

---

# Future Dependencies

## Schedule-X

Purpose:
Calendar component.

Planned installation:

```bash
npm install @schedule-x/calendar @schedule-x/react
```

Status:
Not installed yet.

---

## Temporal Polyfill

Purpose:
Date/time support required by Schedule-X.

Planned installation:

```bash
npm install temporal-polyfill
```

Status:
Not installed yet.


# Frontend Dependencies

## React + Vite

Purpose:
Frontend framework and development environment.

Installation:

```bash
npm create vite@latest . -- --template react
npm install
```

---

## React Router DOM

Purpose:
Client-side routing between application pages.

Used for:

* /dashboard
* /upload
* /calendar
* /tasks
* /search

Installation:

```bash
npm install react-router-dom
```

---

## Schedule-X Calendar

Purpose:
Calendar component for month, week and day views.

Installation:

```bash
npm install @schedule-x/calendar @schedule-x/react
```

Status:
Installed

---

## Temporal Polyfill

Purpose:
Date and time support required by Schedule-X.

Installation:

```bash
npm install temporal-polyfill@0.3.0
```

Status:
Installed

---

## Important Files

Dependency versions:

```text
package.json
package-lock.json
```

These files must always be transferred together with the source code.

---

## Air-Gapped Deployment Notes

Before deployment to the isolated environment:

1. Verify all required packages are present in package.json.
2. Preserve package-lock.json.
3. Export npm package cache for offline installation.
4. Transfer source code, package.json, package-lock.json and cached packages together.
