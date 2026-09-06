"""
Comprehensive Test Suite for Phase 3: Groq AI Teacher & Structured Extraction
Tests:
1. Versioned prompt loading (interview_teacher_v1.md).
2. Strict GroqTeacherResult JSON schema validation.
3. API-only behavior when AI Gateway is unavailable.
"""

import json
from unittest.mock import AsyncMock, patch

import pytest
from app.core.ai_gateway import AIServiceUnavailable
from app.modules.interview_intelligence.schemas import (
    EmailCategory,
    GroqTeacherResult,
    NormalizedEmail,
)
from app.modules.interview_intelligence.teacher import GroqTeacherService


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


def test_prompt_versioning_and_payload_builder():
    teacher = GroqTeacherService(prompt_version="teacher_v1")
    prompt = teacher._get_prompt_template()
    assert "Groq AI Teacher" in prompt or "teacher_v1" in prompt or "category" in prompt

    email = NormalizedEmail(
        subject="Senior Systems Engineer Interview - Citadel",
        sender_email="recruiting@citadel.com",
        sender_domain="citadel.com",
        links=["https://citadel.zoom.us/j/12345"],
        attachment_names=["prep_guide.pdf"],
        body="We invite you to Technical Round 1 on Zoom.",
    )
    payload = teacher.build_user_payload(email)

    assert payload["subject"] == "Senior Systems Engineer Interview - Citadel"
    assert payload["sender_domain"] == "citadel.com"
    assert "local_model_prediction" not in payload


@pytest.mark.anyio
async def test_groq_teacher_structured_json_extraction():
    teacher = GroqTeacherService(prompt_version="teacher_v1")
    email = NormalizedEmail(
        subject="Invitation: Snowflake Technical Assessment on HackerRank",
        sender_email="no-reply@hackerrank.com",
        sender_domain="hackerrank.com",
        links=["https://hackerrank.com/tests/snowflake-oa-123"],
        attachment_names=[],
        body="Please complete the 90-minute online assessment within 48 hours.",
    )

    mock_payload = {
        "it_related": True,
        "category": EmailCategory.TECHNICAL_ASSESSMENT.value,
        "company": "Snowflake",
        "role": "Backend Engineer",
        "round_name": "Online Assessment",
        "round_type": "technical_assessment",
        "status": "Scheduled",
        "confidence": 99,
        "meeting_link": "https://hackerrank.com/tests/snowflake-oa-123",
        "deadline": "within 48 hours",
        "reason": "Detected HackerRank assessment instructions.",
    }

    with patch(
        "app.modules.interview_intelligence.teacher.chat_completion",
        new=AsyncMock(
            return_value={
                "choices": [{"message": {"content": json.dumps(mock_payload)}}],
                "model": "llama-3.3-70b-versatile",
            }
        ),
    ):
        result = await teacher.classify_with_teacher(email)

    assert isinstance(result, GroqTeacherResult)
    assert result.it_related is True
    assert result.category == EmailCategory.TECHNICAL_ASSESSMENT.value
    assert result.confidence >= 90
    assert result.prompt_version == "teacher_v1"
    assert "hackerrank" in (result.reason or "").lower() or "assessment" in (result.reason or "").lower()


@pytest.mark.anyio
async def test_teacher_raises_when_gateway_unavailable():
    teacher = GroqTeacherService(prompt_version="teacher_v1")
    email = NormalizedEmail(
        subject="Quick note",
        sender_email="sender@example.com",
        sender_domain="example.com",
        body="Can we talk later?",
    )

    with patch(
        "app.modules.interview_intelligence.teacher.chat_completion",
        new=AsyncMock(side_effect=AIServiceUnavailable("No AI API key configured")),
    ):
        with pytest.raises(AIServiceUnavailable):
            await teacher.classify_with_teacher(email)
