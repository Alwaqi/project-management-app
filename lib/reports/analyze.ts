import {
  formatDate,
  getLocalDateKey,
  Project,
  ProjectCategory,
  projectCategoryOptions,
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

export type ReportCategoryRow = {
  category: ProjectCategory;
  total: number;
  selesai: number;
  avgDurasiHari: number | null;
};

export type ReportClientRow = {
  client: string;
  total: number;
  selesai: number;
};

export type ReportSpeakerRow = {
  user_id: string;
  nama: string;
  team: TeamType | null;
  total: number;
};

export type ReportProjectDetail = {
  id: string;
  nama_proyek: string;
  category: ProjectCategory | null;
  client_nama: string | null;
  owner_team: TeamType;
  collaborator_teams: TeamType[];
  speaker_names: string[];
  status: Project["status"];
  dibuat_pada: string;
  tanggal_selesai: string | null;
  durasi_hari: number | null;
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
  byCategory: ReportCategoryRow[];
  byClient: ReportClientRow[];
  bySpeaker: ReportSpeakerRow[];
  projectsDetail: ReportProjectDetail[];
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

  // === Dimensi baru: kategori / client / pemateri / projects detail ===
  const userById = new Map(users.map((u) => [u.id, u] as const));

  const projectsInPeriod = projects.filter((p) => {
    // Project relevan kalau dibuat dalam range, atau diselesaikan dalam range,
    // atau ada target dalam range (sudah ditangani via targetsInPeriod).
    if (p.dibuat_pada && isWithinRange(p.dibuat_pada, range)) return true;
    if (
      p.status === "Selesai" &&
      p.diperbarui_pada &&
      isWithinRange(p.diperbarui_pada, range)
    ) {
      return true;
    }
    return p.target_detail_tugas.some((t) => isTargetInPeriod(t, range));
  });

  const projectsDetail: ReportProjectDetail[] = projectsInPeriod.map((p) => {
    const tanggalSelesai =
      p.status === "Selesai" ? p.diperbarui_pada ?? null : null;
    const endRef = tanggalSelesai ?? today;
    let durasiHari: number | null = null;
    if (p.dibuat_pada) {
      const start = new Date(`${p.dibuat_pada}T00:00:00`).getTime();
      const end = new Date(`${endRef}T00:00:00`).getTime();
      durasiHari = Math.max(1, Math.ceil((end - start) / 86_400_000) + 1);
    }
    const speakerNames = (p.speaker_user_ids ?? [])
      .map((id) => userById.get(id)?.nama)
      .filter((n): n is string => Boolean(n));
    return {
      id: p.id,
      nama_proyek: p.nama_proyek,
      category: p.category,
      client_nama: p.client_nama,
      owner_team: p.owner_team,
      collaborator_teams: p.collaborator_teams,
      speaker_names: speakerNames,
      status: p.status,
      dibuat_pada: p.dibuat_pada,
      tanggal_selesai: tanggalSelesai,
      durasi_hari: durasiHari,
    };
  });

  const byCategory: ReportCategoryRow[] = projectCategoryOptions.map((cat) => {
    const rows = projectsDetail.filter((p) => p.category === cat);
    const selesai = rows.filter((p) => p.status === "Selesai");
    const durations = selesai
      .map((p) => p.durasi_hari)
      .filter((d): d is number => typeof d === "number");
    const avg =
      durations.length > 0
        ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length)
        : null;
    return {
      category: cat,
      total: rows.length,
      selesai: selesai.length,
      avgDurasiHari: avg,
    };
  });

  const clientAgg = new Map<string, { total: number; selesai: number }>();
  for (const p of projectsDetail) {
    if (!p.client_nama) continue;
    const acc = clientAgg.get(p.client_nama) ?? { total: 0, selesai: 0 };
    acc.total += 1;
    if (p.status === "Selesai") acc.selesai += 1;
    clientAgg.set(p.client_nama, acc);
  }
  const byClient: ReportClientRow[] = Array.from(clientAgg.entries())
    .map(([clientName, agg]) => ({
      client: clientName,
      total: agg.total,
      selesai: agg.selesai,
    }))
    .sort((a, b) => b.total - a.total || a.client.localeCompare(b.client));

  const speakerAgg = new Map<string, number>();
  for (const p of projectsInPeriod) {
    for (const speakerId of p.speaker_user_ids ?? []) {
      speakerAgg.set(speakerId, (speakerAgg.get(speakerId) ?? 0) + 1);
    }
  }
  const bySpeaker: ReportSpeakerRow[] = Array.from(speakerAgg.entries())
    .map(([userId, total]) => {
      const u = userById.get(userId);
      return {
        user_id: userId,
        nama: u?.nama ?? "—",
        team: u?.team_type ?? null,
        total,
      };
    })
    .sort((a, b) => b.total - a.total || a.nama.localeCompare(b.nama));

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
    byCategory,
    byClient,
    bySpeaker,
    projectsDetail,
    orgNarrative,
    recommendations,
  };
}

export function workloadLabel(status: WorkloadStatus): string {
  return WORKLOAD_LABELS[status];
}

// ============================================================
// Member (personal) report
// ============================================================

export type MemberRole = "Anggota" | "Pemateri/Asesor" | "Keduanya";

export type MemberReportProject = {
  id: string;
  nama_proyek: string;
  category: ProjectCategory | null;
  role: MemberRole;
  targetTotal: number;
  targetCompleted: number;
  status: Project["status"];
};

