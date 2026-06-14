# Config Files Moved

The runtime configuration JSON files have moved to:

```text
frontend/public/config/
```

Use these files as the single source of truth:

- `frontend/public/config/agents.json`
- `frontend/public/config/roles.json`
- `frontend/public/config/tokens.json`

The browser still fetches them as `/config/*.json` through Vite/static hosting.
Python reads the same files through `src.config`.
