import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  callAiGateway,
  resetAiGatewayState,
  getAiGatewayTelemetry,
  recordFailure,
  recordAuthFailure,
  isKeyInCooldown,
  resolveConfiguredProviders,
  getAiUsageAnalytics,
} from "../src/services/aiGateway";
import { callGroqAi } from "../src/routes/ai";
import { GroqAnalysisSchema, type GroqAnalysis } from "../src/schemas/ai";
import { createAccessToken } from "../src/auth";
import type { Bindings, UserPayload } from "../src/types";

// Mock user for route testing
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
        if (queryText.includes("ai_request_logs")) {
          return [
            {
              total_requests: 12,
              successful_requests: 11,
              success_rate: 91.7,
              avg_latency_ms: 1240.5,
              total_fallbacks: 2,
            },
          ];
        }
        return [];
      };
    },
  };
});

import app from "../src/index";

const mockValidAiResponse: GroqAnalysis = {
  candidate_name: "Jane Smith",
  email: "jane.smith@example.com",
  phone: "+1-555-0144",
  skills: ["TypeScript", "React", "Cloudflare Workers", "SQL"],
  experience_years: 6,
  education: "M.S. in Computer Science",
  current_company: "TechFlow Systems",
  summary: "Senior Full Stack Engineer with extensive serverless and cloud database expertise.",
  confidence: 0.94,
  role: "Senior Staff Engineer",
  company: "TechFlow Systems",
  round: "Technical Interview",
  status: "interview",
  interview_date: "2026-09-18",
  is_interview_mail: true,
};

function createLlmCompletionResponse(content: any, status = 200) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: typeof content === "string" ? content : JSON.stringify(content),
          },
        },
      ],
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

