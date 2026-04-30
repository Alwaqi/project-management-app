"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  MailCheck,
  LayoutDashboard,
  LogOut,
  PenLine,
  Plus,
  Save,
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
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth-client";
import {
  formatDate,
  getProjectProgress,
  Project,
  ProjectStatus,
  Role,
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

type DashboardSummary = {
  metrics: {
    proyek_berjalan: number;
    tugas_hari_ini: number;
    rata_rata_progress: number;
    proyek_selesai: number;
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
        const [usersResponse, projectsResponse, tasksResponse, summaryResponse] = await Promise.all([
          fetchJson<User[]>("/api/users"),
          fetchJson<ProjectWithProgress[]>("/api/projects"),
          fetchJson<Task[]>("/api/tasks"),
          fetchJson<DashboardSummary>("/api/dashboard/summary"),
        ]);

        setUsers(usersResponse);
        setProjects(projectsResponse);
        setTasks(tasksResponse);
        setDashboardSummary(summaryResponse);

        const email = sessionEmail ?? session.data?.user?.email;
        const currentUser = usersResponse.find((user) => user.email === email);

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
    <main className="min-h-screen bg-background">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b bg-card lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col gap-6 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <BarChart3 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold">Ruang Kerja Proyek</p>
                <p className="text-xs text-muted-foreground">Lebih ringan dari Excel</p>
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

        <section className="flex-1 p-4 sm:p-6 lg:p-8">
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
              onCreateProject={(project) => {
                void createProject(project, loadWorkspace, showToast);
              }}
              onUpdateProject={(updatedProject) => {
                void updateProject(updatedProject, loadWorkspace, showToast);
              }}
              onCloseProject={(projectId) => {
                void closeProject(projectId, loadWorkspace, showToast);
              }}
            />
          )}
          {activeView === "journal" && (
            <JournalView
              activeUser={activeUser}
              projects={projects}
              tasks={tasks}
              users={users}
              onCreateTask={(task) => {
                void createTask(task, loadWorkspace, showToast);
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
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FolderKanban className="h-5 w-5" aria-hidden="true" />
          </div>
          <CardTitle className="text-xl">Masuk ke Ruang Kerja Proyek</CardTitle>
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
  const todayTasks = tasks.filter((task) => task.tanggal === getLocalDateKey());
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Proyek Berjalan" value={metrics?.proyek_berjalan ?? activeProjects.length} icon={FolderKanban} />
        <MetricCard label="Tugas Hari Ini" value={metrics?.tugas_hari_ini ?? todayTasks.length} icon={ClipboardList} />
        <MetricCard label="Rata-rata Progress" value={`${metrics?.rata_rata_progress ?? averageProgress}%`} icon={BarChart3} />
        <MetricCard label="Proyek Selesai" value={metrics?.proyek_selesai ?? completedProjects.length} icon={CheckCircle2} />
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
                        {project.target_tugas} tugas target
                      </p>
                    </div>
                    <Badge variant={statusVariant[project.status]}>{project.status}</Badge>
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
  onCreateProject,
  onUpdateProject,
  onCloseProject,
}: {
  activeUser: User;
  projects: ProjectWithProgress[];
  tasks: Task[];
  onCreateProject: (project: Project) => void;
  onUpdateProject: (project: Project) => void;
  onCloseProject: (projectId: string) => void;
}) {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Manajemen Proyek"
        description="Buat, edit, dan tutup proyek tanpa spreadsheet manual."
        action={activeUser.role === "Leader" ? <ProjectDialog onSubmit={onCreateProject} /> : null}
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
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Dibuat</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => {
                const progress = project.progress ?? getProjectProgress(project, tasks);
                return (
                  <TableRow key={project.id}>
                    <TableCell className="min-w-56 font-medium">{project.nama_proyek}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[project.status]}>{project.status}</Badge>
                    </TableCell>
                    <TableCell className="min-w-48">
                      <div className="flex items-center gap-3">
                        <Progress value={progress} />
                        <span className="w-10 text-right text-xs font-semibold">{progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(project.dibuat_pada)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {activeUser.role === "Leader" ? (
                          <>
                            <ProjectDialog project={project} onSubmit={onUpdateProject} />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={project.status === "Selesai"}
                              onClick={() => onCloseProject(project.id)}
                            >
                              Tutup
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
  onSubmit,
}: {
  project?: Project;
  onSubmit: (project: Project) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project?.nama_proyek ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "Berjalan");
  const [target, setTarget] = useState(project?.target_tugas.toString() ?? "8");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      id: project?.id ?? `p-${Date.now()}`,
      nama_proyek: name,
      status,
      target_tugas: Math.max(1, Number(target) || 1),
      dibuat_pada: project?.dibuat_pada ?? new Date().toISOString().slice(0, 10),
    });
    setOpen(false);
    if (!project) {
      setName("");
      setStatus("Berjalan");
      setTarget("8");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={project ? "outline" : "default"} size={project ? "sm" : "default"} className="gap-2">
          {project ? <PenLine className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          {project ? "Edit" : "Buat Proyek Baru"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project ? "Edit Proyek" : "Buat Proyek Baru"}</DialogTitle>
          <DialogDescription>
            Isi nama, status, dan target tugas agar progress bisa dipantau.
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
              <Label htmlFor="target">Target tugas</Label>
              <Input
                id="target"
                type="number"
                min={1}
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                required
              />
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
  onCreateTask,
}: {
  activeUser: User;
  projects: ProjectWithProgress[];
  tasks: Task[];
  users: User[];
  onCreateTask: (task: Task) => void;
}) {
  const selectableProjects = projects.filter((project) => project.status !== "Selesai");
  const [selectedProject, setSelectedProject] = useState(selectableProjects[0]?.id ?? "");
  const [description, setDescription] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onCreateTask({
      id: `t-${Date.now()}`,
      project_id: selectedProject,
      user_id: activeUser.id,
      deskripsi: description,
      tanggal: getLocalDateKey(),
    });
    setDescription("");
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Jurnal Tugas Harian"
        description="Catat pekerjaan yang selesai hari ini dan hubungkan ke proyek terkait."
      />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Input Tugas</CardTitle>
            <CardDescription>Satu catatan singkat sudah cukup untuk memperbarui progress.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={handleSubmit}>
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
              <div className="grid gap-2">
                <Label htmlFor="task-description">Apa yang sudah diselesaikan?</Label>
                <Textarea
                  id="task-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Contoh: Menyelesaikan validasi form login dan memperbaiki pesan error."
                  required
                />
              </div>
              <Button type="submit" className="gap-2" disabled={!selectedProject}>
                <Save className="h-4 w-4" aria-hidden="true" />
                Simpan Tugas
              </Button>
            </form>
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
  const projectStatusById = new Map(projects.map((project) => [project.id, project.status]));

  return users.map((user) => {
    const userTasks = tasks.filter((task) => task.user_id === user.id);
    const completed = userTasks.filter(
      (task) => projectStatusById.get(task.project_id) === "Selesai",
    ).length;
    const inProgress = userTasks.length - completed;

    return {
      ...user,
      completed,
      inProgress,
      total: userTasks.length,
      completionRate: userTasks.length ? Math.round((completed / userTasks.length) * 100) : 0,
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
