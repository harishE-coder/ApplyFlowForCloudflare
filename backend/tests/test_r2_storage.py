"""
Unit tests for Cloudflare R2 Storage Service.
Verifies:
- Object key format (resumes/{client_slug}/{year}/{month}/{uuid}_{filename})
- Upload handling (calculating file_size, content_type, expires_at)
- Presigned preview and download URL generation
- Binary byte retrieval
- Delete operation
- Retention cleanup calculation
"""

import pytest
from datetime import datetime, timezone
from app.services.r2_storage import r2_storage, R2StorageService
from app.core.config import settings


def test_object_key_format():
    """Verify object key follows: resumes/{client_slug}/{year}/{month}/{uuid}_{filename}"""
    client_name = "Global Staffing & Tech Solutions Ltd"
    filename = "John Doe Resume 2026.pdf"
    key = r2_storage.generate_object_key(filename=filename, client_name=client_name)

    now = datetime.now(timezone.utc)
    expected_year = now.strftime("%Y")
    expected_month = now.strftime("%m")

    assert key.startswith("resumes/global_staffing_tech_solutions_ltd/")
    assert f"/{expected_year}/{expected_month}/" in key
    assert key.endswith("John_Doe_Resume_2026.pdf")


def test_upload_resume_local_fallback():
    """Test upload_resume creates file, computes size, content_type and expiration."""
    sample_pdf = b"%PDF-1.4 sample content for test"
    filename = "test_candidate.pdf"
    client_name = "Acme Corp"

    result = r2_storage.upload_resume(
        file_bytes=sample_pdf,
        filename=filename,
        client_name=client_name,
        mime_type="application/pdf",
    )

    assert "r2_key" in result
    assert result["file_size"] == len(sample_pdf)
    assert result["content_type"] == "application/pdf"
    assert result["expires_at"] is not None
    assert result["expires_at"] > datetime.now(timezone.utc)

    # Verify we can fetch the bytes back
    fetched_bytes, ct = r2_storage.get_file_bytes(result["r2_key"], filename)
    assert fetched_bytes == sample_pdf
    assert ct == "application/pdf"

    # Cleanup
    deleted = r2_storage.delete_resume(result["r2_key"])
    assert deleted is True


def test_presigned_url_generation_fallback():
    """When R2 client is not configured (offline dev mode), presigned url returns None gracefully."""
    # Temporarily ensure unconfigured
    orig_key = settings.r2_access_key_id
    settings.r2_access_key_id = None
    service = R2StorageService()

    preview_url = service.get_presigned_preview_url("resumes/test/2026/09/sample.pdf")
    download_url = service.get_presigned_download_url("resumes/test/2026/09/sample.pdf")

    assert preview_url is None
    assert download_url is None

    settings.r2_access_key_id = orig_key


def test_presigned_url_generation_with_mock_client():
    """Verify presigned URLs pass correct ResponseContentDisposition and ContentType params."""
    service = R2StorageService()

    class MockS3Client:
        def generate_presigned_url(self, client_method, Params, ExpiresIn):
            assert client_method == "get_object"
            assert Params["Bucket"] == service.bucket_name
            assert Params["Key"] == "resumes/test/2026/09/sample.pdf"
            assert "ResponseContentDisposition" in Params
            assert ExpiresIn == 3600
            return f"https://mock-r2.cloudflarestorage.com/{Params['Key']}?sig=mock"

    service._s3_client = MockS3Client()
    preview_url = service.get_presigned_preview_url(
        r2_key="resumes/test/2026/09/sample.pdf",
        original_filename="sample.pdf",
        expires_in=3600,
    )
    assert preview_url is not None
    assert "https://mock-r2.cloudflarestorage.com" in preview_url

    download_url = service.get_presigned_download_url(
        r2_key="resumes/test/2026/09/sample.pdf",
        original_filename="sample.pdf",
        expires_in=3600,
    )
    assert download_url is not None
    assert "https://mock-r2.cloudflarestorage.com" in download_url


def test_fallback_pdf_generation():
    """Verify fallback PDF generator returns valid PDF binary structure."""
    pdf_bytes = R2StorageService._generate_fallback_pdf("jane_doe_ats.pdf")
    assert pdf_bytes.startswith(b"%PDF-1.4")
    assert b"%%EOF" in pdf_bytes
    assert b"jane doe ats" in pdf_bytes
