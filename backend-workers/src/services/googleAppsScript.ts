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

/**
 * Uploads resume to Google Drive via Google Apps Script Web App.
 * Sends multipart/form-data with file blob, base64 fallback, and client name.
 */
export async function uploadResume(
  fileBuffer: ArrayBuffer,
  filename: string,
  clientName: string,
  env: Bindings
): Promise<GoogleDriveUploadResult> {
  const scriptUrl = env.GOOGLE_APPS_SCRIPT_URL;
  if (!scriptUrl) {
    throw new Error("GOOGLE_APPS_SCRIPT_URL is not configured on Cloudflare Worker");
  }

  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: "application/pdf" });
  formData.append("file", blob, filename);
  formData.append("filename", filename);
  formData.append("client", clientName);
  formData.append("content", bufferToBase64(fileBuffer));
  formData.append("action", "upload");

  const headers: Record<string, string> = {};
  if (env.GOOGLE_APPS_SCRIPT_SECRET) {
    headers["X-Worker-Secret"] = env.GOOGLE_APPS_SCRIPT_SECRET;
  }

  const response = await fetch(scriptUrl, {
    method: "POST",
    body: formData,
    headers,
    redirect: "follow",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Google Apps Script upload failed (HTTP ${response.status}): ${errorText}`);
  }

  const data = (await response.json().catch(() => ({}))) as Record<string, any>;
  const fileId = data.fileId || data.id;

  if (!fileId) {
    throw new Error(data.message || data.error || "Google Apps Script returned invalid file metadata");
  }

  const webViewLink =
    data.url || data.webViewLink || getPreviewUrl(fileId);
  const downloadLink =
    data.downloadUrl || data.downloadLink || getDownloadUrl(fileId);

  return {
    success: true,
    fileId: String(fileId),
    webViewLink,
    downloadLink,
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
  const scriptUrl = env.GOOGLE_APPS_SCRIPT_URL;
  if (!scriptUrl || !fileId) return true;

  try {
    const formData = new FormData();
    formData.append("action", "delete");
    formData.append("fileId", fileId);

    const headers: Record<string, string> = {};
    if (env.GOOGLE_APPS_SCRIPT_SECRET) {
      headers["X-Worker-Secret"] = env.GOOGLE_APPS_SCRIPT_SECRET;
    }

    const response = await fetch(scriptUrl, {
      method: "POST",
      body: formData,
      headers,
      redirect: "follow",
    });

    if (response.ok) {
      const data = (await response.json().catch(() => ({}))) as Record<string, any>;
      return Boolean(data.success !== false);
    }
    return false;
  } catch (err) {
    console.error(`Failed to delete file ${fileId} from Google Drive via Apps Script:`, err);
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
