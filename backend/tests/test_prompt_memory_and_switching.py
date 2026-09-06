"""
Tests for:
1. Dynamic AI Provider switching (AI_PROVIDER=groq, openai, gemini).
2. Strict AI Gateway guarantee (no offline fallback, AIServiceUnavailable on failure).
3. Prompt memory from recruiter corrections (few-shot context injection).
4. Intake classification scenarios (interview invitation vs. marketing spam).
"""

import json
from unittest.mock import MagicMock, patch

import pytest
from app.core.ai_gateway import AIGateway, AIServiceUnavailable, Provider
from app.core.config import settings
from app.modules.interview_intelligence.schemas import EmailCategory, GroqTeacherResult, NormalizedEmail
from app.modules.interview_intelligence.teacher import groq_teacher
from app.services.groq_service import GroqService


@pytest.mark.asyncio
async def test_provider_switching_priority():
    """Verify that settings.ai_provider dynamically elevates the chosen provider."""
    gw = AIGateway()

    # Configure multiple providers in settings
    with patch.object(settings, "groq_api_key", "gsk_groq_key"), \
         patch.object(settings, "openai_api_key", "sk_openai_key"), \
         patch.object(settings, "gemini_api_key", "gemini_test_key"):

        # 1. With AI_PROVIDER=openai
        with patch.object(settings, "ai_provider", "openai"):
            providers = gw.get_available_providers()
            assert len(providers) >= 2
            assert providers[0].name == "OpenAI"
            assert providers[0].priority_rank == 1

        # 2. With AI_PROVIDER=gemini
        with patch.object(settings, "ai_provider", "gemini"):
            providers = gw.get_available_providers()
            assert providers[0].name == "Gemini"
            assert providers[0].priority_rank == 1

        # 3. With AI_PROVIDER=groq
        with patch.object(settings, "ai_provider", "groq"):
            providers = gw.get_available_providers()
            assert providers[0].name == "Groq"
            assert providers[0].priority_rank == 1


@pytest.mark.asyncio
async def test_openai_chat_completion_invocation():
    """Verify that when OpenAI is active, chat_completion calls OpenAI endpoint with its model."""
    gw = AIGateway()
    openai_provider = Provider(
        name="OpenAI",
        api_key="sk-test-openai",
        model="gpt-4o-mini",
        fallback_models=["gpt-4o-mini"],
        endpoint="https://api.openai.com/v1/chat/completions",
        key_id="OpenAI#1",
        priority_rank=1,
    )

    mock_resp = MagicMock(status_code=200)
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": "{\"category\": \"interview\"}"}}],
        "model": "gpt-4o-mini",
    }

    with patch.object(gw, "get_available_providers", return_value=[openai_provider]):
        with patch("httpx.AsyncClient.post", return_value=mock_resp) as mock_post:
            res = await gw.chat_completion(
                messages=[{"role": "user", "content": "hello"}],
            )
            assert res["_gateway"]["provider"] == "OpenAI"
            assert res["_gateway"]["model"] == "gpt-4o-mini"
            assert mock_post.call_count == 1
            call_kwargs = mock_post.call_args
            assert call_kwargs[0][0] == "https://api.openai.com/v1/chat/completions"
            assert call_kwargs[1]["headers"]["Authorization"] == "Bearer sk-test-openai"


@pytest.mark.asyncio
async def test_ai_gateway_never_falls_back_to_heuristic():
    """Verify that when no API keys are configured, AIServiceUnavailable is strictly raised."""
    gw = AIGateway()
    with patch.object(gw, "get_available_providers", return_value=[]):
        with pytest.raises(AIServiceUnavailable) as exc_info:
            await gw.chat_completion(messages=[{"role": "user", "content": "classify"}])
        assert "No AI API key configured" in str(exc_info.value)


@pytest.mark.asyncio
async def test_groq_service_strictly_raises_ai_service_unavailable():
    """Verify GroqService.extract_email_entities raises AIServiceUnavailable on failure."""
    with patch("app.services.groq_service.chat_completion", side_effect=AIServiceUnavailable("Keys exhausted")):
        with pytest.raises(AIServiceUnavailable):
            await GroqService.extract_email_entities("Subject: Interview invite")


