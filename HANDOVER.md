# ProTrack SDK Handover

Panduan ini untuk melanjutkan pengembangan ProTrack SDK di Claude Code atau agent coding lain.

## Ringkasan Proyek

ProTrack SDK adalah aplikasi Next.js untuk tracking proyek dan tugas tim.

- Repo GitHub: `Alwaqi/project-management-app`
- Project Vercel: `protrack-sdk`
- Production URL: `https://protrack-sdk.vercel.app`
- Framework: Next.js App Router
- Database: PostgreSQL
- ORM/migration: Drizzle
- Auth: Better Auth email/password dengan verifikasi email
- Email: Gmail SMTP via `nodemailer`

## Status Terakhir

Fitur yang sudah ada:

- Login/register email/password.
- Verifikasi email saat daftar.
- Role `Leader` dan `Tim`.
- Manajemen proyek dan detail target tugas.
- Assignment task ke anggota tim.
- Notifikasi email saat task baru di-assign.
- Dashboard semua role.
- Gantt Chart di dashboard.
- KPI Chart khusus role `Tim`.
- Menu Kanban semua role.
- Kanban Leader melihat semua target.
- Kanban Tim hanya melihat target yang assigned ke akun tersebut.
- Update status tugas dari Jurnal Tugas Harian dan Kanban.

## Struktur Penting

- `app/page.tsx`
  UI utama: auth screen, dashboard, project view, kanban, journal, Gantt, KPI, helper frontend.

- `app/api/projects/route.ts`
  API list dan create project. Create project juga memicu email assignment.

- `app/api/projects/[id]/route.ts`
  API detail, update, delete project. Update assignment juga memicu email.

- `app/api/tasks/route.ts`
  API list task, update status target, create/delete task journal.

- `app/api/dashboard/summary/route.ts`
  Summary dashboard untuk Leader.

- `lib/db/schema.ts`
  Drizzle PostgreSQL schema.

- `lib/db/index.ts`
  PostgreSQL client untuk runtime app.

- `drizzle/`
  Migration SQL dan metadata Drizzle.

- `lib/auth.ts`
  Better Auth config, email verification handler.

- `lib/email.ts`
  Email delivery helper. Prioritas SMTP Gmail, fallback Resend jika dikonfigurasi.

- `lib/api/assignment-notifications.ts`
  Template dan logic email notifikasi assignment.

- `lib/domain.ts`
  Type domain dan helper progress/date/status.

## Setup Lokal

Install dependency:

```bash
npm install
```

Siapkan `.env.local` dari `.env.example`:

```bash
cp .env.example .env.local
```

Environment utama:

```bash
DATABASE_URL="postgresql://project_manager:project_manager_password@localhost:55432/project_management"
BETTER_AUTH_SECRET="isi-secret-panjang"
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="jamagis1897@gmail.com"
SMTP_PASS="google-app-password"
EMAIL_FROM="ProTrack SDK <jamagis1897@gmail.com>"
```

Jalankan PostgreSQL lokal dengan Docker jika belum ada:

```bash
docker run --name project-management-postgres \
  -e POSTGRES_DB=project_management \
  -e POSTGRES_USER=project_manager \
  -e POSTGRES_PASSWORD=project_manager_password \
  -p 55432:5432 \
  -d postgres:16-alpine
```

Apply migration:

```bash
npm run db:migrate
```

Run dev server:

```bash
npm run dev
```

Buka:

```text
http://localhost:3000
```

## Database dan Migration

Schema source ada di:

```text
lib/db/schema.ts
```

Jika mengubah schema:

```bash
npm run db:generate
npm run db:migrate
```

Pastikan migration baru di folder `drizzle/` ikut di-commit.

Jangan kembali ke MySQL. Semua setup sekarang PostgreSQL untuk lokal dan Vercel.

## Email Verification dan SMTP

Register user memakai Better Auth dengan `requireEmailVerification: true`.

Flow email:

