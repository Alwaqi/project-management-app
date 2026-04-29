import { z } from "zod";

export const projectCreateSchema = z.object({
  nama_proyek: z.string().trim().min(1, "Nama proyek wajib diisi"),
  status: z.enum(["Menunggu", "Berjalan", "Selesai"]).default("Berjalan"),
  target_tugas: z.coerce.number().int().min(1).default(8),
});

export const projectUpdateSchema = projectCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Minimal satu field harus dikirim",
);

export const taskCreateSchema = z.object({
  project_id: z.string().trim().min(1, "Project ID wajib diisi"),
  user_id: z.string().trim().min(1, "User ID wajib diisi"),
  deskripsi: z.string().trim().min(1, "Deskripsi wajib diisi"),
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus YYYY-MM-DD").optional(),
});

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
