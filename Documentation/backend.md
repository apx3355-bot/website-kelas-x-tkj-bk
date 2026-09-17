# Backend Architecture

## Two Backend Systems
1. **PHP Backend (Current Production)** — `backend/api.php` + `router.php`
2. **Node.js Express (Legacy/Test)** — `server.js` + `auth.js`

## PHP Backend (backend/)
- `router.php` — SPA fallback, static serving, API routing
- `api.php` — 20+ REST endpoints, PDO SQLite, session auth
- `check_*.php` — diagnostic scripts

## API Routes (PHP)
### Auth
- `POST /api/auth/login` — username/password, bcrypt compare
- `GET /api/auth/me` — session check
- `GET /api/auth/dashboard` — user dashboard data
- `POST /api/auth/logout`

### User Management
- `GET /api/auth/members` — list all members
- `GET /api/auth/admin/members/{id}/promote`
- `GET /api/auth/admin/members/{id}/demote`
- `GET /api/auth/admin/members/{id}/reset-password`

### Content
- `GET /api/auth/class-content` — schedule + class info
- `PUT /api/auth/class-content` — update content
- `GET /api/auth/class-structure` — seating position
- `PUT /api/auth/class-structure`

### Announcements
- `GET /api/auth/announcements` — active announcements
- `POST /api/auth/announcements` — create (auth: developer, wali_kelas)
- `DELETE /api/auth/announcements/{id}` — delete (auth only)

### Gallery
- `GET /api/auth/gallery`
- `POST /api/auth/gallery`
- `DELETE /api/auth/gallery/{id}`

## Database Schema (SQLite → Supabase Postgres)
- `users` — auth: id, username, password(bcrypt), role
- `member_profiles` — extended: nama_lengkap, kelas, jabatan, bio, photo_url
- `class_info` — class announcement/title
- `class_schedule` — hari, subjects (JSON)
- `class_structure` — position, user_id
- `announcements` — title, content, image_url, expires_at
- `class_gallery` — title, description, photo_url

## Migration Target
- **Supabase Postgres** replaces SQLite
- **Supabase Storage** (`uploads` bucket) replaces `public/uploads/`
- **Node.js API function** replaces PHP backend for Vercel