- `lib/auth.ts` memanggil `sendEmail()` untuk link verifikasi.
- `lib/api/assignment-notifications.ts` memanggil `sendEmail()` untuk notifikasi task assignment.
- `lib/email.ts` mengirim via SMTP jika `SMTP_USER` dan `SMTP_PASS` tersedia.

Untuk Gmail, `SMTP_PASS` harus Google App Password 16 karakter, bukan password Gmail biasa.

Jangan commit `.env.local`, `.env.production.local`, atau value secret apa pun.

## Role Behavior

Leader:

- Bisa membuat, edit, tutup, dan hapus proyek.
- Melihat semua proyek, semua task, dashboard summary, Gantt, Kanban.
- Kanban menampilkan semua target task.

Tim:

- Dashboard bisa dibuka.
- KPI Chart menampilkan target assigned ke user aktif.
- Gantt Chart menampilkan target assigned ke user aktif.
- Kanban hanya menampilkan target assigned ke user aktif.
- Journal hanya menampilkan proyek/target yang visible untuk user tersebut.

Catatan: helper role/filter ada di `app/page.tsx`:

- `getAssignedTargetDetails`
- `getKanbanTargetDetails`
- `getVisibleTargetDetails`
- `getCompletedTargetIds`
- `getEffectiveTargetStatus`

## Workflow Update Fitur

Sebelum edit:

```bash
git status --short --branch
```

Setelah edit:

```bash
npm run lint
npm run build
```

Jika mengubah database:

```bash
npm run db:generate
npm run db:migrate
```

Commit:

```bash
git add <file-yang-diubah>
git commit -m "Deskripsi perubahan"
git push origin main
```

## Redeploy Vercel

Vercel production bisa dideploy dari CLI:

```bash
npx vercel pull --yes --environment=production --scope team_iIegB6FZi6ISlVt9ezz1VRMF
npx vercel build --prod --scope team_iIegB6FZi6ISlVt9ezz1VRMF
npx vercel deploy --prebuilt --prod --scope team_iIegB6FZi6ISlVt9ezz1VRMF
```

Atau cukup push ke `main` jika GitHub Actions/Vercel workflow aktif.

Setelah deploy, cek health:

```bash
curl https://protrack-sdk.vercel.app/api/health
```

Expected:

```json
{"ok":true,"databaseConfigured":true}
```

## Vercel Environment Variables

Production env yang harus ada di Vercel:

```text
DATABASE_URL
BETTER_AUTH_SECRET
BETTER_AUTH_URL
NEXT_PUBLIC_APP_URL
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASS
EMAIL_FROM
```

Untuk production:

```text
BETTER_AUTH_URL=https://protrack-sdk.vercel.app
NEXT_PUBLIC_APP_URL=https://protrack-sdk.vercel.app
SMTP_USER=jamagis1897@gmail.com
EMAIL_FROM=ProTrack SDK <jamagis1897@gmail.com>
```

## Common Issues

Preview lokal kosong:

- Pastikan dev server jalan: `npm run dev`.
- Pastikan port `3000` tidak dipakai proses lain.
- Buka ulang `http://localhost:3000`.

Build error aneh dari `.next`:

- Matikan dev server.
- Hapus `.next`.
- Build ulang.

```bash
rm -rf .next
npm run build
```

Email tidak terkirim:

- Cek `SMTP_USER` dan `SMTP_PASS`.
- Pastikan `SMTP_PASS` adalah Google App Password.
- Test SMTP via helper kecil atau register user baru.
- Vercel harus redeploy setelah env berubah.

Database tidak terbaca:

- Cek `DATABASE_URL`.
- Jalankan `npm run db:migrate`.
- Cek `/api/health`.

## Catatan Keamanan

Jangan commit:

- `.env.local`
- `.env.production.local`
- `.vercel/.env.production.local`
- App password Gmail
- URL database production lengkap
- Token Vercel/GitHub

Sebelum commit, cek:

```bash
git status --short
git diff --cached
```

