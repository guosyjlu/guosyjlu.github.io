import argparse
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlencode
from urllib.error import URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
PROFILE_ID = "JE1Yco4AAAAJ"
OUTPUT = ROOT / "assets" / "scholar-stats.json"
SOURCE = "https://scholar.google.com/citations?" + urlencode({"user": PROFILE_ID, "hl": "en"})
FALLBACK = "https://cse.bth.se/~fer/googlescholar-api/googlescholar.php?" + urlencode({"user": PROFILE_ID})


class ScholarUnavailable(RuntimeError):
    pass


class ScholarStats(HTMLParser):
    def __init__(self):
        super().__init__()
        self.cells = []
        self.current = None
        self.name = []
        self.in_name = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "td" and "gsc_rsb_std" in attrs.get("class", "").split():
            self.current = []
        if attrs.get("id") == "gsc_prf_in":
            self.in_name = True

    def handle_endtag(self, tag):
        if tag == "td" and self.current is not None:
            self.cells.append("".join(self.current))
            self.current = None
        if tag == "div" and self.in_name:
            self.in_name = False

    def handle_data(self, value):
        if self.current is not None:
            self.current.append(value)
        if self.in_name:
            self.name.append(value)


def parse_stats(html):
    parser = ScholarStats()
    parser.feed(html)
    name = "".join(parser.name).strip()
    if name.casefold() != "siyuan guo":
        raise ValueError("Expected Siyuan Guo's public Scholar profile")
    if not parser.cells:
        raise ValueError("Scholar citation table was missing; existing data was preserved")
    digits = re.sub(r"[,\s\u00a0\u202f]", "", parser.cells[0])
    if not re.fullmatch(r"[0-9]+", digits):
        raise ValueError("Scholar citation count was not numeric")
    return int(digits)


def fetch_text(url):
    request = Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept-Language": "en"})
    with urlopen(request, timeout=20) as response:
        return response.read().decode(response.headers.get_content_charset() or "utf-8", errors="replace")


def parse_fallback(text):
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("Fallback response was not an object")
    count = data.get("total_citations")
    if type(count) is not int or count < 0:
        raise ValueError("Fallback citation count was not a nonnegative integer")

    papers = data.get("publications", [])
    if not isinstance(papers, list):
        raise ValueError("Fallback publication list was missing")
    if not any(
        isinstance(paper, dict)
        and isinstance(paper.get("title"), str)
        and isinstance(paper.get("authors"), str)
        and paper.get("title", "").startswith("DS-Agent: Automated Data Science")
        and paper.get("authors", "").startswith("S Guo,")
        for paper in papers
    ):
        raise ValueError("Fallback did not contain the expected Siyuan Guo publication")
    return count


def retrieve_stats():
    for attempt in range(1, 4):
        errors = []
        for label, url, parse in (
            ("Google Scholar", SOURCE, parse_stats),
            ("BTH fallback", FALLBACK, parse_fallback),
        ):
            try:
                return parse(fetch_text(url)), url
            except (URLError, TimeoutError, OSError, ValueError) as error:
                message = f"{label}: {error}"
                errors.append(message)
                print(f"Attempt {attempt}/3 unavailable ({message})", file=sys.stderr)
        if attempt < 3:
            time.sleep(2 ** attempt)
    raise ScholarUnavailable("; ".join(errors))


def read_cached_stats(output):
    try:
        old = json.loads(output.read_text())
    except (OSError, ValueError):
        return None
    if not isinstance(old, dict) or old.get("profileId") != PROFILE_ID:
        return None
    count = old.get("citations")
    return old if type(count) is int and count >= 0 else None


def update_stats(output=OUTPUT, html=None):
    count, retrieval = (parse_stats(html), SOURCE) if html is not None else retrieve_stats()
    old = read_cached_stats(output) or {}

    if old.get("profileId") == PROFILE_ID and old.get("citations") == count:
        return old, False
    stats = {
        "profileId": PROFILE_ID,
        "profileName": "Siyuan Guo",
        "citations": count,
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "sourceUrl": SOURCE,
        "retrievalUrl": retrieval,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp")
    temporary.write_text(json.dumps(stats, indent=2) + "\n")
    temporary.replace(output)
    return stats, True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--html", type=Path, help="Parse saved HTML for offline verification")
    parser.add_argument("--allow-stale", action="store_true", help="Keep a validated cached count when all remote sources are unavailable")
    args = parser.parse_args()
    html = args.html.read_text(errors="replace") if args.html else None
    try:
        stats, changed = update_stats(args.output, html)
    except ScholarUnavailable as error:
        stats = read_cached_stats(args.output) if args.allow_stale else None
        if stats is None:
            print(f"Scholar update failed: {error}", file=sys.stderr)
            return 1
        message = f"Both citation sources are unavailable after 3 attempts. Retained {stats['citations']} citations; no fresh data was retrieved."
        if os.environ.get("GITHUB_ACTIONS") == "true":
            print(f"::warning title=Google Scholar refresh deferred::{message}")
        else:
            print(f"Warning: {message}", file=sys.stderr)
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary:
            with open(summary, "a") as stream:
                stream.write(f"### Citation refresh deferred\n\n{message}\n\nThe next scheduled run will retry automatically.\n")
        print(json.dumps({"citations": stats["citations"], "changed": False, "status": "stale"}))
        return 0
    except Exception as error:
        print(f"Scholar update failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps({"citations": stats["citations"], "changed": changed, "status": "fresh"}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
