import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
import shutil
from pathlib import Path
from typing import Dict, Optional, Sequence, Set, Union

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import vivo_verify

PACKAGE = "com.yongzhe.huoxiantuwei.vivominigame"
VERSION = {
    "versionName": "1.0.11",
    "versionCode": 12,
    "tag": "vivo-v1.0.11",
    "reused": False,
}
CONFIG = {
    "platform": "vivo",
    "branch": "vivo",
    "tagPrefix": "vivo-v",
    "packageName": PACKAGE,
    "displayName": "勇者火线突围",
    "versionBaseline": {"name": "1.0.10", "code": 11},
    "minPlatformVersion": 1206,
    "subpackages": ["AudioAssets", "Effect", "Game", "LevelData", "Roles", "UI"],
    "limits": {"mainBytes": 4 * 1024 * 1024, "totalBytes": 20 * 1024 * 1024},
}
ENGINE_NAME = "cc.8e5b4.js"
SYSTEM_NAME = "system.bundle.8e5b4.js"


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def valid_manifest() -> dict:
    return {
        "package": PACKAGE,
        "versionName": VERSION["versionName"],
        "versionCode": VERSION["versionCode"],
        "minPlatformVersion": CONFIG["minPlatformVersion"],
        "buildType": "release",
        "subpackages": [
            {"name": f"usr_{name}", "root": f"usr_{name}/"}
            for name in CONFIG["subpackages"]
        ],
    }


def valid_compile_config() -> dict:
    return {
        "platform": "vivo-mini-game",
        "buildEngineParam": {"platform": "VIVO"},
        "packages": {
            "vivo-mini-game": {
                "package": PACKAGE,
                "versionName": VERSION["versionName"],
                "versionCode": VERSION["versionCode"],
                "minPlatformVersion": CONFIG["minPlatformVersion"],
            }
        },
    }


def valid_cocos_source(engine_name: str = ENGINE_NAME, system_name: str = SYSTEM_NAME) -> str:
    return (
        'const t="x";\n'
        'require("src/"+t);\n'
        f'if ("{engine_name}" && "{system_name}") {{ cc.assetManager.fsUtils = ral.fsUtils; }}\n'
    )


def modern_cocos_source() -> str:
    return "\n".join(
        [
            "tryDefineGlobal('CC_XIAOMI', false);",
            "tryDefineGlobal('CC_VIVO', true);",
            "currentPlatform = Platform.VIVO_MINI_GAME;",
            'function loadJsFile(path) { return require("" + path); }',
        ]
    )


def valid_startup_source(system_name: str = SYSTEM_NAME) -> str:
    return "\n".join(
        [
            "require('runtime-adapter/ral.js');",
            "require('runtime-adapter/web-adapter.js');",
            "require('runtime-adapter/engine-adapter.js');",
            f'require("src/{system_name}");',
            "window.self = window;",
            "System.warmup();",
            "System.import('./application.8e5b4.js');",
        ]
    )


def valid_minigame_config(system_name: str = SYSTEM_NAME) -> str:
    return json.dumps(
        {
            "external": [
                "runtime-adapter/ral.js",
                "runtime-adapter/web-adapter.js",
                "runtime-adapter/engine-adapter.js",
                f"src/{system_name}",
            ]
        },
        ensure_ascii=False,
    )


