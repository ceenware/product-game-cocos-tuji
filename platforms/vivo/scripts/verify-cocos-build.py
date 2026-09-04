#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

from vivo_verify import VerificationError, verify_cocos_build, write_reports


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--version-file", required=True, type=Path)
    parser.add_argument("--report-json", type=Path)
    parser.add_argument("--report-text", type=Path)
    args = parser.parse_args()
    checks = []
    try:
        config = json.loads(args.config.read_text(encoding="utf-8"))
        version = json.loads(args.version_file.read_text(encoding="utf-8"))
        checks = verify_cocos_build(args.root, config, version)
    except VerificationError as exc:
        checks = exc.checks
        print(f"[vivo] Cocos verification failed: {exc}", file=sys.stderr)
        if args.report_json and args.report_text:
            write_reports(checks, args.report_json, args.report_text)
        return 1
    except (OSError, json.JSONDecodeError) as exc:
        print(f"[vivo] Cocos verification failed: {exc}", file=sys.stderr)
        return 1
    if args.report_json and args.report_text:
        write_reports(checks, args.report_json, args.report_text)
    print(f"[vivo] Cocos build verification passed: {args.root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
