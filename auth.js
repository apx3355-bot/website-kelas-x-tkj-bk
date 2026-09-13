const express = require("express");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("./database");

const router = express.Router();
const MAX_MEMBER_COUNT = 30;
const UPLOAD_STORAGE_LIMIT = 5 * 1024 * 1024 * 1024;
const uploadStorageRoot = process.env.UPLOAD_PATH ? process.env.UPLOAD_PATH : path.join(__dirname, "storage", "uploads");
const profileUploadDirectory = path.join(uploadStorageRoot, "profiles");
const galleryUploadDirectory = path.join(uploadStorageRoot, "gallery");

function ensureUploadDirectories() {
    const directories = [
        uploadStorageRoot,
        profileUploadDirectory,
        galleryUploadDirectory,
        path.join(__dirname, "storage", "uploads"),
        path.join(__dirname, "storage", "uploads", "profiles"),
        path.join(__dirname, "storage", "uploads", "gallery"),
        path.join(__dirname, "public", "uploads"),
        path.join(__dirname, "public", "uploads", "profiles"),
        path.join(__dirname, "public", "uploads", "gallery")
    ];

    directories.forEach((directory) => {
        fs.mkdirSync(directory, { recursive: true });
    });
}

ensureUploadDirectories();

function getUploadStorageUsage() {
    let totalBytes = 0;

    function walk(directory) {
        if (!fs.existsSync(directory)) return;
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
                continue;
            }
            try {
                totalBytes += fs.statSync(fullPath).size;
            } catch (error) {
                // ignore unreadable orphaned files
            }
        }
    }

    walk(uploadStorageRoot);
    walk(path.join(__dirname, "storage", "uploads"));
    walk(path.join(__dirname, "public", "uploads"));
    return totalBytes;
}

function checkUploadStorage(fileSize) {
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
        return { allowed: true };
    }

    const usedBytes = getUploadStorageUsage();
    if (fileSize > UPLOAD_STORAGE_LIMIT) {
        return { allowed: false, message: "Ukuran file melebihi batas penyimpanan server 5 GB." };
    }
    if (usedBytes + fileSize > UPLOAD_STORAGE_LIMIT) {
        return { allowed: false, message: "Penyimpanan server sudah penuh. Hapus file lama atau gunakan ruang yang tersedia." };
    }

    return { allowed: true };
}

function deleteStoredUpload(fileUrl) {
    if (!fileUrl || typeof fileUrl !== "string") return;
    const relativePath = fileUrl.replace(/^\//, "").replace(/^uploads\//, "");
    const candidates = [
        path.join(uploadStorageRoot, relativePath),
        path.join(__dirname, "storage", "uploads", relativePath),
        path.join(__dirname, "storage", relativePath),
        path.join(__dirname, "public", relativePath),
        path.join(__dirname, "public", "uploads", relativePath)
    ];

    candidates.forEach((candidatePath) => {
        try {
            if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
                fs.unlinkSync(candidatePath);
            }
        } catch (error) {
            // ignore missing files
        }
    });
}

const upload = multer({
    storage: multer.diskStorage({
        destination: profileUploadDirectory,
        filename: (req, file, callback) => {
            const extension = path.extname(file.originalname).toLowerCase();
            callback(null, `profile-${req.session.user.id}-${Date.now()}${extension}`);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
        callback(null, allowedTypes.includes(file.mimetype));
    }
});

const developerProfileUpload = multer({
    storage: multer.diskStorage({
        destination: profileUploadDirectory,
        filename: (req, file, callback) => {
            const extension = path.extname(file.originalname).toLowerCase();
            callback(null, `profile-${req.params.id}-${Date.now()}${extension}`);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        callback(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype));
    }
});

const galleryUpload = multer({
    storage: multer.diskStorage({
        destination: galleryUploadDirectory,
        filename: (req, file, callback) => {
            const extension = path.extname(file.originalname).toLowerCase();
            callback(null, `gallery-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
        }
    }),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        callback(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype));
    }
});

const announcementUpload = multer({
    storage: multer.diskStorage({
        destination: galleryUploadDirectory,
        filename: (req, file, callback) => {
            const extension = path.extname(file.originalname).toLowerCase();
            callback(null, `announcement-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
        }
    }),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        callback(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype));
    }
});

const ROLE_ALIASES = {
    developer: "developer",
    wali: "wali_kelas",
    wali_kelas: "wali_kelas",
    "wali kelas": "wali_kelas",
    murid: "murid",
    siswa: "murid"
};

function normalizeRole(role) {
    if (typeof role !== "string") {
        return null;
    }

    return ROLE_ALIASES[role.trim().toLowerCase()] || null;
}

function findUser(username, role) {
    return new Promise((resolve, reject) => {
        db.get(
            "SELECT id, username, password, role, nama FROM users WHERE username = ? AND role = ?",
            [username, role],
            (error, user) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(user);
            }
        );
    });
}

function createProfileIfNeeded(user) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT OR IGNORE INTO member_profiles (user_id, nama_lengkap, kelas)
             VALUES (?, ?, 'X TKJ')`,
            [user.id, user.nama],
            (error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            }
        );
    });
}

function getProfile(userId) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT nama_lengkap, kelas, jabatan, bio, photo_url, updated_at
             FROM member_profiles WHERE user_id = ?`,
            [userId],
            (error, profile) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(profile || null);
            }
        );
    });
}

