"""
Phase 2 tests for API-key-only Interview Intelligence.
Tests:
1. Multi-signal feature extraction remains available for search/export metadata.
2. Dataset exporter still generates seed datasets without a local classifier.
3. AI Gateway raises when no API provider is configured.
"""

from unittest.mock import patch

import pytest

from app.core.ai_gateway import AIGateway, AIServiceUnavailable
from app.modules.interview_intelligence.export_dataset import DatasetExporter
from app.modules.interview_intelligence.features import (
    build_feature_text,
    extract_domain_signals,
)
from app.modules.interview_intelligence.schemas import NormalizedEmail


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


def test_feature_builder_and_binary_signals():
    email = NormalizedEmail(
        subject="Technical Assessment Invitation - Snowflake",
        sender_email="recruiting@snowflake.com",
        sender_domain="snowflake.com",
        links=["https://hackerrank.com/test/123", "https://calendly.com/snowflake/tech"],
        attachment_names=["instructions.pdf", "invite.ics"],
        body="Please complete the HackerRank coding challenge within 48 hours.",
    )

    feature_text = build_feature_text(email)
    assert "SUBJECT: Technical Assessment Invitation - Snowflake" in feature_text
    assert "SENDER_DOMAIN: snowflake.com" in feature_text
    assert "SENDER_EMAIL: recruiting@snowflake.com" in feature_text
    assert "hackerrank.com" in feature_text
    assert "calendly.com" in feature_text
    assert "HAS_ICS=1" in feature_text
    assert "HAS_MEETING_LINK=1" in feature_text
    assert "HAS_DEADLINE=1" in feature_text
    assert "BODY: Please complete the HackerRank" in feature_text

    signals = extract_domain_signals(email.links)
    assert signals["has_assessment_platform"] is True
    assert signals["has_scheduling_platform"] is True


def test_dataset_exporter_seed_generation():
    export_res = DatasetExporter.export_seed_dataset(version="v1.0.0-test")
    assert export_res["total_samples"] >= 13
    assert export_res["train_samples"] >= 13
    assert "datasets/seed/v1.0.0-test/train.jsonl" in export_res["paths"]["train"]
    assert export_res["paths"]["golden"] == "datasets/golden/golden.jsonl"
    assert len(export_res["class_distribution"]) >= 10


@pytest.mark.asyncio
async def test_ai_gateway_requires_configured_api_key():
    gateway = AIGateway()

    # Simulate an environment with no AI API keys configured. The gateway must
    # surface a clear configuration error rather than attempting a local guess.
    with patch.object(gateway, "get_available_providers", return_value=[]):
        with pytest.raises(AIServiceUnavailable) as exc_info:
            await gateway.chat_completion(messages=[{"role": "user", "content": "classify this"}])

    assert "No AI API key configured" in str(exc_info.value)
