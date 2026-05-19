import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

const roleValues = ["Leader", "Tim", "Manajemen"] as const;
const teamTypeValues = [
  "Tim Sales",
  "Tim SE",
  "Tim Admin",
  "Tim Marketing dan Konten",
  "Tim Edukasi",
  "Tim SDK",
] as const;
const projectStatusValues = ["Menunggu", "Berjalan", "Selesai"] as const;
const targetTaskStatusValues = [
  "Belum Mulai",
  "Dikerjakan",
  "Koreksi",
  "Selesai",
] as const;
const projectCategoryValues = [
  "Training",
  "Eksplorasi",
  "Produksi Produk",
  "Workshop",
  "Sertifikasi",
  "Produksi Konten",
  "Publish Konten",
  "Evaluasi Konten",
] as const;

export const roleEnum = pgEnum("role", roleValues);
export const teamTypeEnum = pgEnum("team_type", teamTypeValues);
export const projectStatusEnum = pgEnum("project_status", projectStatusValues);
export const targetTaskStatusEnum = pgEnum("target_task_status", targetTaskStatusValues);
export const projectCategoryEnum = pgEnum("project_category", projectCategoryValues);

export const user = pgTable(
  "user",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: varchar("image", { length: 255 }),
    role: roleEnum("role").notNull().default("Tim"),
    teamType: teamTypeEnum("team_type").notNull().default("Tim Sales"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex("user_email_idx").on(table.email),
  }),
);

export const session = pgTable(
  "session",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
    ipAddress: varchar("ip_address", { length: 255 }),
    userAgent: text("user_agent"),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => ({
    tokenIdx: uniqueIndex("session_token_idx").on(table.token),
  }),
);

export const account = pgTable("account", {
  id: varchar("id", { length: 255 }).primaryKey(),
  accountId: varchar("account_id", { length: 255 }).notNull(),
  providerId: varchar("provider_id", { length: 255 }).notNull(),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: "date" }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: "date" }),
  scope: varchar("scope", { length: 255 }),
  password: text("password"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: varchar("id", { length: 255 }).primaryKey(),
  identifier: varchar("identifier", { length: 255 }).notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const client = pgTable(
  "client",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    nama: varchar("nama", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    namaIdx: uniqueIndex("client_nama_idx").on(table.nama),
  }),
);

export const project = pgTable("project", {
  id: varchar("id", { length: 255 }).primaryKey(),
  namaProyek: varchar("nama_proyek", { length: 255 }).notNull(),
  status: projectStatusEnum("status").notNull().default("Berjalan"),
  targetTugas: integer("target_tugas").notNull().default(8),
  deadline: date("deadline", { mode: "string" }),
  ownerTeam: teamTypeEnum("owner_team").notNull().default("Tim Admin"),
  category: projectCategoryEnum("category"),
  clientId: varchar("client_id", { length: 255 }).references(() => client.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const projectSpeaker = pgTable(
  "project_speaker",
  {
    projectId: varchar("project_id", { length: 255 })
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.userId] }),
    userIdx: index("project_speaker_user_idx").on(table.userId),
  }),
);

export const projectCollaboratorTeam = pgTable(
  "project_collaborator_team",
  {
    projectId: varchar("project_id", { length: 255 })
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    teamType: teamTypeEnum("team_type").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.teamType] }),
    teamIdx: index("pct_team_idx").on(table.teamType),
  }),
);

export const projectTargetTask = pgTable("project_target_task", {
  id: varchar("id", { length: 255 }).primaryKey(),
  projectId: varchar("project_id", { length: 255 })
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  assignedUserId: varchar("assigned_user_id", { length: 255 }).references(() => user.id, {
    onDelete: "set null",
  }),
  deskripsi: text("deskripsi").notNull(),
  status: targetTaskStatusEnum("status").notNull().default("Belum Mulai"),
  mulai: date("mulai", { mode: "string" }),
  deadline: date("deadline", { mode: "string" }),
  urutan: integer("urutan").notNull().default(1),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const task = pgTable("task", {
  id: varchar("id", { length: 255 }).primaryKey(),
  projectId: varchar("project_id", { length: 255 })
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  targetTaskId: varchar("target_task_id", { length: 255 }).references(() => projectTargetTask.id, {
    onDelete: "set null",
  }),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  deskripsi: text("deskripsi").notNull(),
  tanggal: date("tanggal", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  tasks: many(task),
  assignedTargetTasks: many(projectTargetTask),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const projectRelations = relations(project, ({ one, many }) => ({
  tasks: many(task),
  targetTasks: many(projectTargetTask),
  collaboratorTeams: many(projectCollaboratorTeam),
  speakers: many(projectSpeaker),
  client: one(client, {
    fields: [project.clientId],
    references: [client.id],
  }),
}));

export const projectSpeakerRelations = relations(projectSpeaker, ({ one }) => ({
  project: one(project, {
    fields: [projectSpeaker.projectId],
    references: [project.id],
  }),
  user: one(user, {
    fields: [projectSpeaker.userId],
    references: [user.id],
  }),
}));

export const clientRelations = relations(client, ({ many }) => ({
  projects: many(project),
}));

export const projectCollaboratorTeamRelations = relations(
  projectCollaboratorTeam,
  ({ one }) => ({
    project: one(project, {
      fields: [projectCollaboratorTeam.projectId],
      references: [project.id],
    }),
  }),
);

export const projectTargetTaskRelations = relations(projectTargetTask, ({ one }) => ({
  project: one(project, {
    fields: [projectTargetTask.projectId],
    references: [project.id],
  }),
  assignedUser: one(user, {
    fields: [projectTargetTask.assignedUserId],
    references: [user.id],
  }),
}));

export const taskRelations = relations(task, ({ one }) => ({
  project: one(project, {
    fields: [task.projectId],
    references: [project.id],
  }),
  targetTask: one(projectTargetTask, {
    fields: [task.targetTaskId],
    references: [projectTargetTask.id],
  }),
  user: one(user, {
    fields: [task.userId],
    references: [user.id],
  }),
}));

export const schema = {
  user,
  session,
  account,
  verification,
  project,
  projectTargetTask,
  projectCollaboratorTeam,
  task,
  userRelations,
  sessionRelations,
  accountRelations,
  projectRelations,
  projectCollaboratorTeamRelations,
  projectTargetTaskRelations,
  taskRelations,
};

export type UserRole = (typeof roleValues)[number];
export type TeamType = (typeof teamTypeValues)[number];
export type ProjectStatus = (typeof projectStatusValues)[number];
export type TargetTaskStatus = (typeof targetTaskStatusValues)[number];
export type ProjectRow = typeof project.$inferSelect;
export type NewProject = typeof project.$inferInsert;
export type ProjectTargetTaskRow = typeof projectTargetTask.$inferSelect;
export type NewProjectTargetTask = typeof projectTargetTask.$inferInsert;
export type ProjectCollaboratorTeamRow = typeof projectCollaboratorTeam.$inferSelect;
export type NewProjectCollaboratorTeam = typeof projectCollaboratorTeam.$inferInsert;
export type TaskRow = typeof task.$inferSelect;
export type NewTask = typeof task.$inferInsert;
