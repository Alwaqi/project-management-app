# Ruang Kerja Proyek

Frontend dan backend Next.js untuk aplikasi manajemen proyek ringan dari PRD.

## Backend Setup

1. Buat `.env.local` dari contoh:

```bash
cp .env.example .env.local
```

2. Isi `DATABASE_URL`, `BETTER_AUTH_SECRET`, dan `BETTER_AUTH_URL`.

Untuk Docker lokal yang digunakan di project ini:

```bash
docker run --name project-management-postgres \
  -e POSTGRES_DB=project_management \
  -e POSTGRES_USER=project_manager \
  -e POSTGRES_PASSWORD=project_manager_password \
  -p 55432:5432 \
  -d postgres:16-alpine
```

3. Jalankan migration Postgres:

```bash
npm run db:migrate
```

4. Buka Drizzle Studio:

```bash
npm run db:studio
```

Drizzle Studio berjalan di port `4983`.

## Email Register

Auth utama memakai register email/password tanpa verifikasi email. Akun baru langsung bisa dipakai setelah pendaftaran berhasil.

```bash
npm run dev
```

## API Routes

- `GET /api/health`
- `GET /api/users`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`
- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/dashboard/summary`
- `GET|POST /api/auth/[...all]`

Jika `DATABASE_URL` belum dikonfigurasi, route database akan mengembalikan `503` dengan pesan setup.
