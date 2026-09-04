#!/usr/bin/env python3
"""Shared validation for vivo Cocos exports and RPK release archives."""

from __future__ import annotations

import hashlib
import json
import re
from io import BytesIO
from pathlib import Path
from typing import Any, Iterable
from zipfile import BadZipFile, ZipFile


class VerificationError(RuntimeError):
    def __init__(self, message: str, checks: list[dict[str, Any]] | None = None):
        super().__init__(message)
        self.checks = checks or []


def _record(checks: list[dict[str, Any]], name: str, ok: bool, message: str) -> None:
    checks.append({"check": name, "ok": bool(ok), "message": message})


def _finish(checks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    failures = [item["message"] for item in checks if not item["ok"]]
    if failures:
        raise VerificationError("vivo verification failed: " + "; ".join(failures), checks)
    return checks


def _read_json(path: Path, checks: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    if not path.is_file():
        _record(checks, name, False, f"missing {path}")
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        _record(checks, name, False, f"invalid JSON in {path}: {exc}")
        return None
    if not isinstance(value, dict):
        _record(checks, name, False, f"{path} must contain a JSON object")
        return None
    return value


def _expected_manifest(config: dict[str, Any], version: dict[str, Any]) -> dict[str, Any]:
    return {
        "package": config["packageName"],
        "versionName": version["versionName"],
        "versionCode": version["versionCode"],
        "minPlatformVersion": config["minPlatformVersion"],
        "buildType": "release",
    }


def _check_manifest(
    manifest: dict[str, Any], config: dict[str, Any], version: dict[str, Any], checks: list[dict[str, Any]], name: str
) -> None:
    expected = _expected_manifest(config, version)
    for key, value in expected.items():
        actual = manifest.get(key)
        _record(checks, f"{name}-{key}", actual == value, f"{name} {key} is {actual!r}, expected {value!r}")

    expected_subpackages = [
        {"name": f"usr_{bundle}", "root": f"subpackages/{bundle}/"}
        for bundle in config.get("subpackages", [])
    ]
    _record(
        checks,
        f"{name}-subpackages",
        manifest.get("subpackages") == expected_subpackages,
        f"{name} subpackages are {manifest.get('subpackages')!r}, expected {expected_subpackages!r}",
    )


def _check_settings(settings: dict[str, Any], config: dict[str, Any], checks: list[dict[str, Any]], name: str) -> None:
    actual = settings.get("assets", {}).get("subpackages") if isinstance(settings.get("assets"), dict) else None
    expected = list(config.get("subpackages", []))
    _record(checks, f"{name}-settings-subpackages", actual == expected, f"{name} assets.subpackages is {actual!r}, expected {expected!r}")


def _discover_one(directory: Path, pattern: str, checks: list[dict[str, Any]], name: str) -> Path | None:
    matches = sorted(directory.glob(pattern)) if directory.is_dir() else []
    if len(matches) != 1:
        _record(checks, name, False, f"expected exactly one {pattern} under {directory}, found {len(matches)}")
        return None
    _record(checks, name, True, f"discovered {matches[0].name}")
    return matches[0]


def _read_zip_member(archive: ZipFile, member: str, checks: list[dict[str, Any]], name: str) -> str | None:
    try:
        value = archive.read(member).decode("utf-8", errors="replace")
    except KeyError:
        _record(checks, name, False, f"missing {member}")
        return None
    _record(checks, name, True, f"read {member}")
    return value


def _check_main_sources(
    engine_source: str,
    config: dict[str, Any],
    checks: list[dict[str, Any]],
    name: str,
) -> None:
    traversal = re.search(r"require\s*\(\s*[\"'](?:\.\./)+", engine_source)
    _record(checks, f"{name}-no-traversal", traversal is None, f"{name} contains a traversal loader" if traversal else f"{name} loader has no traversal")
    safe_loader = re.search(r"require\s*\(\s*[\"']src/[\"']\s*\+", engine_source)
    _record(checks, f"{name}-root-loader", safe_loader is not None, f"{name} is missing the RPK-root plugin loader")


def verify_cocos_build(root: Path, config: dict, version: dict) -> list[dict]:
    root = Path(root)
    checks: list[dict[str, Any]] = []
    compile_config = _read_json(root / "cocos.compile.config.json", checks, "compile-config")
    manifest = _read_json(root / "src" / "manifest.json", checks, "manifest")
    settings = _read_json(root / "src" / "settings.json", checks, "settings")

    if compile_config is not None:
        _record(checks, "compile-platform", compile_config.get("platform") == "vivo-mini-game", f"compile platform is {compile_config.get('platform')!r}")
        _record(checks, "compile-engine-platform", compile_config.get("buildEngineParam", {}).get("platform") == "VIVO", "buildEngineParam.platform is not VIVO")
        options = compile_config.get("packages", {}).get("vivo-mini-game", {})
        expected = _expected_manifest(config, version)
        for key in ("package", "versionName", "versionCode", "minPlatformVersion"):
            _record(checks, f"compile-{key}", options.get(key) == expected[key], f"compile {key} is {options.get(key)!r}, expected {expected[key]!r}")

    if manifest is not None:
        _check_manifest(manifest, config, version, checks, "manifest")
    if settings is not None:
        _check_settings(settings, config, checks, "export")

    engine_path = _discover_one(root / "src" / "cocos-js", "cc*.js", checks, "cocos-engine-discovery")
    system_path = _discover_one(root / "src", "system.bundle*.js", checks, "system-bundle-discovery")
    required_files = {
        "game-entry": root / "src" / "game.js",
        "engine-adapter": root / "src" / "runtime-adapter" / "engine-adapter.js",
        "minigame-config": root / "minigame.config.js",
    }
    for name, path in required_files.items():
        _record(checks, name, path.is_file(), f"missing {path}" if not path.is_file() else f"found {path.name}")

    engine_source = engine_path.read_text(encoding="utf-8", errors="replace") if engine_path else ""
    if engine_path:
        _check_main_sources(engine_source, config, checks, "cocos-engine")
    game_source = required_files["game-entry"].read_text(encoding="utf-8", errors="replace") if required_files["game-entry"].is_file() else ""
    adapter_source = required_files["engine-adapter"].read_text(encoding="utf-8", errors="replace") if required_files["engine-adapter"].is_file() else ""
    minigame_source = required_files["minigame-config"].read_text(encoding="utf-8", errors="replace") if required_files["minigame-config"].is_file() else ""
    _record(checks, "game-externs-entry", re.search(r"require\s*\(\s*['\"]externs-game\.js['\"]\s*\)", game_source) is not None, "Cocos game entry is missing externs-game.js")
    _record(checks, "engine-filesystem-bridge", "cc.assetManager.fsUtils = ral.fsUtils" in adapter_source, "engine adapter is missing the Cocos filesystem bridge")
    for adapter in ("runtime-adapter/ral.js", "runtime-adapter/web-adapter.js", "runtime-adapter/engine-adapter.js"):
        _record(checks, f"minigame-{adapter}", adapter in minigame_source, f"minigame.config.js is missing external {adapter}")
    if system_path:
        _record(checks, "minigame-system-bundle", f"src/{system_path.name}" in minigame_source, f"minigame.config.js is missing external src/{system_path.name}")
    _finish(checks)
    return checks


def _outer_archives(rpk_path: Path, checks: list[dict[str, Any]]) -> dict[str, bytes]:
    try:
        with ZipFile(rpk_path) as outer:
            bad = outer.testzip()
            _record(checks, "outer-zip-integrity", bad is None, f"outer package integrity failed at {bad}" if bad else "outer ZIP integrity passed")
            names = [info.filename for info in outer.infolist() if not info.is_dir()]
            if "main.rpk" not in names:
                _record(checks, "outer-main-archive", False, "missing main.rpk")
                return {"main.rpk": rpk_path.read_bytes()}
            return {name: outer.read(name) for name in names if name.endswith(".rpk")}
    except (BadZipFile, OSError) as exc:
        _record(checks, "outer-zip", False, f"not a zip/RPK archive: {rpk_path}: {exc}")
        return {}


def _main_startup_checks(data: bytes, config: dict, version: dict, checks: list[dict[str, Any]], label: str) -> None:
    try:
        archive = ZipFile(BytesIO(data))
    except BadZipFile:
        _record(checks, f"{label}-zip", False, f"invalid nested RPK: {label}")
        return
    with archive:
        bad = archive.testzip()
        _record(checks, f"{label}-integrity", bad is None, f"nested archive {label} integrity failed at {bad}" if bad else f"nested archive {label} integrity passed")
        main_source = _read_zip_member(archive, "main.js", checks, f"{label}-main") or ""
        game_source = _read_zip_member(archive, "game.js", checks, f"{label}-game") or ""
        externs_source = _read_zip_member(archive, "externs-game.js", checks, f"{label}-externs") or ""
        manifest_raw = _read_zip_member(archive, "manifest.json", checks, f"{label}-manifest")
        if manifest_raw is not None:
            try:
                manifest = json.loads(manifest_raw)
                if isinstance(manifest, dict):
                    _check_manifest(manifest, config, version, checks, f"{label}-manifest")
                else:
                    _record(checks, f"{label}-manifest-json", False, f"{label} manifest.json must be an object")
            except json.JSONDecodeError as exc:
                _record(checks, f"{label}-manifest-json", False, f"{label} invalid manifest.json: {exc}")

        _record(checks, f"{label}-loads-game", re.search(r"require\s*\(\s*['\"]game\.js['\"]\s*\)", main_source) is not None, f"{label} main.js does not load game.js")
        _record(checks, f"{label}-loads-externs", re.search(r"require\s*\(\s*['\"]externs-game\.js['\"]\s*\)", game_source) is not None, f"{label} game.js does not load externs-game.js")
        required = (
            ("ral", r"require\s*\(\s*['\"]runtime-adapter/ral\.js['\"]\s*\)"),
            ("web", r"require\s*\(\s*['\"]runtime-adapter/web-adapter\.js['\"]\s*\)"),
            ("engine", r"require\s*\(\s*['\"]runtime-adapter/engine-adapter\.js['\"]\s*\)"),
            ("system", r"require\s*\(\s*['\"]src/system\.bundle[^'\"]+\.js['\"]\s*\)"),
        )
        for check_name, pattern in required:
            _record(checks, f"{label}-startup-{check_name}", re.search(pattern, externs_source) is not None, f"{label} startup is missing {check_name}")
        _record(checks, f"{label}-startup-window", "window.self = window" in externs_source, f"{label} startup is missing window.self")
        _record(checks, f"{label}-startup-warmup", "System.warmup" in externs_source, f"{label} startup is missing System.warmup")
        _record(checks, f"{label}-startup-application", re.search(r"System\.import\s*\(\s*['\"]\./application\.[^'\"]+\.js['\"]\s*\)", externs_source) is not None, f"{label} startup is missing the hashed application import")
        for adapter in ("ral", "web-adapter", "engine-adapter"):
            pattern = rf"require\s*\(\s*['\"]runtime-adapter/{adapter}['\"]\s*\)"
            _record(checks, f"{label}-no-extensionless-{adapter}", re.search(pattern, externs_source) is None, f"{label} contains an extensionless {adapter} require")
        _record(checks, f"{label}-no-import-map-require", re.search(r"require\s*\(\s*['\"]\./src/import-map\.js['\"]\s*\)", externs_source) is None, f"{label} requires import-map.js at runtime")


def verify_startup_entry(rpk_path: Path, config: dict, version: dict) -> list[dict]:
    checks: list[dict[str, Any]] = []
    path = Path(rpk_path)
    if not path.is_file():
        _record(checks, "rpk-file", False, f"missing RPK: {path}")
        return _finish(checks)
    archives = _outer_archives(path, checks)
    if "main.rpk" in archives:
        _main_startup_checks(archives["main.rpk"], config, version, checks, "main.rpk")
    else:
        _main_startup_checks(path.read_bytes(), config, version, checks, "main.rpk")
    return _finish(checks)


def _check_nested_archives(archives: dict[str, bytes], config: dict, checks: list[dict[str, Any]]) -> None:
    expected = ["main.rpk", *[f"usr_{name}.rpk" for name in config.get("subpackages", [])]]
    full_package = f"{config['packageName']}.rpk"
    actual = sorted(archives)
    missing = [name for name in expected if name not in archives]
    unexpected = [name for name in actual if name not in expected and name != full_package]
    _record(checks, "split-archives", not missing, f"missing split archive(s): {', '.join(missing)}" if missing else "all configured split archives are present")
    _record(checks, "split-archives-unexpected", not unexpected, f"unexpected split archive(s): {', '.join(unexpected)}" if unexpected else "no unexpected split archives")


def verify_release_rpk(rpk_path: Path, config: dict, version: dict) -> list[dict]:
    checks: list[dict[str, Any]] = []
    path = Path(rpk_path)
    if not path.is_file():
        _record(checks, "rpk-file", False, f"missing RPK: {path}")
        return _finish(checks)
    limits = config.get("limits", {})
    total_limit = int(limits.get("totalBytes", 20 * 1024 * 1024))
    main_limit = int(limits.get("mainBytes", 4 * 1024 * 1024))
    total_size = path.stat().st_size
    _record(checks, "total-size", total_size <= total_limit, f"outer package is {total_size} bytes, limit is {total_limit}")
    archives = _outer_archives(path, checks)
    _check_nested_archives(archives, config, checks)
    if "main.rpk" in archives:
        _main_startup_checks(archives["main.rpk"], config, version, checks, "main.rpk")
    for name, data in archives.items():
        try:
            with ZipFile(BytesIO(data)) as nested:
                bad = nested.testzip()
                _record(checks, f"nested-integrity-{name}", bad is None, f"nested archive {name} integrity failed at {bad}" if bad else f"nested archive {name} integrity passed")
                if name == "main.rpk":
                    _record(checks, "main-size", len(data) <= main_limit, f"main.rpk is {len(data)} bytes, limit is {main_limit}")
                    manifest_raw = _read_zip_member(nested, "manifest.json", checks, "release-manifest")
                    settings_raw = _read_zip_member(nested, "src/settings.json", checks, "release-settings")
                    engine_names = sorted(member for member in nested.namelist() if member.startswith("src/cocos-js/cc") and member.endswith(".js"))
                    _record(checks, "release-engine-discovery", len(engine_names) == 1, f"expected one packaged Cocos engine, found {engine_names}")
                    if engine_names:
                        _check_main_sources(nested.read(engine_names[0]).decode("utf-8", errors="replace"), config, checks, "release-cocos-engine")
                    if manifest_raw is not None:
                        try:
                            manifest = json.loads(manifest_raw)
                            if isinstance(manifest, dict):
                                _check_manifest(manifest, config, version, checks, "release-manifest")
                            else:
                                _record(checks, "release-manifest-json", False, "release manifest.json must be an object")
                        except json.JSONDecodeError as exc:
                            _record(checks, "release-manifest-json", False, f"invalid release manifest.json: {exc}")
                    if settings_raw is not None:
                        try:
                            settings = json.loads(settings_raw)
                            if isinstance(settings, dict):
                                _check_settings(settings, config, checks, "release")
                            else:
                                _record(checks, "release-settings-json", False, "release settings.json must be an object")
                        except json.JSONDecodeError as exc:
                            _record(checks, "release-settings-json", False, f"invalid release settings.json: {exc}")
                elif name != f"{config['packageName']}.rpk":
                    bundle_name = name.removeprefix("usr_").removesuffix(".rpk")
                    for required in (f"subpackages/{bundle_name}/main.js", f"subpackages/{bundle_name}/index.js", f"subpackages/{bundle_name}/config.json"):
                        _record(checks, f"{name}-{required}", required in nested.namelist(), f"{name} missing {required}" if required not in nested.namelist() else f"{name} contains {required}")
        except BadZipFile:
            _record(checks, f"nested-zip-{name}", False, f"nested archive is invalid: {name}")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    _record(checks, "sha256", True, f"sha256={digest}")
    _finish(checks)
    return checks


def write_reports(checks: list[dict], json_path: Path, text_path: Path) -> None:
    json_path = Path(json_path)
    text_path = Path(text_path)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    text_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(checks, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = [f"[{item['check']}] {'PASS' if item['ok'] else 'FAIL'}: {item['message']}" for item in checks]
    text_path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
