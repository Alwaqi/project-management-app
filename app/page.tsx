"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FolderKanban,
  MailCheck,
  LayoutDashboard,
  ListChecks,
  LogOut,
  PenLine,
  Plus,
  Save,
  Trash2,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authClient } from "@/lib/auth-client";
import {
  formatDate,
  getDaysUntilDeadline,
  getProjectProgress,
  getProjectTargetCount,
  getTaskPlannedDuration,
  isProjectOverdue,
  Project,
  ProjectStatus,
  Role,
  TargetTaskStatus,
  Task,
  User,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

type View = "dashboard" | "projects" | "journal";
type AuthMode = "login" | "register";

type ProjectWithProgress = Project & {
  progress: number;
  total_tugas: number;
};

type TargetDraft = {
  id: string;
  deskripsi: string;
  assigned_user_id: string;
  status: TargetTaskStatus;
  mulai: string;
  deadline: string;
};

type DashboardSummary = {
  metrics: {
    proyek_berjalan: number;
    tugas_hari_ini: number;
    rata_rata_progress: number;
    proyek_selesai: number;
    proyek_overdue: number;
    deadline_minggu_ini: number;
  };
  projects: ProjectWithProgress[];
  memberPerformance: Array<{
    id: string;
    nama: string;
    email: string;
    role: Role;
    dikerjakan: number;
    selesai: number;
    total: number;
    rasio_selesai: number;
  }>;
  deadlineTracking: {
    overdueProjects: ProjectWithProgress[];
    dueSoonProjects: ProjectWithProgress[];
    withoutDeadline: number;
  };
  recentTasks: Task[];
};

const statusVariant: Record<ProjectStatus, "secondary" | "success" | "warning"> = {
  Menunggu: "warning",
  Berjalan: "secondary",
  Selesai: "success",
};

const navItems = [
  { id: "dashboard" as const, label: "Dasbor", icon: LayoutDashboard },
  { id: "projects" as const, label: "Proyek", icon: FolderKanban },
  { id: "journal" as const, label: "Tugas Harian", icon: ClipboardList },
];

export default function Home() {
  const session = authClient.useSession();
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<ProjectWithProgress[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  const loadWorkspace = useCallback(
    async (sessionEmail?: string) => {
      setIsLoadingData(true);

      try {
        const usersResponse = await fetchJson<User[]>("/api/users");
        const email = sessionEmail ?? session.data?.user?.email;
        const currentUser = usersResponse.find((user) => user.email === email);
        const [projectsResponse, tasksResponse, summaryResponse] = await Promise.all([
          fetchJson<ProjectWithProgress[]>("/api/projects"),
          fetchJson<Task[]>("/api/tasks"),
          currentUser?.role === "Leader"
            ? fetchJson<DashboardSummary>("/api/dashboard/summary")
            : Promise.resolve(null),
        ]);

        setUsers(usersResponse);
        setProjects(projectsResponse);
        setTasks(tasksResponse);
        setDashboardSummary(summaryResponse);

        if (currentUser) {
          setActiveUser(currentUser);
          setActiveView((currentView) =>
            currentUser.role === "Tim" && currentView === "dashboard" ? "journal" : currentView,
          );
        }

        return currentUser;
      } catch (error) {
        showToast(getErrorMessage(error));
        return null;
      } finally {
        setIsLoadingData(false);
      }
    },
    [session.data?.user?.email],
  );

  useEffect(() => {
    if (session.isPending) {
      return;
    }

    if (!session.data?.user) {
      setActiveUser(null);
      setUsers([]);
      setProjects([]);
      setTasks([]);
      setDashboardSummary(null);
      return;
    }

    void loadWorkspace(session.data.user.email);
  }, [loadWorkspace, session.data?.user, session.isPending]);

  const handleLogin = async (email: string, password: string) => {
    const { error } = await authClient.signIn.email({
      email,
      password,
    });

    if (error) {
      throw new Error(getAuthErrorMessage(error.message));
    }

    authClient.$store.notify("$sessionSignal");
    await session.refetch({ query: { disableCookieCache: true } });
    const loggedInUser = await loadWorkspace(email);
    setActiveView((loggedInUser?.role ?? "Tim") === "Leader" ? "dashboard" : "journal");
    showToast("Berhasil masuk ke ruang kerja.");
  };

  const handleRegister = async (name: string, email: string, password: string, role: Role) => {
    const { error: signUpError } = await authClient.signUp.email({
      name,
      email,
      password,
      role,
    });

    if (signUpError) {
      throw new Error(getAuthErrorMessage(signUpError.message));
    }

    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    });

    if (signInError) {
      throw new Error(getAuthErrorMessage(signInError.message));
    }

    authClient.$store.notify("$sessionSignal");
    await session.refetch({ query: { disableCookieCache: true } });
    const registeredUser = await loadWorkspace(email);
    setActiveView((registeredUser?.role ?? role) === "Leader" ? "dashboard" : "journal");
    showToast("Akun berhasil dibuat.");
  };

  const handleLogout = async () => {
    const { error } = await authClient.signOut();

    if (error) {
      showToast(getAuthErrorMessage(error.message));
      return;
    }

    authClient.$store.notify("$sessionSignal");
    await session.refetch({ query: { disableCookieCache: true } });
    setActiveUser(null);
    setUsers([]);
    setProjects([]);
    setTasks([]);
    setDashboardSummary(null);
    setActiveView("dashboard");
    showToast("");
  };

  if (session.isPending) {
    return <LoadingScreen message="Memeriksa sesi login..." />;
  }

  if (!activeUser) {
    return <LoginScreen onLogin={handleLogin} onRegister={handleRegister} />;
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-background">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b bg-card lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col gap-6 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border bg-white">
                <Image
                  src="/logo-sdk.png"
                  alt="Logo SDK"
                  width={40}
                  height={40}
                  className="h-full w-full object-contain p-1"
                />
              </div>
              <div>
                <p className="text-sm font-semibold">ProTrack SDK</p>
                <p className="text-xs text-muted-foreground">Project tracking tim SDK</p>
              </div>
            </div>

            <nav className="grid gap-1 sm:grid-cols-3 lg:grid-cols-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isDisabled = activeUser.role === "Tim" && item.id === "dashboard";

                return (
                  <Button
                    key={item.id}
                    type="button"
                    variant={activeView === item.id ? "secondary" : "ghost"}
                    className="justify-start gap-2"
                    disabled={isDisabled}
                    onClick={() => setActiveView(item.id)}
                    title={isDisabled ? "Khusus Leader" : item.label}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                  </Button>
                );
              })}
            </nav>

            <div className="mt-auto rounded-lg border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{activeUser.nama}</p>
                  <p className="break-all text-xs text-muted-foreground">{activeUser.email}</p>
                </div>
                <Badge variant={activeUser.role === "Leader" ? "default" : "outline"}>
                  {activeUser.role}
                </Badge>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 w-full gap-2"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Keluar
              </Button>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          {activeView === "dashboard" && (
            <DashboardView
              projects={projects}
              tasks={tasks}
              users={users}
              summary={dashboardSummary}
              isLoading={isLoadingData}
            />
          )}
          {activeView === "projects" && (
            <ProjectView
              activeUser={activeUser}
              projects={projects}
              tasks={tasks}
              users={users}
              onCreateProject={(project) => {
                void createProject(project, loadWorkspace, showToast);
              }}
              onUpdateProject={(updatedProject) => {
                void updateProject(updatedProject, loadWorkspace, showToast);
              }}
              onCloseProject={(projectId) => {
                void closeProject(projectId, loadWorkspace, showToast);
              }}
              onDeleteProject={(project) => {
                void deleteProject(project, loadWorkspace, showToast);
              }}
            />
          )}
          {activeView === "journal" && (
            <JournalView
              activeUser={activeUser}
              projects={projects}
              tasks={tasks}
              users={users}
              onUpdateTaskStatus={(projectId, targetTaskId, status) => {
                void updateTaskStatus(projectId, targetTaskId, status, loadWorkspace, showToast);
              }}
            />
          )}
        </section>
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm shadow-lg">
          <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
          {toast}
        </div>
      )}
    </main>
  );
}