function recordLoginSession(sessionId, userId) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT OR REPLACE INTO login_sessions
             (session_id, user_id, login_at, last_seen, logged_out_at)
             VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
            [sessionId, userId],
            (error) => error ? reject(error) : resolve()
        );
    });
}

function getMemberCount() {
    return new Promise((resolve, reject) => {
        db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'murid'", (error, row) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(row.count);
        });
    });
}

function normalizeMemberIdentifier(memberId) {
    if (memberId === null || memberId === undefined) {
        return null;
    }

    const stringValue = String(memberId).trim();
    if (!stringValue) {
        return null;
    }

    const numericValue = Number.parseInt(stringValue, 10);
    return Number.isNaN(numericValue) ? stringValue : numericValue;
}

function findMemberAccountById(memberId) {
    const normalizedId = normalizeMemberIdentifier(memberId);
    if (normalizedId === null) {
        return Promise.resolve(null);
    }

    return new Promise((resolve, reject) => {
        const idVariants = [normalizedId, String(normalizedId), String(normalizedId).trim()];
        const uniqueVariants = [...new Set(idVariants.filter((value) => value !== "" && value !== null && value !== undefined))];

        db.get(
            `SELECT id, nama, role FROM users WHERE id = ? OR CAST(id AS TEXT) = ? OR CAST(id AS TEXT) = ?`,
            [normalizedId, String(normalizedId), String(normalizedId).trim()],
            (error, user) => {
                if (error) {
                    reject(error);
                    return;
                }

                if (user) {
                    resolve(user);
                    return;
                }

                db.get(
                    `SELECT user_id AS id, nama_lengkap AS nama, CASE WHEN role = 'wali_kelas' THEN 'wali_kelas' ELSE 'murid' END AS role
                     FROM users
                     WHERE id = ? OR CAST(id AS TEXT) = ? OR CAST(id AS TEXT) = ?
                     UNION ALL
                     SELECT user_id AS id, nama_lengkap AS nama, 'murid' AS role
                     FROM member_profiles
                     WHERE user_id = ? OR CAST(user_id AS TEXT) = ? OR CAST(user_id AS TEXT) = ?
                     LIMIT 1`,
                    [...uniqueVariants, ...uniqueVariants],
                    (profileError, profile) => {
                        if (profileError) {
                            reject(profileError);
                            return;
                        }

                        resolve(profile || null);
                    }
                );
            }
        );
    });
}

function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: "Silakan login terlebih dahulu"
        });
    }

    next();
}

function requireRole(...allowedRoles) {
    const normalizedRoles = allowedRoles.map(normalizeRole).filter(Boolean);

    return (req, res, next) => {
        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                message: "Silakan login terlebih dahulu"
            });
        }

        if (!normalizedRoles.includes(req.session.user.role)) {
            return res.status(403).json({
                success: false,
                message: "Anda tidak memiliki akses ke halaman ini"
            });
        }

        next();
    };
}

router.post("/login", async (req, res) => {
    const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const role = normalizeRole(req.body.role);

    if (!username || !password || !role) {
        return res.status(400).json({
            success: false,
            message: "Username, password, dan role wajib diisi"
        });
    }

    try {
        const user = await findUser(username, role);
        const passwordValid = user && await bcrypt.compare(password, user.password.startsWith("$2y$") ? "$2b$" + user.password.slice(4) : user.password);

        if (!passwordValid) {
            return res.status(401).json({
                success: false,
                message: "Username, password, atau role tidak sesuai"
            });
        }

        req.session.user = {
            id: user.id,
            username: user.username,
            nama: user.nama,
            role: user.role
        };

        await recordLoginSession(req.sessionID, user.id);

        if (["developer", "wali_kelas", "murid"].includes(user.role)) {
            await createProfileIfNeeded(user);
        }

        res.json({
            success: true,
            message: "Login berhasil",
            user: req.session.user
        });
    } catch (error) {
        console.error("Login gagal:", error.message);
        res.status(500).json({
            success: false,
            message: "Terjadi kesalahan pada server"
        });
    }
});

