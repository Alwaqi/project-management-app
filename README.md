# Ruang Kerja Proyek

Frontend dan backend Next.js untuk aplikasi manajemen proyek ringan dari PRD.

## Backend Setup

1. Buat `.env.local` dari contoh:

```bash
cp .env.example .env.local
```

2. Isi `DATABASE_URL`, `BETTER_AUTH_SECRET`, dan `BETTER_AUTH_URL`.

Format database memakai PostgreSQL untuk lokal dan Vercel:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
```

Untuk Docker lokal:

```bash
docker run --name project-management-postgres \
  -e POSTGRES_DB=project_management \
  -e POSTGRES_USER=project_manager \
  -e POSTGRES_PASSWORD=project_manager_password \
  -p 55432:5432 \
  -d postgres:16-alpine
```

Contoh `DATABASE_URL` lokal:

```bash
DATABASE_URL="postgresql://project_manager:project_manager_password@localhost:55432/project_management"
```

3. Jalankan migration PostgreSQL:

```bash
npm run db:migrate
```

4. Buka Drizzle Studio:

```bash
npm run db:studio
```

Drizzle Studio berjalan di port `4983`.

## Vercel Deploy

Project production berjalan di Vercel. Pastikan environment production di Vercel berisi:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
BETTER_AUTH_URL="https://protrack-sdk.vercel.app"
NEXT_PUBLIC_APP_URL="https://protrack-sdk.vercel.app"
```

## Email Register

Auth utama memakai register email/password dengan verifikasi email. Pengiriman email
utama memakai Gmail SMTP / Google App Password:

```bash
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="your-gmail@gmail.com"
SMTP_PASS="your-google-app-password"
EMAIL_FROM="ProTrack SDK <your-gmail@gmail.com>"
```

Email yang dikirim:

- Link verifikasi akun saat user daftar atau login sebelum email terverifikasi.
- Notifikasi ke anggota tim saat Leader membuat tugas target baru atau mengganti assignment tugas ke user tersebut.

`RESEND_API_KEY` masih bisa dipakai sebagai fallback lama jika SMTP belum dikonfigurasi.

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
