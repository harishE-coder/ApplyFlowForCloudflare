import { describe, expect, it, vi } from "vitest";
import { ChatRoomDO } from "../src/durable_objects/ChatRoomDO";
import {
  getAuthorizedClientIds,
  getAuthorizedRoomIds,
  logChatAccessAudit,
  resolveRoomMembers,
  validateRoomAccess,
} from "../src/services/chatAccess";

describe("Workspace Chat Lifecycle & Dynamic Employee Reassignment (ASRC)", () => {
  const mockClientId = "11111111-1111-1111-1111-111111111111";
  const mockRoomId = "22222222-2222-2222-2222-222222222222";
  const adminUserId = "aaaa-1111";
  const subAdminUserId = "bbbb-2222";
  const clientUserId = "cccc-3333";
  const recruiterAId = "rec-aaaa";
  const recruiterBId = "rec-bbbb";

  describe("1. Dynamic Access Scoping (Single Source of Truth)", () => {
    it("Admin / Super-Admin has global access (returns null)", async () => {
      const mockSql = vi.fn();
      const clientIds = await getAuthorizedClientIds(mockSql, {
        id: adminUserId,
        role: "admin",
      });
      expect(clientIds).toBeNull();
    });

    it("Recruiter access is derived dynamically from employee_clients", async () => {
      const mockSql = vi.fn().mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
        const query = strings.join("");
        if (query.includes("FROM users WHERE id =")) {
          return [{ is_active: true }];
        }
        if (query.includes("FROM employee_clients WHERE employee_id =")) {
          return [{ client_id: mockClientId }];
        }
        return [];
      });

      const clientIds = await getAuthorizedClientIds(mockSql, {
        id: recruiterAId,
        role: "employee",
      });

      expect(clientIds).toEqual([mockClientId]);
    });

    it("Deactivated recruiter loses access immediately even with active employee_clients row", async () => {
      const mockSql = vi.fn().mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
        const query = strings.join("");
        if (query.includes("FROM users WHERE id =")) {
          return [{ is_active: false }]; // Account deactivated
        }
        return [];
      });

      const clientIds = await getAuthorizedClientIds(mockSql, {
        id: recruiterAId,
        role: "employee",
      });

      expect(clientIds).toEqual([]);
    });
  });

  describe("2. validateRoomAccess (ASRC Role Enforcement & Archived Protection)", () => {
    it("allows active Admin permanent access to any room", async () => {
      const mockSql = vi.fn().mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
        const query = strings.join("");
        if (query.includes("FROM users WHERE id =")) {
          return [{ id: adminUserId, is_active: true, role: "admin" }];
        }
        if (query.includes("FROM chat_rooms r")) {
          return [{ id: mockRoomId, client_id: mockClientId, status: "active", client_name: "Acme Corp" }];
        }
        return [];
      });

      const res = await validateRoomAccess(mockSql, mockRoomId, {
        id: adminUserId,
        role: "admin",
      });

      expect(res.authorized).toBe(true);
      expect(res.room?.client_id).toBe(mockClientId);
    });

    it("allows active Recruiter assigned to the room's Service Client", async () => {
      const mockSql = vi.fn().mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
        const query = strings.join("");
        if (query.includes("FROM users WHERE id =")) {
          return [{ id: recruiterAId, is_active: true, role: "employee" }];
        }
        if (query.includes("FROM chat_rooms r")) {
          return [{ id: mockRoomId, client_id: mockClientId, status: "active", client_name: "Acme Corp" }];
        }
        if (query.includes("FROM employee_clients")) {
          return [{ 1: 1 }]; // Found active assignment
        }
        return [];
      });

      const res = await validateRoomAccess(mockSql, mockRoomId, {
        id: recruiterAId,
        role: "employee",
      });

      expect(res.authorized).toBe(true);
    });

    it("rejects unassigned Recruiter from accessing Service Client room", async () => {
      const mockSql = vi.fn().mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
        const query = strings.join("");
        if (query.includes("FROM users WHERE id =")) {
          return [{ id: recruiterAId, is_active: true, role: "employee" }];
        }
        if (query.includes("FROM chat_rooms r")) {
          return [{ id: mockRoomId, client_id: mockClientId, status: "active", client_name: "Acme Corp" }];
        }
        if (query.includes("FROM employee_clients")) {
          return []; // No active assignment
        }
        return [];
      });

      const res = await validateRoomAccess(mockSql, mockRoomId, {
        id: recruiterAId,
        role: "employee",
      });

      expect(res.authorized).toBe(false);
      expect(res.reason).toContain("Recruiter is not actively assigned");
    });

    it("rejects deactivated Recruiter account (Archived protection)", async () => {
      const mockSql = vi.fn().mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
        const query = strings.join("");
        if (query.includes("FROM users WHERE id =")) {
          return [{ id: recruiterAId, is_active: false, role: "employee" }]; // Inactive
        }
        return [];
      });

      const res = await validateRoomAccess(mockSql, mockRoomId, {
        id: recruiterAId,
        role: "employee",
      });

      expect(res.authorized).toBe(false);
      expect(res.reason).toContain("inactive or deactivated");
    });
  });

  describe("3. Multi-Recruiter Workspace Support", () => {
    it("resolveRoomMembers returns both Recruiter A and Recruiter B when simultaneously assigned", async () => {
      const mockSql = vi.fn().mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
        const query = strings.join("");
        if (query.includes("FROM chat_rooms WHERE id =")) {
          return [{ id: mockRoomId, client_id: mockClientId, status: "active" }];
        }
        if (query.includes("FROM users\n    WHERE role IN ('admin'")) {
          return [{ id: adminUserId, name: "Admin User", role: "admin", email: "admin@applyflow.com" }];
        }
        if (query.includes("FROM users u\n    WHERE u.role = 'sub_admin'")) {
          return [];
        }
        if (query.includes("FROM users\n    WHERE client_id =")) {
          return [{ id: clientUserId, name: "Client Contact", role: "client", email: "client@acme.com" }];
        }
        if (query.includes("FROM employee_clients ec")) {
          // Multiple recruiters active simultaneously
          return [
            { id: recruiterAId, name: "Recruiter Alpha", role: "employee", email: "alpha@applyflow.com", is_primary: true },
            { id: recruiterBId, name: "Recruiter Beta", role: "employee", email: "beta@applyflow.com", is_primary: false },
          ];
        }
        return [];
      });

      const resolved = await resolveRoomMembers(mockSql, mockRoomId);

      expect(resolved.room).not.toBeNull();
      expect(resolved.authorizedUserIds.has(recruiterAId)).toBe(true);
      expect(resolved.authorizedUserIds.has(recruiterBId)).toBe(true);
      expect(resolved.members).toHaveLength(4); // Admin + Client + Recruiter A + Recruiter B

      const recruiterMembers = resolved.members.filter((m) => m.role === "employee");
      expect(recruiterMembers).toHaveLength(2);
      expect(recruiterMembers[0].name).toBe("Recruiter Alpha");
      expect(recruiterMembers[0].is_primary).toBe(true);
      expect(recruiterMembers[1].name).toBe("Recruiter Beta");
      expect(recruiterMembers[1].is_primary).toBe(false);
    });
  });

  describe("4. ChatRoomDO Targeted Eviction on Reassignment", () => {
    it("targeted eviction closes removed recruiter socket with 4003 and leaves other recruiter connected", async () => {
      const mockStorage = {
        getAlarm: vi.fn().mockResolvedValue(null),
        setAlarm: vi.fn(),
      };
      const mockState = {
        storage: mockStorage,
      } as any;

      const chatDO = new ChatRoomDO(mockState, {
        DATABASE_URL: "postgresql://test",
      } as any);

      // Create two fake WebSockets for Recruiter A and Recruiter B
      const socketA = {
        send: vi.fn(),
        close: vi.fn(),
        addEventListener: vi.fn(),
      } as any;

      const socketB = {
        send: vi.fn(),
        close: vi.fn(),
        addEventListener: vi.fn(),
      } as any;

      chatDO.sessions.set(socketA, {
        userId: recruiterAId,
        name: "Recruiter Alpha",
        role: "employee",
        lastSeen: Date.now(),
      });

      chatDO.sessions.set(socketB, {
        userId: recruiterBId,
        name: "Recruiter Beta",
        role: "employee",
        lastSeen: Date.now(),
      });

      expect(chatDO.sessions.size).toBe(2);

      // Trigger broadcast of room_members_updated where Recruiter A was removed
      const req = new Request("http://do/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "room_members_updated",
          room_id: mockRoomId,
          removed_user_ids: [recruiterAId],
        }),
      });

      const response = await chatDO.fetch(req);
      expect(response.status).toBe(200);

      // Socket A should receive access_revoked and be closed with 4003
      expect(socketA.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"access_revoked"')
      );
      expect(socketA.close).toHaveBeenCalledWith(4003, "Access Revoked");
      expect(chatDO.sessions.has(socketA)).toBe(false);

      // Socket B remains connected and active!
      expect(socketB.close).not.toHaveBeenCalled();
      expect(chatDO.sessions.has(socketB)).toBe(true);
      expect(chatDO.sessions.size).toBe(1);
    });
  });

  describe("5. Access Audit Logging", () => {
    it("logChatAccessAudit records assigned and removed events", async () => {
      const executedQueries: string[] = [];
      const mockSql = vi.fn().mockImplementation(async (strings: TemplateStringsArray) => {
        executedQueries.push(strings.join(""));
        return [];
      });

      await logChatAccessAudit(mockSql, {
        roomId: mockRoomId,
        clientId: mockClientId,
        userId: recruiterAId,
        action: "assigned",
        performedBy: adminUserId,
      });

      expect(executedQueries.some((q) => q.includes("CREATE TABLE IF NOT EXISTS chat_room_access_audit"))).toBe(true);
      expect(executedQueries.some((q) => q.includes("INSERT INTO chat_room_access_audit"))).toBe(true);
    });
  });
});
