# Quick Start (use this to update README if needed)

## Start everything

From the project root:

```bash
./start
```

This stops existing containers, removes volumes, builds images (using cache), and starts all services. The `start` script also applies the backend volumes endpoint from `app-patched.ts` so the UI can show connected scan volumes.

- **Frontend**: http://localhost:5173  
- **Backend API**: http://localhost:3000  

Force a full rebuild (no cache): `./start --rebuild`  
View logs: `docker compose logs -f`

## Scripts in repo root

| Script | Description |
|--------|-------------|
| `./start` | Start all services (down, build, up). Add `--rebuild` or `-r` for a clean rebuild. |
| `./add-volume <name> [path]` | Add a host folder as a scan volume. Updates `docker-compose.yml` and `scan-volumes.json`, restarts backend/worker. Default `path` is current directory. |
| `./list-volumes` | List connected scan volumes. |
| `./remove-volume <name>` | Remove a volume and restart backend/worker. |

## Optional: .env

Create a `.env` in the root to override ports and API URL. The frontend needs the backend base URL **including `/api`** (baked in at build time):

```env
VITE_API_URL=http://localhost:3000/api
FRONTEND_PORT=5173
BACKEND_PORT=3000
# ... database, redis, etc. (see .env.example)
```

If `./start` reports that it could not apply `app-patched.ts`, fix backend source ownership so volumes show in the UI:

```bash
sudo chown -R $(whoami) apps/backend/src
```

Then run `./start` again.
