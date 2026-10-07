"""Unit tests for cloud model catalog helpers."""

import pytest

from app.services.cloud_model_catalog import (
    VISIBLE_MODEL_THRESHOLD,
    _parse_google,
    _parse_openai_compatible,
    _seed_visible_after_refresh,
    resolve_picker_models,
    selection_required,
)
from app.utils.llm_providers import DEFAULT_LLM_MODELS, PROVIDER_MODEL_CATALOG


@pytest.mark.unit
def test_selection_required_threshold():
    assert not selection_required(["a"] * VISIBLE_MODEL_THRESHOLD)
    assert selection_required(["a"] * (VISIBLE_MODEL_THRESHOLD + 1))


@pytest.mark.unit
def test_parse_openai_compatible_dedupes_and_sorts():
    payload = {"data": [{"id": "z-model"}, {"id": "a-model"}, {"id": "z-model"}, {"foo": 1}]}
    assert _parse_openai_compatible(payload) == ["a-model", "z-model"]


@pytest.mark.unit
def test_parse_google_strips_prefix_and_filters():
    payload = {
        "models": [
            {"name": "models/gemini-2.5-flash", "supportedGenerationMethods": ["generateContent"]},
            {"name": "models/embedding-001", "supportedGenerationMethods": ["embedContent"]},
            {"name": "models/gemini-2.0-flash", "supportedGenerationMethods": ["generateContent"]},
        ]
    }
    assert _parse_google(payload) == ["gemini-2.0-flash", "gemini-2.5-flash"]


@pytest.mark.unit
def test_seed_visible_keeps_previous_intersection():
    catalog = [f"m{i}" for i in range(VISIBLE_MODEL_THRESHOLD + 5)]
    previous = ["m1", "m2", "gone"]
    visible = _seed_visible_after_refresh("openai", catalog, previous)
    assert visible is not None
    assert "m1" in visible and "m2" in visible
    assert "gone" not in visible


@pytest.mark.unit
def test_seed_visible_none_when_small():
    catalog = ["a", "b", "c"]
    assert _seed_visible_after_refresh("openai", catalog, None) is None


@pytest.mark.unit
def test_resolve_picker_models_falls_back_to_seed():
    assert resolve_picker_models(None, "ionos") == PROVIDER_MODEL_CATALOG["ionos"]
    assert resolve_picker_models(None, "ionos")[0] == DEFAULT_LLM_MODELS["ionos"]
