"""Rewrite actor state JSON files from escaped Unicode to readable UTF-8.

Usage:
    python scripts/rescue_unicode.py                    # dry-run (show what would change)
    python scripts/rescue_unicode.py --apply            # actually rewrite files
    python scripts/rescue_unicode.py --apply --verbose  # show each file processed

Targets: state_archive/**/agents/*.json
Idempotent: files already in readable UTF-8 are skipped (output equals input).
"""

import argparse
import json
from pathlib import Path


def _rewrite(path: Path, apply: bool, verbose: bool) -> bool:
    """Return True if the file would be (or was) changed."""
    original = path.read_text(encoding="utf-8")
    data = json.loads(original)
    rewritten = json.dumps(data, indent=2, ensure_ascii=False) + "\n"

    if rewritten == original:
        if verbose:
            print(f"  skip (already readable): {path}")
        return False

    if apply:
        path.write_text(rewritten, encoding="utf-8")
        print(f"  fixed: {path}")
    else:
        print(f"  would fix: {path}")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Actually rewrite files (default: dry-run)")
    parser.add_argument("--verbose", action="store_true", help="Also report already-readable files")
    args = parser.parse_args()

    root = Path(__file__).parent.parent
    targets = sorted(root.glob("state_archive/**/agents/*.json"))

    if not targets:
        print("No files found under state_archive/**/agents/")
        return

    changed = 0
    for path in targets:
        if _rewrite(path, apply=args.apply, verbose=args.verbose):
            changed += 1

    mode = "fixed" if args.apply else "would fix"
    print(f"\n{mode}: {changed} / {len(targets)} files")
    if not args.apply and changed:
        print("Re-run with --apply to actually rewrite.")


if __name__ == "__main__":
    main()
