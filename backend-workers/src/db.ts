/**
 * Neon PostgreSQL Serverless Client for Cloudflare Workers.
 * Leverages Neon HTTP pipeline for zero-latency connectionless pooling.
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export function getDb(connectionString: string): NeonQueryFunction<false, false> {
  if (!connectionString) {
    throw new Error("DATABASE_URL environment binding is not set.");
  }
  return neon(connectionString);
}
