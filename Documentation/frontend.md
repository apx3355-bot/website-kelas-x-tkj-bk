# Frontend (Vite + React)

**Stack:** Vite 6.x, React 19, Vite PWA plugin

## Entry Point
- `[[package.json]]` — scripts, dependencies
- `vite.config.js` — dev server (port 5173), proxy `/api/*` → PHP:8000

## Build Output
- `dist/` — built to `public/` for PHP static serving
- Assets: `index-*.js`, `index-*.css` (minified)

## Key Files
- `App.jsx` — main component, routing, state management
- `api.js` — `api(route, options)` → `fetch('/api/auth/${route}')`
- `.env` — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## Components
- `ProfilePanel` — user profile display/edit
- `AdminTools` — manage users (wali kelas role)
- `StructureTools` — class structure management
- `ContentTools` — class schedule/content
- `AnnouncementTools` — add/delete announcements
- `GalleryTools` — class memory gallery

## Dependencies
```
bcrypt ^6.0.0
express ^5.2.1
express-session ^1.19.0
multer ^2.3.0
sqlite3 ^6.0.1
```