@pytest.mark.asyncio
async def test_prompt_memory_injection_in_teacher():
    """Verify that recent recruiter corrections are injected into the teacher system prompt."""
    test_email = NormalizedEmail(
        email_hash="hash123",
        subject="Technical Discussion Scheduled",
        sender_email="recruiter@stripe.com",
        sender_domain="stripe.com",
        body="Let us discuss your technical background.",
    )

    corrections = [
        {
            "subject": "Technical Screening Scheduled",
            "company": "Stripe",
            "old_label": "other",
            "new_label": "interview",
            "notes": "Video interview with hiring manager",
        },
        {
            "subject": "Final HR Round",
            "company": "Datadog",
            "old_label": "hr_screening",
            "new_label": "interview",
            "notes": "Final executive round",
        },
    ]

    mock_chat_res = {
        "choices": [{
            "message": {
                "content": json.dumps({
                    "it_related": True,
                    "category": "interview",
                    "company": "Stripe",
                    "role": "Software Engineer",
                    "round_name": "Technical Discussion",
                    "round_type": "interview",
                    "status": "Scheduled",
                    "confidence": 98,
                    "reason": "Aligned with recruiter prompt memory correction."
                })
            }
        }]
    }

    with patch("app.modules.interview_intelligence.teacher.chat_completion", return_value=mock_chat_res) as mock_cc:
        result: GroqTeacherResult = await groq_teacher.classify_with_teacher(
            email_data=test_email,
            recent_corrections=corrections,
        )

        assert result.category == "interview"
        assert result.company == "Stripe"
        assert result.confidence == 98

        # Inspect messages passed to chat_completion
        call_args = mock_cc.call_args[1]["messages"]
        system_msg = call_args[0]["content"]

        assert "RECRUITER CORRECTIONS & PROMPT MEMORY" in system_msg
        assert "Technical Screening Scheduled" in system_msg
        assert "Final HR Round" in system_msg
        assert "Stripe" in system_msg
        assert "Datadog" in system_msg


@pytest.mark.asyncio
async def test_intake_interview_invitation_scenario():
    """Test Case 1: Interview invitation -> classified as interview."""
    test_email = NormalizedEmail(
        email_hash="inv_001",
        subject="Interview with Netflix - Senior Platform Engineer",
        sender_email="recruiter@netflix.com",
        sender_domain="netflix.com",
        body="We would like to invite you to a 45-minute technical interview via Zoom: https://zoom.us/j/123456789.",
    )

    mock_chat_res = {
        "choices": [{
            "message": {
                "content": json.dumps({
                    "it_related": True,
                    "category": "interview",
                    "company": "Netflix",
                    "role": "Senior Platform Engineer",
                    "round_name": "Technical Interview",
                    "round_type": "interview",
                    "status": "Scheduled",
                    "meeting_link": "https://zoom.us/j/123456789",
                    "confidence": 99,
                    "reason": "Recruiter invitation with meeting link."
                })
            }
        }]
    }

    with patch("app.modules.interview_intelligence.teacher.chat_completion", return_value=mock_chat_res):
        result = await groq_teacher.classify_with_teacher(test_email)
        assert result.category == EmailCategory.INTERVIEW.value
        assert result.it_related is True
        assert result.company == "Netflix"
        assert result.meeting_link == "https://zoom.us/j/123456789"


@pytest.mark.asyncio
async def test_intake_marketing_spam_scenario():
    """Test Case 2: Marketing email -> classified as non_it or other."""
    test_email = NormalizedEmail(
        email_hash="mkt_002",
        subject="Get 50% off your annual Cloud subscription today!",
        sender_email="promotions@clouddeals.net",
        sender_domain="clouddeals.net",
        body="Limited time offer! Upgrade your cloud hosting storage now and save big.",
    )

    mock_chat_res = {
        "choices": [{
            "message": {
                "content": json.dumps({
                    "it_related": False,
                    "category": "non_it",
                    "company": None,
                    "role": None,
                    "round_name": None,
                    "round_type": "other",
                    "status": "Rejected",
                    "confidence": 95,
                    "reason": "Promotional sales newsletter."
                })
            }
        }]
    }

    with patch("app.modules.interview_intelligence.teacher.chat_completion", return_value=mock_chat_res):
        result = await groq_teacher.classify_with_teacher(test_email)
        assert result.category == EmailCategory.NON_IT.value
        assert result.it_related is False
