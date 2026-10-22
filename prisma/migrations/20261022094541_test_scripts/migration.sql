-- CreateTable
CREATE TABLE "TestScript" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "moduleId" TEXT,
    "role" TEXT NOT NULL DEFAULT '',
    "preconditions" TEXT NOT NULL DEFAULT '',
    "testData" TEXT NOT NULL DEFAULT '',
    "inputs" TEXT NOT NULL DEFAULT '[]',
    "steps" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "reviewNote" TEXT,
    "reviewById" TEXT,
    "reviewAt" DATETIME,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestScript_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestScript_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workItemId" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "testerId" TEXT NOT NULL,
    "inputs" TEXT NOT NULL DEFAULT '{}',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "outcome" TEXT,
    CONSTRAINT "TestAttempt_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestStepResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "actual" TEXT NOT NULL DEFAULT '',
    "attachments" TEXT NOT NULL DEFAULT '[]',
    "raised" TEXT NOT NULL DEFAULT '[]',
    "carried" BOOLEAN NOT NULL DEFAULT false,
    "changedAt" DATETIME NOT NULL,
    CONSTRAINT "TestStepResult_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TestAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Phase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "order" INTEGER NOT NULL DEFAULT 0,
    "requireApprovedScripts" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Phase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Phase" ("endDate", "id", "name", "order", "projectId", "startDate") SELECT "endDate", "id", "name", "order", "projectId", "startDate" FROM "Phase";
DROP TABLE "Phase";
ALTER TABLE "new_Phase" RENAME TO "Phase";
CREATE INDEX "Phase_projectId_idx" ON "Phase"("projectId");
CREATE TABLE "new_WorkItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "descriptionText" TEXT,
    "state" TEXT NOT NULL,
    "columnDone" BOOLEAN NOT NULL DEFAULT false,
    "assignedToId" TEXT,
    "moduleId" TEXT,
    "phaseId" TEXT,
    "parentId" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 2,
    "severity" INTEGER,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "dueDate" DATETIME,
    "fields" TEXT NOT NULL DEFAULT '{}',
    "boardOrder" REAL NOT NULL DEFAULT 0,
    "stateChangedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedById" TEXT NOT NULL,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scriptId" TEXT,
    "scriptVersion" INTEGER,
    CONSTRAINT "WorkItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkItem_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "WorkItemType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkItem_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkItem_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkItem_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WorkItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkItem_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkItem_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "TestScript" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WorkItem" ("assignedToId", "boardOrder", "changedAt", "changedById", "columnDone", "createdAt", "createdById", "description", "descriptionText", "dueDate", "fields", "id", "moduleId", "parentId", "phaseId", "priority", "projectId", "severity", "state", "stateChangedAt", "tags", "title", "typeId") SELECT "assignedToId", "boardOrder", "changedAt", "changedById", "columnDone", "createdAt", "createdById", "description", "descriptionText", "dueDate", "fields", "id", "moduleId", "parentId", "phaseId", "priority", "projectId", "severity", "state", "stateChangedAt", "tags", "title", "typeId" FROM "WorkItem";
DROP TABLE "WorkItem";
ALTER TABLE "new_WorkItem" RENAME TO "WorkItem";
CREATE INDEX "WorkItem_projectId_state_idx" ON "WorkItem"("projectId", "state");
CREATE INDEX "WorkItem_assignedToId_idx" ON "WorkItem"("assignedToId");
CREATE INDEX "WorkItem_parentId_idx" ON "WorkItem"("parentId");
CREATE INDEX "WorkItem_scriptId_idx" ON "WorkItem"("scriptId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "TestScript_projectId_number_key" ON "TestScript"("projectId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "TestAttempt_workItemId_number_key" ON "TestAttempt"("workItemId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "TestStepResult_attemptId_stepIndex_key" ON "TestStepResult"("attemptId", "stepIndex");

-- Data: UAT phases require approved scripts; existing built-in roles get the new script permissions.
UPDATE "Phase" SET "requireApprovedScripts" = true WHERE upper("name") LIKE '%UAT%';
UPDATE "ProjectRole" SET "permissions" = json_insert(json_insert("permissions", '$[#]', 'scripts.edit'), '$[#]', 'scripts.approve')
  WHERE "name" = 'Project lead' AND json_valid("permissions");
UPDATE "ProjectRole" SET "permissions" = json_insert("permissions", '$[#]', 'scripts.edit')
  WHERE "name" = 'Consultant' AND json_valid("permissions");
