import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createAccessToken } from "../src/auth";
import type { Bindings, UserPayload } from "../src/types";

// Mock user for auth
const mockUser = {
  id: "u1111111-1111-1111-1111-111111111111",
  name: "Recruiter Alice",
  email: "recruiter@applyflow.com",
  role: "recruiter" as const,
  is_active: true,
};

vi.mock("../src/db", () => {
  return {
    getDb: () => {
      return async (strings: TemplateStringsArray, ...values: any[]) => {
        const queryText = strings.join("?");
        if (queryText.includes("WHERE id =") || queryText.includes("WHERE id = ?")) {
          const id = String(values[0]);
          if (id === mockUser.id) {
            return [mockUser];
          }
        }
        if (queryText.includes("FROM clients")) {
          return [{ id: "c1111111-1111-1111-1111-111111111111", company_name: "Acme Client" }];
        }
        if (queryText.includes("FROM resumes")) {
          return [];
        }
        return [];
      };
    },
  };
});

import app from "../src/index";

const mockEnv: Bindings = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/testdb",
  JWT_SECRET_KEY: "test-secret-key-12345678901234567890",
  ACCESS_TOKEN_EXPIRE_MINUTES: "60",
  REFRESH_TOKEN_EXPIRE_DAYS: "7",
  GROQ_API_KEY: "gsk_test_mock_groq_api_key_12345",
  FRONTEND_URL: "https://applyflowforcloudflare.pages.dev",
  APP_CORS_ORIGINS: "https://applyflowforcloudflare.pages.dev,http://localhost:5173",
};

describe("AI Resume Intake Router (/api/ai/analyze-file)", () => {
  let validToken: string;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    validToken = await createAccessToken(mockUser, mockEnv.JWT_SECRET_KEY!, 60);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("1. Returns 401 when unauthenticated", async () => {
    const formData = new FormData();
    const file = new File(["Resume text content here"], "resume.txt", { type: "text/plain" });
    formData.append("file", file);

    const res = await app.fetch(
      new Request("http://localhost/api/ai/analyze-file", {
        method: "POST",
        body: formData,
      }),
      mockEnv
    );

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.detail).toBe("Not authenticated");
  });

  it("2. Returns 400 when file is missing from form-data", async () => {
    const formData = new FormData();
    formData.append("client_id", "some-client-id");

    const res = await app.fetch(
      new Request("http://localhost/api/ai/analyze-file", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
        body: formData,
      }),
      mockEnv
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.detail).toContain("Missing file");
  });

  it("3. Returns 400 when file type is invalid or unsupported", async () => {
    const formData = new FormData();
    const invalidFile = new File([new Uint8Array([0x00, 0x01, 0x02])], "malware.exe", {
      type: "application/x-msdownload",
    });
    formData.append("file", invalidFile);

    const res = await app.fetch(
      new Request("http://localhost/api/ai/analyze-file", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
        body: formData,
      }),
      mockEnv
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.detail).toContain("Unsupported file type");
  });

  it("4. Returns 200 with structured analysis JSON on successful upload", async () => {
    // Mock GROQ API fetch
    const mockGroqResponse = {
      candidate_name: "Jane Doe",
      email: "jane.doe@example.com",
      phone: "+1-234-567-8901",
      skills: ["React", "TypeScript", "Tailwind CSS", "Node.js"],
      experience_years: 4,
      education: "B.Tech Computer Science",
      current_company: "Innovatech Corp",
      summary: "Experienced frontend developer passionate about accessible UI engineering.",
      role: "Senior Frontend Engineer",
      company: "Innovatech Corp",
      round: "Screening",
      status: "applied",
      interview_date: "2026-09-20",
      is_interview_mail: true,
    };

    globalThis.fetch = vi.fn(async (url: any, opts: any) => {
      const urlStr = String(url);
      if (urlStr.includes("api.groq.com")) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify(mockGroqResponse),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(url, opts);
    });

    const resumeContent = `
Jane Doe
Email: jane.doe@example.com | Phone: +1-234-567-8901
Experience: 4 years as Senior Frontend Engineer at Innovatech Corp.
Skills: React, TypeScript, Tailwind CSS, Node.js.
Education: B.Tech Computer Science.
    `;

    const formData = new FormData();
    const file = new File([resumeContent], "Jane_Doe_Resume.txt", { type: "text/plain" });
    formData.append("file", file);
    formData.append("client_id", "c1111111-1111-1111-1111-111111111111");

    const res = await app.fetch(
      new Request("http://localhost/api/ai/analyze-file", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
        body: formData,
      }),
      mockEnv
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.analysis).toBeDefined();
    expect(json.analysis.candidate_name).toBe("Jane Doe");
    expect(json.analysis.skills).toContain("React");
    expect(json.analysis.experience_years).toBe(4);
    expect(json.candidate_name).toBe("Jane Doe");
    expect(json.company).toBe("Innovatech Corp");
    expect(json.role).toBe("Senior Frontend Engineer");
  });

  it("5. Returns 502 when GROQ API fails", async () => {
    globalThis.fetch = vi.fn(async (url: any, opts: any) => {
      const urlStr = String(url);
      if (urlStr.includes("api.groq.com")) {
        return new Response("GROQ Service Unavailable", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        });
      }
      return originalFetch(url, opts);
    });

    const resumeContent = "John Smith Resume content with enough characters to pass minimum text length check.";
    const formData = new FormData();
    const file = new File([resumeContent], "John_Smith_Resume.txt", { type: "text/plain" });
    formData.append("file", file);

    const res = await app.fetch(
      new Request("http://localhost/api/ai/analyze-file", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
        body: formData,
      }),
      mockEnv
    );

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.detail).toContain("AI analysis service failure");
  });
});
