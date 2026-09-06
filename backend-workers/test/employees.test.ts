import { describe, expect, it } from "vitest";
import app from "../src/index";
import {
  ResetPasswordSchema,
  UserCreateSchema,
  UserUpdateSchema,
} from "../src/schemas/employees";
import type { Bindings } from "../src/types";

const mockEnv: Bindings = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/testdb",
  JWT_SECRET_KEY: "test-secret-key-12345678901234567890",
  ACCESS_TOKEN_EXPIRE_MINUTES: "60",
  REFRESH_TOKEN_EXPIRE_DAYS: "7",
  RESUMES_BUCKET: {} as any,
  FRONTEND_URL: "http://localhost:5173",
  APP_CORS_ORIGINS: "http://localhost:5173",
};

describe("Employees & Users Module Tests", () => {
  describe("Zod Validation Schemas", () => {
    it("validates valid UserCreate payload", () => {
      const valid = {
        name: "Alice Recruiter",
        email: "alice@applyflow.com",
        password: "securePassword123",
        phone: "+1 555-1234",
        role: "employee" as const,
        status: "active" as const,
        assigned_client_ids: [],
      };
      const res = UserCreateSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it("rejects UserCreate with short password", () => {
      const invalid = {
        name: "Bob",
        email: "bob@applyflow.com",
        password: "123",
      };
      const res = UserCreateSchema.safeParse(invalid);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toBe("Password must be at least 6 characters");
      }
    });

    it("rejects UserCreate with invalid email", () => {
      const invalid = {
        name: "Charlie",
        email: "not-an-email",
        password: "password123",
      };
      const res = UserCreateSchema.safeParse(invalid);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toBe("Invalid email address");
      }
    });

    it("validates UserUpdate partial updates", () => {
      const update = {
        name: "Alice Updated",
        status: "inactive" as const,
        is_active: false,
      };
      const res = UserUpdateSchema.safeParse(update);
      expect(res.success).toBe(true);
    });

    it("validates ResetPassword schema", () => {
      const valid = { new_password: "brandNewPassword2026" };
      expect(ResetPasswordSchema.safeParse(valid).success).toBe(true);

      const invalid = { new_password: "abc" };
      expect(ResetPasswordSchema.safeParse(invalid).success).toBe(false);
    });
  });

  describe("Endpoints Security & Unauthenticated Responses", () => {
    it("GET /api/employees returns 401 when unauthenticated", async () => {
      const res = await app.fetch(new Request("http://localhost/api/employees"), mockEnv);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.detail).toBe("Not authenticated");
    });

    it("GET /api/users returns 401 when unauthenticated", async () => {
      const res = await app.fetch(new Request("http://localhost/api/users"), mockEnv);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.detail).toBe("Not authenticated");
    });

    it("POST /api/employees returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Dave", email: "dave@example.com", password: "password123" }),
        }),
        mockEnv
      );
      expect(res.status).toBe(401);
    });
  });
});
