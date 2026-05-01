export type Role = "Leader" | "Tim";
export type TeamType = "Tim Sales" | "Tim SE" | "Tim Admin" | "Tim Marketing dan Konten";
export type ProjectStatus = "Menunggu" | "Berjalan" | "Selesai";
export type TargetTaskStatus = "Belum Mulai" | "Dikerjakan" | "Koreksi" | "Selesai";

export const teamTypeOptions: TeamType[] = [
  "Tim Sales",
  "Tim SE",
  "Tim Admin",
  "Tim Marketing dan Konten",
];

export type TargetDetailTask = {
  id: string;
  deskripsi: string;
  assigned_user_id: string | null;
  status: TargetTaskStatus;
  mulai: string | null;
  deadline: string | null;
  urutan: number;
};

export type User = {
  id: string;
  nama: string;
  email: string;
  role: Role;
  team_type: TeamType;
};

export type Project = {
  id: string;
  nama_proyek: string;
  status: ProjectStatus;
  target_tugas: number;
  target_detail_tugas: TargetDetailTask[];
  deadline: string | null;
  dibuat_pada: string;
};

export type Task = {
  id: string;
  project_id: string;
  target_task_id: string | null;
  user_id: string;
  deskripsi: string;
  tanggal: string;
};

export function getProjectProgress(project: Project, tasks: Task[]) {
  if (project.status === "Selesai") {
    return 100;
  }

  const completedTasks = getProjectCompletedTaskCount(project, tasks);
  return Math.min(100, Math.round((completedTasks / getProjectTargetCount(project)) * 100));
}

export function getProjectTargetCount(project: Project) {
  return Math.max(1, project.target_detail_tugas.length || project.target_tugas);
}

export function getProjectCompletedTaskCount(project: Project, tasks: Task[]) {
  const projectTasks = tasks.filter((task) => task.project_id === project.id);

  if (project.target_detail_tugas.length === 0) {
    return projectTasks.length;
  }

  const targetIds = new Set(project.target_detail_tugas.map((target) => target.id));
  const completedTargetIds = new Set(
    projectTasks
      .map((task) => task.target_task_id)
      .filter((targetTaskId): targetTaskId is string => Boolean(targetTaskId)),
  );
  const statusCompletedTargetIds = new Set(
    project.target_detail_tugas
      .filter((target) => target.status === "Selesai")
      .map((target) => target.id),
  );
  const completedIds = new Set([...completedTargetIds, ...statusCompletedTargetIds]);

  return Array.from(completedIds).filter((targetTaskId) => targetIds.has(targetTaskId))
    .length;
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function isProjectOverdue(project: Project, today = getLocalDateKey()) {
  return Boolean(project.deadline && project.status !== "Selesai" && project.deadline < today);
}

export function getDaysUntilDeadline(deadline: string, today = getLocalDateKey()) {
  const deadlineDate = new Date(`${deadline}T00:00:00`);
  const todayDate = new Date(`${today}T00:00:00`);
  const diffMs = deadlineDate.getTime() - todayDate.getTime();

  return Math.ceil(diffMs / 86_400_000);
}

export function getTaskPlannedDuration(target: TargetDetailTask) {
  if (!target.mulai || !target.deadline) {
    return null;
  }

  return Math.max(1, getDaysBetween(target.mulai, target.deadline) + 1);
}

export function getTargetCompletionDuration(target: TargetDetailTask, tasks: Task[]) {
  if (!target.mulai) {
    return null;
  }

  const completedTask = tasks.find((task) => task.target_task_id === target.id);

  if (!completedTask) {
    return null;
  }

  return Math.max(1, getDaysBetween(target.mulai, completedTask.tanggal) + 1);
}

function getDaysBetween(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  return Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
}

export function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
