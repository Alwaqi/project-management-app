import { z } from "zod";

const targetDetailTaskSchema = z.union([
  z.string().trim().min(1),
  z.object({
    deskripsi: z.string().trim().min(1, "Detail tugas wajib diisi"),
    mulai: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal mulai harus YYYY-MM-DD")
      .nullable()
      .optional(),
    deadline: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Deadline detail harus YYYY-MM-DD")
      .nullable()
      .optional(),
  }),
]);

export const projectCreateSchema = z.object({
  nama_proyek: z.string().trim().min(1, "Nama proyek wajib diisi"),
  status: z.enum(["Menunggu", "Berjalan", "Selesai"]).default("Berjalan"),
  target_tugas: z.coerce.number().int().min(1).default(8),
  target_detail_tugas: z.array(targetDetailTaskSchema).optional(),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Deadline harus YYYY-MM-DD")
    .nullable()
    .optional(),
});

export const projectUpdateSchema = projectCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Minimal satu field harus dikirim",
);

export const taskCreateSchema = z.object({
  project_id: z.string().trim().min(1, "Project ID wajib diisi"),
  target_task_id: z.string().trim().min(1, "Target task ID wajib diisi").optional(),
  user_id: z.string().trim().min(1, "User ID wajib diisi"),
  deskripsi: z.string().trim().min(1, "Deskripsi wajib diisi").optional(),
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus YYYY-MM-DD").optional(),
});

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
