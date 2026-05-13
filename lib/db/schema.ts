import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  int,
  mysqlTable,
  varchar,
  text,
  timestamp,
  mysqlEnum,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

const roleValues = ["Leader", "Tim"] as const;
const teamTypeValues = [
  "Tim Sales",
  "Tim SE",
  "Tim Admin",
  "Tim Marketing dan Konten",
  "Tim Edukasi",
] as const;
const projectStatusValues = ["Menunggu", "Berjalan", "Selesai"] as const;
const targetTaskStatusValues = [
  "Belum Mulai",
  "Dikerjakan",
  "Koreksi",
  "Selesai",
] as const;

export const user = mysqlTable(
  "user",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: varchar("image", { length: 255 }),
    role: mysqlEnum("role", roleValues).notNull().default("Tim"),
    teamType: mysqlEnum("team_type", teamTypeValues).notNull().default("Tim Sales"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex("user_email_idx").on(table.email),
  }),
);

export const session = mysqlTable(
  "session",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
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

export const account = mysqlTable("account", {
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
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
});

export const verification = mysqlTable("verification", {
  id: varchar("id", { length: 255 }).primaryKey(),
  identifier: varchar("identifier", { length: 255 }).notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
});

export const project = mysqlTable("project", {
  id: varchar("id", { length: 255 }).primaryKey(),
  namaProyek: varchar("nama_proyek", { length: 255 }).notNull(),
  status: mysqlEnum("status", projectStatusValues).notNull().default("Berjalan"),
  targetTugas: int("target_tugas").notNull().default(8),
  deadline: date("deadline", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
});

export const projectTargetTask = mysqlTable("project_target_task", {
  id: varchar("id", { length: 255 }).primaryKey(),
  projectId: varchar("project_id", { length: 255 })
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  assignedUserId: varchar("assigned_user_id", { length: 255 }).references(() => user.id, {
    onDelete: "set null",
  }),
  deskripsi: text("deskripsi").notNull(),
  status: mysqlEnum("status", targetTaskStatusValues).notNull().default("Belum Mulai"),
  mulai: date("mulai", { mode: "string" }),
  deadline: date("deadline", { mode: "string" }),
  urutan: int("urutan").notNull().default(1),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
});

export const task = mysqlTable("task", {
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
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
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

export const projectRelations = relations(project, ({ many }) => ({
  tasks: many(task),
  targetTasks: many(projectTargetTask),
}));

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
  task,
  userRelations,
  sessionRelations,
  accountRelations,
  projectRelations,
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
export type TaskRow = typeof task.$inferSelect;
export type NewTask = typeof task.$inferInsert;
