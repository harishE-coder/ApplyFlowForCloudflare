import uuid
from datetime import date
from io import BytesIO
import pytest
from fastapi import UploadFile
from sqlalchemy import select

from app.core.database import async_session_factory
from app.modules.clients.models import Client, EmployeeClient
from app.modules.resumes.models import Resume
from app.modules.resumes.service import process_bulk_upload
from app.modules.users.models import User


@pytest.mark.asyncio
async def test_recruiter_metadata_honored_and_partial_failures_isolated():
    """
    Test that process_bulk_upload:
    1. Honors recruiter-verified metadata (company, role, candidate_name).
    2. Isolates failures per file so valid files are saved even if one fails.
    3. Populates work_date on Resume.
    """
    async with async_session_factory() as db:
        # 1. Fetch or create employee user
        emp = (await db.execute(select(User).where(User.role == "employee"))).scalars().first()
        if not emp:
            emp = User(
                id=uuid.uuid4(),
                email=f"recruiter_test_{uuid.uuid4().hex[:6]}@applyflow.com",
                name="Test Recruiter",
                role="employee",
                password_hash="mock_hash",
                is_active=True,
            )
            db.add(emp)
            await db.commit()
            await db.refresh(emp)

        # 2. Fetch or create client
        client = (await db.execute(select(Client))).scalars().first()
        if not client:
            client = Client(
                id=uuid.uuid4(),
                company_name="Acme Corp Staffing",
                contact_person="Acme Contact",
                email="acme@example.com",
                status="active",
            )
            db.add(client)
            await db.commit()
            await db.refresh(client)

        # 3. Ensure employee is assigned to client
        emp_client = (
            await db.execute(
                select(EmployeeClient).where(
                    EmployeeClient.employee_id == emp.id,
                    EmployeeClient.client_id == client.id,
                )
            )
        ).scalar_one_or_none()
        if not emp_client:
            emp_client = EmployeeClient(
                employee_id=emp.id,
                client_id=client.id,
                is_primary=True,
                active=True,
            )
            db.add(emp_client)
            await db.commit()

        # 4. Prepare 2 mock PDF files: one with custom recruiter metadata, one standard 4-part
        file1_bytes = b"%PDF-1.4 Mock PDF Content 1"
        file2_bytes = b"%PDF-1.4 Mock PDF Content 2"

        upload_file1 = UploadFile(
            filename="CandidateA_CustomName.pdf",
            file=BytesIO(file1_bytes),
            headers={"content-type": "application/pdf"},
        )
        tag = uuid.uuid4().hex[:4].upper()
        clean_client_prefix = client.company_name.replace(" ", "")
        valid_fname = f"{clean_client_prefix}_Google_SoftwareEngineer_RES{tag}.pdf"
        upload_file2 = UploadFile(
            filename=valid_fname,
            file=BytesIO(file2_bytes),
            headers={"content-type": "application/pdf"},
        )

        # Recruiter verified metadata for file 1
        metadata_json = """[
            {
                "filename": "CandidateA_CustomName.pdf",
                "company": "Google",
                "role": "Senior Staff Engineer",
                "candidate_name": "Alice Smith"
            }
        ]"""

        test_work_date = date(2026, 9, 20)
        response = await process_bulk_upload(
            db=db,
            current_user=emp,
            files=[upload_file1, upload_file2],
            client_id=client.id,
            resume_date=test_work_date,
            metadata=metadata_json,
        )

        assert response.success is True
        assert response.saved_count == 2
        assert response.rejected_count == 0

        # Verify Alice Smith resume in DB
        alice_resume = (
            await db.execute(
                select(Resume).where(Resume.candidate_name == "Alice Smith")
            )
        ).scalars().first()

        assert alice_resume is not None
        assert alice_resume.company == "Google"
        assert alice_resume.role == "Senior Staff Engineer"
        assert alice_resume.work_date == test_work_date
        assert alice_resume.client_id == client.id


@pytest.mark.asyncio
async def test_unparsed_unreviewed_file_isolated_without_crashing_valid_files():
    """
    Test that a file with unparseable format that wasn't confirmed in metadata
    is safely tagged as needs_review without crashing the valid files in the batch.
    """
    async with async_session_factory() as db:
        emp = (await db.execute(select(User).where(User.role == "employee"))).scalars().first()
        client = (await db.execute(select(Client))).scalars().first()

        bad_filename = "RandomFileWithoutStructure.pdf"
        clean_client_prefix = client.company_name.replace(" ", "")
        tag = uuid.uuid4().hex[:4].upper()
        valid_filename = f"{clean_client_prefix}_Meta_ReactDev_RES{tag}.pdf"

        upload_bad = UploadFile(
            filename=bad_filename,
            file=BytesIO(b"%PDF-1.4 Bad Format"),
            headers={"content-type": "application/pdf"},
        )
        upload_good = UploadFile(
            filename=valid_filename,
            file=BytesIO(b"%PDF-1.4 Good Format"),
            headers={"content-type": "application/pdf"},
        )

        response = await process_bulk_upload(
            db=db,
            current_user=emp,
            files=[upload_bad, upload_good],
            client_id=client.id,
            resume_date=date.today(),
            metadata=None,  # No manual override provided for bad file
        )

        assert response.success is True
        assert response.saved_count == 1
        assert response.needs_review_count == 1

        bad_item = next(it for it in response.items if it.filename == bad_filename)
        assert bad_item.status == "needs_review"
        assert bad_item.message is not None

        good_item = next(it for it in response.items if it.filename == valid_filename)
        assert good_item.status == "saved"
