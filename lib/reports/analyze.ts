import {
  formatDate,
  getLocalDateKey,
  Project,
  Role,
  Task,
  TargetDetailTask,
  TargetTaskStatus,
  TeamType,
  teamTypeOptions,
  User,
} from "@/lib/domain";

export type DateRange = { from: string; to: string };

export type WorkloadStatus = "ringan" | "seimbang" | "berat" | "overload";

export type ReportMember = {
  id: string;
  nama: string;
  team: TeamType;
  role: Role;
  totalTargets: number;
  activeTargets: number;
  completed: number;
  overdue: number;
  completionRate: number;
  workloadStatus: WorkloadStatus;
};

export type ReportTeam = {
  team: TeamType;
  leaderName: string | null;
  memberCount: number;
  totalTargets: number;
  completed: number;
  active: number;
  overdue: number;
  completionRate: number;
  workloadStatus: WorkloadStatus;
  narrative: string;
};

export type ReportData = {
  range: DateRange;
  generatedAt: string;
  org: {
    totalTargets: number;
    completed: number;
    active: number;
    overdue: number;
    completionRate: number;
    teamCount: number;
    memberCount: number;
  };
  teams: ReportTeam[];
  members: ReportMember[];
  spotlights: {
    topPerformers: ReportMember[];
    overdueRisks: ReportMember[];
    overloadedMembers: ReportMember[];
  };
  orgNarrative: string;
  recommendations: string[];
};

const WORKLOAD_LABELS: Record<WorkloadStatus, string> = {
  ringan: "Beban kerja ringan",
  seimbang: "Beban kerja seimbang",
  berat: "Beban kerja berat",
  overload: "Overload",
};

function classifyWorkload(active: number, overdue: number): WorkloadStatus {
  if (active > 8 || overdue >= 4) return "overload";
  if (active >= 6 || overdue >= 2) return "berat";
  if (active >= 3) return "seimbang";
  return "ringan";
}

function classifyTeamWorkload(
  members: ReportMember[],
): WorkloadStatus {
  if (members.length === 0) return "ringan";
  const overloaded = members.filter((m) => m.workloadStatus === "overload").length;
  const heavy = members.filter((m) => m.workloadStatus === "berat").length;
  const overloadRatio = overloaded / members.length;
  const avgActive =
    members.reduce((sum, m) => sum + m.activeTargets, 0) / members.length;

  if (overloadRatio > 0.3) return "overload";
  if (overloaded + heavy > members.length / 2) return "berat";
  if (avgActive < 2) return "ringan";
  return "seimbang";
}

function isWithinRange(date: string | null, range: DateRange): boolean {
  if (!date) return false;
  return date >= range.from && date <= range.to;
}

function isTargetInPeriod(target: TargetDetailTask, range: DateRange): boolean {
  if (target.deadline && isWithinRange(target.deadline, range)) return true;
  if (target.mulai && target.mulai <= range.to && target.status !== "Selesai") return true;
  if (!target.deadline && !target.mulai) return true;
  return false;
}

function isCompleted(target: TargetDetailTask, completedTargetIds: Set<string>): boolean {
  return target.status === "Selesai" || completedTargetIds.has(target.id);
}

function getEffectiveStatus(
  target: TargetDetailTask,
  completedTargetIds: Set<string>,
): TargetTaskStatus {
  if (completedTargetIds.has(target.id)) return "Selesai";
  return target.status;
}

