import argparse
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlencode
from urllib.error import URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
PROFILE_ID = "JE1Yco4AAAAJ"
OUTPUT = ROOT / "assets" / "scholar-stats.json"
SOURCE = "https://scholar.google.com/citations?" + urlencode({"user": PROFILE_ID, "hl": "en"})
FALLBACK = "https://cse.bth.se/~fer/googlescholar-api/googlescholar.php?" + urlencode({"user": PROFILE_ID})


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
    with urlopen(request, timeout=25) as response:
        return response.read().decode(response.headers.get_content_charset() or "utf-8", errors="replace")


def parse_fallback(text):
    data = json.loads(text)
    count = data.get("total_citations")
    if type(count) is not int or count < 0:
        raise ValueError("Fallback citation count was not a nonnegative integer")

    papers = data.get("publications", [])
    if not any(
        isinstance(paper, dict)
        and paper.get("title", "").startswith("DS-Agent: Automated Data Science")
        and paper.get("authors", "").startswith("S Guo,")
        for paper in papers
    ):
        raise ValueError("Fallback did not contain the expected Siyuan Guo publication")
    return count


def update_stats(output=OUTPUT, html=None):
    retrieval = SOURCE
    if html is not None:
        count = parse_stats(html)
    else:
        try:
            count = parse_stats(fetch_text(SOURCE))
        except (URLError, TimeoutError, OSError, ValueError) as error:
            print(f"Direct Scholar fetch unavailable ({error}); trying BTH fallback", file=sys.stderr)
            count = parse_fallback(fetch_text(FALLBACK))
            retrieval = FALLBACK
    try:
        old = json.loads(output.read_text())
    except (OSError, ValueError):
        old = {}

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
    args = parser.parse_args()
    html = args.html.read_text(errors="replace") if args.html else None
    try:
        stats, changed = update_stats(args.output, html)
    except Exception as error:
        print(f"Scholar update failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps({"citations": stats["citations"], "changed": changed}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
