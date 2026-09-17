# Installed Tools & Environment

## Local Environment
| Tool | Version | Path |
|------|---------|------|
| Node.js | v22.23.2 | System PATH |
| npm | 12.0.2 | System PATH |
| PHP | 8.4.24 (cli) | WinGet: `C:\Users\Lenovo\AppData\Local\Microsoft\WindowsApps\php.exe` |
| Git | 2.55.0.windows.3 | System PATH |
| Vercel CLI | 59.18.0 | npx |
| Supabase CLI | 2.117.0 | npx |

## Global npm Packages
```
vercel@59.18.0
supabase@2.117.0
```

## Project Dependencies
### Production (package.json)
- `bcrypt ^6.0.0` — password hashing (PHP backend uses native, Node uses this)
- `express ^5.2.1` — web framework (legacy server.js)
- `express-session ^1.19.0` — session management
- `multer ^2.3.0` — multipart file upload
- `sqlite3 ^6.0.1` — SQLite driver

### Development
- `jest ^30.5.1` — test framework
- `supertest ^7.2.2` — HTTP assertions

## Frontend Dependencies (frontend/package.json)
- `react ^19.0.0` — UI library
- `react-dom ^19.0.0` — DOM renderer
- `vite ^6.0.0` — build tool/dev server
- `tailwindcss ^3.4.0` — CSS framework
- `mermaid ^10.0.0` — graph diagrams
- `@supabase/supabase-js ^2.0.0` — Supabase client (frontend)

## Configuration Paths
- `.vscode/settings.json` — VS Code settings
- `.azure/.env.lock` — deployment lock
- `.temp/` — temp files (cli-latest, project-ref, pooler-url, etc.)

## Scripts Available
| Command | Purpose |
|---------|---------|
| `npm start` | Start Node.js server (port 3000) |
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run dev:all` | Start PHP backend + Vite (scripts/start-all.ps1) |
| `npm run build` | Build frontend to public/ |
| `npm run backend:lan` | Start PHP server only |
| `npm test` | Run Jest tests |
| `npm run host` | Alias for dev:all |

## Diagnostic Tools
- `check_dev.php` — dev mode check
- `check_schema.php` — schema validation
- `check_users.php` — user data verification
- `test_pass.php` — password testing
- `reset_dev_pass.php` — password reset utility

## Infra Files
- `infra/main.bicep` — Azure Infrastructure as Code
- `start-railway.sh` — Railway startup script
- `start-replit.sh` — Replit startup script
