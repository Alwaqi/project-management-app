export type Role = "Leader" | "Tim";
export type ProjectStatus = "Menunggu" | "Berjalan" | "Selesai";

export type User = {
  id: string;
  nama: string;
  email: string;
  role: Role;
};

export type Project = {
  id: string;
  nama_proyek: string;
  status: ProjectStatus;
  target_tugas: number;
  dibuat_pada: string;
};

export type Task = {
  id: string;
  project_id: string;
  user_id: string;
  deskripsi: string;
  tanggal: string;
};

export function getProjectProgress(project: Project, tasks: Task[]) {
  if (project.status === "Selesai") {
    return 100;
  }

  const completedTasks = tasks.filter((task) => task.project_id === project.id).length;
  return Math.min(100, Math.round((completedTasks / project.target_tugas) * 100));
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}
