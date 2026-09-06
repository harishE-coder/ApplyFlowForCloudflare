"""
Supabase Storage service for raw email files, normalized JSON payloads, and datasets.
Uses Supabase Storage Python SDK with automatic fallback to local persistent filesystem
storage when Supabase credentials are not configured (e.g. offline dev/testing).
Includes retry-safe staging and atomic rollback cleanup to prevent orphaned files.
"""

import json
import logging
import os
from collections.abc import Generator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import settings

logger = logging.getLogger("interview_intelligence.storage")

# Local fallback directory for offline development or testing
LOCAL_STORAGE_BASE = Path(__file__).resolve().parent.parent.parent.parent / "uploads" / "applyflow_storage"


class SupabaseStorageService:
    """Manages file persistence (.eml/.pdf/json/jsonl) in Supabase Storage."""

    def __init__(self):
        self._client = None
        self._initialized = False

    def _get_client(self):
        if self._initialized:
            return self._client

        self._initialized = True
        supabase_url = settings.supabase_url or os.getenv("SUPABASE_URL")
        supabase_key = settings.supabase_secret_key or os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if supabase_url and supabase_key:
            try:
                from supabase import create_client

                self._client = create_client(supabase_url, supabase_key)
                logger.info("Supabase Storage client initialized successfully.")
            except Exception as e:
                logger.warning(f"Could not initialize Supabase client: {e}. Falling back to local storage.")
                self._client = None
        else:
            logger.info("Supabase credentials not provided. Using local filesystem storage for datasets.")
            self._client = None

        return self._client

    @property
    def bucket_name(self) -> str:
        return settings.supabase_bucket or os.getenv("SUPABASE_BUCKET", "applyflow-storage")

    def _get_date_prefix(self, received_time: datetime | None = None) -> str:
        dt = received_time or datetime.now(timezone.utc)
        return f"{dt.strftime('%Y')}/{dt.strftime('%m')}/{dt.strftime('%d')}"

    def upload_raw_file(
        self,
        raw_bytes: bytes,
        email_hash: str,
        file_ext: str = "eml",
        received_time: datetime | None = None,
        metadata: dict[str, str] | None = None,
    ) -> str:
        """
        Uploads original raw email file (.eml, .pdf, .txt) to emails/raw/YYYY/MM/DD/{hash}.{ext}.
        Returns the raw storage_key.
        """
        ext = file_ext.lstrip(".").lower() or "eml"
        date_prefix = self._get_date_prefix(received_time)
        storage_key = f"emails/raw/{date_prefix}/{email_hash}.{ext}"

        content_type_map = {
            "eml": "message/rfc822",
            "pdf": "application/pdf",
            "txt": "text/plain",
            "json": "application/json",
            "jsonl": "application/x-ndjson",
        }
        content_type = content_type_map.get(ext, "application/octet-stream")

        client = self._get_client()
        if client:
            try:
                client.storage.from_(self.bucket_name).upload(
                    path=storage_key,
                    file=raw_bytes,
                    file_options={"content-type": content_type, "upsert": "true"},
                )
                return storage_key
            except Exception as e:
                logger.error(f"Supabase raw upload failed for {storage_key}: {e}. Saving to local fallback.")

        # Local filesystem fallback
        local_path = LOCAL_STORAGE_BASE / storage_key
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(raw_bytes)
        return storage_key

    def upload_normalized_json(
        self,
        email_data: dict[str, Any],
        email_hash: str,
        received_time: datetime | None = None,
        metadata: dict[str, str] | None = None,
    ) -> str:
        """
        Uploads normalized email JSON to emails/normalized/YYYY/MM/DD/{hash}.json.
        Returns the storage_key.
        """
        date_prefix = self._get_date_prefix(received_time)
        storage_key = f"emails/normalized/{date_prefix}/{email_hash}.json"
        payload_bytes = json.dumps(email_data, ensure_ascii=False, indent=2).encode("utf-8")

        client = self._get_client()
        if client:
            try:
                client.storage.from_(self.bucket_name).upload(
                    path=storage_key,
                    file=payload_bytes,
                    file_options={"content-type": "application/json", "upsert": "true"},
                )
                return storage_key
            except Exception as e:
                logger.error(f"Supabase normalized upload failed for {storage_key}: {e}. Saving to local fallback.")

        local_path = LOCAL_STORAGE_BASE / storage_key
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(payload_bytes)
        return storage_key

    def upload_email(
        self,
        email_data: dict[str, Any],
        email_hash: str,
        received_time: datetime | None = None,
        metadata: dict[str, str] | None = None,
    ) -> str:
        """Alias for upload_normalized_json."""
        return self.upload_normalized_json(email_data, email_hash, received_time, metadata)

    def upload_file_direct(self, storage_path: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        """Uploads arbitrary file to explicit storage_path."""
        clean_path = storage_path.lstrip("/")
        client = self._get_client()
        if client:
            try:
                client.storage.from_(self.bucket_name).upload(
                    path=clean_path,
                    file=data,
                    file_options={"content-type": content_type, "upsert": "true"},
                )
                return clean_path
            except Exception as e:
                logger.error(f"Supabase direct upload failed for {clean_path}: {e}. Saving to local fallback.")

        local_path = LOCAL_STORAGE_BASE / clean_path
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(data)
        return clean_path

    def download_raw_file(self, storage_path: str) -> bytes | None:
        """Downloads raw bytes from Supabase or local fallback."""
        clean_path = storage_path.lstrip("/")
        client = self._get_client()
        if client:
            try:
                res = client.storage.from_(self.bucket_name).download(clean_path)
                return res
            except Exception as e:
                logger.warning(f"Supabase download failed for {clean_path}: {e}. Checking local storage.")

        local_path = LOCAL_STORAGE_BASE / clean_path
        if local_path.exists():
            try:
                return local_path.read_bytes()
            except Exception as e:
                logger.error(f"Error reading local file {local_path}: {e}")
                return None

        return None

    def download_email(self, storage_key: str) -> dict[str, Any] | None:
        """Downloads email JSON from Supabase (or local fallback) and parses into dict."""
        raw_bytes = self.download_raw_file(storage_key)
        if raw_bytes:
            try:
                return json.loads(raw_bytes.decode("utf-8"))
            except Exception as e:
                logger.error(f"Error parsing email JSON from {storage_key}: {e}")
                return None
        return None

    def file_exists(self, storage_path: str) -> bool:
        """Checks whether the object exists in Supabase or local storage."""
        clean_path = storage_path.lstrip("/")
        client = self._get_client()
        if client:
            try:
                # Search parent folder in bucket
                parent_dir = str(Path(clean_path).parent)
                file_name = Path(clean_path).name
                items = client.storage.from_(self.bucket_name).list(parent_dir if parent_dir != "." else "")
                if any(item.get("name") == file_name for item in items):
                    return True
            except Exception:
                pass

        local_path = LOCAL_STORAGE_BASE / clean_path
        return local_path.exists()

    def email_exists(self, storage_key: str) -> bool:
        """Alias for file_exists."""
        return self.file_exists(storage_key)

    def delete_file(self, storage_path: str) -> bool:
        """Deletes object from Supabase and local storage."""
        clean_path = storage_path.lstrip("/")
        success = False
        client = self._get_client()
        if client:
            try:
                client.storage.from_(self.bucket_name).remove([clean_path])
                success = True
            except Exception as e:
                logger.error(f"Supabase delete failed for {clean_path}: {e}")

        local_path = LOCAL_STORAGE_BASE / clean_path
        if local_path.exists():
            try:
                local_path.unlink()
                success = True
            except Exception as e:
                logger.error(f"Failed deleting local file {local_path}: {e}")

        return success

    def delete_email(self, storage_key: str) -> bool:
        """Alias for delete_file."""
        return self.delete_file(storage_key)

    def cleanup_keys(self, keys: list[str]) -> None:
        """Helper to delete a batch of uploaded keys on failure."""
        clean_keys = [k.lstrip("/") for k in keys if k]
        client = self._get_client()
        if client and clean_keys:
            try:
                client.storage.from_(self.bucket_name).remove(clean_keys)
            except Exception as e:
                logger.error(f"Supabase batch remove failed: {e}")

        for k in clean_keys:
            local_path = LOCAL_STORAGE_BASE / k
            if local_path.exists():
                try:
                    local_path.unlink()
                except Exception:
                    pass

    @contextmanager
    def retry_safe_upload_scope(self) -> Generator[list[str], None, None]:
        """
        Context manager that tracks uploaded storage keys during a workflow.
        If an unhandled exception occurs (e.g. database write fails), all tracked
        keys are automatically cleaned up to prevent orphaned files.
        """
        uploaded_keys: list[str] = []
        try:
            yield uploaded_keys
        except Exception:
            logger.warning(f"Operation failed; cleaning up {len(uploaded_keys)} staged Supabase storage objects.")
            self.cleanup_keys(uploaded_keys)
            raise


# Global singleton instance
supabase_storage = SupabaseStorageService()
storage_service = supabase_storage
r2_storage = supabase_storage  # Backward compatibility alias
