import { useEffect, useState } from 'react';
import { api } from './api';

const roleLabels = { developer: 'Developer', wali_kelas: 'Wali Kelas', murid: 'Murid' };
const defaultScheduleDays = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const normalizeSchedule = (schedule = []) => {
  const itemsByDay = new Map((schedule || []).map((item) => [String(item.day || '').trim(), String(item.subjects || '').trim()]));
  return defaultScheduleDays.map((day) => ({ day, subjects: itemsByDay.get(day) || '' }));
};

const getStableListKey = (prefix, value, fallbackIndex) => {
  const safeValue = value ?? '';
  return safeValue ? `${prefix}-${String(safeValue)}` : `${prefix}-fallback-${fallbackIndex}`;
};

function dataUrlToFile(dataUrl, fileName) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], fileName, { type: mime });
}

async function createCroppedFile(file, options = {}) {
  const { zoom = 1.2, offsetX = 0, offsetY = 0 } = options;
  const image = await new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Gagal memuat gambar untuk crop'));
    };
    img.src = objectUrl;
  });

  const canvas = document.createElement('canvas');
  const size = 900;
  const minSide = Math.min(image.width, image.height);
  const cropSize = Math.max(160, minSide / zoom);
  const maxPanX = Math.max(0, image.width - cropSize) / 2;
  const maxPanY = Math.max(0, image.height - cropSize) / 2;
  const offsetPixelsX = (offsetX / 100) * (maxPanX * 2);
  const offsetPixelsY = (offsetY / 100) * (maxPanY * 2);
  const startX = (image.width - cropSize) / 2 + offsetPixelsX;
  const startY = (image.height - cropSize) / 2 + offsetPixelsY;

  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.fillStyle = '#0d0f14';
  context.fillRect(0, 0, size, size);
  context.drawImage(image, startX, startY, cropSize, cropSize, 0, 0, size, size);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(file);
        return;
      }
      const croppedName = file.name.replace(/\.[^.]+$/, '') + '-cropped.jpg';
      resolve(new File([blob], croppedName, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  });
}

function Login({ onLogin, onRegister }) {
  const [form, setForm] = useState({ username: '', password: '', role: 'murid' });
  const [message, setMessage] = useState('');
  const submit = async (event) => {
    event.preventDefault(); setMessage('');
    try { const result = await api('login', { method: 'POST', body: JSON.stringify(form) }); onLogin(result.user); }
    catch (error) { setMessage(error.message); }
  };
  return <section className="auth-panel"><p className="eyebrow">KELAS X TKJ</p><h1>Masuk ke ruang kelas</h1><form onSubmit={submit}><label>Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="murid">Murid</option><option value="wali_kelas">Wali Kelas</option><option value="developer">Developer</option></select></label><label>Username<input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label><label>Password<input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>{message && <p className="error">{message}</p>}<button className="button primary" type="submit">Login</button></form><button className="text-action" type="button" onClick={onRegister}>Daftar sebagai anggota</button></section>;
}