def zip_bytes(entries: Dict[str, Union[str, bytes]]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, data in entries.items():
            archive.writestr(name, data)
    return buffer.getvalue()


def make_cocos_fixture(
    *,
    engine_name: str = ENGINE_NAME,
    system_name: str = SYSTEM_NAME,
    manifest: Optional[dict] = None,
    compile_config: Optional[dict] = None,
    minigame_config: Optional[str] = None,
    cocos_source: Optional[str] = None,
) -> Path:
    root = Path(tempfile.mkdtemp(prefix="vivo-cocos-verify-"))
    (root / "src" / "cocos-js").mkdir(parents=True)
    (root / "src" / "runtime-adapter").mkdir(parents=True)
    write_json(root / "cocos.compile.config.json", compile_config or valid_compile_config())
    write_json(root / "src" / "manifest.json", manifest or valid_manifest())
    write_json(root / "src" / "settings.json", {"assets": {"subpackages": CONFIG["subpackages"]}})
    (root / "src" / "cocos-js" / engine_name).write_text(
        cocos_source or valid_cocos_source(engine_name, system_name),
        encoding="utf-8",
    )
    (root / "src" / system_name).write_text("System.register([], function () {});", encoding="utf-8")
    (root / "src" / "game.js").write_text("require('externs-game.js')", encoding="utf-8")
    (root / "src" / "runtime-adapter" / "ral.js").write_text("ral", encoding="utf-8")
    (root / "src" / "runtime-adapter" / "web-adapter.js").write_text("web", encoding="utf-8")
    (root / "src" / "runtime-adapter" / "engine-adapter.js").write_text(
        "cc.assetManager.fsUtils = ral.fsUtils",
        encoding="utf-8",
    )
    (root / "minigame.config.js").write_text(
        minigame_config or valid_minigame_config(system_name),
        encoding="utf-8",
    )
    return root


def make_normalized_cocos_fixture() -> Path:
    root = make_cocos_fixture()
    (root / "manifest.json").write_bytes((root / "src" / "manifest.json").read_bytes())
    (root / "src" / "manifest.json").unlink()
    (root / "game.js").write_bytes((root / "src" / "game.js").read_bytes())
    (root / "src" / "game.js").unlink()
    (root / "externs-game.js").write_text(valid_startup_source(), encoding="utf-8")
    (root / "main.js").write_text("require('game.js')", encoding="utf-8")
    (root / "runtime-adapter").mkdir()
    for name in ("ral.js", "web-adapter.js", "engine-adapter.js"):
        (root / "runtime-adapter" / name).write_bytes((root / "src" / "runtime-adapter" / name).read_bytes())
    shutil.rmtree(root / "src" / "runtime-adapter")
    return root


def make_outer_rpk(
    *,
    omit: Optional[Set[str]] = None,
    extra_archives: Optional[Sequence[str]] = None,
    cocos_source: Optional[str] = None,
    startup_source: Optional[str] = None,
    main_padding: int = 0,
    system_name: str = SYSTEM_NAME,
    engine_name: str = ENGINE_NAME,
) -> Path:
    omit = omit or set()
    outer_entries = {
        "main.rpk": zip_bytes(
            {
                "main.js": "require('game.js')",
                "game.js": "require('externs-game.js')",
                "externs-game.js": startup_source or valid_startup_source(system_name),
                "manifest.json": json.dumps(valid_manifest(), ensure_ascii=False),
                "src/settings.json": json.dumps({"assets": {"subpackages": CONFIG["subpackages"]}}, ensure_ascii=False),
                f"src/cocos-js/{engine_name}": cocos_source or valid_cocos_source(engine_name, system_name),
                f"src/{system_name}": "System.register([], function () {});",
            }
        )
    }
    if main_padding:
        main_entries = {
            "main.js": "require('game.js')",
            "game.js": "require('externs-game.js')",
            "externs-game.js": startup_source or valid_startup_source(system_name),
            "manifest.json": json.dumps(valid_manifest(), ensure_ascii=False),
            "src/settings.json": json.dumps({"assets": {"subpackages": CONFIG["subpackages"]}}, ensure_ascii=False),
            f"src/cocos-js/{engine_name}": cocos_source or valid_cocos_source(engine_name, system_name),
            f"src/{system_name}": "System.register([], function () {});",
            "padding.bin": os.urandom(main_padding),
        }
        outer_entries["main.rpk"] = zip_bytes(main_entries)
    for name in CONFIG["subpackages"]:
        archive_name = f"usr_{name}.rpk"
        if archive_name not in omit:
            outer_entries[archive_name] = zip_bytes(
                {
                    f"usr_{name}/main.js": "import './index.js';",
                    f"usr_{name}/index.js": "export default {};",
                    f"usr_{name}/config.json": "{}",
                }
            )
    for archive_name in extra_archives or ():
        outer_entries[archive_name] = zip_bytes({"unexpected.txt": "x"})
    descriptor, filename = tempfile.mkstemp(prefix="vivo-release-", suffix=".rpk")
    os.close(descriptor)
    output = Path(filename)
    output.write_bytes(zip_bytes(outer_entries))
    return output


class VivoVerifyTests(unittest.TestCase):
    def test_verify_cocos_build_accepts_dynamic_hash_names(self):
        root = make_cocos_fixture(engine_name="cc.deadbeef.js", system_name="system.bundle.deadbeef.js")
        checks = vivo_verify.verify_cocos_build(root, CONFIG, VERSION)
        self.assertTrue(all(item["ok"] for item in checks))

    def test_verify_cocos_build_accepts_normalized_quickgame_layout(self):
        root = make_normalized_cocos_fixture()
        checks = vivo_verify.verify_cocos_build(root, CONFIG, VERSION)
        self.assertTrue(all(item["ok"] for item in checks))

    def test_verify_cocos_build_accepts_modern_engine_and_minified_adapter(self):
        root = make_cocos_fixture(cocos_source=modern_cocos_source())
        (root / "src" / "runtime-adapter" / "engine-adapter.js").write_text(
            "cc.assetManager.fsUtils=ral.fsUtils;",
            encoding="utf-8",
        )
        checks = vivo_verify.verify_cocos_build(root, CONFIG, VERSION)
        self.assertTrue(all(item["ok"] for item in checks))

    def test_verify_release_rpk_accepts_valid_package_and_records_sha256(self):
        rpk = make_outer_rpk()
        checks = vivo_verify.verify_release_rpk(rpk, CONFIG, VERSION)
        self.assertTrue(all(item["ok"] for item in checks))
        self.assertTrue(any(item["check"] == "sha256" and item["message"].startswith("sha256=") for item in checks))

    def test_verify_release_rpk_accepts_quickgame_full_package_entry(self):
        rpk = make_outer_rpk(extra_archives=[f"{PACKAGE}.rpk"])
        checks = vivo_verify.verify_release_rpk(rpk, CONFIG, VERSION)
        self.assertTrue(all(item["ok"] for item in checks))

    def test_verify_cocos_build_rejects_manifest_version_mismatch(self):
        root = make_cocos_fixture(manifest={**valid_manifest(), "versionCode": 99})
        with self.assertRaisesRegex(vivo_verify.VerificationError, "versionCode"):
            vivo_verify.verify_cocos_build(root, CONFIG, VERSION)

    def test_verify_startup_entry_accepts_nested_zip_with_discovered_system_bundle(self):
        rpk = make_outer_rpk(system_name="system.bundle.abcdef.js", engine_name="cc.abcdef.js")
        checks = vivo_verify.verify_startup_entry(rpk, CONFIG, VERSION)
        self.assertTrue(all(item["ok"] for item in checks))

    def test_verify_release_rpk_accepts_unhashed_cocos_36_startup(self):
        startup = "\n".join(
            [
                "require('runtime-adapter/ral.js');",
                "require('runtime-adapter/web-adapter.js');",
                "window.self=window;",
                "require('src/system.bundle.js');",
                "require('runtime-adapter/engine-adapter.js');",
                "System.warmup();",
                "System.import('./src/application.js');",
            ]
        )
        rpk = make_outer_rpk(startup_source=startup, system_name="system.bundle.js")
        checks = vivo_verify.verify_release_rpk(rpk, CONFIG, VERSION)
        self.assertTrue(all(item["ok"] for item in checks))

    def test_verify_release_rpk_rejects_missing_split_archive(self):
        rpk = make_outer_rpk(omit={"usr_UI.rpk"})
        with self.assertRaisesRegex(vivo_verify.VerificationError, "missing split archive.*usr_UI.rpk"):
            vivo_verify.verify_release_rpk(rpk, CONFIG, VERSION)

    def test_verify_release_rpk_rejects_unexpected_split_archive(self):
        rpk = make_outer_rpk(extra_archives=["usr_Extra.rpk"])
        with self.assertRaisesRegex(vivo_verify.VerificationError, "unexpected split archive.*usr_Extra.rpk"):
            vivo_verify.verify_release_rpk(rpk, CONFIG, VERSION)

    def test_verify_release_rpk_rejects_traversal_loader_and_oversized_main(self):
        rpk = make_outer_rpk(cocos_source='require("../../src/"+t)', main_padding=4_194_305)
        with self.assertRaises(vivo_verify.VerificationError):
            vivo_verify.verify_release_rpk(rpk, CONFIG, VERSION)

    def test_verify_release_rpk_rejects_broken_startup_chain(self):
        rpk = make_outer_rpk(startup_source="require('runtime-adapter/ral.js');")
        with self.assertRaisesRegex(vivo_verify.VerificationError, "startup.*missing"):
            vivo_verify.verify_release_rpk(rpk, CONFIG, VERSION)

    def test_verify_cocos_build_cli_succeeds(self):
        root = make_cocos_fixture()
        result = self._run_cli("verify-cocos-build.py", root)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_verify_cocos_build_cli_fails(self):
        root = make_cocos_fixture(manifest={**valid_manifest(), "versionCode": 99})
        result = self._run_cli("verify-cocos-build.py", root)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_verify_startup_entry_cli_succeeds(self):
        rpk = make_outer_rpk()
        result = self._run_cli("verify-startup-entry.py", rpk)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_verify_startup_entry_cli_fails(self):
        rpk = make_outer_rpk(startup_source="require('runtime-adapter/ral.js');")
        result = self._run_cli("verify-startup-entry.py", rpk)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_verify_release_rpk_cli_succeeds(self):
        rpk = make_outer_rpk()
        result = self._run_cli("verify-release-rpk.py", rpk)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_verify_release_rpk_writes_reports_and_cli_returns_nonzero_on_failure(self):
        rpk = make_outer_rpk(omit={"usr_Game.rpk"})
        report_json = Path(tempfile.mkdtemp(prefix="vivo-report-")) / "validation-report.json"
        report_text = report_json.with_suffix(".txt")
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPTS / "verify-release-rpk.py"),
                "--config",
                str(ROOT / "release.json"),
                "--version-file",
                str(self._write_version_file(report_json.parent)),
                str(rpk),
                "--report-json",
                str(report_json),
                "--report-text",
                str(report_text),
            ],
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue(report_json.is_file())
        self.assertTrue(report_text.is_file())
        payload = json.loads(report_json.read_text(encoding="utf-8"))
        self.assertTrue(any(item["check"] == "split-archives" for item in payload))
        self.assertIn("failed", result.stdout.lower() + result.stderr.lower())

    def test_each_cli_writes_requested_single_report(self):
        targets = (
            ("verify-cocos-build.py", make_cocos_fixture()),
            ("verify-startup-entry.py", make_outer_rpk()),
            ("verify-release-rpk.py", make_outer_rpk()),
        )
        for cli_name, target in targets:
            with self.subTest(cli=cli_name, report="json"):
                report_json = Path(tempfile.mkdtemp(prefix="vivo-single-report-json-")) / "validation-report.json"
                result = self._run_cli(cli_name, target, report_json=report_json)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertTrue(report_json.is_file())
                self.assertIsInstance(json.loads(report_json.read_text(encoding="utf-8")), list)

            with self.subTest(cli=cli_name, report="text"):
                report_text = Path(tempfile.mkdtemp(prefix="vivo-single-report-text-")) / "validation-report.txt"
                result = self._run_cli(cli_name, target, report_text=report_text)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertTrue(report_text.is_file())
                self.assertIn("PASS", report_text.read_text(encoding="utf-8"))

    def _run_cli(
        self,
        cli_name: str,
        target: Path,
        *,
        report_json: Optional[Path] = None,
        report_text: Optional[Path] = None,
    ) -> subprocess.CompletedProcess[str]:
        version_file = self._write_version_file(target.parent)
        command = [
            sys.executable,
            str(SCRIPTS / cli_name),
            "--config",
            str(ROOT / "release.json"),
            "--version-file",
            str(version_file),
        ]
        if cli_name == "verify-cocos-build.py":
            command.append(str(target))
        else:
            command.append(str(target))
        if report_json:
            command.extend(["--report-json", str(report_json)])
        if report_text:
            command.extend(["--report-text", str(report_text)])
        return subprocess.run(command, capture_output=True, text=True)

    def _write_version_file(self, directory: Path) -> Path:
        path = directory / "version.json"
        write_json(path, VERSION)
        return path


if __name__ == "__main__":
    unittest.main()
