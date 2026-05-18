"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChartColumnIncreasing,
  ClipboardList,
  Download,
  Eye,
  EyeOff,
  FileText,
  Filter,
  FolderKanban,
  Gauge,
  Kanban,
  MailCheck,
  LayoutDashboard,
  ListChecks,
  LogOut,
  PenLine,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Users,
  X,
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
import { Textarea } from "@/components/ui/textarea";
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
  TeamType,
  TargetTaskStatus,
  Task,
  User,
  teamTypeOptions,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

type View = "dashboard" | "projects" | "kanban" | "journal" | "report";
type AuthMode = "login" | "register" | "forgot" | "reset";

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
    team_type: TeamType;
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

type IconTone = "indigo" | "sky" | "violet" | "emerald" | "amber" | "rose" | "teal";

const iconToneClass: Record<IconTone, { bg: string; text: string; ring: string }> = {
  indigo: { bg: "bg-indigo-100", text: "text-indigo-600", ring: "ring-indigo-200" },
  sky: { bg: "bg-sky-100", text: "text-sky-600", ring: "ring-sky-200" },
  violet: { bg: "bg-violet-100", text: "text-violet-600", ring: "ring-violet-200" },
  emerald: { bg: "bg-emerald-100", text: "text-emerald-600", ring: "ring-emerald-200" },
  amber: { bg: "bg-amber-100", text: "text-amber-600", ring: "ring-amber-200" },
  rose: { bg: "bg-rose-100", text: "text-rose-600", ring: "ring-rose-200" },
  teal: { bg: "bg-teal-100", text: "text-teal-600", ring: "ring-teal-200" },
};

const navItems: Array<{
  id: View;
  label: string;
  icon: typeof LayoutDashboard;
  tone: IconTone;
}> = [
  { id: "dashboard", label: "Dasbor", icon: LayoutDashboard, tone: "indigo" },
  { id: "projects", label: "Proyek", icon: FolderKanban, tone: "violet" },
  { id: "kanban", label: "Kanban", icon: Kanban, tone: "sky" },
  { id: "journal", label: "Tugas Harian", icon: ClipboardList, tone: "emerald" },
  { id: "report", label: "Report", icon: FileText, tone: "amber" },
];