function Register({ onClose }) {
  const [form, setForm] = useState({ nama: '', username: '', password: '', kelas: 'X TKJ', bio: '' });
  const [message, setMessage] = useState('');
  const submit = async (event) => { event.preventDefault(); setMessage(''); try { await api('member-register', { method: 'POST', body: JSON.stringify(form) }); setMessage('Pendaftaran berhasil. Silakan login.'); } catch (error) { setMessage(error.message); } };
  return <section className="auth-panel"><p className="eyebrow">MEMBER ACCESS</p><h1>Daftar anggota</h1><form onSubmit={submit}>{[['nama', 'Nama lengkap'], ['username', 'Username'], ['password', 'Password']].map(([key, label]) => <label key={key}>{label}<input required minLength={key === 'password' ? 6 : undefined} type={key === 'password' ? 'password' : 'text'} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}<label>Kelas<input required value={form.kelas} onChange={(e) => setForm({ ...form, kelas: e.target.value })} /></label><label>Bio<textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label>{message && <p className={message.startsWith('Pendaftaran') ? 'success' : 'error'}>{message}</p>}<button className="button primary" type="submit">Simpan dan daftar</button></form><button className="text-action" type="button" onClick={onClose}>Kembali ke login</button></section>;
}

function ImageLightbox({ src, alt, onClose }) {
  if (!src) return null;
  return (
    <div className="lightbox-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="lightbox-panel" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="button ghost lightbox-close" onClick={onClose}>Tutup</button>
        <img src={src} alt={alt} />
      </div>
    </div>
  );
}

function CropImageDialog({ file, onApply, onCancel }) {
  const [source, setSource] = useState('');
  const [zoom, setZoom] = useState(1.35);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setSource(url);
    setZoom(1.35);
    setOffsetX(0);
    setOffsetY(0);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const applyCrop = async () => {
    const croppedFile = await createCroppedFile(file, { zoom, offsetX, offsetY });
    onApply(croppedFile);
  };

  if (!source) return null;

  return (
    <div className="lightbox-backdrop" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="crop-panel" onClick={(event) => event.stopPropagation()}>
        <div className="crop-header">
          <div>
            <p className="eyebrow">CROP FOTO</p>
            <h3>Sesuaikan profil Anda</h3>
          </div>
          <button type="button" className="button ghost" onClick={onCancel}>Batal</button>
        </div>
        <div className="crop-stage">
          <div className="crop-frame">
            <img src={source} alt="Preview crop" style={{ transform: `translate(${offsetX * 2.6}px, ${offsetY * 2.6}px) scale(${zoom})` }} />
          </div>
        </div>
        <div className="crop-slider-group">
          <label className="crop-slider-label">
            Zoom foto
            <input type="range" min="1" max="2.8" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <label className="crop-slider-label">
            Geser horizontal
            <input type="range" min="-100" max="100" step="1" value={offsetX} onChange={(event) => setOffsetX(Number(event.target.value))} />
          </label>
          <label className="crop-slider-label">
            Geser vertikal
            <input type="range" min="-100" max="100" step="1" value={offsetY} onChange={(event) => setOffsetY(Number(event.target.value))} />
          </label>
        </div>
        <div className="crop-actions">
          <button type="button" className="button secondary" onClick={onCancel}>Batal</button>
          <button type="button" className="button primary" onClick={applyCrop}>Gunakan foto</button>
        </div>
      </div>
    </div>
  );
}

function MemberCard({ member, onOpenImage }) {
  const name = member.nama_lengkap || member.account_name || member.nama;
  return (
    <article className="member-card">
      {member.photo_url ? (
        <button type="button" className="image-button" onClick={() => onOpenImage(member.photo_url, name)}>
          <img className="member-photo" src={member.photo_url} alt={name} />
        </button>
      ) : (
        <div className="avatar">{name.charAt(0).toUpperCase()}</div>
      )}
      <h3>{name}</h3>
      <p className="job">{member.jabatan || roleLabels[member.role] || 'Anggota Kelas'}</p>
      <p>{member.kelas || 'X TKJ'}</p>
      <small>{member.bio || 'Belum ada bio.'}</small>
    </article>
  );
}

function AdminMemberEditor({ member, isDeveloper, onSaved, onOpenImage }) {
  const [form, setForm] = useState({ nama_lengkap: member.nama_lengkap || member.nama, kelas: member.kelas || 'X TKJ', jabatan: member.jabatan || '', bio: member.bio || '' });
  const [photo, setPhoto] = useState(null);
  const [pendingCropFile, setPendingCropFile] = useState(null);
  const [message, setMessage] = useState('');

  const memberId = String(member?.id ?? member?.user_id ?? member?.userId ?? '').trim();

  const save = async (event) => {
    event.preventDefault(); setMessage('');
    try {
      const targetId = memberId || String(member?.id ?? member?.user_id ?? member?.userId ?? '').trim();
      if (!targetId || targetId === 'undefined' || targetId === 'null') {
        throw new Error('Akun anggota tidak ditemukan');
      }
      await api(`developer/members/${encodeURIComponent(targetId)}/profile`, { method: 'PUT', body: JSON.stringify(form) });
      if (photo) {
        const data = new FormData();
        data.append('foto', photo);
        await api(`developer/members/${encodeURIComponent(targetId)}/profile/photo`, { method: 'POST', body: data });
      }
      setPhoto(null); setMessage('Profil tersimpan'); onSaved();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const reset = async () => {
    const targetId = String(member?.id ?? member?.user_id ?? '').trim();
    const password = window.prompt('Password baru minimal 6 karakter:');
    if (!password || !targetId) return;
    try { await api(`developer/members/${encodeURIComponent(targetId)}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) }); setMessage('Password berhasil diubah'); }
    catch (error) { setMessage(error.message); }
  };

  const remove = async () => {
    const targetId = String(member?.id ?? member?.user_id ?? '').trim();
    if (!targetId) return;
    if (!window.confirm(`Hapus akun ${form.nama_lengkap}?`)) return;
    try { await api(`developer/members/${encodeURIComponent(targetId)}`, { method: 'DELETE' }); onSaved(); }
    catch (error) { setMessage(error.message); }
  };

  const handleFileSelection = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPendingCropFile(file);
    event.target.value = '';
  };

  return (
    <>
      <form className="editor" onSubmit={save}>
        <strong>{member.nama_lengkap || member.nama}</strong>
        {member.photo_url ? (
          <button type="button" className="image-button avatar-inline" onClick={() => onOpenImage(member.photo_url, member.nama_lengkap || member.nama)}>
            <img className="member-photo" src={member.photo_url} alt={`Foto ${member.nama_lengkap || member.nama}`} />
          </button>
        ) : null}
        <label>Foto profil<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileSelection} /></label>
        <input aria-label="Nama lengkap" value={form.nama_lengkap} onChange={(e) => setForm({ ...form, nama_lengkap: e.target.value })} required />
        <input aria-label="Kelas" value={form.kelas} onChange={(e) => setForm({ ...form, kelas: e.target.value })} required />
        <input aria-label="Jabatan" placeholder="Contoh: Ketua Kelas" maxLength="80" value={form.jabatan} onChange={(e) => setForm({ ...form, jabatan: e.target.value })} />
        <textarea aria-label="Bio" placeholder="Bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
        <div className="editor-actions">
          <button className="button secondary" type="submit">Simpan profil</button>
          {isDeveloper && member.role === 'murid' && <button className="button ghost" type="button" onClick={reset}>Reset password</button>}
          {isDeveloper && <button className="button danger" type="button" onClick={remove}>Hapus akun</button>}
        </div>
        {message && <small className={message.includes('gagal') || message.includes('tidak') ? 'error' : 'success'}>{message}</small>}
      </form>
      {pendingCropFile && (
        <CropImageDialog
          file={pendingCropFile}
          onApply={(croppedFile) => {
            setPhoto(croppedFile);
            setPendingCropFile(null);
          }}
          onCancel={() => setPendingCropFile(null)}
        />
      )}
    </>
  );
}

function ProfilePanel({ user, onSaved, onOpenImage }) {
  const [profile, setProfile] = useState({ nama_lengkap: user.nama, kelas: 'X TKJ', jabatan: '', bio: '', photo_url: '' });
  const [photo, setPhoto] = useState(null);
  const [pendingCropFile, setPendingCropFile] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api('profile').then((result) => result.profile && setProfile(result.profile)).catch(() => {});
  }, []);

  const save = async (event) => {
    event.preventDefault();
    try {
      await api('profile', { method: 'PUT', body: JSON.stringify(profile) });
      if (photo) {
        const data = new FormData();
        data.append('foto', photo);
        const result = await api('profile/photo', { method: 'POST', body: data });
        setProfile({ ...profile, photo_url: result.photo_url });
        setPhoto(null);
      }
      setMessage('Profil berhasil disimpan');
      onSaved(profile.nama_lengkap);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const handleFileSelection = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPendingCropFile(file);
    event.target.value = '';
  };

  return (
    <>
      <section className="tool-panel">
        <p className="eyebrow">PROFIL KELAS</p>
        <h2>Profil saya</h2>
        <form className="tool-form" onSubmit={save}>
          {profile.photo_url ? (
            <button type="button" className="image-button avatar-inline" onClick={() => onOpenImage(profile.photo_url, profile.nama_lengkap)}>
              <img className="member-photo" src={profile.photo_url} alt={`Foto profil ${profile.nama_lengkap}`} />
            </button>
          ) : null}
          <label>Foto profil<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileSelection} /></label>
          <input aria-label="Nama lengkap" value={profile.nama_lengkap} onChange={(e) => setProfile({ ...profile, nama_lengkap: e.target.value })} required />
          <input aria-label="Kelas" value={profile.kelas} onChange={(e) => setProfile({ ...profile, kelas: e.target.value })} required />
          <input aria-label="Jabatan" placeholder="Jabatan atau peran" value={profile.jabatan} onChange={(e) => setProfile({ ...profile, jabatan: e.target.value })} />
          <textarea aria-label="Bio" placeholder="Tentang saya" value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} />
          <button className="button primary" type="submit">Simpan profil</button>
          {message && <small className="success">{message}</small>}
        </form>
      </section>
      {pendingCropFile && (
        <CropImageDialog
          file={pendingCropFile}
          onApply={(croppedFile) => {
            setPhoto(croppedFile);
            setPendingCropFile(null);
          }}
          onCancel={() => setPendingCropFile(null)}
        />
      )}
    </>
  );
}

function AdminTools({ members, isDeveloper, onSaved, onOpenImage }) {
  return (
    <section className="tool-panel wide">
      <p className="eyebrow">ALAT PENGELOLA</p>
      <h2>Anggota dan akun</h2>
      <div className="edit-grid">
        {members.filter((m) => ['murid', 'wali_kelas'].includes(m.role)).map((member, index) => (
          <AdminMemberEditor key={getStableListKey('admin-member', member.id ?? member.username ?? member.nama_lengkap ?? member.nama, index)} member={member} isDeveloper={isDeveloper} onSaved={onSaved} onOpenImage={onOpenImage} />
        ))}
      </div>
    </section>
  );
}

function ContentTools({ content, onSaved }) {
  const [form, setForm] = useState({ info: content?.info || { title: '', content: '' }, schedule: normalizeSchedule(content?.schedule || []) });
  useEffect(() => setForm({ info: content?.info || { title: '', content: '' }, schedule: normalizeSchedule(content?.schedule || []) }), [content]);
  const save = async (e) => {
    e.preventDefault();
    const payload = {
      title: (form.info?.title || '').trim(),
      content: (form.info?.content || '').trim(),
      schedule: form.schedule.map((item) => ({ day: item.day, subjects: (item.subjects || '').trim() }))
    };
    await api('class-content', { method: 'PUT', body: JSON.stringify(payload) });
    onSaved();
  };
  return <section className="tool-panel"><p className="eyebrow">KONTEN KELAS</p><h2>Info dan jadwal</h2><form className="tool-form" onSubmit={save}><input value={form.info?.title || ''} onChange={(e) => setForm({ ...form, info: { ...form.info, title: e.target.value } })} /><textarea value={form.info?.content || ''} onChange={(e) => setForm({ ...form, info: { ...form.info, content: e.target.value } })} />{(form.schedule || []).map((item, index) => <label key={getStableListKey('schedule-item', item.day, index)} className="schedule-editor-item"><strong>{item.day}</strong><input value={item.subjects || ''} onChange={(e) => { const schedule = [...form.schedule]; schedule[index] = { ...item, subjects: e.target.value }; setForm({ ...form, schedule }); }} /></label>)}<button className="button primary">Simpan konten</button></form></section>;
}

function StructureTools({ structure, members, onSaved }) {
  const positions = [['wali_kelas', 'Wali Kelas'], ['ketua', 'Ketua Kelas'], ['wakil', 'Wakil Ketua'], ['sekretaris', 'Sekretaris']];
  const [form, setForm] = useState(Object.fromEntries(structure.map((item) => [item.position, item.user_id || ''])));
  useEffect(() => setForm(Object.fromEntries(structure.map((item) => [item.position, item.user_id || '']))), [structure]);
  const save = async (event) => { event.preventDefault(); await api('class-structure', { method: 'PUT', body: JSON.stringify(form) }); onSaved(); };
  const optionMembers = (position) => members.filter((member) => position === 'wali_kelas' ? member.role === 'wali_kelas' : member.role === 'murid');
  return <section className="tool-panel"><p className="eyebrow">STRUKTUR KELAS</p><h2>Susunan pengurus</h2><form className="tool-form" onSubmit={save}>{positions.map(([position, label]) => <label key={position}>{label}<select value={form[position] || ''} onChange={(event) => setForm({ ...form, [position]: event.target.value })}><option value="">Belum dipilih</option>{optionMembers(position).map((member, index) => <option value={member.id} key={getStableListKey(`structure-option-${position}`, member.id ?? member.username ?? member.nama_lengkap ?? member.nama, index)}>{member.nama_lengkap || member.nama}</option>)}</select></label>)}<button className="button primary" type="submit">Simpan struktur</button></form></section>;
}

function AnnouncementTools({ announcements, onSaved }) { const [form, setForm] = useState({ title: '', content: '', duration: '7', poster: null }); const [message, setMessage] = useState(''); const save = async (e) => { e.preventDefault(); setMessage(''); try { const data = new FormData(); data.append('title', form.title); data.append('content', form.content); data.append('duration', form.duration); if (form.poster) data.append('poster', form.poster); await api('announcements', { method: 'POST', body: data }); setForm({ title: '', content: '', duration: '7', poster: null }); setMessage('Pengumuman berhasil ditambahkan'); onSaved(); } catch (error) { setMessage(error.message); } }; const remove = async (id, title) => { if (!window.confirm(`Hapus pengumuman "${title}"?`)) return; try { await api(`announcements/${encodeURIComponent(id)}`, { method: 'DELETE' }); setMessage('Pengumuman berhasil dihapus'); onSaved(); } catch (error) { setMessage(error.message); } }; const isExpired = (announcement) => announcement.expires_at && new Date(announcement.expires_at) <= new Date(); return <section className="tool-panel"><p className="eyebrow">INFORMASI KELAS</p><h2>Pengumuman baru</h2><form className="tool-form" onSubmit={save}><input placeholder="Judul" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /><textarea placeholder="Isi pengumuman" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required /><label>Foto poster (opsional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setForm({ ...form, poster: e.target.files[0] || null })} /></label><select value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })}><option value="1">1 hari</option><option value="7">7 hari</option><option value="30">30 hari</option><option value="permanent">Permanen</option></select><button className="button primary">Terbitkan</button>{message && <small className={message.includes('berhasil') ? 'success' : 'error'}>{message}</small>}</form>{announcements?.length ? <div className="announcement-admin-list"><p className="eyebrow">DAFTAR PENGUMUMAN ({announcements.length})</p>{announcements.map((item, index) => <article className={`announcement-admin-card ${isExpired(item) ? 'is-expired' : ''}`} key={getStableListKey('ann-admin', item.id ?? index, index)}><div className="ann-admin-info"><h4>{item.title}</h4><p className="ann-admin-content">{item.content}</p><small>Dibuat: {item.created_at}{item.expires_at ? ' · Kadaluarsa: ' + item.expires_at : ' · Permanen'}</small></div><button className="button danger text-action" onClick={() => remove(item.id, item.title)}>Hapus</button></article>)}</div> : <p className="muted">Belum ada pengumuman.</p>}<p className="ann-desc">Klik "Hapus" untuk menghapus pengumuman. Pengumuman kadaluarsa ditandai dengan latar belakang yang berbeda.</p></section>; }

function GalleryTools({ onSaved }) { const [form, setForm] = useState({ title: '', description: '', foto: null }); const [message, setMessage] = useState(''); const save = async (e) => { e.preventDefault(); setMessage(''); try { if (!form.foto) { setMessage('Foto wajib dipilih'); return; } const data = new FormData(); data.append('title', form.title); data.append('description', form.description); data.append('foto', form.foto); await api('gallery', { method: 'POST', body: data }); setForm({ title: '', description: '', foto: null }); setMessage('Foto berhasil ditambahkan'); onSaved(); } catch (error) { setMessage(error.message); } }; return <section className="tool-panel"><p className="eyebrow">KENANGAN KELAS</p><h2>Tambah foto</h2><form className="tool-form" onSubmit={save}><input placeholder="Judul foto" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /><textarea placeholder="Keterangan" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setForm({ ...form, foto: e.target.files[0] || null })} required /><button className="button secondary">Simpan foto</button>{message && <small className={message.includes('berhasil') ? 'success' : 'error'}>{message}</small>}</form></section>; }

function App() {
  const [user, setUser] = useState(null);
  const [members, setMembers] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [classContent, setClassContent] = useState({ info: null, schedule: [] });
  const [structure, setStructure] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [view, setView] = useState('home');
  const [authView, setAuthView] = useState('login');
  const [authOpen, setAuthOpen] = useState(false);
  const [activeStructure, setActiveStructure] = useState(0);
  const [activePhoto, setActivePhoto] = useState(0);
  const [activeMember, setActiveMember] = useState(0);
  const [lightboxImage, setLightboxImage] = useState({ src: '', alt: '' });
  const [memberQuery, setMemberQuery] = useState('');
  const [registrationStatus, setRegistrationStatus] = useState({ count: 0, max: 30, remaining: 30, available: true });

  const canManage = ['developer', 'wali_kelas'].includes(user?.role);
  const isDeveloper = user?.role === 'developer';
  const filteredMembers = members.filter((member) => {
    if (!memberQuery.trim()) return true;
    const searchTarget = `${member.nama_lengkap || member.account_name || member.nama || ''} ${member.jabatan || ''} ${member.kelas || ''}`.toLowerCase();
    return searchTarget.includes(memberQuery.trim().toLowerCase());
  });
  const remainingSlots = Number.isFinite(registrationStatus?.remaining)
    ? Math.max(0, registrationStatus.remaining)
    : Math.max(0, (registrationStatus?.max ?? 30) - (registrationStatus?.count ?? 0));

  const loadMembers = async () => {
    const result = await api(canManage ? 'developer/members' : 'members');
    setMembers(result.members);
  };

  const load = async () => {
    const [announcementResult, classResult, structureResult, galleryResult, statusResult] = await Promise.all([
      api('announcements'),
      api('class-content'),
      api('class-structure'),
      api('gallery'),
      api('member-registration-status')
    ]);
    setAnnouncements(announcementResult.announcements);
    setClassContent({ info: classResult.info || null, schedule: normalizeSchedule(classResult.schedule || []) });
    setStructure(structureResult.structure || []);
    setPhotos(galleryResult.photos || []);
    setRegistrationStatus(statusResult || { count: 0, max: 30, remaining: 30, available: true });
    await loadMembers();
  };

  useEffect(() => {
    api('me').then((result) => { if (result.loggedIn) setUser(result.user); }).catch(() => {});
    load().catch(() => {});
  }, []);

  useEffect(() => { if (user) loadMembers().catch(() => {}); }, [user?.role]);

  useEffect(() => {
    if (structure.length < 2) return undefined;
    setActiveStructure(0);
    const rotation = window.setInterval(() => setActiveStructure((current) => (current + 1) % structure.length), 4200);
    return () => window.clearInterval(rotation);
  }, [structure]);

  useEffect(() => {
    if (photos.length < 2) return undefined;
    setActivePhoto(0);
    const rotation = window.setInterval(() => setActivePhoto((current) => (current + 1) % photos.length), 4800);
    return () => window.clearInterval(rotation);
  }, [photos]);

  useEffect(() => {
    if (members.length < 2) return undefined;
    setActiveMember(0);
    const rotation = window.setInterval(() => setActiveMember((current) => (current + 1) % members.length), 4000);
    return () => window.clearInterval(rotation);
  }, [members]);

  const logout = async () => { await api('logout', { method: 'POST' }); setUser(null); setView('home'); setAuthOpen(false); };
  const loginCompleted = (account) => { setUser(account); setAuthOpen(false); setView('home'); };
  const openLightbox = (src, alt) => setLightboxImage({ src, alt });

  return (
    <div className="app-shell">
      <header>
        <div>
          <span className="eyebrow">DIGITAL CLASSROOM</span>
          <h1>KELAS X TKJ<span className="accent">.</span></h1>
        </div>
        <nav>
          <button className="link-button" onClick={() => setView('home')}>Beranda</button>
          <button className="link-button" onClick={() => setView('members')}>Anggota</button>
          <button className="link-button" onClick={() => setView('gallery')}>Galeri</button>
          {user ? <><button className="link-button" onClick={() => setView('dashboard')}>Dashboard</button><button className="button secondary" onClick={logout}>Keluar</button></> : <button className="button primary" onClick={() => { setAuthView('login'); setAuthOpen(true); }}>Login</button>}
        </nav>
      </header>

      {view === 'home' && <main>
        <section className="hero">
          <div>
            <p className="eyebrow">Satu kelas, satu arah</p>
            <h2>Tempat bertumbuh, berbagi, dan bergerak bersama.</h2>
            <p>Informasi kelas, jadwal, pengumuman, galeri, dan profil seluruh anggota dalam satu ruang digital.</p>
            {user ? <p className="welcome">Masuk sebagai <strong>{user.nama}</strong> · {roleLabels[user.role]}</p> : <p className="guest-note">Mode pengunjung: informasi kelas, galeri, dan daftar anggota tersedia untuk semua.</p>}
            <div className="hero-actions"><button className="button primary" onClick={() => setView('members')}>Lihat anggota</button><button className="button secondary" onClick={() => setView('gallery')}>Buka galeri</button></div>
            <div className="hero-stats">
              <div className="stat-card">
                <span>Kuota anggota</span>
                <strong>{remainingSlots} tersisa</strong>
              </div>
              <div className="stat-card">
                <span>Total anggota</span>
                <strong>{members.length}</strong>
              </div>
              <div className="stat-card">
                <span>Galeri kelas</span>
                <strong>{photos.length} foto</strong>
              </div>
            </div>
          </div>
          <div className="hero-mark">X<br /><span>TKJ</span></div>
        </section>

        <section className="section structure-section">
          <div className="section-heading">
            <div><p className="eyebrow">CLASS STRUCTURE</p><h2>Struktur Kelas</h2></div>
            <span className="structure-status" aria-live="polite">{structure[activeStructure]?.position === 'wali_kelas' ? 'Pembina kelas' : 'Pengurus kelas'}</span>
          </div>
          {structure[activeStructure] && (
            <div key={structure[activeStructure].position} className="structure-feature">
              <div className="structure-feature-photo">
                {structure[activeStructure].photo_url ? (
                  <button type="button" className="image-button" onClick={() => openLightbox(structure[activeStructure].photo_url, structure[activeStructure].nama)}>
                    <img src={structure[activeStructure].photo_url} alt={structure[activeStructure].nama} />
                  </button>
                ) : (
                  <div className="structure-avatar">{structure[activeStructure].nama ? structure[activeStructure].nama.charAt(0).toUpperCase() : '?'}</div>
                )}
              </div>
              <div className="structure-feature-copy">
                <p className="eyebrow">{structure[activeStructure].position === 'wali_kelas' ? 'WALI KELAS' : structure[activeStructure].position.toUpperCase()}</p>
                <h3>{structure[activeStructure].nama || 'Belum dipilih'}</h3>
                <p>{structure[activeStructure].jabatan || (structure[activeStructure].position === 'wali_kelas' ? 'Wali Kelas' : 'Anggota Kelas')}</p>
                <small>{structure[activeStructure].kelas || 'X TKJ'}</small>
              </div>
            </div>
          )}
        </section>

        <section className="section home-gallery">
          <div className="section-heading">
            <div><p className="eyebrow">CLASS MEMORIES</p><h2>Galeri Kelas</h2></div>
            <button className="link-button" type="button" onClick={() => setView('gallery')}>Lihat semua</button>
          </div>
          {photos.length ? <>
            <div className="gallery-showcase">
              {photos.map((photo, index) => (
                <article className={`gallery-feature ${index === activePhoto ? 'is-active' : ''}`} key={getStableListKey('gallery-feature', photo.id ?? photo.title ?? index, index)} aria-hidden={index !== activePhoto}>
                  <button type="button" className="image-button" onClick={() => openLightbox(photo.photo_url, photo.title)}>
                    <img src={photo.photo_url} alt={photo.title} />
                  </button>
                  <div>
                    <p className="eyebrow">{photo.uploaded_by_name || 'Dokumentasi kelas'}</p>
                    <h3>{photo.title}</h3>
                    <p>{photo.description || 'Momen kebersamaan KELAS X TKJ.'}</p>
                  </div>
                </article>
              ))}
            </div>
            <div className="showcase-dots" aria-label="Navigasi galeri kelas">{photos.map((photo, index) => <button className={index === activePhoto ? 'is-active' : ''} key={getStableListKey('gallery-dot', photo.id ?? photo.title ?? index, index)} type="button" aria-label={`Tampilkan foto ${photo.title}`} aria-pressed={index === activePhoto} onClick={() => setActivePhoto(index)} />)}</div>
          </> : <p className="muted">Belum ada foto di galeri.</p>}
        </section>

        <section className="section member-spotlight">
          <div className="section-heading">
            <div><p className="eyebrow">CLASS DIRECTORY</p><h2>Profil Anggota</h2></div>
            <button className="link-button" type="button" onClick={() => setView('members')}>Lihat semua</button>
          </div>
          {members.length ? <>
            <div className="member-showcase">
              {members.map((member, index) => {
                const name = member.nama_lengkap || member.account_name || member.nama;
                return (
                  <article className={`member-feature ${index === activeMember ? 'is-active' : ''}`} key={getStableListKey('member-feature', member.id ?? member.username ?? member.nama_lengkap ?? member.nama, index)} aria-hidden={index !== activeMember}>
                    {member.photo_url ? (
                      <button type="button" className="image-button" onClick={() => openLightbox(member.photo_url, name)}>
                        <img src={member.photo_url} alt={name} />
                      </button>
                    ) : (
                      <div className="member-feature-avatar">{name.charAt(0).toUpperCase()}</div>
                    )}
                    <div className="member-feature-copy">
                      <p className="eyebrow">{member.jabatan || roleLabels[member.role] || 'Anggota Kelas'}</p>
                      <h3>{name}</h3>
                      <p>{member.kelas || 'X TKJ'}</p>
                      <small>{member.bio || 'Belum ada bio.'}</small>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="showcase-dots" aria-label="Navigasi profil anggota">{members.map((member, index) => <button className={index === activeMember ? 'is-active' : ''} key={getStableListKey('member-dot', member.id ?? member.username ?? member.nama_lengkap ?? member.nama, index)} type="button" aria-label={`Tampilkan profil ${member.nama_lengkap || member.nama}`} aria-pressed={index === activeMember} onClick={() => setActiveMember(index)} />)}</div>
          </> : <p className="muted">Belum ada profil anggota.</p>}
        </section>

        <section className="section">
          <div className="section-heading"><div><p className="eyebrow">CLASS UPDATES</p><h2>Pengumuman</h2></div></div>
          <div className="announcement-grid">{announcements.map((item, index) => <article className="announcement-card" key={getStableListKey('announcement-card', item.id ?? item.title ?? index, index)}><p className="eyebrow">{item.created_at}</p><h3>{item.title}</h3><p>{item.content}</p></article>)}</div>
          {!announcements.length && <p className="muted">Belum ada pengumuman.</p>}
        </section>

        <section className="section class-overview">
          <div>
            <p className="eyebrow">ABOUT THE CLASS</p>
            <h2>{classContent.info?.title || 'Satu Kelas, Satu Tim'}</h2>
            <p>{classContent.info?.content || 'Pusat informasi digital KELAS X TKJ.'}</p>
          </div>
          <div className="schedule-list">
            <p className="eyebrow">JADWAL KELAS</p>
            <h3>Jadwal Kelas</h3>
            {classContent.schedule.length ? classContent.schedule.map((item, index) => <div key={getStableListKey('schedule-row', item.day ?? item.subjects ?? index, index)}><strong>{item.day || 'Hari'}</strong><span>{item.subjects || 'Belum ada jadwal'}</span></div>) : <p className="muted">Belum ada jadwal kelas yang ditambahkan.</p>}
          </div>
        </section>
      </main>}

      {view === 'members' && <main className="page-section"><div className="section-heading"><div><p className="eyebrow">CLASS DIRECTORY</p><h2>Anggota Kelas</h2></div><span>{filteredMembers.length} dari {members.length} anggota</span></div><div className="members-toolbar"><label className="member-search"><span>Cari anggota</span><input type="search" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Nama, posis, kelas, jabatan..." /></label><div className="quota-pill">Kuota: {remainingSlots} slot tersisa</div></div><div className="members-grid">{filteredMembers.map((member, index) => <MemberCard key={getStableListKey('member-card', member.id ?? member.username ?? member.nama_lengkap ?? member.nama, index)} member={member} onOpenImage={openLightbox} />)}</div>{!filteredMembers.length && <p className="muted">Tidak ada anggota yang cocok dengan pencarian.</p>}</main>}
      {view === 'gallery' && <main className="page-section"><div className="section-heading"><div><p className="eyebrow">CLASS MEMORIES</p><h2>Galeri Kelas</h2></div></div><div className="gallery-grid">{photos.map((photo, index) => <article className="gallery-card" key={getStableListKey('gallery-card', photo.id ?? photo.title ?? index, index)}><button type="button" className="image-button" onClick={() => openLightbox(photo.photo_url, photo.title)}><img src={photo.photo_url} alt={photo.title} /></button><div><h3>{photo.title}</h3><p>{photo.description}</p><small>Diunggah oleh {photo.uploaded_by_name}</small>{canManage && <button className="text-action" onClick={async () => { await api(`gallery/${photo.id}`, { method: 'DELETE' }); load(); }}>Hapus</button>}</div></article>)}</div>{!photos.length && <p className="muted">Belum ada foto di galeri.</p>}</main>}
      {view === 'dashboard' && user && <main className="page-section dashboard-grid"><ProfilePanel user={user} onSaved={(name) => setUser({ ...user, nama: name })} onOpenImage={openLightbox} />{canManage && <AdminTools members={members} isDeveloper={isDeveloper} onSaved={load} onOpenImage={openLightbox} />}{canManage && <StructureTools structure={structure} members={members} onSaved={load} />}{canManage && <ContentTools content={classContent} onSaved={load} />}{canManage && <AnnouncementTools announcements={announcements} onSaved={load} />}{canManage && <GalleryTools onSaved={load} />}</main>}
      {authOpen && !user && <div className="login-overlay">{authView === 'login' ? <Login onLogin={loginCompleted} onRegister={() => setAuthView('register')} /> : <Register onClose={() => setAuthView('login')} />}</div>}
      {lightboxImage.src && <ImageLightbox src={lightboxImage.src} alt={lightboxImage.alt} onClose={() => setLightboxImage({ src: '', alt: '' })} />}
    </div>
  );
}

export default App;
