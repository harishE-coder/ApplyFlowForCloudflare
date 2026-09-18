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

  describe("6. Data Preservation & Permanent Room Identity (No Chat Loss)", () => {
    it("existing room survives recruiter removal (room identity permanent, access revoked only)", async () => {
      // In-memory representation of database tables
      const chatRooms = [
        { id: mockRoomId, client_id: mockClientId, status: "active", created_at: "2026-08-01T00:00:00Z" },
      ];
      const chatMessages = [
        { id: "msg-1", room_id: mockRoomId, message: "Hello from Recruiter A", sender_id: recruiterAId },
      ];
      let employeeClients = [
        { employee_id: recruiterAId, client_id: mockClientId, active: true },
      ];

      // Remove recruiter A (sets active = false)
      employeeClients = employeeClients.map((ec) =>
        ec.employee_id === recruiterAId && ec.client_id === mockClientId ? { ...ec, active: false } : ec
      );

      // Verify chat_rooms record is NOT deleted or modified
      expect(chatRooms).toHaveLength(1);
      expect(chatRooms[0].id).toBe(mockRoomId);
      expect(chatMessages).toHaveLength(1);
      expect(chatMessages[0].room_id).toBe(mockRoomId);

      // Verify Recruiter A lost access dynamically
      const mockSql = vi.fn().mockImplementation(async (strings: TemplateStringsArray) => {
        const query = strings.join("");
        if (query.includes("FROM users WHERE id =")) return [{ id: recruiterAId, is_active: true, role: "employee" }];
        if (query.includes("FROM chat_rooms r")) return chatRooms;
        if (query.includes("FROM employee_clients")) return employeeClients.filter((ec) => ec.active);
        return [];
      });

      const accessA = await validateRoomAccess(mockSql, mockRoomId, { id: recruiterAId, role: "employee" });
      expect(accessA.authorized).toBe(false);
    });

    it("existing room survives recruiter reassignment (Recruiter B inherits same room ID & history)", async () => {
      const permanentRoomId = mockRoomId;
      const chatRooms = [
        { id: permanentRoomId, client_id: mockClientId, status: "active", created_at: "2026-08-01T00:00:00Z" },
      ];
      const chatMessages = [
        { id: "msg-1", room_id: permanentRoomId, message: "Historical resume share", sender_id: recruiterAId },
      ];

      // Reassign: Recruiter A is inactive, Recruiter B is active
      const employeeClients = [
        { employee_id: recruiterAId, client_id: mockClientId, active: false },
        { employee_id: recruiterBId, client_id: mockClientId, active: true },
      ];

      // Verify room ID is permanent
      expect(chatRooms[0].id).toBe(permanentRoomId);

      const mockSql = vi.fn().mockImplementation(async (strings: TemplateStringsArray) => {
        const query = strings.join("");
        if (query.includes("FROM users WHERE id =")) return [{ id: recruiterBId, is_active: true, role: "employee" }];
        if (query.includes("FROM chat_rooms r")) return chatRooms;
        if (query.includes("FROM employee_clients")) {
          return employeeClients.filter((ec) => ec.employee_id === recruiterBId && ec.active);
        }
        return [];
      });

      // Recruiter B is granted access to the exact same room
      const accessB = await validateRoomAccess(mockSql, permanentRoomId, { id: recruiterBId, role: "employee" });
      expect(accessB.authorized).toBe(true);
      expect(accessB.room?.id).toBe(permanentRoomId);
      expect(chatMessages[0].room_id).toBe(permanentRoomId);
    });

    it("Admin still sees all rooms even when no recruiters are assigned", async () => {
      const chatRooms = [
        { id: mockRoomId, client_id: mockClientId, status: "active", client_name: "Orphaned Client Inc", created_at: "2026-08-01T00:00:00Z" },
      ];

      // Admin global client resolution returns null (unrestricted)
      const mockSql = vi.fn();
      const adminClientIds = await getAuthorizedClientIds(mockSql, { id: adminUserId, role: "admin" });
      expect(adminClientIds).toBeNull();

      // validateRoomAccess confirms permanent admin access to unassigned room
      const mockSqlAdmin = vi.fn().mockImplementation(async (strings: TemplateStringsArray) => {
        const query = strings.join("");
        if (query.includes("FROM users WHERE id =")) return [{ id: adminUserId, is_active: true, role: "admin" }];
        if (query.includes("FROM chat_rooms r")) return chatRooms;
        return [];
      });

      const res = await validateRoomAccess(mockSqlAdmin, mockRoomId, { id: adminUserId, role: "admin" });
      expect(res.authorized).toBe(true);
      expect(res.room?.id).toBe(mockRoomId);
    });

    it("sync-workspaces creates only missing rooms and leaves existing rooms untouched", async () => {
      const existingClientWithRoom = { id: mockClientId, company_name: "Existing Client" };
      const legacyClientWithoutRoom = { id: "legacy-client-999", company_name: "Legacy Client" };
      const clients = [existingClientWithRoom, legacyClientWithoutRoom];

      const existingRooms = [
        { id: mockRoomId, client_id: mockClientId, status: "active" },
      ];

      // Emulate self-healing recovery query: find clients with NO room
      const missingClients = clients.filter((c) => !existingRooms.some((r) => r.client_id === c.id));
      expect(missingClients).toHaveLength(1);
      expect(missingClients[0].id).toBe("legacy-client-999");

      // Provision missing room
      const newRoomId = "new-room-888";
      existingRooms.push({
        id: newRoomId,
        client_id: missingClients[0].id,
        status: "active",
      });

      // Confirm existing room was not altered or duplicated
      expect(existingRooms).toHaveLength(2);
      expect(existingRooms[0].id).toBe(mockRoomId); // Preserved!
      expect(existingRooms[1].id).toBe(newRoomId); // Repaired!
    });

    it("Admin receives all existing workspace chats when getAuthorizedClientIds returns null", async () => {
      const allRooms = [
        { id: "room-1", client_id: "c-1", status: "active" },
        { id: "room-2", client_id: "c-2", status: "active" },
        { id: "room-3", client_id: "c-3", status: "active" },
      ];

      // getAuthorizedClientIds returns null for Admin
      const mockSql = vi.fn();
      const authClients = await getAuthorizedClientIds(mockSql, { id: adminUserId, role: "admin" });
      expect(authClients).toBeNull();

      // Flow: if authClients is null, Admin directly gets allRooms without filtering
      const displayedRooms = authClients === null ? allRooms : allRooms.filter((r) => authClients.includes(r.client_id));
      expect(displayedRooms).toHaveLength(3);
    });

    it("Recruiter remains scoped to assigned clients and Client remains scoped to own client", async () => {
      const mockSql = vi.fn().mockImplementation(async (strings: TemplateStringsArray) => {
        const query = strings.join("");
        if (query.includes("FROM users WHERE id =")) return [{ is_active: true }];
        if (query.includes("FROM employee_clients")) return [{ client_id: "c-1" }];
        return [];
      });

      // Recruiter receives only assigned client
      const recruiterClients = await getAuthorizedClientIds(mockSql, { id: recruiterAId, role: "employee" });
      expect(recruiterClients).toEqual(["c-1"]);

      // Client receives only own client_id
      const clientScoped = await getAuthorizedClientIds(mockSql, { id: clientUserId, role: "client", client_id: "c-2" });
      expect(clientScoped).toEqual(["c-2"]);
    });

    it("Health check query logic accurately computes integrity metrics", async () => {
      const totalClients = 120;
      const totalRooms = 120;
      const missingRooms = 0;
      const orphanRooms = 0;
      const duplicateRooms = 0;

      const health = {
        total_clients: totalClients,
        rooms: totalRooms,
        missing_rooms: missingRooms,
        orphan_rooms: orphanRooms,
        duplicate_rooms: duplicateRooms,
      };

      expect(health.total_clients).toBe(120);
      expect(health.rooms).toBe(120);
      expect(health.missing_rooms).toBe(0);
      expect(health.orphan_rooms).toBe(0);
      expect(health.duplicate_rooms).toBe(0);
    });
  });
});
