from src.config import AGENT_CONFIG_PATH, PROJECT_ROOT, PUBLIC_CONFIG_DIR, ROLE_CONFIG_PATH, TOKEN_CONFIG_PATH


def test_public_config_paths_point_to_existing_json_files():
    """
    SUT: src.config public config path constants
    Mock: なし
    Level: unit
    Objective: Python が読む静的 config の SSOT が frontend/public/config 配下の実 JSON を指すこと。
    """
    expected_dir = PROJECT_ROOT / "frontend" / "public" / "config"

    assert PUBLIC_CONFIG_DIR == expected_dir
    assert AGENT_CONFIG_PATH == expected_dir / "agents.json"
    assert ROLE_CONFIG_PATH == expected_dir / "roles.json"
    assert TOKEN_CONFIG_PATH == expected_dir / "tokens.json"
    assert AGENT_CONFIG_PATH.is_file()
    assert ROLE_CONFIG_PATH.is_file()
    assert TOKEN_CONFIG_PATH.is_file()


def test_legacy_config_directory_contains_moved_notice_only():
    """
    SUT: legacy config directory
    Mock: なし
    Level: unit
    Objective: 旧 config/ が JSON を持たず、移動先を案内する Markdown だけを残すこと。
    """
    legacy_dir = PROJECT_ROOT / "config"

    assert legacy_dir.is_dir()
    assert (legacy_dir / "MOVED.md").is_file()
    assert not list(legacy_dir.glob("*.json"))
    assert "frontend/public/config/" in (legacy_dir / "MOVED.md").read_text(encoding="utf-8")