export default function Home() {
  const session = authClient.useSession();
  const cachedSnapshot = useMemo(() => readWorkspaceCache(), []);
  const [activeUser, setActiveUser] = useState<User | null>(
    cachedSnapshot?.activeUser ?? null,
  );
  const [activeView, setActiveView] = useState<View>(() => readActiveView() ?? "dashboard");
  const [users, setUsers] = useState<User[]>(cachedSnapshot?.users ?? []);
  const [projects, setProjects] = useState<ProjectWithProgress[]>(
    cachedSnapshot?.projects ?? [],
  );
  const [tasks, setTasks] = useState<Task[]>(cachedSnapshot?.tasks ?? []);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    writeActiveView(activeView);
  }, [activeView]);

  useEffect(() => {
    if (!activeUser) return;
    if (activeUser.role === "Manajemen" && activeView === "journal") {
      setActiveView("dashboard");
    }
    if (activeUser.role !== "Manajemen" && activeView === "report") {
      setActiveView("dashboard");
    }
  }, [activeUser, activeView]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  const loadWorkspace = useCallback(
    async (sessionEmail?: string) => {
      setIsLoadingData(true);

      try {
        const [usersResponse, projectsResponse, tasksResponse] = await Promise.all([
          fetchJson<User[]>("/api/users"),
          fetchJson<ProjectWithProgress[]>("/api/projects"),
          fetchJson<Task[]>("/api/tasks"),
        ]);

        const email = sessionEmail ?? session.data?.user?.email;
        const currentUser = usersResponse.find((user) => user.email === email);

        setUsers(usersResponse);
        setProjects(projectsResponse);
        setTasks(tasksResponse);

        if (currentUser) {
          setActiveUser(currentUser);
          writeWorkspaceCache({
            email: currentUser.email,
            activeUser: currentUser,
            users: usersResponse,
            projects: projectsResponse,
            tasks: tasksResponse,
          });
        }

        if (currentUser?.role === "Leader" || currentUser?.role === "Manajemen") {
          void fetchJson<DashboardSummary>("/api/dashboard/summary")
            .then((summary) => setDashboardSummary(summary))
            .catch(() => setDashboardSummary(null));
        } else {
          setDashboardSummary(null);
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

  const handleOptimisticStatusUpdate = useCallback(
    (
      projectId: string,
      targetTaskId: string,
      status: TargetTaskStatus,
      note?: string,
    ) => {
      if (!activeUser) return;
      const userId = activeUser.id;

      setProjects((prev) =>
        prev.map((project) => {
          if (project.id !== projectId) return project;
          return {
            ...project,
            target_detail_tugas: project.target_detail_tugas.map((target) =>
              target.id !== targetTaskId
                ? target
                : {
                    ...target,
                    status,
                    assigned_user_id:
                      target.assigned_user_id ??
                      (status === "Belum Mulai" ? null : userId),
                  },
            ),
          };
        }),
      );

      setTasks((prev) => {
        if (status === "Selesai") {
          const existing = prev.find((task) => task.target_task_id === targetTaskId);
          if (existing) {
            return note
              ? prev.map((task) =>
                  task.target_task_id === targetTaskId
                    ? { ...task, deskripsi: note }
                    : task,
                )
              : prev;
          }
          const project = projects.find((item) => item.id === projectId);
          const target = project?.target_detail_tugas.find((item) => item.id === targetTaskId);
          return [
            {
              id: `optimistic-${Date.now()}`,
              project_id: projectId,
              target_task_id: targetTaskId,
              user_id: userId,
              deskripsi: note ?? target?.deskripsi ?? "",
              tanggal: getLocalDateKey(),
            },
            ...prev,
          ];
        }
        return prev.filter((task) => task.target_task_id !== targetTaskId);
      });

      void updateTaskStatus(
        projectId,
        targetTaskId,
        status,
        loadWorkspace,
        showToast,
        note,
      );
    },
    [activeUser, projects, loadWorkspace],
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
      clearWorkspaceCache();
      return;
    }

    if (cachedSnapshot && cachedSnapshot.email !== session.data.user.email) {
      setActiveUser(null);
      setUsers([]);
      setProjects([]);
      setTasks([]);
      clearWorkspaceCache();
    }

    void loadWorkspace(session.data.user.email);
  }, [cachedSnapshot, loadWorkspace, session.data?.user, session.isPending]);

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
    setActiveView(loggedInUser ? "dashboard" : "journal");
    showToast("Berhasil masuk ke ruang kerja.");
  };

  const handleRegister = async (
    name: string,
    email: string,
    password: string,
    role: Role,
    teamType: TeamType,
  ) => {
    const { error: signUpError } = await authClient.signUp.email({
      name,
      email,
      password,
      role,
      teamType,
      callbackURL: "/",
    });

    if (signUpError) {
      throw new Error(getAuthErrorMessage(signUpError.message));
    }
  };

  const handleRequestPasswordReset = async (email: string) => {
    await requestPasswordReset(email);
  };

  const handleResetPassword = async (token: string, newPassword: string) => {
    await resetPassword(token, newPassword);
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
    clearWorkspaceCache();
    showToast("");
  };

  // If we have an activeUser (from cache or fresh load) render the app immediately;
  // the session check and refresh happen in the background.
  if (!activeUser) {
    if (session.isPending) {
      return <LoadingScreen message="Memeriksa sesi login..." />;
    }
    if (session.data?.user) {
      return <LoadingScreen message="Memuat ruang kerja..." />;
    }
    return (
      <LoginScreen
        onLogin={handleLogin}
        onRegister={handleRegister}
        onRequestPasswordReset={handleRequestPasswordReset}
        onResetPassword={handleResetPassword}
      />
    );
  }

  return (
    <main className="min-h-screen w-full bg-background">
      <div className="flex min-h-screen w-full flex-col lg:flex-row">
        <aside className="w-full border-b border-border/60 bg-card/80 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="flex h-full min-w-0 flex-col gap-4 p-3 sm:gap-6 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border bg-white ring-2 ring-indigo-100">
                  <Image
                    src="/logo-sdk.png"
                    alt="Logo SDK"
                    width={40}
                    height={40}
                    className="h-full w-full object-contain p-1"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">ProTrack SDK</p>
                  <p className="text-xs text-muted-foreground">Project tracking tim SDK</p>
                </div>
              </div>
              <NotificationBell
                activeUser={activeUser}
                projects={projects}
                tasks={tasks}
                users={users}
                onNavigate={setActiveView}
              />
            </div>

            <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-1">
              {navItems
                .filter((item) => {
                  if (activeUser.role === "Manajemen" && item.id === "journal") return false;
                  if (activeUser.role !== "Manajemen" && item.id === "report") return false;
                  return true;
                })
                .map((item) => {
                const Icon = item.icon;
                const tone = iconToneClass[item.tone];
                const isActive = activeView === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveView(item.id)}
                    title={item.label}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm font-medium transition-all",
                      isActive
                        ? "border-border/60 bg-white text-foreground shadow-sm ring-1 ring-indigo-100"
                        : "text-muted-foreground hover:bg-white/60 hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all",
                        tone.bg,
                        isActive ? `ring-2 ${tone.ring}` : "opacity-90 group-hover:opacity-100",
                      )}
                    >
                      <Icon className={cn("h-4.5 w-4.5", tone.text)} aria-hidden="true" />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto rounded-2xl border border-border/60 bg-white/70 p-3 shadow-sm backdrop-blur">
              <div className="grid min-w-0 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-semibold text-white shadow-sm">
                    {getInitials(activeUser.nama)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{activeUser.nama}</p>
                    <p className="break-all text-xs text-muted-foreground">{activeUser.email}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={activeUser.role === "Leader" ? "default" : "outline"}>
                    {activeUser.role}
                  </Badge>
                  <Badge variant="secondary">{activeUser.team_type}</Badge>
                </div>
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

        <section className="w-full min-w-0 flex-1 overflow-x-hidden p-3 sm:p-6 lg:p-8">
          {activeView === "dashboard" && (
            <DashboardView
              projects={projects}
              tasks={tasks}
              users={users}
              activeUser={activeUser}
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
          {activeView === "kanban" && (
            <KanbanView
              activeUser={activeUser}
              projects={projects}
              tasks={tasks}
              users={users}
            />
          )}
          {activeView === "journal" && (
            <JournalView
              activeUser={activeUser}
              projects={projects}
              tasks={tasks}
              users={users}
              onUpdateTaskStatus={handleOptimisticStatusUpdate}
            />
          )}
          {activeView === "report" && (
            <ReportView
              activeUser={activeUser}
              projects={projects}
              tasks={tasks}
              users={users}
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
  onRequestPasswordReset,
  onResetPassword,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (
    name: string,
    email: string,
    password: string,
    role: Role,
    teamType: TeamType,
  ) => Promise<void>;
  onRequestPasswordReset: (email: string) => Promise<void>;
  onResetPassword: (token: string, newPassword: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<AuthMode>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("reset_token")
      ? "reset"
      : "login",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("email") ?? "" : "",
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("reset_token") ?? "" : "",
  );
  const [role, setRole] = useState<Role>("Tim");
  const [teamType, setTeamType] = useState<TeamType>("Tim Sales");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      if (mode === "reset") {
        if (!resetToken) {
          throw new Error("Token reset password tidak ditemukan. Minta link reset baru.");
        }

        if (password !== confirmPassword) {
          throw new Error("Konfirmasi password belum sama.");
        }

        await onResetPassword(resetToken, password);
        setMode("login");
        setPassword("");
        setConfirmPassword("");
        setResetToken("");
        setNotice("Password baru berhasil disimpan. Silakan masuk dengan password baru.");

        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", window.location.pathname);
        }
      } else if (mode === "forgot") {
        await onRequestPasswordReset(email);
        setMode("login");
        setNotice("Jika email terdaftar, link reset password sudah dikirim.");
      } else if (mode === "register") {
        await onRegister(name, email, password, role, teamType);
        setMode("login");
        setPassword("");
        setNotice("Akun dibuat. Cek email aktif Anda dan klik link verifikasi sebelum masuk.");
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
            {mode === "forgot"
              ? "Masukkan email aktif untuk menerima link reset password."
              : mode === "reset"
                ? "Buat password baru untuk akun ProTrack SDK Anda."
                : "Daftar memakai email aktif, verifikasi lewat link email, lalu masuk ke ruang kerja tim."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-md bg-muted p-1">
            <Button
              type="button"
              variant={mode === "login" || mode === "forgot" || mode === "reset" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => {
                setMode("login");
                setError("");
                setNotice("");
                setPassword("");
                setConfirmPassword("");
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
                setPassword("");
                setConfirmPassword("");
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
            {mode !== "reset" && (
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
            )}
            {mode !== "forgot" && (
              <PasswordField
                id="password"
                label={mode === "reset" ? "Password baru" : "Password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={setPassword}
                showPassword={showPassword}
                onToggleShowPassword={() => setShowPassword((currentValue) => !currentValue)}
              />
            )}
            {mode === "reset" && (
              <PasswordField
                id="confirm-password"
                label="Konfirmasi password baru"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                showPassword={showConfirmPassword}
                onToggleShowPassword={() => setShowConfirmPassword((currentValue) => !currentValue)}
              />
            )}
            {mode === "register" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Role awal</Label>
                  <Select value={role} onValueChange={(value) => setRole(value as Role)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Tim">Anggota Tim</SelectItem>
                      <SelectItem value="Leader">Leader</SelectItem>
                      <SelectItem value="Manajemen">Manajemen SDK</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Jenis tim</Label>
                  <Select value={teamType} onValueChange={(value) => setTeamType(value as TeamType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih jenis tim" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamTypeOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
              {isSubmitting
                ? "Memproses..."
                : mode === "register"
                  ? "Daftar"
                  : mode === "forgot"
                    ? "Kirim Link Reset"
                    : mode === "reset"
                      ? "Simpan Password Baru"
                      : "Masuk"}
            </Button>
            {mode === "login" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="justify-self-center"
                onClick={() => {
                  setMode("forgot");
                  setError("");
                  setNotice("");
                  setPassword("");
                }}
              >
                Lupa password?
              </Button>
            )}
          </form>
          <div className="mt-5 grid gap-2 rounded-md border bg-muted/45 p-3 text-xs text-muted-foreground">
            <p>Akun baru aktif setelah link verifikasi email diklik.</p>
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

function PasswordField({
  id,
  label,
  autoComplete,
  value,
  onChange,
  showPassword,
  onToggleShowPassword,
}: {
  id: string;
  label: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  showPassword: boolean;
  onToggleShowPassword: () => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={id}
          type={showPassword ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={8}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pr-11"
          required
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 p-0"
          onClick={onToggleShowPassword}
          aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
          title={showPassword ? "Sembunyikan password" : "Tampilkan password"}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>
    </div>
  );
}

function DashboardView({
  projects,
  tasks,
  users,
  activeUser,
  summary,
  isLoading,
}: {
  projects: ProjectWithProgress[];
  tasks: Task[];
  users: User[];
  activeUser: User;
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

      {(activeUser.role === "Leader" || activeUser.role === "Manajemen") && (
        <div className="grid min-w-0 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <MetricCard label="Proyek Berjalan" value={metrics?.proyek_berjalan ?? activeProjects.length} icon={FolderKanban} tone="indigo" />
          <MetricCard label="Tugas Hari Ini" value={metrics?.tugas_hari_ini ?? todayTasks.length} icon={ClipboardList} tone="emerald" />
          <MetricCard label="Rata-rata Progress" value={`${metrics?.rata_rata_progress ?? averageProgress}%`} icon={BarChart3} tone="sky" />
          <MetricCard label="Proyek Selesai" value={metrics?.proyek_selesai ?? completedProjects.length} icon={CheckCircle2} tone="teal" />
          <MetricCard label="Proyek Overdue" value={metrics?.proyek_overdue ?? overdueProjects.length} icon={AlertTriangle} tone="rose" />
          <MetricCard label="Deadline 7 Hari" value={metrics?.deadline_minggu_ini ?? dueSoonProjects.length} icon={CalendarClock} tone="amber" />
        </div>
      )}

      <TeamKpiChart
        activeUser={activeUser}
        projects={projects}
        tasks={tasks}
        users={users}
        today={today}
      />

      <GanttChart
        activeUser={activeUser}
        projects={projects}
        tasks={tasks}
        users={users}
        today={today}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Progress Proyek</CardTitle>
              <CardDescription>Persentase dihitung dari jumlah tugas selesai terhadap target.</CardDescription>
            </div>
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconToneClass.violet.bg)}>
              <BarChart3 className={cn("h-5 w-5", iconToneClass.violet.text)} aria-hidden="true" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {projects.length > 0 ? (
            projects.map((project) => {
              const progress = project.progress ?? getProjectProgress(project, tasks);
              return (
                <div key={project.id} className="rounded-xl border border-border/60 bg-white/70 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">{project.nama_proyek}</p>
                      <ProjectTeamBadges project={project} />
                      <p className="mt-1 text-sm text-muted-foreground">
                        {project.total_tugas ?? tasks.filter((task) => task.project_id === project.id).length} dari{" "}
                        {getProjectTargetCount(project)} tugas target
                      </p>
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
            })
          ) : (
            <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
              Belum ada proyek yang dapat dipantau.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type KpiPeriod = "all" | "month" | "quarter" | "semester" | "year";

const periodOptions: Array<{ value: KpiPeriod; label: string }> = [
  { value: "all", label: "Semua waktu" },
  { value: "month", label: "Bulan ini" },
  { value: "quarter", label: "Kuarter ini" },
  { value: "semester", label: "Semester ini" },
  { value: "year", label: "Tahun ini" },
];

function isWithinPeriod(dateStr: string | null, period: KpiPeriod, refDate: Date) {
  if (period === "all") return true;
  if (!dateStr) return false;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  if (d.getFullYear() !== refDate.getFullYear()) return false;
  if (period === "year") return true;
  if (period === "month") return d.getMonth() === refDate.getMonth();
  if (period === "quarter") return Math.floor(d.getMonth() / 3) === Math.floor(refDate.getMonth() / 3);
  if (period === "semester") return Math.floor(d.getMonth() / 6) === Math.floor(refDate.getMonth() / 6);
  return true;
}

function TeamKpiChart({
  activeUser,
  projects,
  tasks,
  users,
  today,
}: {
  activeUser: User;
  projects: ProjectWithProgress[];
  tasks: Task[];
  users: User[];
  today: string;
}) {
  const isManajemen = activeUser.role === "Manajemen";
  const isLeader = activeUser.role === "Leader";
  const [period, setPeriod] = useState<KpiPeriod>("all");
  const [selectedTeam, setSelectedTeam] = useState<TeamType | "all">(
    isManajemen ? "all" : activeUser.team_type,
  );
  const [selectedMemberId, setSelectedMemberId] = useState<string>(
    isManajemen ? "all" : activeUser.id,
  );

  const teamScopedUsers = useMemo(() => {
    if (isManajemen) {
      return selectedTeam === "all"
        ? users
        : users.filter((u) => u.team_type === selectedTeam);
    }
    if (isLeader) {
      return users.filter((u) => u.team_type === activeUser.team_type);
    }
    return [activeUser];
  }, [activeUser, isLeader, isManajemen, selectedTeam, users]);

  const memberOptions = useMemo(() => {
    const sorted = [...teamScopedUsers].sort((a, b) => a.nama.localeCompare(b.nama));
    if (!isManajemen && !sorted.some((u) => u.id === activeUser.id)) {
      sorted.unshift(activeUser);
    }
    return sorted;
  }, [activeUser, isManajemen, teamScopedUsers]);

  useEffect(() => {
    if (selectedMemberId !== "all" && !memberOptions.some((m) => m.id === selectedMemberId)) {
      setSelectedMemberId(isManajemen ? "all" : activeUser.id);
    }
  }, [activeUser.id, isManajemen, memberOptions, selectedMemberId]);

  const selectedMember = memberOptions.find((m) => m.id === selectedMemberId) ?? null;
  const isViewingSelf = selectedMember?.id === activeUser.id;
  const refDate = useMemo(() => new Date(`${today}T00:00:00`), [today]);

  const teamUserIdSet = useMemo(
    () => new Set(teamScopedUsers.map((u) => u.id)),
    [teamScopedUsers],
  );

  const assignedTargets = useMemo(() => {
    return projects.flatMap((project) =>
      project.target_detail_tugas
        .filter((target) => {
          if (!target.assigned_user_id) return false;
          if (selectedMemberId !== "all") {
            if (target.assigned_user_id !== selectedMemberId) return false;
          } else {
            if (!teamUserIdSet.has(target.assigned_user_id)) return false;
          }
          if (!isWithinPeriod(target.deadline, period, refDate)) return false;
          return true;
        })
        .map((target) => ({ project, target })),
    );
  }, [period, projects, refDate, selectedMemberId, teamUserIdSet]);
  const completedTargetIds = getCompletedTargetIds(tasks);
  const totalTargets = assignedTargets.length;
  const completedTargets = assignedTargets.filter(({ target }) =>
    isTargetCompleted(target, completedTargetIds),
  ).length;
  const activeTargets = assignedTargets.filter(({ target }) =>
    ["Dikerjakan", "Koreksi"].includes(getEffectiveTargetStatus(target, completedTargetIds)),
  ).length;
  const overdueTargets = assignedTargets.filter(
    ({ target }) =>
      !isTargetCompleted(target, completedTargetIds) &&
      Boolean(target.deadline && target.deadline < today),
  ).length;
  const completionRate = totalTargets ? Math.round((completedTargets / totalTargets) * 100) : 0;
  const statusRows = targetStatusColumns.map((status) => {
    const value = assignedTargets.filter(
      ({ target }) => getEffectiveTargetStatus(target, completedTargetIds) === status,
    ).length;

    return {
      status,
      value,
      percent: totalTargets ? Math.round((value / totalTargets) * 100) : 0,
    };
  });
  const nextDeadlines = assignedTargets
    .filter(({ target }) => !isTargetCompleted(target, completedTargetIds) && target.deadline)
    .sort((first, second) => (first.target.deadline ?? "").localeCompare(second.target.deadline ?? ""))
    .slice(0, 3);

  const kpiTitle = selectedMember
    ? isViewingSelf
      ? "KPI Saya"
      : `KPI ${selectedMember.nama}`
    : selectedTeam === "all"
      ? "KPI Organisasi"
      : `KPI ${selectedTeam}`;
  const kpiDescription = selectedMember
    ? isViewingSelf
      ? "Progress target yang ditugaskan ke akun Anda."
      : `Target ${selectedMember.nama} (${selectedMember.team_type}).`
    : selectedTeam === "all"
      ? "Agregat target seluruh tim SDK."
      : `Agregat target ${selectedTeam}.`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconToneClass.indigo.bg)}>
              <Gauge className={cn("h-5 w-5", iconToneClass.indigo.text)} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate text-sm sm:text-base">{kpiTitle}</CardTitle>
              <CardDescription className="line-clamp-2 text-xs">{kpiDescription}</CardDescription>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1">
              <Label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Filter className="h-3 w-3" aria-hidden="true" />
                Periode
              </Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as KpiPeriod)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Pilih periode" />
                </SelectTrigger>
                <SelectContent>
                  {periodOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isManajemen && (
              <div className="grid gap-1">
                <Label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Users className="h-3 w-3" aria-hidden="true" />
                  Tim
                </Label>
                <Select
                  value={selectedTeam}
                  onValueChange={(v) => {
                    setSelectedTeam(v as TeamType | "all");
                    setSelectedMemberId("all");
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Semua tim" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua tim</SelectItem>
                    {teamTypeOptions.map((team) => (
                      <SelectItem key={team} value={team}>
                        {team}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(isManajemen || isLeader) && (
              <div className="grid gap-1">
                <Label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Filter className="h-3 w-3" aria-hidden="true" />
                  Anggota
                </Label>
                <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Pilih anggota" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua anggota</SelectItem>
                    {memberOptions.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.id === activeUser.id ? `${member.nama} (Saya)` : member.nama}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Rasio selesai</p>
            <div className="mt-3 flex items-end gap-3">
              <p className="text-3xl font-semibold">{completionRate}%</p>
              <p className="pb-1 text-sm text-muted-foreground">
                {completedTargets}/{totalTargets || 0} target
              </p>
            </div>
            <Progress value={completionRate} className="mt-4" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <KpiMiniCard label="Aktif" value={activeTargets} />
            <KpiMiniCard label="Selesai" value={completedTargets} />
            <KpiMiniCard label="Overdue" value={overdueTargets} tone="danger" />
          </div>
        </div>
        <div className="grid gap-4">
          <div className="grid gap-3">
            {statusRows.map((row) => (
              <div key={row.status} className="grid gap-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{row.status}</span>
                  <span className="text-muted-foreground">
                    {row.value} target - {row.percent}%
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", targetStatusBarClass[row.status])}
                    style={{ width: `${row.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-2">
            <p className="text-sm font-medium">Deadline terdekat</p>
            {nextDeadlines.length > 0 ? (
              nextDeadlines.map(({ project, target }) => (
                <div key={target.id} className="flex flex-col gap-1 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{target.deskripsi}</p>
                    <p className="text-xs text-muted-foreground">{project.nama_proyek}</p>
                  </div>
                  <Badge variant={target.deadline && target.deadline < today ? "warning" : "outline"}>
                    {target.deadline ? formatDate(target.deadline) : "Tanpa deadline"}
                  </Badge>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Belum ada target aktif dengan deadline.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiMiniCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "danger";
}) {
  return (
    <div className={cn("rounded-lg border p-3", tone === "danger" && "border-red-200 bg-red-50")}>
      <p className={cn("text-xs text-muted-foreground", tone === "danger" && "text-red-700")}>
        {label}
      </p>
      <p className={cn("mt-1 text-xl font-semibold", tone === "danger" && "text-red-700")}>
        {value}
      </p>
    </div>
  );
}

function GanttChart({
  activeUser,
  projects,
  tasks,
  users,
  today,
}: {
  activeUser: User;
  projects: ProjectWithProgress[];
  tasks: Task[];
  users: User[];
  today: string;
}) {
  const isManajemen = activeUser.role === "Manajemen";
  const [selectedTeam, setSelectedTeam] = useState<TeamType | "all">("all");
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const [expandedTargetIds, setExpandedTargetIds] = useState<Set<string>>(new Set());
  const completedTargetIds = getCompletedTargetIds(tasks);

  const teamUserIds = useMemo(() => {
    if (selectedTeam === "all") return null;
    return new Set(users.filter((u) => u.team_type === selectedTeam).map((u) => u.id));
  }, [selectedTeam, users]);

  const getScopedTargets = (project: ProjectWithProgress) => {
    if (isManajemen) {
      if (!teamUserIds) {
        return project.target_detail_tugas.filter((t) => t.assigned_user_id);
      }
      return project.target_detail_tugas.filter(
        (target) => target.assigned_user_id && teamUserIds.has(target.assigned_user_id),
      );
    }
    return getAssignedTargetDetails(project, activeUser);
  };

  const visibleProjects = projects.filter((project) => {
    if (isManajemen) {
      if (selectedTeam !== "all") {
        const teamInvolved =
          project.owner_team === selectedTeam ||
          project.collaborator_teams.includes(selectedTeam);
        if (!teamInvolved) return false;
      }
      return getScopedTargets(project).length > 0;
    }
    return getScopedTargets(project).length > 0;
  });
  const filteredProjects =
    selectedProjectId === "all"
      ? visibleProjects
      : visibleProjects.filter((project) => project.id === selectedProjectId);
  useEffect(() => {
    if (selectedProjectId !== "all" && !visibleProjects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId("all");
    }
  }, [selectedProjectId, visibleProjects]);
  const ganttItems = filteredProjects
    .flatMap((project) =>
      getScopedTargets(project).map((target) => {
        const start = target.mulai ?? project.dibuat_pada;
        const end = target.deadline ?? project.deadline ?? start;

        return {
          id: target.id,
          project,
          target,
          start,
          end: end < start ? start : end,
          status: getEffectiveTargetStatus(target, completedTargetIds),
          isCompleted: isTargetCompleted(target, completedTargetIds),
        };
      }),
    )
    .filter((item) => isDateKey(item.start) && isDateKey(item.end))
    .sort((first, second) => first.start.localeCompare(second.start));
  const totalTargets = ganttItems.length;
  const completedTargets = ganttItems.filter((item) => item.isCompleted).length;
  const overdueTargets = ganttItems.filter(
    (item) => !item.isCompleted && Boolean(item.target.deadline && item.target.deadline < today),
  ).length;
  const completionRate = totalTargets ? Math.round((completedTargets / totalTargets) * 100) : 0;
  const minDate = ganttItems[0]?.start ?? today;
  const maxDate =
    ganttItems.map((item) => item.end).sort().at(-1) ??
    ganttItems.map((item) => item.start).sort().at(-1) ??
    today;
  const totalDays = Math.max(1, getDateDistance(minDate, maxDate) + 1);
  const todayOffset =
    today >= minDate && today <= maxDate
      ? Math.min(100, Math.max(0, (getDateDistance(minDate, today) / totalDays) * 100))
      : null;
  const ticks = getGanttTicks(minDate, maxDate);
  const toggleTargetExpansion = (targetId: string) => {
    setExpandedTargetIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(targetId)) {
        nextIds.delete(targetId);
      } else {
        nextIds.add(targetId);
      }

      return nextIds;
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-sm sm:text-base">Gantt Detail Tugas</CardTitle>
            <CardDescription className="text-xs">
              {isManajemen
                ? selectedTeam === "all"
                  ? "Timeline semua tim dengan filter proyek."
                  : `Timeline ${selectedTeam} dengan filter proyek.`
                : "Timeline detail tugas dengan filter proyek."}
            </CardDescription>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 sm:min-w-[24rem]">
            {isManajemen && (
              <div className="grid gap-1">
                <Label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Users className="h-3 w-3" aria-hidden="true" />
                  Filter tim
                </Label>
                <Select
                  value={selectedTeam}
                  onValueChange={(v) => {
                    setSelectedTeam(v as TeamType | "all");
                    setSelectedProjectId("all");
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Pilih tim" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua tim</SelectItem>
                    {teamTypeOptions.map((team) => (
                      <SelectItem key={team} value={team}>
                        {team}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-1">
              <Label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Filter className="h-3 w-3" aria-hidden="true" />
                Filter proyek
              </Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Pilih proyek" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua proyek</SelectItem>
                  {visibleProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.nama_proyek}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <GanttSummaryCard label="Detail tugas" value={totalTargets} />
          <GanttSummaryCard label="Selesai" value={completedTargets} tone="success" />
          <GanttSummaryCard label="Overdue" value={overdueTargets} tone="danger" />
          <GanttSummaryCard label="Progress" value={`${completionRate}%`} />
        </div>
        {ganttItems.length > 0 ? (
          <div className="w-full overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-[12rem_1fr] gap-2 border-b border-border/60 pb-2 text-[11px] font-medium text-muted-foreground">
                <span>Detail tugas</span>
                <div className="relative h-5">
                  {ticks.map((tick) => (
                    <span
                      key={tick.date}
                      className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
                      style={{ left: `${tick.offset}%` }}
                    >
                      {formatShortDate(tick.date)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid max-h-[420px] gap-1.5 overflow-y-auto pt-2 pr-1">
                {ganttItems.map((item) => {
                  const left = (getDateDistance(minDate, item.start) / totalDays) * 100;
                  const width = Math.max(2, ((getDateDistance(item.start, item.end) + 1) / totalDays) * 100);
                  const isExpanded = expandedTargetIds.has(item.id);

                  return (
                    <div
                      key={item.id}
                      className="grid grid-cols-[12rem_1fr] items-start gap-2 rounded-md border border-border/60 bg-white/70 p-2"
                    >
                      <div className="min-w-0">
                        <button
                          type="button"
                          className="flex w-full min-w-0 items-start gap-1.5 text-left"
                          onClick={() => toggleTargetExpansion(item.id)}
                        >
                          <ChevronDown
                            className={cn(
                              "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                              isExpanded && "rotate-180",
                            )}
                            aria-hidden="true"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium">{item.target.deskripsi}</span>
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {item.project.nama_proyek}
                            </span>
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="ml-5 mt-1.5 grid gap-0.5 text-[10px] text-muted-foreground">
                            <span>PIC: {getAssignedUserName(item.target.assigned_user_id, users)}</span>
                            <span>{formatTargetSchedule(item.target)}</span>
                            <span>Durasi: {getTaskPlannedDuration(item.target) ?? "-"} hari · {item.status}</span>
                          </div>
                        )}
                      </div>
                      <div className="relative h-7 rounded bg-muted/60">
                        {todayOffset !== null && (
                          <span
                            className="absolute top-0 h-full w-px bg-red-500"
                            style={{ left: `${todayOffset}%` }}
                            aria-hidden="true"
                          />
                        )}
                        <div
                          className={cn(
                            "absolute top-1 h-5 rounded px-1.5 text-[10px] font-medium text-white",
                            ganttStatusClass[item.status],
                          )}
                          style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                          title={`${item.status} · ${formatDate(item.start)} - ${formatDate(item.end)}`}
                        >
                          <span className="flex h-full items-center overflow-hidden whitespace-nowrap">
                            <span className="truncate">{item.status}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {todayOffset !== null && (
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="inline-block h-3 w-px bg-red-500" aria-hidden="true" />
                  Garis merah = hari ini
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
            Belum ada detail tugas bertanggal untuk filter ini.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GanttSummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 px-2.5 py-1.5",
        tone === "success" && "border-emerald-200 bg-emerald-50",
        tone === "danger" && "border-red-200 bg-red-50",
      )}
    >
      <p
        className={cn(
          "text-[10px] text-muted-foreground",
          tone === "success" && "text-emerald-700",
          tone === "danger" && "text-red-700",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-base font-semibold leading-tight",
          tone === "success" && "text-emerald-700",
          tone === "danger" && "text-red-700",
        )}
      >
        {value}
      </p>
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
        action={activeUser.role === "Leader" ? <ProjectDialog activeUser={activeUser} users={users} onSubmit={onCreateProject} /> : null}
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
                        <ProjectTeamBadges project={project} />
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
                            <ProjectDialog activeUser={activeUser} project={project} users={users} onSubmit={onUpdateProject} />
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
  activeUser,
  onSubmit,
}: {
  project?: Project;
  users?: User[];
  activeUser: User;
  onSubmit: (project: Project) => void;
}) {
  const ownerTeam: TeamType = project?.owner_team ?? activeUser.team_type;
  const otherTeams = teamTypeOptions.filter((team) => team !== ownerTeam);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project?.nama_proyek ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "Berjalan");
  const [collaboratorTeams, setCollaboratorTeams] = useState<TeamType[]>(
    () => project?.collaborator_teams ?? [],
  );
  const [targetRows, setTargetRows] = useState<TargetDraft[]>(() =>
    getInitialTargetRows(project),
  );
  const targetItems = useMemo(() => normalizeTargetRows(targetRows), [targetRows]);
  const targetCount = targetItems.length || project?.target_tugas || 0;
  const computedProjectDeadline = getProjectDeadlineFromTargets(targetItems) ?? project?.deadline ?? null;
  const allowedTeams = useMemo<TeamType[]>(
    () => [ownerTeam, ...collaboratorTeams],
    [ownerTeam, collaboratorTeams],
  );
  const eligibleUsers = useMemo(
    () => users.filter((candidate) => allowedTeams.includes(candidate.team_type)),
    [allowedTeams, users],
  );

  const toggleCollaboratorTeam = (team: TeamType) => {
    setCollaboratorTeams((prev) =>
      prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team],
    );
  };

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
      owner_team: ownerTeam,
      collaborator_teams: collaboratorTeams,
    });
    setOpen(false);
    if (!project) {
      setName("");
      setStatus("Berjalan");
      setCollaboratorTeams([]);
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
      <DialogContent className="bottom-2 left-2 right-2 top-2 max-h-none w-auto max-w-none translate-x-0 translate-y-0 overflow-y-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:bottom-auto sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2">
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

          <div className="grid gap-2 rounded-xl border border-border/60 bg-white/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-sm font-medium">Tim owner</Label>
              <Badge variant="default" className="bg-indigo-600 text-white">
                {ownerTeam}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Owner otomatis = tim Leader yang membuat. Pilih tim kolaborator jika project dikerjakan lintas-tim.
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {otherTeams.map((team) => {
                const checked = collaboratorTeams.includes(team);
                return (
                  <button
                    type="button"
                    key={team}
                    onClick={() => toggleCollaboratorTeam(team)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      checked
                        ? "border-violet-300 bg-violet-100 text-violet-800"
                        : "border-border/60 bg-white text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {checked ? "✓ " : "+ "}
                    {team}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Label>Detail target tugas</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2 sm:w-auto"
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
                        {eligibleUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.nama} - {user.team_type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {eligibleUsers.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Belum ada user pada tim owner/kolaborator. Tambah tim kolaborator dulu.
                      </p>
                    )}
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
    note?: string,
  ) => void;
}) {
  const selectableProjects = projects.filter(
    (project) =>
      project.status !== "Selesai" &&
      (activeUser.role === "Leader" || getVisibleTargetDetails(project, activeUser).length > 0),
  );
  const [selectedProject, setSelectedProject] = useState(selectableProjects[0]?.id ?? "");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectableProjects.some((project) => project.id === selectedProject)) {
      setSelectedProject(selectableProjects[0]?.id ?? "");
    }
  }, [selectableProjects, selectedProject]);
  const selectedProjectData = selectableProjects.find((project) => project.id === selectedProject);
  const projectTasks = tasks.filter((task) => task.project_id === selectedProject);
  const completedTargetIds = getCompletedTargetIds(projectTasks);
  const completedTaskByTargetId = useMemo(() => {
    const map = new Map<string, Task>();
    for (const task of projectTasks) {
      if (task.target_task_id) map.set(task.target_task_id, task);
    }
    return map;
  }, [projectTasks]);
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
    note?: string,
  ) => {
    if (!selectedProjectData) {
      return;
    }

    onUpdateTaskStatus(selectedProjectData.id, target.id, status, note);
  };

  const handleSubmitCompletion = (target: Project["target_detail_tugas"][number]) => {
    const note = noteDrafts[target.id]?.trim();
    handleTargetStatusChange(target, "Selesai", note || undefined);
    setExpandedNoteId(null);
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Jurnal Tugas Harian"
        description="Ubah status detail target dan tuliskan catatan singkat tentang apa yang Anda kerjakan."
      />

      <div className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Checklist Detail Tugas</CardTitle>
                <CardDescription>
                  Pilih proyek, ubah status, dan jelaskan apa yang Anda lakukan. Perubahan tersimpan otomatis.
                </CardDescription>
              </div>
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconToneClass.emerald.bg)}>
                <ClipboardList className={cn("h-5 w-5", iconToneClass.emerald.text)} aria-hidden="true" />
              </div>
            </div>
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
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-white/70 px-3 py-2 text-sm">
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
                        const completionTask = completedTaskByTargetId.get(target.id);
                        const draftNote = noteDrafts[target.id] ?? "";
                        const isExpanded = expandedNoteId === target.id;

                        return (
                          <div
                            key={target.id}
                            className={cn(
                              "grid gap-3 rounded-xl border border-border/60 p-3 text-sm transition-colors",
                              isCompleted ? "bg-emerald-50/80 text-emerald-900" : "bg-white/70 hover:bg-white",
                            )}
                          >
                            <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
                              <span className={cn(isCompleted && "line-through")}>
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium">{target.deskripsi}</span>
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
                                onValueChange={(value) => {
                                  const next = value as TargetTaskStatus;
                                  if (next === "Selesai") {
                                    setExpandedNoteId(target.id);
                                  } else {
                                    setExpandedNoteId(null);
                                    handleTargetStatusChange(target, next);
                                  }
                                }}
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

                            {isCompleted && completionTask?.deskripsi && completionTask.deskripsi !== target.deskripsi && (
                              <div className="rounded-lg border border-emerald-200 bg-white/80 p-2 text-xs text-emerald-900">
                                <span className="font-medium">Catatan: </span>
                                {completionTask.deskripsi}
                              </div>
                            )}

                            {!isCompleted && isExpanded && (
                              <div className="grid gap-2 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/60 p-3">
                                <Label htmlFor={`note-${target.id}`} className="text-xs font-medium text-emerald-900">
                                  Jelaskan apa yang Anda lakukan pada tugas ini
                                </Label>
                                <Textarea
                                  id={`note-${target.id}`}
                                  rows={3}
                                  value={draftNote}
                                  onChange={(event) =>
                                    setNoteDrafts((prev) => ({ ...prev, [target.id]: event.target.value }))
                                  }
                                  placeholder="Contoh: Sudah menyusun draft proposal v1 dan mengirim ke reviewer."
                                  className="bg-white"
                                />
                                <div className="flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setExpandedNoteId(null)}
                                  >
                                    Batal
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => handleSubmitCompletion(target)}
                                  >
                                    Tandai selesai
                                  </Button>
                                </div>
                              </div>
                            )}

                            {!isCompleted && !isExpanded && (
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-2"
                                  onClick={() => setExpandedNoteId(target.id)}
                                >
                                  <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
                                  Tambah catatan & selesaikan
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                      Tidak ada detail tugas yang ditugaskan ke akun ini.
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                  Belum ada proyek aktif yang ditugaskan ke akun ini.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Riwayat Tugas</CardTitle>
                <CardDescription>Catatan terbaru yang masuk ke proyek.</CardDescription>
              </div>
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconToneClass.sky.bg)}>
                <ListChecks className={cn("h-5 w-5", iconToneClass.sky.text)} aria-hidden="true" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            {tasks.length > 0 ? (
              tasks.slice(0, 8).map((task) => (
                <ActivityItem key={task.id} task={task} projects={projects} users={users} />
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                Belum ada tugas harian.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KanbanView({
  activeUser,
  projects,
  tasks,
  users,
}: {
  activeUser: User;
  projects: ProjectWithProgress[];
  tasks: Task[];
  users: User[];
}) {
  const today = getLocalDateKey();
  const isManajemen = activeUser.role === "Manajemen";
  const [selectedTeam, setSelectedTeam] = useState<TeamType | "all">("all");
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const completedTargetIds = getCompletedTargetIds(tasks);

  const teamUserIds = useMemo(() => {
    if (selectedTeam === "all") return null;
    return new Set(users.filter((u) => u.team_type === selectedTeam).map((u) => u.id));
  }, [selectedTeam, users]);

  const getScopedTargets = (project: ProjectWithProgress) => {
    if (isManajemen) {
      if (!teamUserIds) {
        return project.target_detail_tugas.filter((t) => t.assigned_user_id);
      }
      return project.target_detail_tugas.filter(
        (target) => target.assigned_user_id && teamUserIds.has(target.assigned_user_id),
      );
    }
    return getKanbanTargetDetails(project, activeUser);
  };

  const visibleProjects = projects.filter((project) => {
    if (isManajemen) {
      if (selectedTeam !== "all") {
        const teamInvolved =
          project.owner_team === selectedTeam ||
          project.collaborator_teams.includes(selectedTeam);
        if (!teamInvolved) return false;
      }
      return getScopedTargets(project).length > 0;
    }
    return getScopedTargets(project).length > 0;
  });

  const filteredProjects =
    selectedProjectId === "all"
      ? visibleProjects
      : visibleProjects.filter((project) => project.id === selectedProjectId);
  useEffect(() => {
    if (selectedProjectId !== "all" && !visibleProjects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId("all");
    }
  }, [selectedProjectId, visibleProjects]);
  const kanbanItems = filteredProjects
    .flatMap((project) =>
      getScopedTargets(project).map((target) => ({
        project,
        target,
        status: getEffectiveTargetStatus(target, completedTargetIds),
        isCompleted: isTargetCompleted(target, completedTargetIds),
      })),
    )
    .sort((first, second) => {
      const firstDeadline = first.target.deadline ?? first.project.deadline ?? "9999-12-31";
      const secondDeadline = second.target.deadline ?? second.project.deadline ?? "9999-12-31";

      return firstDeadline.localeCompare(secondDeadline);
    });
  const itemsByStatus = new Map(
    targetStatusColumns.map((status) => [
      status,
      kanbanItems.filter((item) => item.status === status),
    ]),
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Kanban Tugas"
        description={
          isManajemen
            ? selectedTeam === "all"
              ? "Pantau semua target lintas tim berdasarkan status pengerjaan."
              : `Pantau target ${selectedTeam} berdasarkan status pengerjaan.`
            : activeUser.role === "Leader"
              ? "Pantau semua target tugas berdasarkan status pengerjaan."
              : "Pantau target tugas yang ditugaskan ke akun Anda."
        }
        action={
          <div className="grid gap-2 sm:grid-cols-2 sm:min-w-[24rem]">
            {isManajemen && (
              <div className="grid gap-1">
                <Label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Users className="h-3 w-3" aria-hidden="true" />
                  Filter tim
                </Label>
                <Select
                  value={selectedTeam}
                  onValueChange={(v) => {
                    setSelectedTeam(v as TeamType | "all");
                    setSelectedProjectId("all");
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Pilih tim" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua tim</SelectItem>
                    {teamTypeOptions.map((team) => (
                      <SelectItem key={team} value={team}>
                        {team}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-1">
              <Label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Filter className="h-3 w-3" aria-hidden="true" />
                Filter proyek
              </Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Pilih proyek" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua proyek</SelectItem>
                  {visibleProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.nama_proyek}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        }
      />

      <div className="rounded-xl border border-dashed border-border/60 bg-white/60 p-3 text-xs text-muted-foreground">
        Tampilan ini bersifat <span className="font-medium">read-only</span>. Status kartu akan otomatis berpindah mengikuti aktivitas pada <span className="font-medium">Jurnal Tugas Harian</span>.
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-4">
        {targetStatusColumns.map((status) => {
          const items = itemsByStatus.get(status) ?? [];

          return (
            <Card key={status} className="h-fit">
              <CardHeader className="space-y-0 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-sm">{status}</CardTitle>
                  <Badge variant={status === "Selesai" ? "success" : status === "Koreksi" ? "warning" : "secondary"}>
                    {items.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3">
                {items.length > 0 ? (
                  items.map(({ project, target, isCompleted }) => (
                    <div key={target.id} className="grid gap-3 rounded-xl border border-border/60 bg-white/80 p-3">
                      <div className="grid gap-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn("text-sm font-medium", isCompleted && "line-through")}>
                            {target.deskripsi}
                          </p>
                          <TargetStatusBadge
                            target={target}
                            today={today}
                            isCompleted={isCompleted}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">{project.nama_proyek}</p>
                        <p className="text-xs text-muted-foreground">
                          PIC: {getAssignedUserName(target.assigned_user_id, users)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{formatTargetSchedule(target)}</Badge>
                        {getTaskPlannedDuration(target) ? (
                          <Badge variant="outline">{getTaskPlannedDuration(target)} hari</Badge>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                    Tidak ada tugas.
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ProjectTeamBadges({ project }: { project: Project }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant="default" className="bg-indigo-600 text-white text-[10px]">
        Owner: {project.owner_team}
      </Badge>
      {project.collaborator_teams.map((team) => (
        <Badge
          key={team}
          variant="outline"
          className="border-violet-300 bg-violet-50 text-[10px] text-violet-800"
        >
          + {team}
        </Badge>
      ))}
    </div>
  );
}

function ReportView({
  activeUser,
  projects,
  tasks,
  users,
}: {
  activeUser: User;
  projects: ProjectWithProgress[];
  tasks: Task[];
  users: User[];
}) {
  const today = getLocalDateKey();
  const defaultFrom = useMemo(() => {
    const d = new Date(`${today}T00:00:00`);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }, [today]);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<import("@/lib/reports/analyze").ReportData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState("");

  if (activeUser.role !== "Manajemen") {
    return (
      <div className="grid gap-4">
        <PageHeader
          title="Akses Terbatas"
          description="Halaman Report hanya dapat diakses oleh role Manajemen."
        />
      </div>
    );
  }

  const applyPreset = (preset: "month" | "quarter" | "semester" | "year") => {
    const d = new Date(`${today}T00:00:00`);
    const year = d.getFullYear();
    const month = d.getMonth();
    let start: Date;
    let end: Date;
    if (preset === "month") {
      start = new Date(year, month, 1);
      end = new Date(year, month + 1, 0);
    } else if (preset === "quarter") {
      const qStart = Math.floor(month / 3) * 3;
      start = new Date(year, qStart, 1);
      end = new Date(year, qStart + 3, 0);
    } else if (preset === "semester") {
      const sStart = Math.floor(month / 6) * 6;
      start = new Date(year, sStart, 1);
      end = new Date(year, sStart + 6, 0);
    } else {
      start = new Date(year, 0, 1);
      end = new Date(year, 11, 31);
    }
    const fmt = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    setFrom(fmt(start));
    setTo(fmt(end));
  };

  const handleGenerate = async () => {
    setError("");
    if (from > to) {
      setError("Tanggal mulai harus sebelum tanggal akhir.");
      return;
    }
    setIsGenerating(true);
    try {
      const { buildReport } = await import("@/lib/reports/analyze");
      const result = buildReport({ projects, tasks, users, range: { from, to } });
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal generate laporan.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!report) return;
    setIsDownloading(true);
    try {
      const { downloadReportPdf } = await import("@/lib/reports/pdf");
      downloadReportPdf(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal generate PDF.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Laporan Kinerja Tim SDK"
        description="Generate narasi analitis KPI organisasi, beban kerja per tim/anggota, dan rekomendasi kebijakan. Unduh sebagai PDF untuk distribusi internal."
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Konfigurasi Laporan</CardTitle>
              <CardDescription>Pilih rentang periode lalu klik Generate.</CardDescription>
            </div>
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconToneClass.amber.bg)}>
              <FileText className={cn("h-5 w-5", iconToneClass.amber.text)} aria-hidden="true" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="report-from" className="text-xs">Dari tanggal</Label>
              <Input id="report-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="report-to" className="text-xs">Sampai tanggal</Label>
              <Input id="report-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("month")}>
              Bulan ini
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("quarter")}>
              Kuarter ini
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("semester")}>
              Semester ini
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("year")}>
              Tahun ini
            </Button>
          </div>
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleGenerate} disabled={isGenerating} className="gap-2">
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              {isGenerating ? "Memproses..." : "Generate Laporan"}
            </Button>
            {report && (
              <>
                <Button type="button" variant="default" onClick={handleDownload} disabled={isDownloading} className="gap-2">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {isDownloading ? "Menyiapkan PDF..." : "Download PDF"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setReport(null)}>
                  Bersihkan
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {report && <ReportPreview report={report} />}
    </div>
  );
}

function ReportPreview({ report }: { report: import("@/lib/reports/analyze").ReportData }) {
  const workloadBadgeClass: Record<string, string> = {
    ringan: "bg-sky-100 text-sky-800",
    seimbang: "bg-emerald-100 text-emerald-800",
    berat: "bg-amber-100 text-amber-800",
    overload: "bg-rose-100 text-rose-800",
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Ringkasan Organisasi</CardTitle>
          <CardDescription className="text-xs">
            Periode {formatDate(report.range.from)} – {formatDate(report.range.to)}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricCard label="Total Target" value={report.org.totalTargets} icon={ClipboardList} tone="indigo" />
            <MetricCard label="Selesai" value={report.org.completed} icon={CheckCircle2} tone="emerald" />
            <MetricCard label="Overdue" value={report.org.overdue} icon={AlertTriangle} tone="rose" />
            <MetricCard label="Completion" value={`${report.org.completionRate}%`} icon={BarChart3} tone="amber" />
          </div>
          <div className="rounded-xl border border-border/60 bg-white/70 p-3 text-sm leading-relaxed text-foreground">
            {report.orgNarrative.split("\n\n").map((p, i) => (
              <p key={i} className={cn(i > 0 && "mt-2")}>{p}</p>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Progres per Tim</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {report.teams.map((team) => (
            <div key={team.team} className="grid gap-1">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-medium">{team.team}</span>
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", workloadBadgeClass[team.workloadStatus])}>
                    {team.workloadStatus}
                  </span>
                  <span className="text-muted-foreground">
                    {team.completed}/{team.totalTargets} · {team.completionRate}%
                  </span>
                </div>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    team.completionRate >= 70 ? "bg-emerald-500" : team.completionRate >= 40 ? "bg-indigo-500" : "bg-rose-500",
                  )}
                  style={{ width: `${team.completionRate}%` }}
                />
              </div>
              {team.narrative && (
                <p className="text-xs leading-relaxed text-muted-foreground">{team.narrative}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {report.members.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Kinerja Anggota</CardTitle>
            <CardDescription className="text-xs">
              {report.members.length} anggota dengan target aktif dalam periode terpilih.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Tim</TableHead>
                  <TableHead className="text-right">Active</TableHead>
                  <TableHead className="text-right">Selesai</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="text-right">Completion</TableHead>
                  <TableHead>Beban</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.nama}</TableCell>
                    <TableCell className="text-xs">{m.team}</TableCell>
                    <TableCell className="text-right text-xs">{m.activeTargets}</TableCell>
                    <TableCell className="text-right text-xs">{m.completed}</TableCell>
                    <TableCell className="text-right text-xs text-rose-700">{m.overdue}</TableCell>
                    <TableCell className="text-right text-xs font-semibold">{m.completionRate}%</TableCell>
                    <TableCell>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", workloadBadgeClass[m.workloadStatus])}>
                        {m.workloadStatus}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Rekomendasi Kebijakan</CardTitle>
          <CardDescription className="text-xs">
            Disusun otomatis berdasarkan distribusi target & beban kerja.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm">
            {report.recommendations.map((rec, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" aria-hidden="true" />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

type AppNotification = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  view: View;
  tone: IconTone;
  icon: typeof Bell;
};

function buildNotifications(
  activeUser: User,
  projects: ProjectWithProgress[],
  tasks: Task[],
  users: User[],
): AppNotification[] {
  const today = getLocalDateKey();
  const notifications: AppNotification[] = [];

  if (activeUser.role === "Tim") {
    projects.forEach((project) => {
      project.target_detail_tugas.forEach((target) => {
        if (target.assigned_user_id !== activeUser.id) return;
        if (target.status === "Selesai") return;

        if (target.deadline) {
          const daysLeft = getDaysUntilDeadline(target.deadline, today);
          if (daysLeft < 0) {
            notifications.push({
              id: `overdue-${target.id}`,
              title: "Tugas overdue",
              description: `${target.deskripsi} di ${project.nama_proyek} terlambat ${Math.abs(daysLeft)} hari.`,
              createdAt: target.deadline,
              view: "journal",
              tone: "rose",
              icon: AlertTriangle,
            });
          } else if (daysLeft <= 3) {
            notifications.push({
              id: `due-${target.id}`,
              title: "Deadline dekat",
              description: `${target.deskripsi} di ${project.nama_proyek} jatuh tempo ${daysLeft === 0 ? "hari ini" : `dalam ${daysLeft} hari`}.`,
              createdAt: target.deadline,
              view: "journal",
              tone: "amber",
              icon: CalendarClock,
            });
          }
        }

        if (target.status === "Belum Mulai") {
          notifications.push({
            id: `assigned-${target.id}`,
            title: "Tugas baru ditugaskan",
            description: `${target.deskripsi} di ${project.nama_proyek}.`,
            createdAt: target.deadline ?? project.dibuat_pada,
            view: "journal",
            tone: "indigo",
            icon: Sparkles,
          });
        }
      });
    });
  } else {
    const recentTasks = [...tasks].sort((a, b) => b.tanggal.localeCompare(a.tanggal)).slice(0, 10);
    recentTasks.forEach((task) => {
      const project = projects.find((p) => p.id === task.project_id);
      const user = users.find((u) => u.id === task.user_id);
      if (!project) return;
      notifications.push({
        id: `done-${task.id}`,
        title: "Tugas diselesaikan",
        description: `${user?.nama ?? "Anggota"} menyelesaikan tugas di ${project.nama_proyek}.`,
        createdAt: task.tanggal,
        view: "dashboard",
        tone: "emerald",
        icon: CheckCircle2,
      });
    });

    projects.forEach((project) => {
      if (!project.deadline || project.status === "Selesai") return;
      if (isProjectOverdue(project, today)) {
        notifications.push({
          id: `proj-overdue-${project.id}`,
          title: "Proyek overdue",
          description: `${project.nama_proyek} sudah melewati deadline.`,
          createdAt: project.deadline,
          view: "dashboard",
          tone: "rose",
          icon: AlertTriangle,
        });
      } else {
        const daysLeft = getDaysUntilDeadline(project.deadline, today);
        if (daysLeft <= 7 && daysLeft >= 0) {
          notifications.push({
            id: `proj-due-${project.id}`,
            title: "Deadline proyek dekat",
            description: `${project.nama_proyek} jatuh tempo dalam ${daysLeft === 0 ? "hari ini" : `${daysLeft} hari`}.`,
            createdAt: project.deadline,
            view: "dashboard",
            tone: "amber",
            icon: CalendarClock,
          });
        }
      }
    });
  }

  return notifications
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 30);
}

function NotificationBell({
  activeUser,
  projects,
  tasks,
  users,
  onNavigate,
}: {
  activeUser: User;
  projects: ProjectWithProgress[];
  tasks: Task[];
  users: User[];
  onNavigate: (view: View) => void;
}) {
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const storageKey = `protrack:notif-read:${activeUser.id}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) setReadIds(new Set(JSON.parse(stored) as string[]));
    } catch {
      // ignore
    }
  }, [storageKey]);

  const persist = (next: Set<string>) => {
    setReadIds(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
    }
  };

  const notifications = useMemo(
    () => buildNotifications(activeUser, projects, tasks, users),
    [activeUser, projects, tasks, users],
  );
  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  const handleClick = (notif: AppNotification) => {
    const next = new Set(readIds);
    next.add(notif.id);
    persist(next);
    onNavigate(notif.view);
    setOpen(false);
  };

  const handleMarkAll = () => {
    const next = new Set(readIds);
    notifications.forEach((n) => next.add(n.id));
    persist(next);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-notif-root]")) {
        setOpen(false);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [open]);

  const viewLabels: Record<View, string> = {
    dashboard: "Dasbor",
    projects: "Proyek",
    kanban: "Kanban",
    journal: "Tugas Harian",
    report: "Report",
  };

  return (
    <div className="relative shrink-0" data-notif-root>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-white text-muted-foreground transition-colors hover:bg-indigo-50 hover:text-indigo-600"
        aria-label="Notifikasi"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-50 max-h-[80vh] overflow-hidden rounded-2xl border border-border/60 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-80">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Notifikasi</p>
              <p className="text-xs text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} belum dibaca` : "Semua sudah dibaca"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {notifications.length > 0 && unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAll}
                  className="text-xs font-medium text-indigo-600 hover:underline"
                >
                  Tandai semua
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted/50"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length > 0 ? (
              notifications.map((notif) => {
                const Icon = notif.icon;
                const tone = iconToneClass[notif.tone];
                const isRead = readIds.has(notif.id);
                return (
                  <button
                    key={notif.id}
                    type="button"
                    onClick={() => handleClick(notif)}
                    className={cn(
                      "flex w-full gap-3 border-b border-border/40 px-4 py-3 text-left transition-colors hover:bg-muted/40",
                      !isRead && "bg-indigo-50/40",
                    )}
                  >
                    <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tone.bg)}>
                      <Icon className={cn("h-4 w-4", tone.text)} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {notif.title}
                        </span>
                        {!isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-500" />}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                        {notif.description}
                      </span>
                      <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-indigo-600">
                        Buka {viewLabels[notif.view]}
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </span>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Belum ada notifikasi.
              </div>
            )}
          </div>
        </div>
      )}
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
    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-normal sm:text-2xl">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="w-full sm:w-auto">{action}</div> : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "indigo",
}: {
  label: string;
  value: string | number;
  icon: typeof FolderKanban;
  tone?: IconTone;
}) {
  const palette = iconToneClass[tone];
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", palette.bg)}>
          <Icon className={cn("h-5 w-5", palette.text)} aria-hidden="true" />
        </div>
      </CardContent>
    </Card>
  );
}

const targetStatusColumns: TargetTaskStatus[] = [
  "Belum Mulai",
  "Dikerjakan",
  "Koreksi",
  "Selesai",
];

const targetStatusBarClass: Record<TargetTaskStatus, string> = {
  "Belum Mulai": "bg-slate-400",
  Dikerjakan: "bg-blue-500",
  Koreksi: "bg-amber-500",
  Selesai: "bg-emerald-500",
};

const ganttStatusClass: Record<TargetTaskStatus, string> = {
  "Belum Mulai": "bg-slate-500",
  Dikerjakan: "bg-blue-600",
  Koreksi: "bg-amber-500 text-amber-950",
  Selesai: "bg-emerald-600",
};

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
  completedTargetIds: Set<string>,
): TargetTaskStatus {
  if (completedTargetIds.has(target.id)) {
    return "Selesai";
  }

  return target.status;
}

function getCompletedTargetIds(tasks: Task[]) {
  return new Set(
    tasks
      .map((task) => task.target_task_id)
      .filter((targetTaskId): targetTaskId is string => Boolean(targetTaskId)),
  );
}

function isTargetCompleted(
  target: Project["target_detail_tugas"][number],
  completedTargetIds: Set<string>,
) {
  return target.status === "Selesai" || completedTargetIds.has(target.id);
}

function getAssignedTargetDetails(project: Project, activeUser: User) {
  if (activeUser.role === "Leader") {
    return project.target_detail_tugas;
  }

  return project.target_detail_tugas.filter((target) => target.assigned_user_id === activeUser.id);
}

function getKanbanTargetDetails(project: Project, activeUser: User) {
  return getAssignedTargetDetails(project, activeUser);
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

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getDateDistance(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  return Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
}

function addDays(date: string, days: number) {
  const nextDate = new Date(`${date}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate.toISOString().slice(0, 10);
}

function getGanttTicks(startDate: string, endDate: string) {
  const totalDays = Math.max(1, getDateDistance(startDate, endDate) + 1);
  const tickCount = Math.min(5, totalDays);

  if (tickCount <= 1) {
    return [{ date: startDate, offset: 0 }];
  }

  return Array.from({ length: tickCount }, (_, index) => {
    const dayOffset = Math.round(((totalDays - 1) / (tickCount - 1)) * index);

    return {
      date: addDays(startDate, dayOffset),
      offset: (dayOffset / totalDays) * 100,
    };
  });
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
  }).format(new Date(date));
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
        <div>
          <p className="text-sm font-medium">{user?.nama ?? "Anggota Tim"}</p>
          {user?.team_type ? (
            <p className="text-xs text-muted-foreground">{user.team_type}</p>
          ) : null}
        </div>
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
        collaborator_teams: project.collaborator_teams,
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
        collaborator_teams: project.collaborator_teams,
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
  note?: string,
) {
  try {
    await fetchJson<Task | null>("/api/tasks", {
      method: "PATCH",
      body: JSON.stringify({
        project_id: projectId,
        target_task_id: targetTaskId,
        status,
        tanggal: getLocalDateKey(),
        ...(note ? { deskripsi: note } : {}),
      }),
    });
  } catch (error) {
    showToast(getErrorMessage(error));
    await refresh();
  }
}

async function requestPasswordReset(email: string) {
  const response = await fetch("/api/auth/request-password-reset", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      redirectTo: "/",
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? payload.message ?? "Gagal mengirim link reset password");
  }
}

async function resetPassword(token: string, newPassword: string) {
  const response = await fetch("/api/auth/reset-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token,
      newPassword,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? payload.message ?? "Gagal menyimpan password baru");
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Terjadi kesalahan. Coba lagi.";
}

const WORKSPACE_CACHE_KEY = "protrack:workspace-cache:v1";
const ACTIVE_VIEW_KEY = "protrack:active-view:v1";

type WorkspaceCache = {
  email: string;
  activeUser: User;
  users: User[];
  projects: ProjectWithProgress[];
  tasks: Task[];
};

function readWorkspaceCache(): WorkspaceCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WORKSPACE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceCache;
    if (!parsed?.email || !parsed.activeUser?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeWorkspaceCache(cache: WorkspaceCache) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WORKSPACE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota errors
  }
}

function clearWorkspaceCache() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(WORKSPACE_CACHE_KEY);
  } catch {
    // ignore
  }
}

function readActiveView(): View | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(ACTIVE_VIEW_KEY);
    if (
      value === "dashboard" ||
      value === "projects" ||
      value === "kanban" ||
      value === "journal" ||
      value === "report"
    ) {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

function writeActiveView(view: View) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_VIEW_KEY, view);
  } catch {
    // ignore
  }
}

function getAuthErrorMessage(message?: string) {
  if (!message) {
    return "Autentikasi gagal. Coba lagi.";
  }

  if (message === "EMAIL_NOT_VERIFIED" || message.toLowerCase().includes("email not verified")) {
    return "Email belum diverifikasi. Cek inbox email Anda untuk link verifikasi.";
  }

  return message;
}
