#!/usr/bin/env python3
"""
Generate Riftbound card definitions from scraped gallery data.

Reads downloads/riftbound-cards-flat.json and generates:
- src/cards/{set}/*.ts files with typed card definitions
- src/cards/{set}/index.ts barrel exports
- src/cards/index.ts master barrel
- src/data/sets.ts set metadata
- src/data/all-cards.ts card registry
"""

import json
import os
import re
from collections import defaultdict

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
INPUT_FILE = os.path.join(REPO_ROOT, "downloads/riftbound-cards-flat.json")
CARDS_DIR = os.path.join(REPO_ROOT, "packages/riftbound-cards/src/cards")
DATA_DIR = os.path.join(REPO_ROOT, "packages/riftbound-cards/src/data")

SET_NAMES = {
    "OGN": "Origins",
    "UNL": "Unleashed",
    "SFD": "Spiritforged",
    "OGS": "Origins Showcase",
}

SET_DIR_NAMES = {
    "OGN": "ogn",
    "UNL": "unl",
    "SFD": "sfd",
    "OGS": "ogs",
}

DOMAIN_MAP = {
    "fury": "fury",
    "calm": "calm",
    "mind": "mind",
    "body": "body",
    "chaos": "chaos",
    "order": "order",
    "colorless": "colorless",
}

# Maps legend card names to the champion tag used by their champion units.
# Derived from LoL champion titles cross-referenced with champion unit tags.
LEGEND_CHAMPION_TAGS: dict[str, str] = {
    # OGN legends
    "Daughter of the Void": "Kai'Sa",
    "Relentless Storm": "Volibear",
    "Loose Cannon": "Jinx",
    "Hand of Noxus": "Darius",
    "Nine-Tailed Fox": "Ahri",
    "Blind Monk": "Lee Sin",
    "Unforgiven": "Yasuo",
    "Radiant Dawn": "Leona",
    "Swift Scout": "Teemo",
    "Herald of the Arcane": "Viktor",
    "Bounty Hunter": "Miss Fortune",
    "The Boss": "Sett",
    # SFD legends
    "Mechanized Menace": "Rumble",
    "Purifier": "Lucian",
    "Glorious Executioner": "Draven",
    "Void Burrower": "Rek'Sai",
    "Fire Below the Mountain": "Ornn",
    "Grandmaster at Arms": "Jax",
    "Blade Dancer": "Irelia",
    "Emperor of the Sands": "Azir",
    "Prodigal Explorer": "Ezreal",
    "Chem-Baroness": "Renata Glasc",
    "Battle Mistress": "Sivir",
    "Grand Duelist": "Fiora",
    # UNL legends
    "Virtuoso": "Jhin",
    "Pridestalker": "Rengar",
    "Bloodharbor Ripper": "Pyke",
    "Piltover Enforcer": "Vi",
    "Bashful Bloom": "Lillia",
    "Wuju Master": "Master Yi",
    "Gloomist": "Vex",
    "Green Father": "Ivern",
    "Scorn of the Moon": "Diana",
    "Deceiver": "LeBlanc",
    "Voidreaver": "Kha'Zix",
    "Keeper of the Hammer": "Poppy",
    # OGS starter legends (variants with " - Starter" suffix)
    "Dark Child - Starter": "Annie",
    "Wuju Bladesman - Starter": "Yi",
    "Lady of Luminosity - Starter": "Lux",
    "Might of Demacia - Starter": "Garen",
}