router.post("/member-register", async (req, res) => {
    const nama = typeof req.body.nama === "string" ? req.body.nama.trim() : "";
    const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const kelas = typeof req.body.kelas === "string" ? req.body.kelas.trim() : "";
    const bio = typeof req.body.bio === "string" ? req.body.bio.trim() : "";

    if (!nama || !username || password.length < 6 || !kelas) {
        return res.status(400).json({
            success: false,
            message: "Nama, username, kelas, dan password minimal 6 karakter wajib diisi"
        });
    }

    try {
        const memberCount = await getMemberCount();
        if (memberCount >= MAX_MEMBER_COUNT) {
            return res.status(403).json({
                success: false,
                code: "MEMBER_LIMIT_REACHED",
                message: "Kuota 30 anggota sudah penuh. Anda dapat menjadi pengunjung dan melihat info kelas serta galeri."
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        db.run(
            "INSERT INTO users (username, password, role, nama) VALUES (?, ?, 'murid', ?)",
            [username, passwordHash, nama],
            async function (error) {
                if (error) {
                    const message = error.code === "SQLITE_CONSTRAINT"
                        ? "Username sudah digunakan"
                        : "Pendaftaran anggota gagal";
                    return res.status(error.code === "SQLITE_CONSTRAINT" ? 409 : 500).json({ success: false, message });
                }

                db.run(
                    `INSERT INTO member_profiles (user_id, nama_lengkap, kelas, bio)
                     VALUES (?, ?, ?, ?)`,
                    [this.lastID, nama, kelas, bio],
                    async (profileError) => {
                        if (profileError) {
                            return res.status(500).json({ success: false, message: "Profil anggota gagal disimpan" });
                        }

                        req.session.user = {
                            id: this.lastID,
                            username,
                            nama,
                            role: "murid"
                        };
                        await recordLoginSession(req.sessionID, this.lastID);
                        res.status(201).json({
                            success: true,
                            message: "Pendaftaran anggota berhasil",
                            user: req.session.user
                        });
                    }
                );
            }
        );
    } catch (error) {
        console.error("Pendaftaran anggota gagal:", error.message);
        res.status(500).json({ success: false, message: "Pendaftaran anggota gagal" });
    }
});

router.get("/member-registration-status", async (req, res) => {
    try {
        const memberCount = await getMemberCount();
        const remaining = Math.max(MAX_MEMBER_COUNT - memberCount, 0);
        res.json({
            success: true,
            count: memberCount,
            max: MAX_MEMBER_COUNT,
            remaining,
            available: memberCount < MAX_MEMBER_COUNT
        });
    } catch (error) {
        console.error("Status kuota anggota gagal dimuat:", error.message);
        res.status(500).json({ success: false, message: "Status kuota tidak dapat dimuat" });
    }
});

router.get("/me", (req, res) => {
    res.json({
        success: true,
        loggedIn: Boolean(req.session.user),
        user: req.session.user || null
    });
});

router.post("/logout", (req, res) => {
    db.run(
        "UPDATE login_sessions SET logged_out_at = CURRENT_TIMESTAMP, last_seen = CURRENT_TIMESTAMP WHERE session_id = ?",
        [req.sessionID],
        () => req.session.destroy((error) => {
        if (error) {
            return res.status(500).json({
                success: false,
                message: "Logout gagal"
            });
        }

        res.clearCookie("connect.sid");
        res.json({
            success: true,
            message: "Logout berhasil"
        });
        })
    );
});

router.get("/dashboard", requireAuth, (req, res) => {
    const dashboardByRole = {
        developer: ["kelola pengguna", "kelola pengumuman", "lihat data kelas"],
        wali_kelas: ["kelola pengumuman", "lihat data murid", "lihat jadwal kelas"],
        murid: ["lihat pengumuman", "lihat jadwal kelas", "lihat profil"]
    };

    res.json({
        success: true,
        user: req.session.user,
        permissions: dashboardByRole[req.session.user.role] || []
    });
});

router.get("/announcements", (req, res) => {
    db.all(
        `SELECT id, title, content, image_url, expires_at, created_at
         FROM announcements
         WHERE expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP
         ORDER BY created_at DESC, id DESC`,
        (error, announcements) => {
            if (error) {
                console.error("Pengumuman gagal dimuat:", error.message);
                return res.status(500).json({ success: false, message: "Pengumuman tidak dapat dimuat" });
            }

            res.json({ success: true, announcements });
        }
    );
});

router.get("/class-content", (req, res) => {
    const defaultScheduleDays = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    db.get("SELECT title, content FROM class_info WHERE id = 1", (infoError, info) => {
        if (infoError) {
            return res.status(500).json({ success: false, message: "Info kelas tidak dapat dimuat" });
        }
        db.all("SELECT day, subjects FROM class_schedule ORDER BY id ASC", (scheduleError, schedule) => {
            if (scheduleError) {
                return res.status(500).json({ success: false, message: "Jadwal kelas tidak dapat dimuat" });
            }
            const normalizedSchedule = defaultScheduleDays.map((day) => {
                const match = (schedule || []).find((item) => String(item.day).trim().toLowerCase() === day.toLowerCase());
                return { day, subjects: match ? match.subjects : "" };
            });
            res.json({ success: true, info, schedule: normalizedSchedule });
        });
    });
});

router.put("/class-content", requireRole("developer", "wali_kelas"), (req, res) => {
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
    const rawSchedule = Array.isArray(req.body.schedule) ? req.body.schedule : [];
    const defaultScheduleDays = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const normalizedSchedule = defaultScheduleDays.map((day) => {
        const given = rawSchedule.find((item) => String(item?.day || "").trim().toLowerCase() === day.toLowerCase());
        return { day, subjects: String(given?.subjects || "").trim() };
    });

    if (!title || !content || normalizedSchedule.length === 0 || normalizedSchedule.some((item) => !item.day || !item.subjects)) {
        return res.status(400).json({ success: false, message: "Info kelas dan semua jadwal Senin sampai Sabtu wajib diisi" });
    }

    db.serialize(() => {
        db.run("UPDATE class_info SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1", [title, content]);
        normalizedSchedule.forEach((item, index) => {
            db.run(
                "INSERT INTO class_schedule (day, subjects) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET subjects = excluded.subjects",
                [item.day, item.subjects],
                () => {
                    if (index === normalizedSchedule.length - 1) {
                        res.json({ success: true, message: "Info kelas dan jadwal berhasil diperbarui" });
                    }
                }
            );
        });
    });
});

router.get("/class-structure", (req, res) => {
    db.all(
        `SELECT structure.position, structure.user_id,
                COALESCE(member_profiles.nama_lengkap, users.nama) AS nama,
                member_profiles.jabatan, member_profiles.kelas, member_profiles.photo_url
         FROM class_structure AS structure
         LEFT JOIN users ON users.id = structure.user_id
         LEFT JOIN member_profiles ON member_profiles.user_id = users.id
         ORDER BY CASE structure.position
             WHEN 'wali_kelas' THEN 1
             WHEN 'ketua' THEN 2
             WHEN 'wakil' THEN 3
             WHEN 'sekretaris' THEN 4
             ELSE 5
         END`,
        (error, structure) => {
            if (error) {
                console.error("Struktur kelas gagal dimuat:", error.message);
                return res.status(500).json({ success: false, message: "Struktur kelas tidak dapat dimuat" });
            }
            res.json({ success: true, structure });
        }
    );
});

router.put("/class-structure", requireRole("developer", "wali_kelas"), (req, res) => {
    const positions = ["wali_kelas", "ketua", "wakil", "sekretaris"];
    const values = {};

    positions.forEach((position) => {
        const rawValue = req.body[position];
        if (rawValue === "" || rawValue === undefined || rawValue === null) {
            values[position] = null;
            return;
        }

        if (!Number.isInteger(Number(rawValue))) {
            return res.status(400).json({ success: false, message: "Data struktur kelas tidak valid" });
        }

        values[position] = Number(rawValue);
    });

    if (values.wali_kelas !== null) {
        db.get("SELECT id FROM users WHERE id = ? AND role = 'wali_kelas'", [values.wali_kelas], (error, user) => {
            if (error || !user) {
                return res.status(400).json({ success: false, message: "Posisi wali kelas harus diisi akun wali kelas" });
            }

            const studentIds = [values.ketua, values.wakil, values.sekretaris].filter((value) => value !== null && value !== undefined);
            if (studentIds.length !== new Set(studentIds).size) {
                return res.status(400).json({ success: false, message: "Satu anggota tidak boleh memegang dua posisi" });
            }

            const checkedIds = studentIds.length ? studentIds : [0];
            const placeholders = checkedIds.map(() => "?").join(", ");
            db.all(`SELECT id FROM users WHERE role = 'murid' AND id IN (${placeholders})`, checkedIds, (checkError, selected) => {
                if (checkError) {
                    return res.status(500).json({ success: false, message: "Validasi struktur kelas gagal" });
                }
                if (studentIds.length > 0 && selected.length !== studentIds.length) {
                    return res.status(400).json({ success: false, message: "Ketua, wakil, dan sekretaris harus anggota murid" });
                }

                db.serialize(() => {
                    positions.forEach((position) => {
                        db.run("UPDATE class_structure SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE position = ?", [values[position], position]);
                    });
                    res.json({ success: true, message: "Struktur kelas berhasil disimpan" });
                });
            });
        });
        return;
    }

    const studentIds = [values.ketua, values.wakil, values.sekretaris].filter((value) => value !== null && value !== undefined);
    if (studentIds.length !== new Set(studentIds).size) {
        return res.status(400).json({ success: false, message: "Satu anggota tidak boleh memegang dua posisi" });
    }

    const checkedIds = studentIds.length ? studentIds : [0];
    const placeholders = checkedIds.map(() => "?").join(", ");
    db.all(`SELECT id FROM users WHERE role = 'murid' AND id IN (${placeholders})`, checkedIds, (checkError, selected) => {
        if (checkError) {
            return res.status(500).json({ success: false, message: "Validasi struktur kelas gagal" });
        }
        if (studentIds.length > 0 && selected.length !== studentIds.length) {
            return res.status(400).json({ success: false, message: "Ketua, wakil, dan sekretaris harus anggota murid" });
        }

        db.serialize(() => {
            positions.forEach((position) => {
                db.run("UPDATE class_structure SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE position = ?", [values[position], position]);
            });
            res.json({ success: true, message: "Struktur kelas berhasil disimpan" });
        });
    });
});

router.post("/announcements", requireRole("developer", "wali_kelas"), (req, res) => {
    announcementUpload.single("poster")(req, res, (uploadError) => {
        if (uploadError) {
            return res.status(400).json({ success: false, message: "Poster wajib berupa JPG, PNG, atau WebP dan maksimal 8 MB" });
        }
        if (req.file) {
            const storageCheck = checkUploadStorage(req.file.size);
            if (!storageCheck.allowed) {
                fs.unlink(req.file.path, () => {});
                return res.status(413).json({ success: false, message: storageCheck.message });
            }
        }

        const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
        const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
        const duration = req.body.duration === "permanent" ? null : Number(req.body.duration);
        if (!title || !content || (duration !== null && (![1, 3, 7, 30].includes(duration)))) {
            if (req.file) fs.unlink(req.file.path, () => {});
            return res.status(400).json({ success: false, message: "Judul dan isi pengumuman wajib diisi" });
        }

        const expiresAt = duration === null
            ? null
            : new Date(Date.now() + duration * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
        const imageUrl = req.file ? `/uploads/gallery/${req.file.filename}` : null;

        db.run(
            "INSERT INTO announcements (title, content, image_url, expires_at) VALUES (?, ?, ?, ?)",
            [title, content, imageUrl, expiresAt],
            function (error) {
            if (error) {
                if (req.file) fs.unlink(req.file.path, () => {});
                return res.status(500).json({ success: false, message: "Pengumuman gagal disimpan" });
            }
            res.status(201).json({
                success: true,
                message: "Pengumuman berhasil ditambahkan",
                announcement: { id: this.lastID, title, content, image_url: imageUrl, expires_at: expiresAt }
            });
            }
        );
    });
});

router.delete("/announcements/:id", requireRole("developer", "wali_kelas"), (req, res) => {
    db.get("SELECT image_url FROM announcements WHERE id = ?", [req.params.id], (findError, announcement) => {
        if (findError) {
            return res.status(500).json({ success: false, message: "Pengumuman gagal diperiksa" });
        }
        if (!announcement) {
            return res.status(404).json({ success: false, message: "Pengumuman tidak ditemukan" });
        }
        db.run("DELETE FROM announcements WHERE id = ?", [req.params.id], function (error) {
        if (error) {
            return res.status(500).json({ success: false, message: "Pengumuman gagal dihapus" });
        }
        if (announcement.image_url) {
            deleteStoredUpload(announcement.image_url);
        }
        res.json({ success: true, message: "Pengumuman berhasil dihapus" });
        });
    });
});

router.get("/developer/members", requireRole("developer", "wali_kelas"), (req, res) => {
    db.all(
        `SELECT users.id, users.username, users.nama, users.role, member_profiles.nama_lengkap,
            member_profiles.kelas, member_profiles.jabatan, member_profiles.bio, member_profiles.photo_url,
                MAX(login_sessions.login_at) AS last_login_at,
                SUM(CASE WHEN login_sessions.session_id IS NOT NULL
                    AND login_sessions.logged_out_at IS NULL THEN 1 ELSE 0 END) AS active_sessions
         FROM users
         LEFT JOIN member_profiles ON member_profiles.user_id = users.id
         LEFT JOIN login_sessions ON login_sessions.user_id = users.id
            WHERE users.role IN ('developer', 'murid', 'wali_kelas')
         GROUP BY users.id
            ORDER BY CASE users.role WHEN 'developer' THEN 1 WHEN 'wali_kelas' THEN 2 ELSE 3 END,
                COALESCE(member_profiles.nama_lengkap, users.nama) ASC`,
        (error, members) => {
            if (error) {
                console.error("Data sesi anggota gagal dimuat:", error.message);
                return res.status(500).json({ success: false, message: "Data sesi anggota tidak dapat dimuat" });
            }

            res.json({ success: true, members });
        }
    );
});

router.put("/developer/members/:id/profile", requireRole("developer", "wali_kelas"), async (req, res) => {
    const memberId = normalizeMemberIdentifier(req.params.id);
    const namaLengkap = typeof req.body.nama_lengkap === "string" ? req.body.nama_lengkap.trim() : "";
    const kelas = typeof req.body.kelas === "string" ? req.body.kelas.trim() : "";
    const jabatan = typeof req.body.jabatan === "string" ? req.body.jabatan.trim() : "";
    const bio = typeof req.body.bio === "string" ? req.body.bio.trim() : "";
    if (!namaLengkap || !kelas || jabatan.length > 80) {
        return res.status(400).json({ success: false, message: "Nama lengkap dan kelas wajib diisi" });
    }

    try {
        const member = await findMemberAccountById(memberId);
        const targetId = Number.isFinite(Number(memberId)) ? Number(memberId) : (member && member.id ? member.id : memberId);
        if (!member || !targetId) {
            return res.status(404).json({ success: false, message: "Akun anggota tidak ditemukan" });
        }
        if (member.role && !['murid', 'wali_kelas'].includes(member.role)) {
            return res.status(404).json({ success: false, message: "Akun anggota tidak ditemukan" });
        }

        await createProfileIfNeeded({ id: targetId, nama: namaLengkap });
        db.run(
            `UPDATE member_profiles
             SET nama_lengkap = ?, kelas = ?, jabatan = ?, bio = ?, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = ?`,
            [namaLengkap, kelas, jabatan, bio, targetId],
            (updateError) => updateError
                ? res.status(500).json({ success: false, message: "Profil anggota gagal diperbarui" })
                : res.json({ success: true, message: "Profil anggota berhasil diperbarui" })
        );
    } catch (error) {
        console.error("Profil anggota gagal diperbarui:", error.message);
        res.status(500).json({ success: false, message: "Profil anggota gagal diperbarui" });
    }
});

router.post("/developer/members/:id/profile/photo", requireRole("developer", "wali_kelas"), (req, res) => {
    developerProfileUpload.single("foto")(req, res, async (uploadError) => {
        if (uploadError || !req.file) {
            return res.status(400).json({ success: false, message: "Foto wajib berupa JPG, PNG, atau WebP dan maksimal 5 MB" });
        }
        const storageCheck = checkUploadStorage(req.file.size);
        if (!storageCheck.allowed) {
            fs.unlink(req.file.path, () => {});
            return res.status(413).json({ success: false, message: storageCheck.message });
        }
        db.get(
            `SELECT member_profiles.photo_url
             FROM users LEFT JOIN member_profiles ON member_profiles.user_id = users.id
             WHERE users.id = ? AND users.role IN ('murid', 'wali_kelas')`,
            [req.params.id],
            (findError, profile) => {
                if (findError || !profile) {
                    fs.unlink(req.file.path, () => {});
                    return res.status(404).json({ success: false, message: "Akun anggota tidak ditemukan" });
                }
                db.run(
                    `INSERT OR IGNORE INTO member_profiles (user_id, nama_lengkap, kelas)
                     SELECT id, nama, 'X TKJ' FROM users WHERE id = ?`,
                    [req.params.id],
                    (createError) => {
                        if (createError) {
                            fs.unlink(req.file.path, () => {});
                            return res.status(500).json({ success: false, message: "Foto profil gagal disimpan" });
                        }
                        db.run("UPDATE member_profiles SET photo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?", [`/uploads/profiles/${req.file.filename}`, req.params.id], (updateError) => {
                            if (updateError) {
                                fs.unlink(req.file.path, () => {});
                                return res.status(500).json({ success: false, message: "Foto profil gagal disimpan" });
                            }
                            if (profile.photo_url) deleteStoredUpload(profile.photo_url);
                            res.json({ success: true, message: "Foto profil anggota berhasil diperbarui" });
                        });
                    }
                );
            }
        );
    });
});

router.delete("/developer/members/:id/profile/photo", requireRole("developer", "wali_kelas"), (req, res) => {
    db.get(
        `SELECT member_profiles.photo_url
         FROM users LEFT JOIN member_profiles ON member_profiles.user_id = users.id
         WHERE users.id = ? AND users.role IN ('murid', 'wali_kelas')`,
        [req.params.id],
        (findError, profile) => {
            if (findError) return res.status(500).json({ success: false, message: "Foto profil tidak dapat diperiksa" });
            if (!profile) return res.status(404).json({ success: false, message: "Akun anggota tidak ditemukan" });
            db.run("UPDATE member_profiles SET photo_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?", [req.params.id], (updateError) => {
                if (updateError) return res.status(500).json({ success: false, message: "Foto profil gagal dihapus" });
                if (profile.photo_url) deleteStoredUpload(profile.photo_url);
                res.json({ success: true, message: "Foto profil anggota berhasil dihapus" });
            });
        }
    );
});

router.post("/developer/members/:id/reset-password", requireRole("developer"), async (req, res) => {
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (password.length < 6) {
        return res.status(400).json({ success: false, message: "Password baru minimal 6 karakter" });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        db.run(
            "UPDATE users SET password = ? WHERE id = ? AND role = 'murid'",
            [passwordHash, req.params.id],
            function (error) {
                if (error) {
                    return res.status(500).json({ success: false, message: "Password gagal diubah" });
                }
                if (!this.changes) {
                    return res.status(404).json({ success: false, message: "Anggota tidak ditemukan" });
                }

                res.json({ success: true, message: "Password anggota berhasil diubah" });
            }
        );
    } catch (error) {
        console.error("Reset password anggota gagal:", error.message);
        res.status(500).json({ success: false, message: "Password gagal diubah" });
    }
});

router.delete("/developer/members/:id", requireRole("developer"), (req, res) => {
    if (String(req.params.id) === String(req.session.user.id)) {
        return res.status(400).json({ success: false, message: "Akun developer yang sedang digunakan tidak dapat dihapus" });
    }

    db.get(
        `SELECT users.id, users.role, member_profiles.photo_url
         FROM users
         LEFT JOIN member_profiles ON member_profiles.user_id = users.id
         WHERE users.id = ? AND users.role IN ('murid', 'wali_kelas')`,
        [req.params.id],
        (findError, member) => {
            if (findError) {
                return res.status(500).json({ success: false, message: "Akun tidak dapat diperiksa" });
            }
            if (!member) {
                return res.status(404).json({ success: false, message: "Akun anggota tidak ditemukan" });
            }

            db.all("SELECT photo_url FROM class_gallery WHERE uploaded_by = ?", [member.id], (galleryError, photos) => {
                if (galleryError) {
                    return res.status(500).json({ success: false, message: "Data galeri akun tidak dapat diperiksa" });
                }

                db.serialize(() => {
                    db.run("DELETE FROM class_gallery WHERE uploaded_by = ?", [member.id]);
                    db.run("DELETE FROM login_sessions WHERE user_id = ?", [member.id]);
                    db.run("DELETE FROM member_profiles WHERE user_id = ?", [member.id]);
                    db.run("DELETE FROM users WHERE id = ?", [member.id], function (deleteError) {
                        if (deleteError || !this.changes) {
                            return res.status(500).json({ success: false, message: "Akun gagal dihapus" });
                        }

                        if (member.photo_url) {
                            deleteStoredUpload(member.photo_url);
                        }
                        photos.forEach((photo) => {
                            if (photo?.photo_url) deleteStoredUpload(photo.photo_url);
                        });
                        res.json({ success: true, message: "Akun berhasil dihapus" });
                    });
                });
            });
        }
    );
});

router.get("/profile", requireRole("developer", "wali_kelas", "murid"), async (req, res) => {
    try {
        res.json({ success: true, profile: await getProfile(req.session.user.id) });
    } catch (error) {
        console.error("Profil gagal dimuat:", error.message);
        res.status(500).json({ success: false, message: "Profil tidak dapat dimuat" });
    }
});

router.put("/profile", requireRole("developer", "wali_kelas", "murid"), async (req, res) => {
    const namaLengkap = typeof req.body.nama_lengkap === "string" ? req.body.nama_lengkap.trim() : "";
    const kelas = typeof req.body.kelas === "string" ? req.body.kelas.trim() : "";
    const jabatan = typeof req.body.jabatan === "string" ? req.body.jabatan.trim() : "";
    const bio = typeof req.body.bio === "string" ? req.body.bio.trim() : "";

    if (!namaLengkap || !kelas) {
        return res.status(400).json({
            success: false,
            message: "Nama lengkap dan kelas wajib diisi"
        });
    }

    try {
        await createProfileIfNeeded({ id: req.session.user.id, nama: namaLengkap });
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE member_profiles
                 SET nama_lengkap = ?, kelas = ?, jabatan = ?, bio = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = ?`,
                [namaLengkap, kelas, jabatan, bio, req.session.user.id],
                (error) => error ? reject(error) : resolve()
            );
        });

        req.session.user.nama = namaLengkap;
        res.json({ success: true, message: "Profil berhasil disimpan", profile: await getProfile(req.session.user.id) });
    } catch (error) {
        console.error("Profil gagal disimpan:", error.message);
        res.status(500).json({ success: false, message: "Profil tidak dapat disimpan" });
    }
});

router.post("/profile/photo", requireRole("developer", "wali_kelas", "murid"), (req, res) => {
    upload.single("foto")(req, res, async (error) => {
        if (error || !req.file) {
            return res.status(400).json({
                success: false,
                message: error?.code === "LIMIT_FILE_SIZE"
                    ? "Ukuran foto maksimal 5 MB"
                    : "Foto wajib berupa JPG, PNG, atau WebP"
            });
        }

        const storageCheck = checkUploadStorage(req.file.size);
        if (!storageCheck.allowed) {
            fs.unlink(req.file.path, () => {});
            return res.status(413).json({ success: false, message: storageCheck.message });
        }

        try {
            const profile = await getProfile(req.session.user.id);
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE member_profiles
                     SET photo_url = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE user_id = ?`,
                    [`/uploads/profiles/${req.file.filename}`, req.session.user.id],
                    (updateError) => updateError ? reject(updateError) : resolve()
                );
            });

            if (profile?.photo_url) {
                deleteStoredUpload(profile.photo_url);
            }

            res.json({
                success: true,
                message: "Foto profil berhasil disimpan",
                photo_url: `/uploads/profiles/${req.file.filename}`
            });
        } catch (updateError) {
            fs.unlink(req.file.path, () => {});
            console.error("Foto profil gagal disimpan:", updateError.message);
            res.status(500).json({ success: false, message: "Foto profil tidak dapat disimpan" });
        }
    });
});

