# server.js (Node.js Express Legacy)

**Status:** Legacy/testing — primary deployment uses PHP backend via Docker

## Role
- Express server on port 3000
- Session management with `express-session`
- Static file serving from `public/`
- API: `app.use("/api/auth", auth.router)` → auth.js routes

## Key Code
```javascript
app.use("/api/auth", auth.router);
app.get("/", (req, res) => {
    res.sendFile(path.join(frontendDistPath, "index.html"));
});
```

## Middleware
- `express.json()`, `express.urlencoded()`
- Session: secret `YPK_CLASS_SECRET_2026`, 4hr cookie expiry
- Uploads: `multer` for multipart form data

## Graceful Shutdown
- SIGINT/SIGTERM: auto backup `database.db` → `backups/`
- Timestamped backups: `database-YYYYMMDD-HHMMSS-{startup|shutdown}.db`
- Cleanup: keep last 20 backups

## Dependencies
- bcrypt, express, express-session, multer, sqlite3
- dev: jest, supertest

## Testing
- `__tests__/api.test.js` — 24 Jest tests, all passing
- Run: `npm test`
