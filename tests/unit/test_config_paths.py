from src.config import AGENT_CONFIG_PATH, PROJECT_ROOT, ROLE_CONFIG_PATH, SHARED_CONFIG_DIR, TOKEN_CONFIG_PATH


def test_shared_config_paths_point_to_existing_json_files():
    """
    SUT: src.config shared config path constants
    Mock: なし
    Level: unit
    Objective: Python が読む静的 config の SSOT が frontend/src/config 配下の実 JSON を指すこと (#628 AC-3/AC-7)。
    """
    expected_dir = PROJECT_ROOT / "frontend" / "src" / "config"

    assert SHARED_CONFIG_DIR == expected_dir
    assert AGENT_CONFIG_PATH == expected_dir / "agents.json"
    assert ROLE_CONFIG_PATH == expected_dir / "roles.json"
    assert TOKEN_CONFIG_PATH == expected_dir / "tokens.json"
    assert AGENT_CONFIG_PATH.is_file()
    assert ROLE_CONFIG_PATH.is_file()
    assert TOKEN_CONFIG_PATH.is_file()


def test_old_public_config_directory_no_longer_has_json():
    """
    SUT: legacy frontend/public/config directory
    Mock: なし
    Level: unit
    Objective: 旧 frontend/public/config/ に JSON が残っておらず、二重配布が無いこと (#628 AC-3/AC-4)。
    """
    legacy_dir = PROJECT_ROOT / "frontend" / "public" / "config"

    assert not legacy_dir.exists() or not list(legacy_dir.glob("*.json"))


def test_legacy_config_directory_contains_moved_notice_only():
    """
    SUT: legacy config directory
    Mock: なし
    Level: unit
    Objective: 旧 config/ が JSON を持たず、移動先を案内する Markdown だけを残すこと (#628 AC-12)。
    """
    legacy_dir = PROJECT_ROOT / "config"

    assert legacy_dir.is_dir()
    assert (legacy_dir / "MOVED.md").is_file()
    assert not list(legacy_dir.glob("*.json"))
    assert "frontend/src/config/" in (legacy_dir / "MOVED.md").read_text(encoding="utf-8")