def to_kebab(name: str) -> str:
    """Convert card name to kebab-case filename."""
    s = name.lower()
    s = re.sub(r"[''']", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s


def to_camel(name: str) -> str:
    """Convert card name to camelCase variable name."""
    s = to_kebab(name)
    parts = s.split("-")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def escape_str(s: str) -> str:
    """Escape a string for TypeScript."""
    if s is None:
        return ""
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def detect_spell_timing(text: str) -> str:
    """Detect if a spell is Action or Reaction from its text."""
    if not text:
        return "action"
    if text.startswith("[Reaction]") or "[Reaction]" in text.split("\n")[0]:
        return "reaction"
    return "action"


def is_equipment(card: dict) -> bool:
    """Detect if a gear card is actually equipment."""
    text = card.get("text", "") or ""
    return "[Equip]" in text or card.get("mightBonus") is not None


def format_domains(domains: list) -> str:
    """Format domain array for TypeScript."""
    if not domains:
        return ""
    valid = [d for d in domains if d in DOMAIN_MAP and d != "colorless"]
    if len(valid) == 0:
        return ""
    if len(valid) == 1:
        return f'"{valid[0]}"'
    return "[" + ", ".join(f'"{d}"' for d in valid) + "]"


def format_power_cost(power: list) -> str:
    """Format power cost array."""
    if not power:
        return ""
    return "[" + ", ".join(f'"{p}"' for p in power) + "]"


def extract_champion_tag(name: str, card_type: str) -> str | None:
    """Extract champion tag from a card name.

    Unit cards with names like "Ahri, Alluring" have champion tag "Ahri"
    (the part before the comma). Units without commas are generic.
    """
    if card_type != "unit":
        return None
    if "," not in name:
        return None
    return name.split(",")[0].strip()


def build_champion_tags(cards: list[dict]) -> set[str]:
    """Build the set of all unique champion tags from unit card names."""
    tags = set()
    for card in cards:
        tag = extract_champion_tag(card["name"], card["cardType"])
        if tag:
            tags.add(tag)
    return tags


def generate_card_ts(card: dict, champion_tags: set[str] | None = None) -> tuple[str, str, str]:
    """Generate TypeScript for a single card. Returns (filename, varname, code)."""
    if champion_tags is None:
        champion_tags = set()
    card_type = card["cardType"]
    name = card["name"]
    card_id = card["id"]
    filename = to_kebab(name)
    varname = to_camel(name)

    # Handle duplicate names across sets by appending set
    collector = card.get("collectorNumber", "")
    text = card.get("text", "") or ""
    energy = card.get("energy")
    might = card.get("might")
    might_bonus = card.get("mightBonus")
    domains = card.get("domains", [])
    rarity = card.get("rarity", "common")
    power = card.get("power")
    set_id = card.get("set", "")
    tags = card.get("tags", [])

    # Extract champion tag for unit cards
    champion_tag = extract_champion_tag(name, card_type)
    is_champion = champion_tag is not None and champion_tag in champion_tags

    # Determine the interface type
    if card_type == "unit":
        ts_type = "UnitCard"
    elif card_type == "spell":
        ts_type = "SpellCard"
    elif card_type == "gear":
        if is_equipment(card):
            ts_type = "EquipmentCard"
            card_type = "equipment"
        else:
            ts_type = "GearCard"
    elif card_type == "legend":
        ts_type = "LegendCard"
    elif card_type == "battlefield":
        ts_type = "BattlefieldCard"
    elif card_type == "rune":
        ts_type = "RuneCard"
    else:
        ts_type = "BaseCard"

    # Build the import
    imports = [ts_type]
    needs_create_id = True

    lines = []
    lines.append(f'import type {{ {ts_type} }} from "@tcg/riftbound-types/cards";')
    lines.append(f'import {{ createCardId }} from "@tcg/riftbound-types/cards";')
    lines.append("")

    # Build the card object
    lines.append(f"export const {varname}: {ts_type} = {{")
    lines.append(f'  id: createCardId("{escape_str(card_id)}"),')
    lines.append(f'  name: "{escape_str(name)}",')
    lines.append(f'  cardType: "{card_type}",')

    # Set info
    if set_id:
        lines.append(f'  setId: "{set_id}",')
    if collector:
        lines.append(f"  cardNumber: {collector},")
    if rarity:
        lines.append(f'  rarity: "{rarity}",')

    # Costs
    if energy is not None:
        lines.append(f"  energyCost: {energy},")
    if power:
        power_str = format_power_cost(power)
        if power_str:
            lines.append(f"  powerCost: {power_str},")

    # Type-specific fields (including domain handling)
    if card_type == "unit":
        domain_str = format_domains(domains)
        if domain_str:
            lines.append(f"  domain: {domain_str},")
        lines.append(f"  might: {might if might is not None else 0},")
        # Build unit tags: combine existing tags with champion tag
        unit_tags = list(tags)
        if champion_tag and champion_tag not in unit_tags:
            unit_tags.insert(0, champion_tag)
        if unit_tags:
            lines.append(f"  tags: [{', '.join(f'\"' + escape_str(t) + '\"' for t in unit_tags)}],")
        if is_champion:
            lines.append("  isChampion: true,")
    elif card_type == "spell":
        domain_str = format_domains(domains)
        if domain_str:
            lines.append(f"  domain: {domain_str},")
        timing = detect_spell_timing(text)
        lines.append(f'  timing: "{timing}",')
    elif card_type == "equipment":
        domain_str = format_domains(domains)
        if domain_str:
            lines.append(f"  domain: {domain_str},")
        if might_bonus is not None:
            lines.append(f"  mightBonus: {might_bonus},")
    elif card_type == "gear":
        domain_str = format_domains(domains)
        if domain_str:
            lines.append(f"  domain: {domain_str},")
    elif card_type == "legend":
        domain_str = format_domains(domains)
        if domain_str:
            lines.append(f"  domain: {domain_str},")
        else:
            lines.append('  domain: "fury",  // TODO: determine domain')
        legend_champion_tag = LEGEND_CHAMPION_TAGS.get(name)
        if legend_champion_tag:
            lines.append(f'  championTag: "{escape_str(legend_champion_tag)}",')
        else:
            lines.append(f"  // TODO: determine championTag for {escape_str(name)}")
    elif card_type == "battlefield":
        domain_str = format_domains(domains)
        if domain_str:
            lines.append(f"  domain: {domain_str},")
    elif card_type == "rune":
        rune_domain = domains[0] if domains else "fury"
        if rune_domain == "colorless":
            rune_domain = "fury"
        lines.append(f'  domain: "{rune_domain}",')
        lines.append("  isBasic: true,")

    # Rules text
    if text:
        lines.append(f'  rulesText: "{escape_str(text)}",')

    lines.append("};")

    return filename, varname, "\n".join(lines) + "\n"


def main():
    with open(INPUT_FILE, "r") as f:
        cards = json.load(f)

    print(f"Loaded {len(cards)} cards")

    # Build champion tags from unit card names
    champion_tags = build_champion_tags(cards)
    print(f"Found {len(champion_tags)} unique champion tags")

    # Group by set
    by_set = defaultdict(list)
    for card in cards:
        set_id = card.get("set", "UNK")
        by_set[set_id].append(card)

    # Track filenames to handle duplicates
    all_set_exports = {}

    for set_id, set_cards in sorted(by_set.items()):
        dir_name = SET_DIR_NAMES.get(set_id, set_id.lower())
        set_dir = os.path.join(CARDS_DIR, dir_name)
        os.makedirs(set_dir, exist_ok=True)

        # Sort by collector number
        set_cards.sort(key=lambda c: c.get("collectorNumber", 0) or 0)

        filenames_seen = {}
        exports = []

        for card in set_cards:
            filename, varname, code = generate_card_ts(card, champion_tags)

            # Handle duplicate filenames within set
            if filename in filenames_seen:
                count = filenames_seen[filename]
                filenames_seen[filename] = count + 1
                filename = f"{filename}-{count + 1}"
                varname = f"{varname}{count + 1}"
                # Regenerate with new varname
                _, _, code = generate_card_ts(card, champion_tags)
                code = code.replace(
                    f"export const {to_camel(card['name'])}:",
                    f"export const {varname}:",
                )
            else:
                filenames_seen[filename] = 1

            filepath = os.path.join(set_dir, f"{filename}.ts")
            with open(filepath, "w") as f:
                f.write(code)

            exports.append((filename, varname))

        # Write set index.ts
        index_lines = [
            f"// {SET_NAMES.get(set_id, set_id)} card definitions",
            f"// {len(set_cards)} cards",
            "",
        ]
        for filename, varname in exports:
            index_lines.append(f'export {{ {varname} }} from "./{filename}";')

        index_path = os.path.join(set_dir, "index.ts")
        with open(index_path, "w") as f:
            f.write("\n".join(index_lines) + "\n")

        all_set_exports[set_id] = (dir_name, exports)
        print(f"  {set_id} ({SET_NAMES.get(set_id, set_id)}): {len(set_cards)} cards")

    # Write master cards/index.ts
    master_lines = [
        "/**",
        " * Riftbound Card Definitions",
        " *",
        " * All card exports organized by set.",
        " */",
        "",
    ]
    for set_id, (dir_name, exports) in sorted(all_set_exports.items()):
        set_label = SET_NAMES.get(set_id, set_id)
        master_lines.append(f'export * as {dir_name} from "./{dir_name}";')
    master_lines.append("")

    master_path = os.path.join(CARDS_DIR, "index.ts")
    with open(master_path, "w") as f:
        f.write("\n".join(master_lines))

    # Write data/sets.ts
    os.makedirs(DATA_DIR, exist_ok=True)
    sets_lines = [
        "/**",
        " * Riftbound set metadata",
        " */",
        "",
        "export interface SetInfo {",
        "  readonly id: string;",
        "  readonly name: string;",
        "  readonly cardCount: number;",
        "}",
        "",
        "export const SETS: Record<string, SetInfo> = {",
    ]
    for set_id, (dir_name, exports) in sorted(all_set_exports.items()):
        set_label = SET_NAMES.get(set_id, set_id)
        sets_lines.append(f'  {set_id}: {{ id: "{set_id}", name: "{set_label}", cardCount: {len(exports)} }},')
    sets_lines.append("};")
    sets_lines.append("")

    sets_path = os.path.join(DATA_DIR, "sets.ts")
    with open(sets_path, "w") as f:
        f.write("\n".join(sets_lines))

    # Write data/all-cards.ts
    allcards_lines = [
        "/**",
        " * Card registry - all cards indexed by ID",
        " */",
        "",
        'import type { Card } from "@tcg/riftbound-types/cards";',
        "",
    ]
    for set_id, (dir_name, exports) in sorted(all_set_exports.items()):
        allcards_lines.append(f'import * as {dir_name} from "../cards/{dir_name}";')
    allcards_lines.append("")
    allcards_lines.append("/**")
    allcards_lines.append(" * Get all cards as an array")
    allcards_lines.append(" */")
    allcards_lines.append("export function getAllCards(): Card[] {")
    allcards_lines.append("  return [")
    for set_id, (dir_name, exports) in sorted(all_set_exports.items()):
        for filename, varname in exports:
            allcards_lines.append(f"    {dir_name}.{varname} as Card,")
    allcards_lines.append("  ];")
    allcards_lines.append("}")
    allcards_lines.append("")
    allcards_lines.append("/**")
    allcards_lines.append(" * Get all cards indexed by ID")
    allcards_lines.append(" */")
    allcards_lines.append("export function getCardRegistry(): Map<string, Card> {")
    allcards_lines.append("  const registry = new Map<string, Card>();")
    allcards_lines.append("  for (const card of getAllCards()) {")
    allcards_lines.append("    registry.set(card.id, card);")
    allcards_lines.append("  }")
    allcards_lines.append("  return registry;")
    allcards_lines.append("}")
    allcards_lines.append("")

    allcards_path = os.path.join(DATA_DIR, "all-cards.ts")
    with open(allcards_path, "w") as f:
        f.write("\n".join(allcards_lines))

    # Write data/index.ts
    data_index_lines = [
        "/**",
        " * Riftbound data exports",
        " */",
        "",
        'export { getAllCards, getCardRegistry } from "./all-cards";',
        'export { SETS } from "./sets";',
        'export type { SetInfo } from "./sets";',
        "",
    ]
    data_index_path = os.path.join(DATA_DIR, "index.ts")
    with open(data_index_path, "w") as f:
        f.write("\n".join(data_index_lines))

    total = sum(len(exports) for _, (_, exports) in all_set_exports.items())
    print(f"\nGenerated {total} card files across {len(all_set_exports)} sets")


if __name__ == "__main__":
    main()
