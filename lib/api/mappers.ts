import { getProjectProgress, Project, Task, User } from "@/lib/domain";
import { ProjectRow, TaskRow } from "@/lib/db/schema";

export function toProjectDto(project: ProjectRow) {
  return {
    id: project.id,
    nama_proyek: project.namaProyek,
    status: project.status,
    target_tugas: project.targetTugas,
    dibuat_pada: toDateKey(project.createdAt),
  };
}

export function toTaskDto(task: TaskRow) {
  return {
    id: task.id,
    project_id: task.projectId,
    user_id: task.userId,
    deskripsi: task.deskripsi,
    tanggal: task.tanggal,
  };
}

export function toProjectWithProgress(project: Project, tasks: Task[]) {
  return {
    ...project,
    progress: getProjectProgress(project, tasks),
    total_tugas: tasks.filter((task) => task.project_id === project.id).length,
  };
}

export function getMemberPerformance(users: User[], projects: Project[], tasks: Task[]) {
  const projectStatusById = new Map(projects.map((project) => [project.id, project.status]));

  return users
    .map((user) => {
      const userTasks = tasks.filter((task) => task.user_id === user.id);
      const completed = userTasks.filter(
        (task) => projectStatusById.get(task.project_id) === "Selesai",
      ).length;
      const inProgress = userTasks.length - completed;

      return {
        id: user.id,
        nama: user.nama,
        email: user.email,
        role: user.role,
        dikerjakan: inProgress,
        selesai: completed,
        total: userTasks.length,
        rasio_selesai: userTasks.length ? Math.round((completed / userTasks.length) * 100) : 0,
      };
    })
    .filter((member) => member.total > 0);
}

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