export type MemberReportData = {
  range: DateRange;
  generatedAt: string;
  user: { id: string; nama: string; team: TeamType; role: Role };
  totalProjects: number;
  asSpeaker: number;
  asMember: number;
  byCategory: { category: ProjectCategory; total: number }[];
  totalTargets: number;
  completed: number;
  overdue: number;
  ongoing: number;
  completionRate: number;
  projects: MemberReportProject[];
  narrative: string;
};

export function buildMemberReport({
  userId,
  projects,
  tasks,
  users,
  range,
}: {
  userId: string;
  projects: Project[];
  tasks: Task[];
  users: User[];
  range: DateRange;
}): MemberReportData {
  const today = getLocalDateKey();
  const user = users.find((u) => u.id === userId);

  const completedByTargetId = new Set(
    tasks
      .filter((t) => t.target_task_id && isWithinRange(t.tanggal, range))
      .map((t) => t.target_task_id as string),
  );

  const memberProjects: MemberReportProject[] = [];
  let totalTargets = 0;
  let completed = 0;
  let overdue = 0;
  let ongoing = 0;
  let asSpeaker = 0;
  let asMember = 0;
  const categoryAgg = new Map<ProjectCategory, number>();

  for (const project of projects) {
    const isSpeaker = (project.speaker_user_ids ?? []).includes(userId);
    const userTargets = project.target_detail_tugas.filter(
      (t) => t.assigned_user_id === userId && isTargetInPeriod(t, range),
    );

    if (!isSpeaker && userTargets.length === 0) continue;

    if (isSpeaker) asSpeaker += 1;
    if (userTargets.length > 0) asMember += 1;

    if (project.category) {
      categoryAgg.set(
        project.category,
        (categoryAgg.get(project.category) ?? 0) + 1,
      );
    }

    let targetCompleted = 0;
    for (const t of userTargets) {
      totalTargets += 1;
      const done = isCompleted(t, completedByTargetId);
      if (done) {
        targetCompleted += 1;
        completed += 1;
      } else if (t.deadline && t.deadline < today) {
        overdue += 1;
      } else {
        ongoing += 1;
      }
    }

    const role: MemberRole =
      isSpeaker && userTargets.length > 0
        ? "Keduanya"
        : isSpeaker
          ? "Pemateri/Asesor"
          : "Anggota";

    memberProjects.push({
      id: project.id,
      nama_proyek: project.nama_proyek,
      category: project.category,
      role,
      targetTotal: userTargets.length,
      targetCompleted,
      status: project.status,
    });
  }

  const completionRate = totalTargets > 0
    ? Math.round((completed / totalTargets) * 100)
    : 0;

  const byCategory = Array.from(categoryAgg.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  const namaUser = user?.nama ?? "Anggota";
  const narrative = composeMemberNarrative({
    nama: namaUser,
    totalProjects: memberProjects.length,
    asSpeaker,
    byCategory,
    totalTargets,
    completed,
    overdue,
    ongoing,
    completionRate,
  });

  return {
    range,
    generatedAt: new Date().toISOString(),
    user: {
      id: userId,
      nama: namaUser,
      team: user?.team_type ?? "Tim Admin",
      role: user?.role ?? "Tim",
    },
    totalProjects: memberProjects.length,
    asSpeaker,
    asMember,
    byCategory,
    totalTargets,
    completed,
    overdue,
    ongoing,
    completionRate,
    projects: memberProjects.sort((a, b) => a.nama_proyek.localeCompare(b.nama_proyek)),
    narrative,
  };
}

export function composeMemberNarrative(data: {
  nama: string;
  totalProjects: number;
  asSpeaker: number;
  byCategory: { category: ProjectCategory; total: number }[];
  totalTargets: number;
  completed: number;
  overdue: number;
  ongoing: number;
  completionRate: number;
}): string {
  if (data.totalProjects === 0) {
    return `Selama periode ini, ${data.nama} belum terlibat di proyek aktif. Pantau penugasan baru dari Leader tim.`;
  }

  const speakerLine =
    data.asSpeaker > 0
      ? ` (${data.asSpeaker} di antaranya sebagai Pemateri/Asesor)`
      : "";

  const topCat = data.byCategory[0];
  const catLine = topCat
    ? ` Sebaran terbanyak di kategori ${topCat.category} (${topCat.total} proyek).`
    : "";

  const targetLine =
    data.totalTargets > 0
      ? ` Dari ${data.totalTargets} target yang ditugaskan, sudah selesai ${data.completed} (${data.completionRate}%), dengan ${data.overdue} terlambat dan ${data.ongoing} masih berjalan.`
      : ` Belum ada target spesifik yang ditugaskan ke ${data.nama} di periode ini.`;

  let closer: string;
  if (data.completionRate >= 80) {
    closer = " Pertahankan ritme, performa konsisten di atas standar.";
  } else if (data.completionRate >= 50) {
    closer = " Konsisten, dorong sisanya tepat waktu agar target periode tercapai.";
  } else if (data.totalTargets > 0) {
    closer = " Fokuskan beberapa target paling dekat deadline lebih dulu untuk menaikkan completion rate.";
  } else {
    closer = " Koordinasikan ulang dengan Leader untuk mendapatkan target periode berikutnya.";
  }

  return `Selama periode ini, ${data.nama} terlibat di ${data.totalProjects} proyek${speakerLine}.${catLine}${targetLine}${closer}`;
}

