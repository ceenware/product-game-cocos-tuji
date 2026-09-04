#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

from vivo_verify import VerificationError, verify_startup_entry, write_reports


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("rpk", type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--version-file", required=True, type=Path)
    parser.add_argument("--report-json", type=Path)
    parser.add_argument("--report-text", type=Path)
    args = parser.parse_args()
    try:
        config = json.loads(args.config.read_text(encoding="utf-8"))
        version = json.loads(args.version_file.read_text(encoding="utf-8"))
        checks = verify_startup_entry(args.rpk, config, version)
    except VerificationError as exc:
        if args.report_json and args.report_text:
            write_reports(exc.checks, args.report_json, args.report_text)
        print(f"[vivo] startup verification failed: {exc}", file=sys.stderr)
        return 1
    except (OSError, json.JSONDecodeError) as exc:
        print(f"[vivo] startup verification failed: {exc}", file=sys.stderr)
        return 1
    if args.report_json and args.report_text:
        write_reports(checks, args.report_json, args.report_text)
    print(f"[vivo] startup verification passed: {args.rpk}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
