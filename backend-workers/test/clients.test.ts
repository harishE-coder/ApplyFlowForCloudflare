import { describe, expect, it } from "vitest";
import {
  AssignEmployeesSchema,
  ClientCreateSchema,
  ClientUpdateSchema,
} from "../src/schemas/clients";

describe("Clients Zod Schemas", () => {
  it("validates a standard ClientCreate payload", () => {
    const valid = {
      company_name: "Stripe",
      contact_person: "John Doe",
      email: "recruiter@stripe.com",
      phone: "+1 555-0199",
      status: "active",
      logo_url: "https://stripe.com/logo.png",
    };
    const result = ClientCreateSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("fails ClientCreate when company_name is missing or empty", () => {
    const invalid = {
      company_name: "",
      email: "test@example.com",
    };
    const result = ClientCreateSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Company name is required");
    }
  });

  it("fails ClientCreate when email is malformed", () => {
    const invalid = {
      company_name: "Netflix",
      email: "not-an-email",
    };
    const result = ClientCreateSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Invalid email address");
    }
  });

  it("validates partial ClientUpdate payloads", () => {
    const update = {
      contact_person: "Jane Smith",
      status: "inactive" as const,
      is_active: false,
    };
    const result = ClientUpdateSchema.safeParse(update);
    expect(result.success).toBe(true);
  });

  it("validates ClientUpdate payloads with employee_ids and assignments", () => {
    const updateWithEmpIds = {
      company_name: "Stripe Updated",
      employee_ids: [
        "550e8400-e29b-41d4-a716-446655440000",
        "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      ],
    };
    const res1 = ClientUpdateSchema.safeParse(updateWithEmpIds);
    expect(res1.success).toBe(true);

    const updateWithAssignments = {
      assignments: [
        {
          employee_id: "550e8400-e29b-41d4-a716-446655440000",
          is_primary: false,
          active: true,
        },
      ],
    };
    const res2 = ClientUpdateSchema.safeParse(updateWithAssignments);
    expect(res2.success).toBe(true);
  });

  it("validates Recruiter Assignment payloads", () => {
    const valid = {
      employee_ids: ["550e8400-e29b-41d4-a716-446655440000"],
      assignments: [
        {
          employee_id: "550e8400-e29b-41d4-a716-446655440000",
          is_primary: true,
          active: true,
        },
      ],
    };
    const result = AssignEmployeesSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});
