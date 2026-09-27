from pathlib import Path

from app.main import _load_demo_profile


def test_load_demo_profile_creates_aligned_history():
    profile = _load_demo_profile()
    assert profile is not None
    assert len(profile) > 1
    assert {"Time", "solar_kw", "load_kw"}.issubset(profile.columns)
    assert not profile.empty
    assert Path("backend/data/demo/solar.csv").exists()
    assert Path("backend/data/demo/load.csv").exists()