router.get("/gallery", (req, res) => {
    db.all(
        `SELECT gallery.id, gallery.title, gallery.description, gallery.photo_url,
                gallery.created_at, users.nama AS uploaded_by_name
         FROM class_gallery AS gallery
         JOIN users ON users.id = gallery.uploaded_by
         ORDER BY gallery.created_at DESC`,
        (error, photos) => {
            if (error) {
                console.error("Galeri gagal dimuat:", error.message);
                return res.status(500).json({ success: false, message: "Galeri tidak dapat dimuat" });
            }

            res.json({
                success: true,
                photos,
                canManage: ["developer", "wali_kelas"].includes(req.session.user?.role)
            });
        }
    );
});

router.get("/members", (req, res) => {
    db.all(
        `SELECT users.id, users.id AS user_id, users.nama AS account_name, users.role,
                member_profiles.nama_lengkap, member_profiles.kelas,
                member_profiles.jabatan, member_profiles.bio, member_profiles.photo_url
         FROM users
         LEFT JOIN member_profiles ON member_profiles.user_id = users.id
         ORDER BY CASE role
             WHEN 'developer' THEN 1
             WHEN 'wali_kelas' THEN 2
             ELSE 3
         END, nama ASC`,
        (error, members) => {
            if (error) {
                console.error("Data anggota gagal dimuat:", error.message);
                return res.status(500).json({ success: false, message: "Data anggota tidak dapat dimuat" });
            }

            res.json({ success: true, members });
        }
    );
});

