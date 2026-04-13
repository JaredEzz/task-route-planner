#!/usr/bin/env python3
"""
Pull OSRS Demonic Pacts League tasks from the wiki.
Run this script anytime new tasks are added to update tasks.json.

Usage:
  python3 scripts/pull-tasks.py
"""
import json
import re
import urllib.request

WIKI_API = "https://oldschool.runescape.wiki/api.php"
PAGE = "Demonic_Pacts_League/Tasks"
OUTPUT = "src/tasks.json"

POINTS_MAP = {"easy": 10, "medium": 30, "hard": 80, "elite": 200, "master": 500}


def clean_wiki(text: str) -> str:
    """Remove wiki markup from text."""
    # [[Page|Display]] -> Display
    text = re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", r"\2", text)
    # [[Page]] -> Page
    text = re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)
    # {{SCP|Skill|Level|...}} -> Skill Level
    text = re.sub(r"\{\{SCP\|([^|]+)\|([^|]+)(?:\|[^}]*)?\}\}", r"\1 \2", text)
    # {{Coins|N}} -> N coins
    text = re.sub(r"\{\{Coins\|([^}]+)\}\}", r"\1 coins", text)
    # {{CombatLevel|N}} -> Combat N
    text = re.sub(r"\{\{CombatLevel\|([^}]+)\}\}", r"Combat \1", text)
    # Remaining templates
    text = re.sub(r"\{\{[^}]*\}\}", "", text)
    # Leftover brackets
    text = text.replace("[[", "").replace("]]", "")
    return text.strip()


def fetch_wikitext() -> str:
    """Fetch raw wikitext from the OSRS wiki."""
    url = f"{WIKI_API}?action=parse&page={PAGE}&prop=wikitext&format=json"
    req = urllib.request.Request(url, headers={"User-Agent": "TaskRoutePlanner/1.0"})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["parse"]["wikitext"]["*"]


def parse_tasks(wikitext: str) -> list[dict]:
    """Parse DPLTaskRow templates from wikitext."""
    tasks = []
    pos = 0

    while True:
        start = wikitext.find("{{DPLTaskRow|", pos)
        if start == -1:
            break

        # Find matching closing }} using brace depth
        depth = 0
        end = start
        while end < len(wikitext):
            if wikitext[end : end + 2] == "{{":
                depth += 1
                end += 2
            elif wikitext[end : end + 2] == "}}":
                depth -= 1
                if depth == 0:
                    end += 2
                    break
                end += 2
            else:
                end += 1

        template = wikitext[start:end]
        pos = end

        # Strip outer template markers
        inner = template[len("{{DPLTaskRow|") : -2]

        # Split on top-level pipes (not inside nested {{}})
        fields = []
        current = ""
        depth = 0
        for ch in inner:
            if ch == "{":
                depth += 1
                current += ch
            elif ch == "}":
                depth -= 1
                current += ch
            elif ch == "|" and depth == 0:
                fields.append(current)
                current = ""
            else:
                current += ch
        fields.append(current)

        if len(fields) < 3:
            continue

        name = fields[0].strip()
        desc = fields[1].strip()

        # Parse key=value pairs
        kv = {}
        for f in fields[2:]:
            if "=" in f:
                k, v = f.split("=", 1)
                kv[k.strip()] = v.strip()

        region = kv.get("region", "").strip()
        tier = kv.get("tier", "").strip().lower()
        task_id = kv.get("id", "0")
        is_pact_task = kv.get("pactTask", "").lower() == "yes"

        desc = clean_wiki(desc).replace("\n", " ")
        skills = clean_wiki(kv.get("s", ""))
        other = clean_wiki(kv.get("other", ""))

        task: dict = {
            "id": int(task_id),
            "name": name,
            "description": desc,
            "tier": tier.capitalize(),
            "region": region,
            "points": POINTS_MAP.get(tier, 0),
        }
        if skills:
            task["requirements"] = skills
        if other:
            task["other"] = other
        if is_pact_task:
            task["pactTask"] = True

        tasks.append(task)

    return tasks


def main():
    print(f"Fetching tasks from {PAGE}...")
    wikitext = fetch_wikitext()
    print(f"  Wikitext: {len(wikitext)} chars")

    tasks = parse_tasks(wikitext)

    # Stats
    by_region: dict[str, int] = {}
    by_tier: dict[str, int] = {}
    for t in tasks:
        by_region[t["region"]] = by_region.get(t["region"], 0) + 1
        by_tier[t["tier"]] = by_tier.get(t["tier"], 0) + 1

    print(f"  Total tasks: {len(tasks)}")
    print(f"  By region: {dict(sorted(by_region.items(), key=lambda x: -x[1]))}")
    print(f"  By tier: {by_tier}")
    print(f"  With requirements: {len([t for t in tasks if 'requirements' in t or 'other' in t])}")

    # Verify no leftover markup
    bad = [t for t in tasks if "[[" in t["description"] or "]]" in t["description"]]
    if bad:
        print(f"  WARNING: {len(bad)} tasks still have wiki markup!")

    with open(OUTPUT, "w") as f:
        json.dump(tasks, f, indent=2)
    print(f"  Saved to {OUTPUT}")


if __name__ == "__main__":
    main()
