import {
  getProjectCompletedTaskCount,
  getProjectProgress,
  Project,
  Task,
  User,
} from "@/lib/domain";
import { ProjectRow, ProjectTargetTaskRow, TaskRow } from "@/lib/db/schema";

export function toProjectDto(project: ProjectRow, targetTasks: ProjectTargetTaskRow[] = []) {
  return {
    id: project.id,
    nama_proyek: project.namaProyek,
    status: project.status,
    target_tugas: targetTasks.length || project.targetTugas,
    target_detail_tugas: targetTasks
      .slice()
      .sort((first, second) => first.urutan - second.urutan)
      .map((targetTask) => ({
        id: targetTask.id,
        deskripsi: targetTask.deskripsi,
        assigned_user_id: targetTask.assignedUserId,
        status: targetTask.status,
        mulai: targetTask.mulai,
        deadline: targetTask.deadline,
        urutan: targetTask.urutan,
      })),
    deadline: project.deadline,
    dibuat_pada: toDateKey(project.createdAt),
  };
}

export function groupTargetTasksByProject(targetTasks: ProjectTargetTaskRow[]) {
  return targetTasks.reduce<Map<string, ProjectTargetTaskRow[]>>((groups, targetTask) => {
    const group = groups.get(targetTask.projectId) ?? [];
    group.push(targetTask);
    groups.set(targetTask.projectId, group);

    return groups;
  }, new Map());
}

export function toTaskDto(task: TaskRow) {
  return {
    id: task.id,
    project_id: task.projectId,
    target_task_id: task.targetTaskId,
    user_id: task.userId,
    deskripsi: task.deskripsi,
    tanggal: task.tanggal,
  };
}

export function toProjectWithProgress(project: Project, tasks: Task[]) {
  return {
    ...project,
    progress: getProjectProgress(project, tasks),
    total_tugas: getProjectCompletedTaskCount(project, tasks),
  };
}

export function getMemberPerformance(users: User[], projects: Project[], tasks: Task[]) {
  const completionByTargetId = new Map(
    tasks
      .filter((task) => task.target_task_id)
      .map((task) => [task.target_task_id as string, task]),
  );

  return users
    .map((user) => {
      const userTargetTasks = projects.flatMap((project) =>
        project.target_detail_tugas.filter((target) => {
          const completedTask = completionByTargetId.get(target.id);
          const ownerId = target.assigned_user_id ?? completedTask?.user_id;

          return ownerId === user.id;
        }),
      );
      const completed = userTargetTasks.filter(
        (target) => target.status === "Selesai" || completionByTargetId.has(target.id),
      ).length;
      const inProgress = userTargetTasks.length - completed;

      return {
        id: user.id,
        nama: user.nama,
        email: user.email,
        role: user.role,
        team_type: user.team_type,
        dikerjakan: inProgress,
        selesai: completed,
        total: userTargetTasks.length,
        rasio_selesai: userTargetTasks.length
          ? Math.round((completed / userTargetTasks.length) * 100)
          : 0,
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
