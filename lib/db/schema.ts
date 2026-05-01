import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["Leader", "Tim"]);
export const teamTypeEnum = pgEnum("team_type", ["Tim Sales", "Tim SE", "Tim Admin"]);
export const projectStatusEnum = pgEnum("project_status", ["Menunggu", "Berjalan", "Selesai"]);
export const targetTaskStatusEnum = pgEnum("target_task_status", [
  "Belum Mulai",
  "Dikerjakan",
  "Koreksi",
  "Selesai",
]);

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: userRoleEnum("role").notNull().default("Tim"),
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
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => ({
    tokenIdx: uniqueIndex("session_token_idx").on(table.token),
  }),
);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: "date" }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: "date" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const project = pgTable("project", {
  id: text("id").primaryKey(),
  namaProyek: text("nama_proyek").notNull(),
  status: projectStatusEnum("status").notNull().default("Berjalan"),
  targetTugas: integer("target_tugas").notNull().default(8),
  deadline: date("deadline", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const projectTargetTask = pgTable("project_target_task", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  assignedUserId: text("assigned_user_id").references(() => user.id, {
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
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  targetTaskId: text("target_task_id").references(() => projectTargetTask.id, {
    onDelete: "set null",
  }),
  userId: text("user_id")
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

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type TeamType = (typeof teamTypeEnum.enumValues)[number];
export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number];
export type TargetTaskStatus = (typeof targetTaskStatusEnum.enumValues)[number];
export type ProjectRow = typeof project.$inferSelect;
export type NewProject = typeof project.$inferInsert;
export type ProjectTargetTaskRow = typeof projectTargetTask.$inferSelect;
export type NewProjectTargetTask = typeof projectTargetTask.$inferInsert;
export type TaskRow = typeof task.$inferSelect;
export type NewTask = typeof task.$inferInsert;
