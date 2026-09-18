/**
 * Shared Chat Access Service for Cloudflare Workers.
 *
 * Core Enterprise Principle:
 * The Service Client (client_id) is the absolute Single Source of Truth.
 * Chat rooms belong exclusively to Service Clients, not individual employees.
 * Permissions are dynamically derived at request time from active assignments
 * (employee_clients, clients, sub_admin_assignments, users).
 * Zero static chat membership records are stored.
 */

export interface RoomMember {
  id: string;
  name: string;
  role: string;
  email?: string | null;
  is_primary?: boolean;
}

export interface ResolvedRoomMembers {
  room: { id: string; client_id: string; status: string } | null;
  authorizedUserIds: Set<string>;
  members: RoomMember[];
}

export interface ValidateRoomAccessResult {
  authorized: boolean;
  room?: {
    id: string;
    client_id: string;
    status: string;
    client_name?: string;
  };
  reason?: string;
}

/**
 * 1. Resolve permitted client IDs for a given user.
 * - Admin / Super-Admin: null (global access to all clients).
 * - Sub-Admin: clients actively managed or assigned via sub_admin_assignments.
 * - Client: only their own client_id.
 * - Recruiter (Employee): ONLY clients where employee_clients.active = true AND user.is_active = true.
 */
export async function getAuthorizedClientIds(
  sql: any,
  user: { id: string; role: string; client_id?: string | null }
): Promise<string[] | null> {
  const role = (user?.role || "").toLowerCase().trim();
  // Admin & Super-Admin always have unrestricted global access
  if (role === "super_admin" || role === "admin" || role === "superadmin") {
    return null;
  }

  // Check if account is active in users table
  const userCheck = await sql`
    SELECT is_active FROM users WHERE id = ${user.id} LIMIT 1
  `;
  if (userCheck.length === 0 || !userCheck[0].is_active) {
    return [];
  }

  if (user.role === "sub_admin") {
    const assigned = await sql`
      SELECT client_id FROM sub_admin_assignments WHERE sub_admin_id = ${user.id} AND active = true AND client_id IS NOT NULL
      UNION
      SELECT id as client_id FROM clients WHERE managed_by = ${user.id}
    `;
    return assigned.map((r: any) => String(r.client_id));
  }

  if (user.role === "client") {
    return user.client_id ? [String(user.client_id)] : [];
  }

  if (user.role === "employee" || user.role === "recruiter") {
    const assigned = await sql`
      SELECT client_id FROM employee_clients WHERE employee_id = ${user.id} AND active = true
    `;
    return assigned.map((r: any) => String(r.client_id));
  }

  return [];
}

/**
 * 2. Resolve permitted room IDs for a given user based on their active client assignments.
 */
export async function getAuthorizedRoomIds(
  sql: any,
  user: { id: string; role: string; client_id?: string | null }
): Promise<string[] | null> {
  const role = (user?.role || "").toLowerCase().trim();
  if (role === "super_admin" || role === "admin" || role === "superadmin") {
    return null; // Global access
  }
  const clientIds = await getAuthorizedClientIds(sql, user);
  if (clientIds === null) {
    return null; // Global access
  }
  if (clientIds.length === 0) {
    return [];
  }
  const rooms = await sql`
    SELECT id FROM chat_rooms WHERE client_id = ANY(${clientIds})
  `;
  return rooms.map((r: any) => String(r.id));
}

/**
 * 3. Dynamically resolve all active members authorized for a given room.
 * Multi-recruiter support: returns ALL active recruiters in employee_clients.
 * No static chat membership table is maintained.
 */
export async function resolveRoomMembers(
  sql: any,
  roomId: string
): Promise<ResolvedRoomMembers> {
  const roomRows = await sql`
    SELECT id, client_id, status FROM chat_rooms WHERE id = ${roomId} LIMIT 1
  `;
  if (roomRows.length === 0) {
    return {
      room: null,
      authorizedUserIds: new Set(),
      members: [],
    };
  }

  const room = roomRows[0];
  const clientId = room.client_id;

  // 1. All active Admins and Super Admins
  const admins = await sql`
    SELECT id, name, role, email
    FROM users
    WHERE role IN ('admin', 'super_admin') AND is_active = true
    ORDER BY name ASC
  `;

  // 2. Sub-Admins managing or actively assigned to this Service Client
  const subAdmins = await sql`
    SELECT u.id, u.name, u.role, u.email
    FROM users u
    WHERE u.role = 'sub_admin' AND u.is_active = true
      AND (
        u.id IN (SELECT managed_by FROM clients WHERE id = ${clientId})
        OR u.id IN (SELECT sub_admin_id FROM sub_admin_assignments WHERE client_id = ${clientId} AND active = true)
      )
    ORDER BY u.name ASC
  `;

  // 3. Client user(s) belonging to this Service Client
  const clientUsers = await sql`
    SELECT id, name, role, email
    FROM users
    WHERE client_id = ${clientId} AND role = 'client' AND is_active = true
    ORDER BY name ASC
  `;

  // 4. All active recruiters assigned to this Service Client
  const recruiters = await sql`
    SELECT u.id, u.name, u.role, u.email, ec.is_primary
    FROM employee_clients ec
    JOIN users u ON u.id = ec.employee_id
    WHERE ec.client_id = ${clientId} AND ec.active = true AND u.is_active = true
    ORDER BY ec.is_primary DESC, u.name ASC
  `;

  const authorizedUserIds = new Set<string>();
  const members: RoomMember[] = [];
  const seenIds = new Set<string>();

  const addMember = (u: any, isPrimary = false) => {
    const uid = String(u.id);
    if (!seenIds.has(uid)) {
      seenIds.add(uid);
      authorizedUserIds.add(uid);
      members.push({
        id: uid,
        name: u.name,
        role: u.role,
        email: u.email || null,
        is_primary: isPrimary || Boolean(u.is_primary),
      });
    }
  };

  for (const a of admins) addMember(a);
  for (const sa of subAdmins) addMember(sa);
  for (const c of clientUsers) addMember(c);
  for (const r of recruiters) addMember(r, Boolean(r.is_primary));

  return {
    room,
    authorizedUserIds,
    members,
  };
}