function LoginScreen({
  onLogin,
  onRegister,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (name: string, email: string, password: string, role: Role) => Promise<void>;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("Tim");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      if (mode === "register") {
        await onRegister(name, email, password, role);
      } else {
        await onLogin(email, password);
      }
    } catch (loginError) {
      setError(getErrorMessage(loginError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border bg-white">
            <Image
              src="/logo-sdk.png"
              alt="Logo SDK"
              width={48}
              height={48}
              className="h-full w-full object-contain p-1"
            />
          </div>
          <CardTitle className="text-xl">Masuk ke ProTrack SDK</CardTitle>
          <CardDescription>
            Daftar memakai email dan password, lalu langsung masuk ke ruang kerja tim.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-md bg-muted p-1">
            <Button
              type="button"
              variant={mode === "login" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => {
                setMode("login");
                setError("");
                setNotice("");
              }}
            >
              Masuk
            </Button>
            <Button
              type="button"
              variant={mode === "register" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => {
                setMode("register");
                setError("");
                setNotice("");
              }}
            >
              Daftar
            </Button>
          </div>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            {mode === "register" && (
              <div className="grid gap-2">
                <Label htmlFor="name">Nama lengkap</Label>
                <Input
                  id="name"
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="email">Email aktif</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {mode === "register" && (
              <div className="grid gap-2">
                <Label>Role awal</Label>
                <Select value={role} onValueChange={(value) => setRole(value as Role)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Tim">Anggota Tim</SelectItem>
                    <SelectItem value="Leader">Leader</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {notice && (
              <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
                {notice}
              </div>
            )}
            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <Button type="submit" className="gap-2" disabled={isSubmitting}>
              <MailCheck className="h-4 w-4" aria-hidden="true" />
              {isSubmitting ? "Memproses..." : mode === "register" ? "Daftar" : "Masuk"}
            </Button>
          </form>
          <div className="mt-5 grid gap-2 rounded-md border bg-muted/45 p-3 text-xs text-muted-foreground">
            <p>Akun baru langsung aktif setelah pendaftaran berhasil.</p>
            <p>Password minimal 8 karakter.</p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          {message}
        </CardContent>
      </Card>
    </main>
  );
}

function DashboardView({
  projects,
  tasks,
  users,
  summary,
  isLoading,
}: {
  projects: ProjectWithProgress[];
  tasks: Task[];
  users: User[];
  summary: DashboardSummary | null;
  isLoading: boolean;
}) {
  const activeProjects = projects.filter((project) => project.status === "Berjalan");
  const completedProjects = projects.filter((project) => project.status === "Selesai");
  const today = getLocalDateKey();
  const todayTasks = tasks.filter((task) => task.tanggal === today);
  const overdueProjects =
    summary?.deadlineTracking.overdueProjects ??
    projects.filter((project) => isProjectOverdue(project, today));
  const dueSoonProjects =
    summary?.deadlineTracking.dueSoonProjects ??
    projects.filter((project) => {
      if (!project.deadline || project.status === "Selesai" || isProjectOverdue(project, today)) {
        return false;
      }

      const daysLeft = getDaysUntilDeadline(project.deadline, today);
      return daysLeft >= 0 && daysLeft <= 7;
    });
  const withoutDeadline =
    summary?.deadlineTracking.withoutDeadline ??
    projects.filter((project) => !project.deadline && project.status !== "Selesai").length;
  const onTrackProjects = projects.filter((project) => {
    if (!project.deadline || project.status === "Selesai") {
      return false;
    }

    return !isProjectOverdue(project, today) && getDaysUntilDeadline(project.deadline, today) > 7;
  });
  const memberPerformance = useMemo(
    () =>
      summary?.memberPerformance.map((member) => ({
        ...member,
        completed: member.selesai,
        inProgress: member.dikerjakan,
        completionRate: member.rasio_selesai,
      })) ?? getMemberPerformance(users, projects, tasks),
    [projects, summary?.memberPerformance, tasks, users],
  );
  const averageProgress = projects.length
    ? Math.round(
        projects.reduce((sum, project) => sum + (project.progress ?? getProjectProgress(project, tasks)), 0) /
          projects.length,
      )
    : 0;
  const metrics = summary?.metrics;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Dasbor Progress"
        description={
          isLoading
            ? "Memuat data terbaru dari database..."
            : "Pantau status proyek, aktivitas harian, dan persentase kemajuan tim."
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard label="Proyek Berjalan" value={metrics?.proyek_berjalan ?? activeProjects.length} icon={FolderKanban} />
        <MetricCard label="Tugas Hari Ini" value={metrics?.tugas_hari_ini ?? todayTasks.length} icon={ClipboardList} />
        <MetricCard label="Rata-rata Progress" value={`${metrics?.rata_rata_progress ?? averageProgress}%`} icon={BarChart3} />
        <MetricCard label="Proyek Selesai" value={metrics?.proyek_selesai ?? completedProjects.length} icon={CheckCircle2} />
        <MetricCard label="Proyek Overdue" value={metrics?.proyek_overdue ?? overdueProjects.length} icon={AlertTriangle} />
        <MetricCard label="Deadline 7 Hari" value={metrics?.deadline_minggu_ini ?? dueSoonProjects.length} icon={CalendarClock} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
        <DeadlineRiskChart
          overdueCount={overdueProjects.length}
          dueSoonCount={dueSoonProjects.length}
          onTrackCount={onTrackProjects.length}
          withoutDeadlineCount={withoutDeadline}
        />
        <DeadlineWatchlist
          projects={[...overdueProjects, ...dueSoonProjects, ...onTrackProjects].slice(0, 6)}
          today={today}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Kinerja Per Anggota</CardTitle>
              <CardDescription>
                Ringkasan jumlah pekerjaan yang sedang dikerjakan dan sudah selesai per orang.
              </CardDescription>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
              <Users className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Anggota</TableHead>
                <TableHead className="text-right">Dikerjakan</TableHead>
                <TableHead className="text-right">Selesai</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Rasio selesai</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {memberPerformance.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="min-w-52">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-semibold text-secondary-foreground">
                        {getInitials(member.nama)}
                      </div>
                      <div>
                        <p className="font-medium">{member.nama}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{member.inProgress}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">
                    {member.completed}
                  </TableCell>
                  <TableCell className="text-right">{member.total}</TableCell>
                  <TableCell className="min-w-48">
                    <div className="flex items-center gap-3">
                      <Progress value={member.completionRate} />
                      <span className="w-12 text-right text-xs font-semibold">
                        {member.completionRate}%
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Progress Proyek</CardTitle>
            <CardDescription>Persentase dihitung dari jumlah tugas selesai terhadap target.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {projects.map((project) => {
              const progress = project.progress ?? getProjectProgress(project, tasks);
              return (
                <div key={project.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium">{project.nama_proyek}</p>
                      <p className="text-sm text-muted-foreground">
                        {project.total_tugas ?? tasks.filter((task) => task.project_id === project.id).length} dari{" "}
                        {getProjectTargetCount(project)} tugas target
                      </p>
                      {project.target_detail_tugas.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {project.target_detail_tugas
                            .slice(0, 2)
                            .map((item) => item.deskripsi)
                            .join(", ")}
                          {project.target_detail_tugas.length > 2 ? "..." : ""}
                        </p>
                      )}
                      {project.deadline && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Deadline {formatDate(project.deadline)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {project.deadline && project.status !== "Selesai" && (
                        <DeadlineBadge project={project} today={today} />
                      )}
                      <Badge variant={statusVariant[project.status]}>{project.status}</Badge>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <Progress value={progress} />
                    <span className="w-12 text-right text-sm font-semibold">{progress}%</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Update Terbaru</CardTitle>
            <CardDescription>Catatan kerja terbaru dari anggota tim.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {(summary?.recentTasks ?? tasks).slice(0, 5).map((task) => (
              <ActivityItem key={task.id} task={task} projects={projects} users={users} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProjectView({
  activeUser,
  projects,
  tasks,
  users,
  onCreateProject,
  onUpdateProject,
  onCloseProject,
  onDeleteProject,
}: {
  activeUser: User;
  projects: ProjectWithProgress[];
  tasks: Task[];
  users: User[];
  onCreateProject: (project: Project) => void;
  onUpdateProject: (project: Project) => void;
  onCloseProject: (projectId: string) => void;
  onDeleteProject: (project: Project) => void;
}) {
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());

  const toggleProjectDetails = (projectId: string) => {
    setExpandedProjectIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(projectId)) {
        nextIds.delete(projectId);
      } else {
        nextIds.add(projectId);
      }

      return nextIds;
    });
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Manajemen Proyek"
        description="Buat, edit, dan tutup proyek tanpa spreadsheet manual."
        action={activeUser.role === "Leader" ? <ProjectDialog users={users} onSubmit={onCreateProject} /> : null}
      />

      <Card>
        <CardHeader>
          <CardTitle>Daftar Proyek</CardTitle>
          <CardDescription>Semua proyek aktif dan selesai dalam satu tabel.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama Proyek</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Dibuat</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => {
                const progress = project.progress ?? getProjectProgress(project, tasks);
                const isExpanded = expandedProjectIds.has(project.id);
                const completedTargetIds = new Set(
                  tasks
                    .filter((task) => task.project_id === project.id && task.target_task_id)
                    .map((task) => task.target_task_id),
                );

                return (
                  <TableRow key={project.id}>
                    <TableCell className="min-w-72">
                      <div className="grid gap-2">
                        <p className="font-medium">{project.nama_proyek}</p>
                        {project.target_detail_tugas.length > 0 ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-fit gap-2 px-2"
                              onClick={() => toggleProjectDetails(project.id)}
                            >
                              <ChevronDown
                                className={cn(
                                  "h-4 w-4 transition-transform",
                                  isExpanded && "rotate-180",
                                )}
                                aria-hidden="true"
                              />
                              {isExpanded ? "Sembunyikan detail" : "Lihat detail"}
                            </Button>
                            {isExpanded && (
                              <ul className="grid gap-1 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                                {project.target_detail_tugas.map((item) => (
                                  <li key={item.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex min-w-0 gap-2">
                                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                                      <span className="min-w-0">{item.deskripsi}</span>
                                    </div>
                                    <div className="ml-3 flex flex-wrap items-center gap-2 sm:ml-0">
                                      <span className="text-muted-foreground">
                                        {getAssignedUserName(item.assigned_user_id, users)}
                                      </span>
                                      <TargetStatusBadge
                                        target={item}
                                        today={getLocalDateKey()}
                                        isCompleted={completedTargetIds.has(item.id)}
                                      />
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Detail target belum diisi
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-32">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />
                        {getProjectTargetCount(project)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[project.status]}>{project.status}</Badge>
                    </TableCell>
                    <TableCell className="min-w-48">
                      <div className="flex items-center gap-3">
                        <Progress value={progress} />
                        <span className="w-10 text-right text-xs font-semibold">{progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-40">
                      {project.deadline ? (
                        <div className="grid gap-1">
                          <span className="text-sm">{formatDate(project.deadline)}</span>
                          {project.status !== "Selesai" && (
                            <DeadlineBadge project={project} today={getLocalDateKey()} />
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Belum diatur</span>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(project.dibuat_pada)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {activeUser.role === "Leader" ? (
                          <>
                            <ProjectDialog project={project} users={users} onSubmit={onUpdateProject} />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={project.status === "Selesai"}
                              onClick={() => onCloseProject(project.id)}
                            >
                              Tutup
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                const confirmed = window.confirm(
                                  `Hapus proyek "${project.nama_proyek}" beserta detail tugas dan jurnal hariannya?`,
                                );

                                if (confirmed) {
                                  onDeleteProject(project);
                                }
                              }}
                            >
                              Hapus
                            </Button>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">Lihat saja</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectDialog({
  project,
  users = [],
  onSubmit,
}: {
  project?: Project;
  users?: User[];
  onSubmit: (project: Project) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project?.nama_proyek ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "Berjalan");
  const [targetRows, setTargetRows] = useState<TargetDraft[]>(() =>
    getInitialTargetRows(project),
  );
  const targetItems = useMemo(() => normalizeTargetRows(targetRows), [targetRows]);
  const targetCount = targetItems.length || project?.target_tugas || 0;
  const computedProjectDeadline = getProjectDeadlineFromTargets(targetItems) ?? project?.deadline ?? null;

  const updateTargetRow = (id: string, values: Partial<TargetDraft>) => {
    setTargetRows((currentRows) =>
      currentRows.map((row) => (row.id === id ? { ...row, ...values } : row)),
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      id: project?.id ?? `p-${Date.now()}`,
      nama_proyek: name,
      status,
      target_tugas: Math.max(1, targetCount || 1),
      target_detail_tugas: targetItems.map((item, index) => ({
        id: item.id || project?.target_detail_tugas[index]?.id || `target-${Date.now()}-${index}`,
        deskripsi: item.deskripsi,
        assigned_user_id: item.assigned_user_id,
        status: item.status,
        mulai: item.mulai,
        deadline: item.deadline,
        urutan: index + 1,
      })),
      deadline: computedProjectDeadline,
      dibuat_pada: project?.dibuat_pada ?? new Date().toISOString().slice(0, 10),
    });
    setOpen(false);
    if (!project) {
      setName("");
      setStatus("Berjalan");
      setTargetRows([createEmptyTargetDraft()]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={project ? "outline" : "default"}
          size={project ? "sm" : "default"}
          className={cn("gap-2", !project && "w-[calc(100vw-2rem)] max-w-full sm:w-auto")}
        >
          {project ? <PenLine className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          {project ? "Edit" : "Buat Proyek Baru"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{project ? "Edit Proyek" : "Buat Proyek Baru"}</DialogTitle>
          <DialogDescription>
            Isi nama, status, target tugas, dan deadline agar progress serta risiko terlambat bisa dipantau.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="project-name">Nama proyek</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as ProjectStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Menunggu">Menunggu</SelectItem>
                  <SelectItem value="Berjalan">Berjalan</SelectItem>
                  <SelectItem value="Selesai">Selesai</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Jumlah target</Label>
              <div className="flex h-10 items-center rounded-md border bg-muted/45 px-3 text-sm font-semibold">
                {targetCount || 0} tugas
              </div>
            </div>
          </div>
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <Label>Detail target tugas</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setTargetRows((currentRows) => [...currentRows, createEmptyTargetDraft()])}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Tambah Baris
              </Button>
            </div>
            <div className="grid gap-3">
              {targetRows.map((row, index) => (
                <div
                  key={row.id}
                  className="grid gap-3 rounded-md border bg-muted/25 p-3 lg:grid-cols-[1.35fr_0.95fr_0.8fr_0.8fr_auto]"
                >
                  <div className="grid gap-2">
                    <Label htmlFor={`target-${row.id}`}>Detail {index + 1}</Label>
                    <Input
                      id={`target-${row.id}`}
                      value={row.deskripsi}
                      onChange={(event) => updateTargetRow(row.id, { deskripsi: event.target.value })}
                      placeholder="Contoh: Buat wireframe dashboard"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>PIC</Label>
                    <Select
                      value={row.assigned_user_id || "unassigned"}
                      onValueChange={(value) =>
                        updateTargetRow(row.id, {
                          assigned_user_id: value === "unassigned" ? "" : value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih PIC" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Belum ditugaskan</SelectItem>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.nama}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`target-start-${row.id}`}>Mulai</Label>
                    <Input
                      id={`target-start-${row.id}`}
                      type="date"
                      value={row.mulai}
                      onChange={(event) => updateTargetRow(row.id, { mulai: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`target-deadline-${row.id}`}>Deadline</Label>
                    <Input
                      id={`target-deadline-${row.id}`}
                      type="date"
                      value={row.deadline}
                      onChange={(event) => updateTargetRow(row.id, { deadline: event.target.value })}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      disabled={targetRows.length === 1}
                      onClick={() =>
                        setTargetRows((currentRows) =>
                          currentRows.filter((currentRow) => currentRow.id !== row.id),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Hapus
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Jumlah target dihitung dari baris detail yang terisi. Deadline proyek otomatis memakai deadline detail paling akhir.
            </p>
          </div>
          <div className="grid gap-2">
            <Label>Deadline proyek otomatis</Label>
            <div className="flex h-10 items-center rounded-md border bg-muted/45 px-3 text-sm font-semibold">
              {computedProjectDeadline ? formatDate(computedProjectDeadline) : "Belum ada deadline detail"}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" className="gap-2">
              <Save className="h-4 w-4" aria-hidden="true" />
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function JournalView({
  activeUser,
  projects,
  tasks,
  users,
  onUpdateTaskStatus,
}: {
  activeUser: User;
  projects: ProjectWithProgress[];
  tasks: Task[];
  users: User[];
  onUpdateTaskStatus: (
    projectId: string,
    targetTaskId: string,
    status: TargetTaskStatus,
  ) => void;
}) {
  const selectableProjects = projects.filter(
    (project) =>
      project.status !== "Selesai" &&
      (activeUser.role === "Leader" || getVisibleTargetDetails(project, activeUser).length > 0),
  );
  const [selectedProject, setSelectedProject] = useState(selectableProjects[0]?.id ?? "");
  useEffect(() => {
    if (!selectableProjects.some((project) => project.id === selectedProject)) {
      setSelectedProject(selectableProjects[0]?.id ?? "");
    }
  }, [selectableProjects, selectedProject]);
  const selectedProjectData = selectableProjects.find((project) => project.id === selectedProject);
  const completedTargetIds = new Set(
    tasks
      .filter((task) => task.project_id === selectedProject && task.target_task_id)
      .map((task) => task.target_task_id),
  );
  const visibleTargetDetails = selectedProjectData
    ? getVisibleTargetDetails(selectedProjectData, activeUser)
    : [];
  const completedTargets = selectedProjectData
    ? visibleTargetDetails.filter(
        (target) => completedTargetIds.has(target.id) || target.status === "Selesai",
      )
        .length
    : 0;

  const handleTargetStatusChange = (
    target: Project["target_detail_tugas"][number],
    status: TargetTaskStatus,
  ) => {
    if (!selectedProjectData) {
      return;
    }

    onUpdateTaskStatus(selectedProjectData.id, target.id, status);
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Jurnal Tugas Harian"
        description="Ubah status detail target sesuai progres pekerjaan harian."
      />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Checklist Detail Tugas</CardTitle>
            <CardDescription>
              Pilih proyek, lalu ubah status target. Perubahan akan tersimpan otomatis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Proyek</Label>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih proyek" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.nama_proyek}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedProjectData ? (
                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/45 px-3 py-2 text-sm">
                    <span className="font-medium">
                      {completedTargets} / {visibleTargetDetails.length || getProjectTargetCount(selectedProjectData)} selesai
                    </span>
                    <span className="text-muted-foreground">
                      {Math.round((completedTargets / (visibleTargetDetails.length || getProjectTargetCount(selectedProjectData))) * 100)}%
                    </span>
                  </div>
                  {visibleTargetDetails.length > 0 ? (
                    <div className="grid gap-2">
                      {visibleTargetDetails.map((target) => {
                        const isCompleted = completedTargetIds.has(target.id) || target.status === "Selesai";
                        const currentStatus = getEffectiveTargetStatus(target, completedTargetIds);

                        return (
                          <div
                            key={target.id}
                            className={cn(
                              "grid gap-3 rounded-md border p-3 text-sm transition-colors sm:grid-cols-[1fr_12rem]",
                              isCompleted ? "bg-emerald-50 text-emerald-800" : "bg-card hover:bg-muted/45",
                            )}
                          >
                            <span className={cn(isCompleted && "line-through")}>
                              <span className="flex flex-wrap items-center gap-2">
                                <span>{target.deskripsi}</span>
                                <TargetStatusBadge
                                  target={target}
                                  today={getLocalDateKey()}
                                  isCompleted={isCompleted}
                                />
                              </span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                PIC: {getAssignedUserName(target.assigned_user_id, users)} -{" "}
                                {formatTargetSchedule(target)}
                                {getTaskPlannedDuration(target)
                                  ? ` - rencana ${getTaskPlannedDuration(target)} hari`
                                  : ""}
                              </span>
                            </span>
                            <Select
                              value={currentStatus}
                              onValueChange={(value) =>
                                handleTargetStatusChange(target, value as TargetTaskStatus)
                              }
                            >
                              <SelectTrigger className="bg-background">
                                <SelectValue placeholder="Pilih status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Belum Mulai">Belum mulai</SelectItem>
                                <SelectItem value="Dikerjakan">Dikerjakan</SelectItem>
                                <SelectItem value="Koreksi">Koreksi</SelectItem>
                                <SelectItem value="Selesai">Selesai</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                      Tidak ada detail tugas yang ditugaskan ke akun ini.
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Belum ada proyek aktif yang ditugaskan ke akun ini.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Riwayat Tugas</CardTitle>
            <CardDescription>Aktivitas terbaru yang masuk ke catatan proyek.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {tasks.length > 0 ? (
              tasks.slice(0, 8).map((task) => (
                <ActivityItem key={task.id} task={task} projects={projects} users={users} />
              ))
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Belum ada tugas harian.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof FolderKanban;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
          <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
      </CardContent>
    </Card>
  );
}

function DeadlineRiskChart({
  overdueCount,
  dueSoonCount,
  onTrackCount,
  withoutDeadlineCount,
}: {
  overdueCount: number;
  dueSoonCount: number;
  onTrackCount: number;
  withoutDeadlineCount: number;
}) {
  const total = overdueCount + dueSoonCount + onTrackCount + withoutDeadlineCount;
  const rows = [
    {
      label: "Overdue",
      value: overdueCount,
      className: "bg-red-500",
      textClassName: "text-red-700",
    },
    {
      label: "Deadline 7 hari",
      value: dueSoonCount,
      className: "bg-amber-500",
      textClassName: "text-amber-700",
    },
    {
      label: "Aman",
      value: onTrackCount,
      className: "bg-emerald-500",
      textClassName: "text-emerald-700",
    },
    {
      label: "Tanpa deadline",
      value: withoutDeadlineCount,
      className: "bg-slate-400",
      textClassName: "text-muted-foreground",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Visual Risiko Deadline</CardTitle>
        <CardDescription>Distribusi proyek aktif berdasarkan kedekatan deadline.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {rows.map((row) => {
          const percent = total ? Math.round((row.value / total) * 100) : 0;

          return (
            <div key={row.label} className="grid gap-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className={cn("font-medium", row.textClassName)}>{row.label}</span>
                <span className="text-muted-foreground">
                  {row.value} proyek - {percent}%
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", row.className)} style={{ width: `${percent}%` }} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function DeadlineWatchlist({
  projects,
  today,
}: {
  projects: ProjectWithProgress[];
  today: string;
}) {
  const sortedProjects = [...projects].sort((first, second) => {
    if (!first.deadline && !second.deadline) return 0;
    if (!first.deadline) return 1;
    if (!second.deadline) return -1;

    return first.deadline.localeCompare(second.deadline);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Watchlist Deadline</CardTitle>
        <CardDescription>Proyek yang perlu dipantau dari sisi waktu dan progress.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {sortedProjects.length > 0 ? (
          sortedProjects.map((project) => {
            const progress = project.progress;

            return (
              <div key={project.id} className="rounded-lg border p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">{project.nama_proyek}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {project.deadline ? `Deadline ${formatDate(project.deadline)}` : "Deadline belum diatur"}
                    </p>
                  </div>
                  {project.deadline ? (
                    <DeadlineBadge project={project} today={today} />
                  ) : (
                    <Badge variant="outline">Tanpa deadline</Badge>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Progress value={progress} />
                  <span className="w-12 text-right text-xs font-semibold">{progress}%</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Belum ada deadline aktif yang perlu dipantau.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeadlineBadge({ project, today }: { project: Project; today: string }) {
  if (!project.deadline) {
    return <Badge variant="outline">Tanpa deadline</Badge>;
  }

  if (project.status === "Selesai") {
    return <Badge variant="success">Selesai</Badge>;
  }

  const daysLeft = getDaysUntilDeadline(project.deadline, today);

  if (daysLeft < 0) {
    return (
      <Badge variant="warning" className="bg-red-100 text-red-700">
        Overdue {Math.abs(daysLeft)} hari
      </Badge>
    );
  }

  if (daysLeft === 0) {
    return <Badge variant="warning">Hari ini</Badge>;
  }

  if (daysLeft <= 7) {
    return <Badge variant="warning">{daysLeft} hari lagi</Badge>;
  }

  return <Badge variant="success">Aman {daysLeft} hari</Badge>;
}

function TargetStatusBadge({
  target,
  today,
  isCompleted = false,
}: {
  target: Project["target_detail_tugas"][number];
  today: string;
  isCompleted?: boolean;
}) {
  if (isCompleted || target.status === "Selesai") {
    return <Badge variant="success">Selesai</Badge>;
  }

  if (target.deadline && target.deadline < today) {
    return (
      <Badge variant="warning" className="bg-red-100 text-red-700">
        Overdue
      </Badge>
    );
  }

  if (target.status === "Dikerjakan") {
    return <Badge variant="default">Dikerjakan</Badge>;
  }

  if (target.status === "Koreksi") {
    return <Badge variant="warning">Koreksi</Badge>;
  }

  return <Badge variant="outline">Belum Mulai</Badge>;
}

function getEffectiveTargetStatus(
  target: Project["target_detail_tugas"][number],
  completedTargetIds: Set<string | null>,
): TargetTaskStatus {
  if (completedTargetIds.has(target.id)) {
    return "Selesai";
  }

  return target.status;
}

function getAssignedUserName(userId: string | null, users: User[]) {
  return users.find((user) => user.id === userId)?.nama ?? "Belum ditugaskan";
}

function getVisibleTargetDetails(project: Project, activeUser: User) {
  if (activeUser.role === "Leader") {
    return project.target_detail_tugas;
  }

  return project.target_detail_tugas.filter(
    (target) => !target.assigned_user_id || target.assigned_user_id === activeUser.id,
  );
}

function ActivityItem({
  task,
  projects,
  users,
}: {
  task: Task;
  projects: Project[];
  users: User[];
}) {
  const project = projects.find((item) => item.id === task.project_id);
  const user = users.find((item) => item.id === task.user_id);

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium">{user?.nama ?? "Anggota Tim"}</p>
        <span className="text-xs text-muted-foreground">{formatDate(task.tanggal)}</span>
      </div>
      <p className="mt-2 text-sm text-foreground">{task.deskripsi}</p>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn("h-2 w-2 rounded-full", project?.status === "Selesai" ? "bg-emerald-500" : "bg-primary")}
        />
        {project?.nama_proyek ?? "Proyek tidak ditemukan"}
      </div>
    </div>
  );
}

function getMemberPerformance(users: User[], projects: Project[], tasks: Task[]) {
  const completionByTargetId = new Map(
    tasks
      .filter((task) => task.target_task_id)
      .map((task) => [task.target_task_id as string, task]),
  );

  return users.map((user) => {
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
      ...user,
      completed,
      inProgress,
      total: userTargetTasks.length,
      completionRate: userTargetTasks.length
        ? Math.round((completed / userTargetTasks.length) * 100)
        : 0,
    };
  }).filter((member) => member.total > 0);
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function createEmptyTargetDraft(): TargetDraft {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    deskripsi: "",
    assigned_user_id: "",
    status: "Belum Mulai",
    mulai: "",
    deadline: "",
  };
}

function getInitialTargetRows(project?: Project): TargetDraft[] {
  if (!project?.target_detail_tugas.length) {
    return [createEmptyTargetDraft()];
  }

  return project.target_detail_tugas.map((target) => ({
    id: target.id,
    deskripsi: target.deskripsi,
    assigned_user_id: target.assigned_user_id ?? "",
    status: target.status,
    mulai: target.mulai ?? "",
    deadline: target.deadline ?? "",
  }));
}

function normalizeTargetRows(rows: TargetDraft[]) {
  const seen = new Set<string>();

  return rows.flatMap((row) => {
    const deskripsi = row.deskripsi.trim();

    if (!deskripsi || seen.has(deskripsi)) {
      return [];
    }

    seen.add(deskripsi);
    return [
      {
        id: row.id,
        deskripsi,
        assigned_user_id: row.assigned_user_id || null,
        status: row.status,
        mulai: row.mulai || null,
        deadline: row.deadline || null,
      },
    ];
  });
}

function getProjectDeadlineFromTargets(targets: Array<{ deadline: string | null }>) {
  return targets
    .map((target) => target.deadline)
    .filter((deadline): deadline is string => Boolean(deadline))
    .sort()
    .at(-1) ?? null;
}

function formatTargetSchedule(target: Project["target_detail_tugas"][number]) {
  if (target.mulai && target.deadline) {
    return `${formatDate(target.mulai)} sampai ${formatDate(target.deadline)}`;
  }

  if (target.mulai) {
    return `Mulai ${formatDate(target.mulai)}`;
  }

  if (target.deadline) {
    return `Deadline ${formatDate(target.deadline)}`;
  }

  return "Jadwal belum diatur";
}

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as { data?: T; error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Request gagal");
  }

  return payload.data as T;
}

async function createProject(
  project: Project,
  refresh: () => Promise<unknown>,
  showToast: (message: string) => void,
) {
  try {
    await fetchJson<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        nama_proyek: project.nama_proyek,
        status: project.status,
        target_tugas: project.target_tugas,
        target_detail_tugas: project.target_detail_tugas.map((item) => ({
          id: item.id,
          deskripsi: item.deskripsi,
          assigned_user_id: item.assigned_user_id,
          status: item.status,
          mulai: item.mulai,
          deadline: item.deadline,
        })),
        deadline: project.deadline,
      }),
    });
    await refresh();
    showToast("Proyek baru berhasil dibuat.");
  } catch (error) {
    showToast(getErrorMessage(error));
  }
}

async function updateProject(
  project: Project,
  refresh: () => Promise<unknown>,
  showToast: (message: string) => void,
) {
  try {
    await fetchJson<Project>(`/api/projects/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        nama_proyek: project.nama_proyek,
        status: project.status,
        target_tugas: project.target_tugas,
        target_detail_tugas: project.target_detail_tugas.map((item) => ({
          id: item.id,
          deskripsi: item.deskripsi,
          assigned_user_id: item.assigned_user_id,
          status: item.status,
          mulai: item.mulai,
          deadline: item.deadline,
        })),
        deadline: project.deadline,
      }),
    });
    await refresh();
    showToast("Perubahan proyek tersimpan.");
  } catch (error) {
    showToast(getErrorMessage(error));
  }
}

async function closeProject(
  projectId: string,
  refresh: () => Promise<unknown>,
  showToast: (message: string) => void,
) {
  try {
    await fetchJson<Project>(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "Selesai",
      }),
    });
    await refresh();
    showToast("Proyek ditandai selesai.");
  } catch (error) {
    showToast(getErrorMessage(error));
  }
}

async function deleteProject(
  project: Project,
  refresh: () => Promise<unknown>,
  showToast: (message: string) => void,
) {
  try {
    await fetchJson<{ id: string }>(`/api/projects/${project.id}`, {
      method: "DELETE",
    });
    await refresh();
    showToast(`Proyek "${project.nama_proyek}" berhasil dihapus.`);
  } catch (error) {
    showToast(getErrorMessage(error));
  }
}

async function createTask(
  task: Task,
  refresh: () => Promise<unknown>,
  showToast: (message: string) => void,
) {
  try {
    await fetchJson<Task>("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        project_id: task.project_id,
        target_task_id: task.target_task_id,
        user_id: task.user_id,
        deskripsi: task.deskripsi,
        tanggal: task.tanggal,
      }),
    });
    await refresh();
    showToast("Tugas harian berhasil disimpan.");
  } catch (error) {
    showToast(getErrorMessage(error));
  }
}

async function deleteTask(
  projectId: string,
  targetTaskId: string,
  userId: string,
  refresh: () => Promise<unknown>,
  showToast: (message: string) => void,
) {
  try {
    await fetchJson<{ target_task_id: string }>("/api/tasks", {
      method: "DELETE",
      body: JSON.stringify({
        project_id: projectId,
        target_task_id: targetTaskId,
        user_id: userId,
      }),
    });
    await refresh();
    showToast("Checklist tugas berhasil dibatalkan.");
  } catch (error) {
    showToast(getErrorMessage(error));
  }
}

async function updateTaskStatus(
  projectId: string,
  targetTaskId: string,
  status: TargetTaskStatus,
  refresh: () => Promise<unknown>,
  showToast: (message: string) => void,
) {
  try {
    await fetchJson<Task | null>("/api/tasks", {
      method: "PATCH",
      body: JSON.stringify({
        project_id: projectId,
        target_task_id: targetTaskId,
        status,
        tanggal: getLocalDateKey(),
      }),
    });
    await refresh();
    showToast(`Status tugas diubah menjadi ${status}.`);
  } catch (error) {
    showToast(getErrorMessage(error));
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Terjadi kesalahan. Coba lagi.";
}

function getAuthErrorMessage(message?: string) {
  if (!message) {
    return "Autentikasi gagal. Coba lagi.";
  }

  return message;
}
