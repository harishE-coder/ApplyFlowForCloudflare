import asyncio
import uuid
from app.core.database import async_session_factory
from app.modules.applications.service import analyze_recruiter_email, confirm_and_save_email
from app.modules.applications.schemas import ConfirmSaveRequest
from app.modules.users.models import User
from sqlalchemy import select

async def run_meeting_link_intake_test():
    print("Testing meeting link, interview time, and logistics extraction...")
    async with async_session_factory() as db:
        admin = (await db.execute(select(User).where(User.role == "admin"))).scalars().first()
        assert admin is not None

        email_with_meet = """From: sarah.recruiter@google.com
To: hr@applyflow.com
Subject: Technical Interview Invitation - Google - Alex Chen

Hi Alex,

We would like to invite you for a 60-minute Google Technical Coding Round on 2026-09-28 at 02:30 PM EST.

Please join using Google Meet:
https://meet.google.com/xyz-qwer-tyu

Interviewer: Sarah Jenkins (sarah.recruiter@google.com)
Notes: Please have a working camera and be ready to code on Google Docs.

Best,
Sarah Jenkins
Google Recruiting"""

        res = await analyze_recruiter_email(db, admin, email_with_meet)
        print("Candidate:", res.candidate_name)
        print("Company:", res.company)
        print("Round:", res.round)
        print("Date:", res.interview_date)
        print("Time:", res.interview_time)
        print("Meeting Link:", res.meeting_link)
        print("Interviewer:", res.interviewer_name)

        assert res.is_interview_mail is True
        assert "meet.google.com" in (res.meeting_link or "")
        assert res.interview_date is not None
        
        # Confirm and save
        confirm_req = ConfirmSaveRequest(
            candidate_name=res.candidate_name or "Alex Chen",
            company=res.company or "Google",
            role=res.role or "Software Engineer",
            round=res.round or "Technical Round",
            status="Round 1",
            interview_date=res.interview_date,
            interview_time=res.interview_time,
            meeting_link=res.meeting_link,
            interviewer_name=res.interviewer_name,
            notes=res.notes,
            client_id=res.client_id,
            raw_email=email_with_meet,
            source_type="paste",
            decision=res.decision,
            matched_application_id=res.matched_application_id,
        )
        saved = await confirm_and_save_email(db, admin, confirm_req)
        await db.commit()
        print("Saved successfully! Application ID:", saved.application.id)
        print("✅ Meeting link intake test passed!")

if __name__ == "__main__":
    asyncio.run(run_meeting_link_intake_test())
