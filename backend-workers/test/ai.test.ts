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

vi.mock("mammoth", () => {
  return {
    default: {
      extractRawText: vi.fn(async ({ buffer }: { buffer?: any }) => {
        if (!buffer || buffer.length === 0) {
          throw new Error("Corrupted DOCX");
        }
        return {
          value:
            "David Miller\nEmail: david.miller@example.com\nSkills: Python, Django, AWS\nRole: Backend Lead at Acme Corp\n5 years experience.",
          messages: [],
        };
      }),
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
    expect(json.request_id).toBeDefined();
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
    expect(json.request_id).toBeDefined();
  });

  it("4. Returns 422 when text extraction fails on corrupted document", async () => {
    const formData = new FormData();
    // Non-parseable binary pretending to be PDF
    const corruptPdf = new File([new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44])], "broken.pdf", {
      type: "application/pdf",
    });
    formData.append("file", corruptPdf);

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

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.detail).toContain("Extraction failed");
    expect(json.request_id).toBeDefined();
  });

  it("5. Returns 200 with structured analysis JSON on successful PDF upload", async () => {
    const mockGroqResponse = {
      candidate_name: "Jane Doe",
      email: "jane.doe@example.com",
      phone: "+1-234-567-8901",
      skills: ["React", "TypeScript", "Tailwind CSS", "Node.js"],
      experience_years: 4,
      education: "B.Tech Computer Science",
      current_company: "Innovatech Corp",
      summary: "Experienced frontend developer passionate about accessible UI engineering.",
      confidence: 0.95,
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
    expect(json.analysis.confidence).toBe(0.95);
    expect(json.candidate_name).toBe("Jane Doe");
    expect(json.company).toBe("Innovatech Corp");
    expect(json.role).toBe("Senior Frontend Engineer");
    expect(json.confidence).toBe(0.95);
    expect(json.request_id).toBeDefined();
  });

  it("6. Returns 200 with structured analysis on DOCX upload using mammoth", async () => {
    const mockGroqResponse = {
      candidate_name: "David Miller",
      email: "david.miller@example.com",
      phone: "+1-555-123-4567",
      skills: ["Python", "Django", "AWS"],
      experience_years: 5,
      education: "BS Computer Science",
      current_company: "Acme Corp",
      summary: "Backend Lead with 5 years experience.",
      confidence: 0.91,
      role: "Backend Lead",
      company: "Acme Corp",
      round: "Screening",
      status: "applied",
      interview_date: "",
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

    const formData = new FormData();
    const docxFile = new File(
      [new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00])],
      "David_Miller.docx",
      {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }
    );
    formData.append("file", docxFile);

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
    expect(json.candidate_name).toBe("David Miller");
    expect(json.analysis.skills).toContain("Python");
    expect(json.confidence).toBe(0.91);
  });

  it("7. Returns 502 when GROQ API fails", async () => {
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
    expect(json.detail).toContain("Groq AI service failure");
    expect(json.request_id).toBeDefined();
  });

  it("8. Phase 3: AI endpoints return 401 when unauthenticated", async () => {
    const inboxRes = await app.fetch(new Request("http://localhost/api/ai/inbox"), mockEnv);
    expect(inboxRes.status).toBe(401);

    const histRes = await app.fetch(new Request("http://localhost/api/ai/history"), mockEnv);
    expect(histRes.status).toBe(401);

    const analyzeEmailRes = await app.fetch(
      new Request("http://localhost/api/ai/analyze-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_email: "Candidate update email..." }),
      }),
      mockEnv
    );
    expect(analyzeEmailRes.status).toBe(401);

    const confirmSaveRes = await app.fetch(
      new Request("http://localhost/api/ai/confirm-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_name: "John Doe" }),
      }),
      mockEnv
    );
    expect(confirmSaveRes.status).toBe(401);
  });
});