/**
 * 4. Universal Access Validation.
 * Derives permission from room.client_id at request time.
 * Archived / deactivated user protection: returns authorized: false if account is inactive.
 */
export async function validateRoomAccess(
  sql: any,
  roomId: string,
  user: { id: string; role: string; client_id?: string | null }
): Promise<ValidateRoomAccessResult> {
  // 1. Verify user account is active
  const userCheck = await sql`
    SELECT id, is_active, role, client_id FROM users WHERE id = ${user.id} LIMIT 1
  `;
  if (userCheck.length === 0 || !userCheck[0].is_active) {
    return { authorized: false, reason: "Account is inactive or deactivated" };
  }
  const dbUser = userCheck[0];

  // 2. Fetch room and client
  const roomRows = await sql`
    SELECT r.id, r.client_id, r.status, c.company_name as client_name
    FROM chat_rooms r
    JOIN clients c ON c.id = r.client_id
    WHERE r.id = ${roomId}
    LIMIT 1
  `;
  if (roomRows.length === 0) {
    return { authorized: false, reason: "Workspace Chat room not found" };
  }
  const room = roomRows[0];

  // 3. Super Admin & Admin: Permanent access
  const role = (dbUser.role || user.role || "").toLowerCase().trim();
  if (role === "super_admin" || role === "admin" || role === "superadmin") {
    return { authorized: true, room };
  }

  // 4. Sub-Admin: Managed or assigned client
  if (dbUser.role === "sub_admin") {
    const saCheck = await sql`
      SELECT 1 FROM sub_admin_assignments
      WHERE sub_admin_id = ${dbUser.id} AND client_id = ${room.client_id} AND active = true
      UNION
      SELECT 1 FROM clients
      WHERE id = ${room.client_id} AND managed_by = ${dbUser.id}
      LIMIT 1
    `;
    if (saCheck.length > 0) {
      return { authorized: true, room };
    }
    return { authorized: false, reason: "Sub-Admin is not assigned to manage this Service Client" };
  }

  // 5. Client: Own client_id
  if (dbUser.role === "client") {
    if (dbUser.client_id && String(dbUser.client_id) === String(room.client_id)) {
      return { authorized: true, room };
    }
    return { authorized: false, reason: "Client user does not belong to this Service Client" };
  }

  // 6. Recruiter (Employee): Active assignment in employee_clients
  if (dbUser.role === "employee" || dbUser.role === "recruiter") {
    const empCheck = await sql`
      SELECT 1 FROM employee_clients
      WHERE employee_id = ${dbUser.id} AND client_id = ${room.client_id} AND active = true
      LIMIT 1
    `;
    if (empCheck.length > 0) {
      return { authorized: true, room };
    }
    return { authorized: false, reason: "Recruiter is not actively assigned to this Service Client" };
  }

  return { authorized: false, reason: "Unauthorized role" };
}

/**
 * 5. Log chat room assignment / removal event in chat_room_access_audit table.
 */
export async function logChatAccessAudit(
  sql: any,
  entry: {
    roomId: string;
    clientId: string;
    userId: string;
    action: "assigned" | "removed";
    performedBy?: string | null;
  }
): Promise<void> {
  // Ensure audit table exists
  await sql`
    CREATE TABLE IF NOT EXISTS chat_room_access_audit (
      id UUID PRIMARY KEY,
      room_id UUID NOT NULL,
      client_id UUID NOT NULL,
      user_id UUID NOT NULL,
      action VARCHAR(20) NOT NULL,
      performed_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const auditId = crypto.randomUUID();
  await sql`
    INSERT INTO chat_room_access_audit (
      id, room_id, client_id, user_id, action, performed_by, created_at
    ) VALUES (
      ${auditId}, ${entry.roomId}, ${entry.clientId}, ${entry.userId},
      ${entry.action}, ${entry.performedBy || null}, NOW()
    )
  `;
}
