# Deployment Configurations

## Vercel (Production)
- [[vercel.json]] — framework: `vite`, build: `npm run build`, output: `public`
- Routes: SPA fallback (`/api/*` proxy to Supabase Edge Function)
- Environment: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`
- Frontend: `frontend/vercel.json` — dedicated Vite config

## Docker (PHP Backend)
- [[Dockerfile]] — multi-stage build:
  - Stage 1: Node 20-alpine, builds frontend → dist
  - Stage 2: PHP 8.2-cli-alpine, serves via `php -S`
  - EXPOSE 10000
  - CMD: `php -S 0.0.0.0:${PORT} -t public backend/router.php`
- [[dockerignore]] — excludes node_modules, .git, backups

## Render
- [[render.yaml]] — service: `website-kelas-x-tkj-bk`
- Plan: `starter` with 1GB persistent disk at `/data`
- Env vars: `DB_PATH=/data/database.db`, `UPLOAD_PATH=/data/uploads`
- Docker deployment strategy

## Railway
- [[railway.json]] — build + deploy config
- Scripts: `start-railway.sh` — Railway startup entrypoint

## Netlify
- [[netlify.toml]] — build + publish settings

## Azure
- [[azure.yaml]] — Bicep IaC
- `infra/main.bicep` — Azure infrastructure definitions

## Replit
- [[.replit]] — run config
- `start-replit.sh` — Replit startup script

## Supabase
- Project: `rkallzhuuvhixyuqmwqp.supabase.co`
- Database: Postgres (replaces SQLite)
- Storage: `uploads` bucket (replaces local file storage)
- Linked via: `npx supabase link --project-ref rkallzhuuvhixyuqmwqp`

## Migration State
- `.temp/` contains:
  - `project-ref` — Supabase project reference
  - `pooler-url` — Supabase connection pooler
  - `storage-migration` — storage migration status
  - `linked-project.json` — linked project metadata
