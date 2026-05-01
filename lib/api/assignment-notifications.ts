import { inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { formatDate } from "@/lib/domain";

type AssignmentTarget = {
  assignedUserId: string | null;
  deskripsi: string;
  mulai: string | null;
  deadline: string | null;
};

export async function sendTargetAssignmentEmails({
  projectName,
  targets,
  assignedBy,
}: {
  projectName: string;
  targets: AssignmentTarget[];
  assignedBy: string;
}) {
  const assignedTargets = targets.filter(
    (target): target is AssignmentTarget & { assignedUserId: string } =>
      Boolean(target.assignedUserId),
  );

  if (assignedTargets.length === 0) {
    return;
  }

  const assignedUserIds = Array.from(
    new Set(assignedTargets.map((target) => target.assignedUserId)),
  );
  const assignedUsers = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
    })
    .from(user)
    .where(inArray(user.id, assignedUserIds));
  const usersById = new Map(assignedUsers.map((assignedUser) => [assignedUser.id, assignedUser]));

  const results = await Promise.allSettled(
    assignedTargets.map((target) => {
      const assignedUser = usersById.get(target.assignedUserId);

      if (!assignedUser) {
        return Promise.resolve();
      }

      const schedule = formatAssignmentSchedule(target.mulai, target.deadline);

      return sendEmail({
        to: assignedUser.email,
        subject: `Tugas baru di ProTrack SDK: ${projectName}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
            <h2 style="margin: 0 0 12px;">Tugas baru untuk ${escapeHtml(assignedUser.name)}</h2>
            <p>${escapeHtml(assignedBy)} menugaskan Anda pada proyek <strong>${escapeHtml(projectName)}</strong>.</p>
            <div style="margin: 16px 0; padding: 14px; border: 1px solid #e5e7eb; border-radius: 8px;">
              <p style="margin: 0 0 8px;"><strong>Detail tugas</strong></p>
              <p style="margin: 0;">${escapeHtml(target.deskripsi)}</p>
              <p style="margin: 10px 0 0; color: #4b5563;">${escapeHtml(schedule)}</p>
            </div>
            <p>Silakan buka ProTrack SDK untuk melihat dan memperbarui status tugas.</p>
          </div>
        `,
        text: [
          `Tugas baru untuk ${assignedUser.name}`,
          `${assignedBy} menugaskan Anda pada proyek ${projectName}.`,
          `Detail tugas: ${target.deskripsi}`,
          schedule,
          "Silakan buka ProTrack SDK untuk melihat dan memperbarui status tugas.",
        ].join("\n\n"),
      });
    }),
  );

  results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .forEach((result) => {
      console.error("Gagal mengirim email assignment", result.reason);
    });
}

function formatAssignmentSchedule(mulai: string | null, deadline: string | null) {
  if (mulai && deadline) {
    return `Jadwal: ${formatDate(mulai)} sampai ${formatDate(deadline)}`;
  }

  if (deadline) {
    return `Deadline: ${formatDate(deadline)}`;
  }

  if (mulai) {
    return `Mulai: ${formatDate(mulai)}`;
  }

  return "Jadwal belum ditentukan.";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
