/**
 * Environment Bindings and Request Variables for ApplyFlow Cloudflare Workers.
 */

export interface Bindings {
  DATABASE_URL: string;
  JWT_SECRET_KEY: string;
  JWT_ALGORITHM?: string;
  ACCESS_TOKEN_EXPIRE_MINUTES?: string;
  REFRESH_TOKEN_EXPIRE_DAYS?: string;
  RESUMES_BUCKET: R2Bucket;
  AI_PROVIDER?: string;
  GROQ_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  FRONTEND_URL?: string;
  APP_CORS_ORIGINS?: string;
  ENVIRONMENT?: string;
}

export interface UserPayload {
  id: string;
  email: string;
  name: string;
  role: "super_admin" | "sub_admin" | "recruiter" | "client" | "employee";
  client_id?: string | null;
}

export interface Variables {
  user: UserPayload;
}
