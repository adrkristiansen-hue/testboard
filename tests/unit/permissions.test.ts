import { describe, expect, it } from "vitest";
import { DEFAULT_ROLES, effectivePermissions, hasPermission, lockedModulesFor, missingPermissions, requiredPermissions, roleLabel, type BoardLock } from "@/lib/permissions";

const role = (key: string) => DEFAULT_ROLES.find((r) => r.key === key)!.permissions;

describe("effectivePermissions", () => {
  it("gives system admins everything, non-members nothing", () => {
    expect(effectivePermissions("ADMIN", null).has("access.manage")).toBe(true);
    expect(effectivePermissions("MEMBER", null).size).toBe(0);
  });
  it("caps read-only accounts to viewing and exporting whatever their role", () => {
    expect([...effectivePermissions("READ_ONLY", role("LEAD"))].sort()).toEqual(["items.export", "items.view"]);
  });
  it("always includes viewing for members", () => {
    expect(effectivePermissions("MEMBER", ["comments.add"]).has("items.view")).toBe(true);
  });
});

describe("test results", () => {
  it("recording Passed on a test task needs change state, not close", () => {
    expect(requiredPermissions([{ field: "state" }], { isOwnItem: false, newStateCategory: "COMPLETED", typeKey: "TEST_TASK" })).toEqual(["items.changeState"]);
    expect(requiredPermissions([{ field: "state" }], { isOwnItem: false, newStateCategory: "COMPLETED", typeKey: "DEFECT" })).toEqual(["items.close"]);
    // The outcome field follows the state, so it is part of recording the result
    expect(requiredPermissions([{ field: "state" }, { field: "fields.outcome" }], { isOwnItem: false, newStateCategory: "IN_PROGRESS", typeKey: "TEST_TASK" })).toEqual(["items.changeState"]);
    expect(requiredPermissions([{ field: "fields.steps" }], { isOwnItem: false, typeKey: "TEST_TASK" })).toEqual(["items.edit"]);
  });
  it("customer testers cannot change test scripts; leads can approve", () => {
    expect(role("CUSTOMER_TESTER")).not.toContain("scripts.edit");
    expect(role("CONSULTANT")).toContain("scripts.edit");
    expect(role("CONSULTANT")).not.toContain("scripts.approve");
    expect(role("LEAD")).toContain("scripts.approve");
  });
});

describe("requiredPermissions", () => {
  it("needs close for closing/removing states and changeState otherwise", () => {
    expect(requiredPermissions([{ field: "state" }], { isOwnItem: false, newStateCategory: "COMPLETED" })).toEqual(["items.close"]);
    expect(requiredPermissions([{ field: "state" }], { isOwnItem: false, newStateCategory: "REMOVED" })).toEqual(["items.close"]);
    expect(requiredPermissions([{ field: "state" }, { field: "columnDone" }], { isOwnItem: false, newStateCategory: "IN_PROGRESS" })).toEqual(["items.changeState"]);
  });
  it("treats taking an item yourself as moving work, assigning others as assigning", () => {
    expect(requiredPermissions([{ field: "assignedToId", newValue: "me" }], { isOwnItem: false, userId: "me" })).toEqual(["items.changeState"]);
    expect(requiredPermissions([{ field: "assignedToId", newValue: "other" }], { isOwnItem: false, userId: "me" })).toEqual(["items.assign"]);
  });
  it("needs edit, or editOwn on own items, for fields", () => {
    expect(requiredPermissions([{ field: "title" }, { field: "fields.steps" }], { isOwnItem: true })).toEqual(["items.editOwn"]);
    expect(requiredPermissions([{ field: "priority" }], { isOwnItem: false })).toEqual(["items.edit"]);
  });
});

describe("default roles", () => {
  const tester = new Set(role("CUSTOMER_TESTER"));
  it("let customer testers report, edit their own and move work, but not close, delete or see internal notes", () => {
    expect(missingPermissions(tester, ["items.create", "items.editOwn", "items.changeState", "comments.add"])).toEqual([]);
    expect(missingPermissions(tester, ["items.close", "items.delete", "comments.internal", "items.edit", "items.assign", "access.manage"])).toHaveLength(6);
  });
  it("let consultants do item work but not delete or manage access", () => {
    const c = new Set(role("CONSULTANT"));
    expect(hasPermission(c, "items.close")).toBe(true);
    expect(hasPermission(c, "items.delete")).toBe(false);
    expect(hasPermission(c, "access.manage")).toBe(false);
  });
  it("count edit-all as covering edit-own", () => {
    expect(hasPermission(new Set(["items.edit"] as const), "items.editOwn")).toBe(true);
  });
  it("show built-in names in Norwegian", () => {
    expect(roleLabel("Customer tester", "nb")).toBe("Kundetester");
    expect(roleLabel("My custom role", "nb")).toBe("My custom role");
    expect(roleLabel("Customer tester", "en")).toBe("Customer tester");
  });
});

describe("lockedModulesFor", () => {
  const boards: BoardLock[] = [
    { teamId: "pay", restricted: true, moduleIds: new Set(["ecp", "term"]), memberIds: new Set(["lars"]) },
    { teamId: "hr", restricted: true, moduleIds: new Set(["term", "cases"]), memberIds: new Set(["maja"]) },
    { teamId: "ec", restricted: false, moduleIds: new Set(["hire", "term"]), memberIds: new Set() },
  ];
  it("hides modules of locked boards the user is not on", () => {
    expect([...lockedModulesFor("nora", boards, false)].sort()).toEqual(["cases", "ecp", "term"]);
  });
  it("shows a module when any locked board the user is on covers it", () => {
    expect([...lockedModulesFor("maja", boards, false)].sort()).toEqual(["ecp"]);
  });
  it("hides nothing from people who see everything", () => {
    expect(lockedModulesFor("nora", boards, true).size).toBe(0);
  });
});