router.post("/gallery", requireRole("developer", "wali_kelas"), (req, res) => {
    galleryUpload.single("foto")(req, res, (error) => {
        if (error || !req.file) {
            return res.status(400).json({
                success: false,
                message: error?.code === "LIMIT_FILE_SIZE"
                    ? "Ukuran foto maksimal 8 MB"
                    : "Foto wajib berupa JPG, PNG, atau WebP"
            });
        }

        const storageCheck = checkUploadStorage(req.file.size);
        if (!storageCheck.allowed) {
            fs.unlink(req.file.path, () => {});
            return res.status(413).json({ success: false, message: storageCheck.message });
        }

        const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
        const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
        if (!title) {
            fs.unlink(req.file.path, () => {});
            return res.status(400).json({ success: false, message: "Judul foto wajib diisi" });
        }

        db.run(
            `INSERT INTO class_gallery (title, description, photo_url, uploaded_by)
             VALUES (?, ?, ?, ?)`,
            [title, description, `/uploads/gallery/${req.file.filename}`, req.session.user.id],
            function (insertError) {
                if (insertError) {
                    fs.unlink(req.file.path, () => {});
                    return res.status(500).json({ success: false, message: "Foto gagal disimpan" });
                }

                res.json({
                    success: true,
                    message: "Foto berhasil ditambahkan ke galeri",
                    photo: { id: this.lastID, title, description, photo_url: `/uploads/gallery/${req.file.filename}`, uploaded_by_name: req.session.user.nama }
                });
            }
        );
    });
});

router.delete("/gallery/:id", requireRole("developer", "wali_kelas"), (req, res) => {
    db.get("SELECT photo_url FROM class_gallery WHERE id = ?", [req.params.id], (findError, photo) => {
        if (findError || !photo) {
            return res.status(404).json({ success: false, message: "Foto tidak ditemukan" });
        }

        db.run("DELETE FROM class_gallery WHERE id = ?", [req.params.id], (deleteError) => {
            if (deleteError) {
                return res.status(500).json({ success: false, message: "Foto gagal dihapus" });
            }

            deleteStoredUpload(photo.photo_url);
            res.json({ success: true, message: "Foto berhasil dihapus" });
        });
    });
});

module.exports = {
    router,
    requireAuth,
    requireRole,
    normalizeRole
};