export function buildReport({
  projects,
  tasks,
  users,
  range,
}: {
  projects: Project[];
  tasks: Task[];
  users: User[];
  range: DateRange;
}): ReportData {
  const today = getLocalDateKey();
  const completedTargetIds = new Set(
    tasks
      .filter((t) => t.target_task_id && isWithinRange(t.tanggal, range))
      .map((t) => t.target_task_id as string),
  );

  const targetsInPeriod = projects.flatMap((project) =>
    project.target_detail_tugas
      .filter((target) => isTargetInPeriod(target, range))
      .map((target) => ({ project, target })),
  );

  type MemberAgg = {
    user: User;
    totalTargets: number;
    activeTargets: number;
    completed: number;
    overdue: number;
  };
  const memberAggs = new Map<string, MemberAgg>();
  for (const user of users) {
    memberAggs.set(user.id, {
      user,
      totalTargets: 0,
      activeTargets: 0,
      completed: 0,
      overdue: 0,
    });
  }

  for (const { target } of targetsInPeriod) {
    if (!target.assigned_user_id) continue;
    const agg = memberAggs.get(target.assigned_user_id);
    if (!agg) continue;
    agg.totalTargets += 1;
    const status = getEffectiveStatus(target, completedTargetIds);
    if (isCompleted(target, completedTargetIds)) {
      agg.completed += 1;
    } else if (status === "Dikerjakan" || status === "Belum Mulai" || status === "Koreksi") {
      agg.activeTargets += 1;
    }
    if (
      !isCompleted(target, completedTargetIds) &&
      target.deadline &&
      target.deadline < today
    ) {
      agg.overdue += 1;
    }
  }

  const members: ReportMember[] = Array.from(memberAggs.values())
    .filter((agg) => agg.totalTargets > 0)
    .map((agg) => {
      const completionRate = agg.totalTargets
        ? Math.round((agg.completed / agg.totalTargets) * 100)
        : 0;
      return {
        id: agg.user.id,
        nama: agg.user.nama,
        team: agg.user.team_type,
        role: agg.user.role,
        totalTargets: agg.totalTargets,
        activeTargets: agg.activeTargets,
        completed: agg.completed,
        overdue: agg.overdue,
        completionRate,
        workloadStatus: classifyWorkload(agg.activeTargets, agg.overdue),
      };
    })
    .sort((a, b) => b.completionRate - a.completionRate);

  const teams: ReportTeam[] = teamTypeOptions.map((team) => {
    const teamMembers = members.filter((m) => m.team === team);
    const teamUsers = users.filter((u) => u.team_type === team);
    const totalTargets = teamMembers.reduce((sum, m) => sum + m.totalTargets, 0);
    const completed = teamMembers.reduce((sum, m) => sum + m.completed, 0);
    const active = teamMembers.reduce((sum, m) => sum + m.activeTargets, 0);
    const overdue = teamMembers.reduce((sum, m) => sum + m.overdue, 0);
    const completionRate = totalTargets ? Math.round((completed / totalTargets) * 100) : 0;
    const leader = teamUsers.find((u) => u.role === "Leader");
    const workloadStatus = classifyTeamWorkload(teamMembers);

    const overdueNote =
      overdue > 0
        ? ` Sebanyak ${overdue} target sudah melewati deadline dan butuh tindak lanjut.`
        : " Tidak ada target overdue pada periode ini.";
    const workloadNote =
      workloadStatus === "overload"
        ? " Beberapa anggota terindikasi overload — pertimbangkan redistribusi."
        : workloadStatus === "berat"
          ? " Beban kerja tergolong berat; pantau ritme penyelesaian."
          : workloadStatus === "ringan"
            ? " Beban kerja relatif ringan; ada kapasitas untuk inisiatif tambahan."
            : " Distribusi tugas tergolong seimbang.";
    const leaderText = leader ? `dipimpin ${leader.nama}` : "belum memiliki Leader terdaftar";

    const narrative = totalTargets
      ? `Tim ${team} ${leaderText} dengan ${teamUsers.length} anggota mencatat completion ${completionRate}% (${completed} dari ${totalTargets} target).${overdueNote}${workloadNote}`
      : `Tim ${team} ${leaderText} belum memiliki target aktif pada periode ini.`;

    return {
      team,
      leaderName: leader?.nama ?? null,
      memberCount: teamUsers.length,
      totalTargets,
      completed,
      active,
      overdue,
      completionRate,
      workloadStatus,
      narrative,
    };
  });

  const orgTotal = teams.reduce((sum, t) => sum + t.totalTargets, 0);
  const orgCompleted = teams.reduce((sum, t) => sum + t.completed, 0);
  const orgActive = teams.reduce((sum, t) => sum + t.active, 0);
  const orgOverdue = teams.reduce((sum, t) => sum + t.overdue, 0);
  const orgCompletionRate = orgTotal ? Math.round((orgCompleted / orgTotal) * 100) : 0;
  const activeTeams = teams.filter((t) => t.totalTargets > 0);

  const sortedByCompletion = [...activeTeams].sort(
    (a, b) => b.completionRate - a.completionRate,
  );
  const topTeam = sortedByCompletion[0];
  const lowTeam = sortedByCompletion[sortedByCompletion.length - 1];

  const orgNarrativeParts: string[] = [];
  if (orgTotal === 0) {
    orgNarrativeParts.push(
      `Tidak ada target aktif pada periode ${formatDate(range.from)} sampai ${formatDate(range.to)}. Pertimbangkan memperluas rentang waktu atau memeriksa input data.`,
    );
  } else {
    orgNarrativeParts.push(
      `Pada periode ${formatDate(range.from)} sampai ${formatDate(range.to)}, organisasi mengelola ${orgTotal} target tugas lintas ${activeTeams.length} tim aktif. Tingkat penyelesaian agregat berada di ${orgCompletionRate}% dengan ${orgCompleted} target selesai, ${orgActive} masih dikerjakan, dan ${orgOverdue} target overdue.`,
    );
    if (topTeam && lowTeam && topTeam.team !== lowTeam.team) {
      orgNarrativeParts.push(
        `Tim ${topTeam.team} memimpin produktivitas dengan completion ${topTeam.completionRate}% (status beban: ${topTeam.workloadStatus}), sementara Tim ${lowTeam.team} mencatat ${lowTeam.completionRate}% (status beban: ${lowTeam.workloadStatus}). Kesenjangan ini menjadi sinyal area yang membutuhkan perhatian Manajemen.`,
      );
    } else if (topTeam) {
      orgNarrativeParts.push(
        `Tim ${topTeam.team} dengan completion ${topTeam.completionRate}% menjadi penggerak utama produktivitas pada periode ini.`,
      );
    }
    const overdueRatio = orgTotal ? Math.round((orgOverdue / orgTotal) * 100) : 0;
    if (overdueRatio > 30) {
      orgNarrativeParts.push(
        `Rasio overdue organisasi mencapai ${overdueRatio}% — di atas batas wajar 30%. Indikasi adanya tekanan deadline atau estimasi yang terlalu agresif yang perlu dievaluasi.`,
      );
    } else if (overdueRatio > 15) {
      orgNarrativeParts.push(
        `Rasio overdue ${overdueRatio}% masih dalam batas wajar namun perlu dipantau agar tidak meningkat pada periode berikutnya.`,
      );
    } else {
      orgNarrativeParts.push(
        `Rasio overdue ${overdueRatio}% menunjukkan disiplin deadline yang baik di tingkat organisasi.`,
      );
    }
  }
  const orgNarrative = orgNarrativeParts.join("\n\n");

  // Spotlights
  const topPerformers = members
    .filter((m) => m.completionRate >= 70 && m.totalTargets >= 2)
    .slice(0, 5);
  const overdueRisks = members
    .filter((m) => m.overdue >= 2)
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, 5);
  const overloadedMembers = members
    .filter((m) => m.workloadStatus === "overload" || m.workloadStatus === "berat")
    .sort((a, b) => b.activeTargets - a.activeTargets)
    .slice(0, 5);

  // Recommendations
  const recommendations: string[] = [];
  const overloadedTeams = activeTeams.filter((t) => t.workloadStatus === "overload");
  const lightTeams = activeTeams.filter((t) => t.workloadStatus === "ringan");
  if (overloadedTeams.length > 0 && lightTeams.length > 0) {
    recommendations.push(
      `Pertimbangkan redistribusi target dari ${overloadedTeams.map((t) => t.team).join(", ")} ke ${lightTeams.map((t) => t.team).join(", ")}. Tim penerima memiliki kapasitas yang belum terpakai optimal.`,
    );
  }
  if (orgOverdue > 0 && orgTotal > 0) {
    const overdueRatio = orgOverdue / orgTotal;
    if (overdueRatio > 0.3) {
      const teamWithMostOverdue = [...activeTeams].sort((a, b) => b.overdue - a.overdue)[0];
      if (teamWithMostOverdue) {
        recommendations.push(
          `Tinjau ulang estimasi deadline pada ${teamWithMostOverdue.team} — terdapat ${teamWithMostOverdue.overdue} target overdue, kontributor terbesar terhadap risiko deadline organisasi.`,
        );
      }
    }
  }
  for (const m of members) {
    if (m.completionRate < 30 && m.activeTargets >= 5) {
      recommendations.push(
        `Eskalasi blocker untuk ${m.nama} (${m.team}): completion ${m.completionRate}% dengan ${m.activeTargets} target aktif mengindikasikan hambatan eksekusi.`,
      );
      break;
    }
  }
  if (topPerformers.length > 0) {
    const star = topPerformers[0];
    recommendations.push(
      `Pertimbangkan ${star.nama} (${star.team}, completion ${star.completionRate}%) sebagai mentor atau lead pada inisiatif lintas-tim untuk transfer praktik terbaik.`,
    );
  }
  for (const team of teams) {
    if (team.memberCount > 0 && !team.leaderName) {
      recommendations.push(
        `Tim ${team.team} belum memiliki Leader terdaftar; tunjuk PIC untuk meningkatkan akuntabilitas dan koordinasi.`,
      );
    }
  }
  if (orgCompletionRate >= 80 && orgOverdue / Math.max(1, orgTotal) < 0.1) {
    recommendations.push(
      `Pertahankan ritme: completion ${orgCompletionRate}% dengan overdue rendah menandakan produktivitas sehat. Fokus pada konsistensi sprint berikutnya dan dokumentasi proses yang berhasil.`,
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      `Belum ada anomali signifikan yang membutuhkan intervensi pada periode ini. Lanjutkan monitoring rutin dan komunikasi reguler antar Leader.`,
    );
  }

  return {
    range,
    generatedAt: new Date().toISOString(),
    org: {
      totalTargets: orgTotal,
      completed: orgCompleted,
      active: orgActive,
      overdue: orgOverdue,
      completionRate: orgCompletionRate,
      teamCount: activeTeams.length,
      memberCount: members.length,
    },
    teams,
    members,
    spotlights: {
      topPerformers,
      overdueRisks,
      overloadedMembers,
    },
    orgNarrative,
    recommendations,
  };
}

export function workloadLabel(status: WorkloadStatus): string {
  return WORKLOAD_LABELS[status];
}