describe("AI Gateway Service (Cloudflare Workers)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetAiGatewayState();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetAiGatewayState();
  });

  it("1. Groq Key1 -> 429 -> Key2 succeeds (key rotation)", async () => {
    const attemptedKeys: string[] = [];

    globalThis.fetch = vi.fn(async (url: any, opts: any) => {
      const authHeader = opts?.headers?.Authorization || "";
      if (authHeader.includes("gsk_key_1")) {
        attemptedKeys.push("GROQ_API_KEY_1");
        return new Response("Rate limit exceeded", { status: 429, headers: { "Content-Type": "text/plain" } });
      }
      if (authHeader.includes("gsk_key_2")) {
        attemptedKeys.push("GROQ_API_KEY_2");
        return createLlmCompletionResponse(mockValidAiResponse);
      }
      return new Response("Not found", { status: 404 });
    });

    const env: Bindings = {
      DATABASE_URL: "postgres://mock",
      GROQ_API_KEY_1: "gsk_key_1",
      GROQ_API_KEY_2: "gsk_key_2",
    };

    const result = await callAiGateway(env, "Resume document text for Jane Smith", undefined, 20000, "ai_test_rot");

    expect(attemptedKeys).toEqual(["GROQ_API_KEY_1", "GROQ_API_KEY_2"]);
    expect(result.candidate_name).toBe("Jane Smith");
    expect(result.skills).toContain("Cloudflare Workers");

    // Key 1 should be under cooldown; Key 2 should be healthy
    expect(isKeyInCooldown("GROQ_API_KEY_1")).toBe(true);
    expect(isKeyInCooldown("GROQ_API_KEY_2")).toBe(false);
  });

  it("2. All Groq keys fail -> OpenAI succeeds (provider fallback)", async () => {
    const providersAttempted: string[] = [];

    globalThis.fetch = vi.fn(async (url: any, opts: any) => {
      const urlStr = String(url);
      const auth = opts?.headers?.Authorization || "";

      if (urlStr.includes("api.groq.com")) {
        providersAttempted.push(auth.includes("gsk_key_1") ? "GROQ_1" : "GROQ_2");
        return new Response("Groq capacity unavailable", { status: 503 });
      }

      if (urlStr.includes("api.openai.com")) {
        providersAttempted.push("OPENAI");
        return createLlmCompletionResponse(mockValidAiResponse);
      }

      return new Response("Not found", { status: 404 });
    });

    const env: Bindings = {
      DATABASE_URL: "postgres://mock",
      GROQ_API_KEY_1: "gsk_key_1",
      GROQ_API_KEY_2: "gsk_key_2",
      OPENAI_API_KEY: "sk-openai-mock-key",
    };

    const result = await callAiGateway(env, "Sample resume content", undefined, 20000, "ai_test_oa");

    expect(providersAttempted).toEqual(["GROQ_1", "GROQ_2", "OPENAI"]);
    expect(result.candidate_name).toBe("Jane Smith");
    expect(isKeyInCooldown("GROQ_API_KEY_1")).toBe(true);
    expect(isKeyInCooldown("GROQ_API_KEY_2")).toBe(true);
    expect(isKeyInCooldown("OPENAI_API_KEY")).toBe(false);
  });

  it("3. OpenAI fails -> Gemini succeeds (full chain fallback)", async () => {
    const providersAttempted: string[] = [];

    globalThis.fetch = vi.fn(async (url: any, opts: any) => {
      const urlStr = String(url);

      if (urlStr.includes("api.groq.com")) {
        providersAttempted.push("GROQ");
        return new Response("Rate limited", { status: 429 });
      }

      if (urlStr.includes("api.openai.com")) {
        providersAttempted.push("OPENAI");
        return new Response("OpenAI internal error", { status: 500 });
      }

      if (urlStr.includes("generativelanguage.googleapis.com")) {
        providersAttempted.push("GEMINI");
        return createLlmCompletionResponse(mockValidAiResponse);
      }

      return new Response("Not found", { status: 404 });
    });

    const env: Bindings = {
      DATABASE_URL: "postgres://mock",
      GROQ_API_KEY: "gsk_single_key",
      OPENAI_API_KEY: "sk-openai-key",
      GEMINI_API_KEY: "AIzaSyGeminiKey",
    };

    const result = await callAiGateway(env, "Resume text for interview");

    expect(providersAttempted).toEqual(["GROQ", "OPENAI", "GEMINI"]);
    expect(result.candidate_name).toBe("Jane Smith");
    expect(isKeyInCooldown("GEMINI_API_KEY")).toBe(false);
  });

  it("4. Cooldown skips failed key on subsequent invocations", async () => {
    // Put Key 1 into cooldown directly
    recordFailure("GROQ_API_KEY_1", true);
    expect(isKeyInCooldown("GROQ_API_KEY_1")).toBe(true);

    const attemptedKeys: string[] = [];

    globalThis.fetch = vi.fn(async (url: any, opts: any) => {
      const auth = opts?.headers?.Authorization || "";
      if (auth.includes("gsk_key_1")) {
        attemptedKeys.push("GROQ_API_KEY_1");
      }
      if (auth.includes("gsk_key_2")) {
        attemptedKeys.push("GROQ_API_KEY_2");
        return createLlmCompletionResponse(mockValidAiResponse);
      }
      return new Response("Not found", { status: 404 });
    });

    const env: Bindings = {
      DATABASE_URL: "postgres://mock",
      GROQ_API_KEY_1: "gsk_key_1",
      GROQ_API_KEY_2: "gsk_key_2",
    };

    const result = await callAiGateway(env, "Candidate profile text");

    // Key 1 must have been skipped without any HTTP request
    expect(attemptedKeys).toEqual(["GROQ_API_KEY_2"]);
    expect(result.candidate_name).toBe("Jane Smith");
  });

  it("5. Timeout triggers immediate fallback to next provider", async () => {
    const attempts: string[] = [];

    globalThis.fetch = vi.fn(async (url: any, opts: any) => {
      const auth = opts?.headers?.Authorization || "";
      if (auth.includes("gsk_hanging")) {
        attempts.push("GROQ_HANGING");
        // Simulate hanging request aborted by signal
        return new Promise((_, reject) => {
          opts?.signal?.addEventListener("abort", () => {
            const err = new Error("AI Gateway request timed out after 1s");
            err.name = "AbortError";
            reject(err);
          });
        });
      }

      if (auth.includes("gsk_fast")) {
        attempts.push("GROQ_FAST");
        return createLlmCompletionResponse(mockValidAiResponse);
      }

      return new Response("Not found", { status: 404 });
    });

    const env: Bindings = {
      DATABASE_URL: "postgres://mock",
      GROQ_API_KEY_1: "gsk_hanging",
      GROQ_API_KEY_2: "gsk_fast",
    };

    // Use small timeout for test (50ms)
    const result = await callAiGateway(env, "Resume text", undefined, 50);

    expect(attempts).toEqual(["GROQ_HANGING", "GROQ_FAST"]);
    expect(result.candidate_name).toBe("Jane Smith");
    expect(isKeyInCooldown("GROQ_API_KEY_1")).toBe(true);
  });

  it("6. callGroqAi compatibility wrapper delegates to callAiGateway", async () => {
    globalThis.fetch = vi.fn(async () => {
      return createLlmCompletionResponse(mockValidAiResponse);
    });

    const result = await callGroqAi("gsk_compat_key", "Candidate document text");
    expect(result.candidate_name).toBe("Jane Smith");
    expect(result.role).toBe("Senior Staff Engineer");
  });

  it("7. Existing AI routes return identical JSON schema (/api/ai/analyze-email & /api/ai/parse-resume)", async () => {
    const validToken = await createAccessToken(mockUser, "test-secret-key-12345678901234567890", 60);

    globalThis.fetch = vi.fn(async () => {
      return createLlmCompletionResponse(mockValidAiResponse);
    });

    const testEnv: Bindings = {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/testdb",
      JWT_SECRET_KEY: "test-secret-key-12345678901234567890",
      ACCESS_TOKEN_EXPIRE_MINUTES: "60",
      REFRESH_TOKEN_EXPIRE_DAYS: "7",
      GROQ_API_KEY_1: "gsk_test_1",
      GROQ_API_KEY_2: "gsk_test_2",
      OPENAI_API_KEY: "sk-test",
      GEMINI_API_KEY: "gemini-test",
      FRONTEND_URL: "https://applyflowforcloudflare.pages.dev",
      APP_CORS_ORIGINS: "https://applyflowforcloudflare.pages.dev,http://localhost:5173",
    };

    // 1. Test POST /api/ai/analyze-email
    const emailRes = await app.fetch(
      new Request("http://localhost/api/ai/analyze-email", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw_email: "Dear Jane, We would like to invite you for a Technical Interview on Sep 18, 2026 for Senior Staff Engineer.",
        }),
      }),
      testEnv
    );

    expect(emailRes.status).toBe(200);
    const emailJson = await emailRes.json();
    expect(emailJson.candidate_name).toBe("Jane Smith");
    expect(emailJson.company).toBe("TechFlow Systems");
    expect(emailJson.role).toBe("Senior Staff Engineer");
    expect(emailJson.round).toBe("Technical Interview");
    expect(emailJson.status).toBe("interview");
    expect(emailJson.interview_date).toBe("2026-09-18");
    expect(emailJson.is_interview_mail).toBe(true);

    // 2. Test POST /api/ai/parse-resume (alias for analyze-file)
    const formData = new FormData();
    formData.append(
      "file",
      new File(["Resume content for Jane Smith with sufficient length for parsing."], "Jane_Smith.txt", {
        type: "text/plain",
      })
    );

    const resumeRes = await app.fetch(
      new Request("http://localhost/api/ai/parse-resume", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
        body: formData,
      }),
      testEnv
    );

    expect(resumeRes.status).toBe(200);
    const resumeJson = await resumeRes.json();
    expect(resumeJson.success).toBe(true);
    expect(resumeJson.candidate_name).toBe("Jane Smith");
    expect(resumeJson.analysis).toBeDefined();

    // Verify response schema strictly validates
    const parseCheck = GroqAnalysisSchema.safeParse(resumeJson.analysis);
    expect(parseCheck.success).toBe(true);
  });

  it("8. HTTP 401 Unauthorized: Invalid key is marked unhealthy immediately (health score 0) without model retries and skips to next key/provider", async () => {
    let key1Attempts = 0;
    let key2Attempts = 0;

    globalThis.fetch = vi.fn(async (url: any, opts: any) => {
      const auth = opts?.headers?.Authorization || "";

      if (auth.includes("invalid_groq_key_1")) {
        key1Attempts++;
        // Return 401 Unauthorized
        return new Response(JSON.stringify({ error: { message: "Invalid API Key provided" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (auth.includes("valid_groq_key_2")) {
        key2Attempts++;
        return createLlmCompletionResponse(mockValidAiResponse);
      }

      return new Response("Not found", { status: 404 });
    });

    const env: Bindings = {
      DATABASE_URL: "postgres://mock",
      GROQ_API_KEY_1: "invalid_groq_key_1",
      GROQ_API_KEY_2: "valid_groq_key_2",
    };

    const result = await callAiGateway(env, "Sample candidate resume", undefined, 20000, "ai_401_test");

    // Must attempt Key 1 exactly ONCE: should NOT retry alternative models on Key 1!
    expect(key1Attempts).toBe(1);
    // Must immediately advance to Key 2 and succeed
    expect(key2Attempts).toBe(1);
    expect(result.candidate_name).toBe("Jane Smith");

    // Key 1 must have health score = 0 and be under cooldown
    const telemetry = getAiGatewayTelemetry();
    expect(telemetry.healthScores["GROQ_API_KEY_1"]).toBe(0);
    expect(isKeyInCooldown("GROQ_API_KEY_1")).toBe(true);
  });

  it("9. OpenAI returns 401 -> immediately continues to Gemini without wasting time", async () => {
    const providersHit: string[] = [];

    globalThis.fetch = vi.fn(async (url: any, opts: any) => {
      const urlStr = String(url);

      if (urlStr.includes("api.openai.com")) {
        providersHit.push("OPENAI");
        return new Response(JSON.stringify({ error: "Incorrect API key" }), { status: 401 });
      }

      if (urlStr.includes("generativelanguage.googleapis.com")) {
        providersHit.push("GEMINI");
        return createLlmCompletionResponse(mockValidAiResponse);
      }

      return new Response("Not found", { status: 404 });
    });

    const env: Bindings = {
      DATABASE_URL: "postgres://mock",
      OPENAI_API_KEY: "revoked_openai_key",
      GEMINI_API_KEY: "valid_gemini_key",
    };

    const result = await callAiGateway(env, "Resume candidate text", undefined, 20000, "ai_oa_401");

    expect(providersHit).toEqual(["OPENAI", "GEMINI"]);
    expect(result.candidate_name).toBe("Jane Smith");

    const telemetry = getAiGatewayTelemetry();
    expect(telemetry.healthScores["OPENAI_API_KEY"]).toBe(0);
    expect(isKeyInCooldown("OPENAI_API_KEY")).toBe(true);
  });

  it("10. GET /api/ai/analytics returns telemetry and usage stats", async () => {
    const validToken = await createAccessToken(mockUser, "test-secret-key-12345678901234567890", 60);

    const testEnv: Bindings = {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/testdb",
      JWT_SECRET_KEY: "test-secret-key-12345678901234567890",
      ACCESS_TOKEN_EXPIRE_MINUTES: "60",
      REFRESH_TOKEN_EXPIRE_DAYS: "7",
      GROQ_API_KEY: "gsk_test_mock",
    };

    const res = await app.fetch(
      new Request("http://localhost/api/ai/analytics", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      }),
      testEnv
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.telemetry).toBeDefined();
    expect(json.summary).toBeDefined();
  });
});
