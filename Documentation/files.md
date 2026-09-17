# Project Files & Structure

## Root Level
| File | Description |
|------|-------------|
| `package.json` | Root package — Node server, scripts, deps |
| `package-lock.json` | npm lockfile |
| `server.js` | Express server (legacy/test) |
| `auth.js` | Express auth router, bcrypt, SQLite |
| `database.js` | SQLite DB connection |
| `database.db` | SQLite database |
| `vercel.json` | Vercel deployment config |
| `Dockerfile` | Docker config for PHP backend |
| `dockerignore` | Docker exclude patterns |
| `gitignore` | Git exclude patterns |
| `railway.json` | Railway deployment config |
| `netlify.toml` | Netlify deployment config |
| `render.yaml` | Render deployment config |
| `azure.yaml` | Azure deployment config |
| `.replit` | Replit environment config |
| `README.md` | Quick readme |
| `README-MIGRASI.md` | Migration documentation |
| `PROJECT-HANDOFF.md` | Handoff notes |
| `supabase_export.json` | SQLite data export |
| `supabase_import_data.sql` | Supabase import SQL |
| `index.html` | Root entry (408 bytes) |
| `start-railway.sh` | Railway startup |
| `start-replit.sh` | Replit startup |

## Scripts Directory
| File | Purpose |
|------|---------|
| `scripts/start-all.ps1` | Start PHP backend + Vite dev |
| `scripts/start-php.ps1` | Start PHP backend only |

## Backend Directory
| File | Purpose |
|------|---------|
| `backend/api.php` | Main API (auth, announcements, gallery) |
| `backend/router.php` | SPA fallback, static serving, API routing |

## Frontend Directory
| File | Purpose |
|------|---------|
| `frontend/package.json` | React/Vite deps |
| `frontend/vite.config.js` | Vite dev server config |
| `frontend/vercel.json` | Frontend Vercel config |
| `frontend/.env` | VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY |
| `frontend/dist/` | Built production files |

## Public Directory
| File | Purpose |
|------|---------|
| `public/index.html` | SPA entry |
| `public/login.html` | Login fallback |
| `public/dashboard.html` | Admin dashboard HTML |
| `public/members.html` | Member list HTML |
| `public/member-login.html` | Member login page |
| `public/gallery.html` | Gallery page |
| `public/css/style.css` | Global styles |
| `public/uploads/` | Legacy uploads |

## Assets Directory
| File | Purpose |
|------|---------|
| `assets/index-CAK6Uw4e.js` | Built JS |
| `assets/index-CoKGjOtO.css` | Built CSS |

## Infrastructure
| Dir/File | Purpose |
|----------|---------|
| `infra/main.bicep` | Azure infra as code |
| `.azure/deployment-plan.md` | Azure deployment notes |
| `.azure/validate-status.json` | Validation data |

## Temp Files
| File | Purpose |
|------|---------|
| `.temp/project-ref` | Supabase project ref |
| `.temp/pooler-url` | Supabase pooler connection |
| `.temp/storage-migration` | Storage migration status |
| `.temp/linked-project.json` | Linked project info |

## Tests
| File | Purpose |
|------|---------|
| `__tests__/api.test.js` | Jest API tests (24 tests) |

## Supabase
| File | Purpose |
|------|---------|
| `supabase_export.json` | SQLite → Supabase data export |
| `supabase_import_data.sql` | SQL import script |

## Media Assets
- `profiles/` — profile photos (6 files)
- `gallery/` — class memory photos (2 files)
