import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeAuditLog, writeWalletAudit, writeChangePasswordAudit, readAuditLog } from "@/lib/audit";

let mockStore: any[];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: (data: any) => {
        const id = `mock-${mockStore.length + 1}`;
        const entry = { id, table, ...data };
        mockStore.push(entry);
        return {
          select: () => ({
            single: async () => ({ data: { id }, error: null }),
          }),
        };
      },
      select: (cols: string) => ({
        eq: (field: string, val: any) => ({
          order: (_field: string, _opts: any) => ({
            limit: (_n: number) =>
              Promise.resolve({
                data: mockStore
                  .filter((r: any) => r[field] === val)
                  .reverse()
                  .slice(0, _n),
                error: null,
              }),
          }),
        }),
      }),
    }),
  }),
}));

beforeEach(() => {
  mockStore = [];
});

describe("writeAuditLog", () => {
  it("writes to wallet_audit_log table", async () => {
    const id = await writeAuditLog("wallet_audit_log", {
      userId: "user-1",
      action: "test_action",
      metadata: { key: "value" },
    });
    expect(id).toBe("mock-1");
  });

  it("writes to change_password_audit table", async () => {
    const id = await writeAuditLog("change_password_audit", {
      userId: "user-1",
      action: "password_change_requested",
    });
    expect(id).toBe("mock-1");
  });

  it("handles missing metadata gracefully", async () => {
    const id = await writeAuditLog("wallet_audit_log", {
      userId: "user-1",
      action: "test",
    });
    expect(id).toBeTruthy();
  });

  it("handles null ipAddress", async () => {
    const id = await writeAuditLog("wallet_audit_log", {
      userId: "user-1",
      action: "test",
      ipAddress: null,
    });
    expect(id).toBeTruthy();
  });
});

describe("writeWalletAudit", () => {
  it("writes a wallet audit entry", async () => {
    const id = await writeWalletAudit("user-1", "withdraw_attempt", { amount: 1000 });
    expect(id).toBe("mock-1");
  });

  it("writes without metadata", async () => {
    const id = await writeWalletAudit("user-1", "password_set");
    expect(id).toBe("mock-1");
  });
});

describe("writeChangePasswordAudit", () => {
  it("writes a change-password audit entry", async () => {
    const id = await writeChangePasswordAudit("user-1", "password_changed");
    expect(id).toBe("mock-1");
  });
});

describe("readAuditLog", () => {
  it("returns entries for a user", async () => {
    await writeWalletAudit("user-1", "action1");
    await writeWalletAudit("user-1", "action2");
    const entries = await readAuditLog("wallet_audit_log", "user-1");
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBe(2);
  });

  it("respects limit", async () => {
    for (let i = 0; i < 5; i++) {
      await writeWalletAudit("user-2", `action-${i}`);
    }
    const entries = await readAuditLog("wallet_audit_log", "user-2", 3);
    expect(entries.length).toBe(3);
  });

  it("returns empty array for user with no entries", async () => {
    const entries = await readAuditLog("wallet_audit_log", "nonexistent-user");
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBe(0);
  });
});
