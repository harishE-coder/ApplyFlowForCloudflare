/**
 * Google Apps Script Web App Storage Service for ApplyFlow Cloudflare Workers.
 * Architecture:
 * Browser -> Cloudflare Worker -> Google Apps Script -> Google Drive -> Neon PostgreSQL
 * 
 * Securely communicates with the existing Google Apps Script deployment using
 * a shared secret header (X-Worker-Secret).
 */

import type { Bindings } from "../types";

export interface GoogleDriveUploadResult {
  success: boolean;
  fileId: string;
  viewUrl: string;
  downloadUrl: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  downloadLink: string;
  error?: string;
}

/**
 * Computes SHA-256 binary hash using WebCrypto.
 */
export async function computeFileHash(buffer: ArrayBuffer): Promise<string> {
  const digestBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const byteArray = new Uint8Array(digestBuffer);
  let hexString = "";
  for (let i = 0; i < byteArray.length; i++) {
    hexString += byteArray[i].toString(16).padStart(2, "0");
  }
  return hexString;
}

/**
 * Converts ArrayBuffer to Base64 in standard Worker JavaScript.
 */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function cleanScriptUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return "";
  let cleaned = rawUrl.trim();
  if (cleaned.startsWith("GOOGLE_APPS_SCRIPT_URL=")) {
    cleaned = cleaned.slice("GOOGLE_APPS_SCRIPT_URL=".length).trim();
  }
  return cleaned.replace(/^['"]+|['"]+$/g, "");
}

function cleanSecret(rawSecret: string | undefined): string | undefined {
  if (!rawSecret) return undefined;
  let cleaned = rawSecret.trim();
  if (cleaned.startsWith("GOOGLE_APPS_SCRIPT_SECRET=")) {
    cleaned = cleaned.slice("GOOGLE_APPS_SCRIPT_SECRET=".length).trim();
  }
  cleaned = cleaned.replace(/^['"]+|['"]+$/g, "");
  return cleaned || undefined;
}

function buildActionUrl(baseUrl: string, action: string): string {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("action", action);
    return url.toString();
  } catch {
    const sep = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${sep}action=${encodeURIComponent(action)}`;
  }
}

/**
 * Uploads resume to Google Drive via Google Apps Script Web App.
 * Uses exact Google Apps Script protocol: ?action=upload with URL-encoded fields
 * (action, filename, mimeType, base64, content, secret, client).
 */
export async function uploadResume(
  fileBuffer: ArrayBuffer,
  filename: string,
  clientName: string,
  env: Bindings,
  customMimeType?: string
): Promise<GoogleDriveUploadResult> {
  const scriptUrl = cleanScriptUrl(env.GOOGLE_APPS_SCRIPT_URL);
  if (!scriptUrl) {
    throw new Error("GOOGLE_APPS_SCRIPT_URL is not configured on Cloudflare Worker");
  }

  const scriptSecret = cleanSecret(env.GOOGLE_APPS_SCRIPT_SECRET);

  const base64Content = bufferToBase64(fileBuffer);
  const lowerName = (filename || "").toLowerCase();
  const mimeType =
    customMimeType ||
    (lowerName.endsWith(".docx")
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : lowerName.endsWith(".doc")
      ? "application/msword"
      : "application/pdf");

  const params = new URLSearchParams();
  params.append("action", "upload");
  params.append("filename", filename);
  params.append("mimeType", mimeType);
  params.append("base64", base64Content);
  params.append("content", base64Content);
  params.append("client", clientName || "");
  if (scriptSecret) {
    params.append("secret", scriptSecret);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (scriptSecret) {
    headers["X-Worker-Secret"] = scriptSecret;
  }

  const targetUrl = buildActionUrl(scriptUrl, "upload");
  const response = await fetch(targetUrl, {
    method: "POST",
    body: params.toString(),
    headers,
    redirect: "follow",
  });

  if (!response.ok) {
    const errorText = typeof response.text === "function" ? await response.text().catch(() => "") : "";
    throw new Error(`Google Apps Script upload failed (HTTP ${response.status}): ${errorText}`);
  }

  let data: Record<string, any> = {};
  if (typeof (response as any).json === "function") {
    data = (await response.json().catch(() => ({}))) as Record<string, any>;
  } else if (typeof response.text === "function") {
    const responseText = await response.text().catch(() => "");
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`Invalid JSON response from Google Apps Script: ${responseText.slice(0, 200)}`);
    }
  }

  if (data.success === false || (!data.fileId && !data.id)) {
    throw new Error(data.message || data.error || "Google Apps Script failed to upload file to Google Drive");
  }

  const fileId = String(data.fileId || data.id);
  const viewUrl = data.url || data.viewUrl || data.webViewLink || getPreviewUrl(fileId);
  const downloadUrl = data.downloadUrl || data.downloadLink || getDownloadUrl(fileId);
  const name = data.fileName || data.name || filename;

  return {
    success: true,
    fileId,
    viewUrl,
    downloadUrl,
    name,
    mimeType: data.mimeType || mimeType,
    webViewLink: viewUrl,
    downloadLink: downloadUrl,
  };
}

/**
 * Deletes a resume from Google Drive via Google Apps Script.
 * Used for retention cleanup and compensation rollbacks.
 */
export async function deleteResume(
  fileId: string,
  env: Bindings
): Promise<boolean> {
  const scriptUrl = cleanScriptUrl(env.GOOGLE_APPS_SCRIPT_URL);
  if (!scriptUrl || !fileId) return true;

  const scriptSecret = cleanSecret(env.GOOGLE_APPS_SCRIPT_SECRET);

  try {
    const params = new URLSearchParams();
    params.append("action", "delete");
    params.append("fileId", fileId);
    if (scriptSecret) {
      params.append("secret", scriptSecret);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (scriptSecret) {
      headers["X-Worker-Secret"] = scriptSecret;
    }

    const targetUrl = buildActionUrl(scriptUrl, "delete");
    const response = await fetch(targetUrl, {
      method: "POST",
      body: params.toString(),
      headers,
      redirect: "follow",
    });

    if (response.ok) {
      let data: Record<string, any> = {};
      if (typeof (response as any).json === "function") {
        data = (await response.json().catch(() => ({}))) as Record<string, any>;
      } else if (typeof response.text === "function") {
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch {}
      }
      return Boolean(data.success !== false);
    }
    return false;
  } catch (err) {
    console.error("Failed to delete resume from Google Drive:", err);
    return false;
  }
}

/**
 * Returns Google Drive web view URL for preview.
 */
export function getPreviewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

/**
 * Returns Google Drive direct download URL.
 */
export function getDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}
