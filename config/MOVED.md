# Config Files Moved

The runtime configuration JSON files have moved to:

```text
frontend/src/config/
```

Use these files as the single source of truth:

- `frontend/src/config/agents.json`
- `frontend/src/config/roles.json`
- `frontend/src/config/role_meta.json`
- `frontend/src/config/tokens.json`

The JS side statically imports them (no runtime fetch — see `agentMeta.js` / `roleMeta.js`).
Python reads the same files through `src.config`.

(Previously these files lived at `frontend/public/config/`; moved in #628 to stop Vite's
"Assets in public directory cannot be imported from JavaScript" warning and to avoid
double-shipping the same JSON in both the JS bundle and the static `public/` output.)
