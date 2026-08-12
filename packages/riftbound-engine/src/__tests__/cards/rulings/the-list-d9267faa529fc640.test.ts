/**
 * Ruling d9267faa529fc640 — The List (UNL-138 → unl-138-219) · Gear · Chaos · 1 · "As you play this, name a tag. [Exhaust]:
 *   Give a unit with the named tag -2 [Might] this turn."
 *   × Falling Star (OGN-029 → ogn-029-298) · Spell · Fury · 2 + [fury][fury] · "Deal 3 to a unit. Deal 3 to a unit."
 *   × The Boss (Sett legend, OGN-269 → ogn-269-298) "If a buffed unit you control would die, you may pay [rainbow], exhaust
 *     me, and spend its buff to heal it, exhaust it, and recall it instead."
 *
 * Q: My buffed unit in base is under the opponent's The List and is chosen twice by their Falling Star. If the first 3
 *    would kill it and I save it with Sett, The Boss — what happens?
 * A: Falling Star resolves top to bottom. First 3: lethal → The Boss replaces the death with a recall (to base — it is
 *    already there), exhausts it, heals it and spends its buff. Second 3: the unit is still at the same location and a
 *    legal choice, so it is hit again. It also remains a valid object for The List while it keeps the named tag.
 * Rules: 359.3 (instructions resolve in order), 372–373 (replacement — the unit never leaves the board), 454 (Recall is a
 *        relocation to base, not a move), 702.2.b (spending a buff), 355 (targets stay legal while they still qualify).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_LIST = "unl-138-219";
const FALLING_STAR = "ogn-029-298";
const THE_BOSS = "ogn-269-298";

/**
 * P2's turn. P1: The Boss (ready), 1 rainbow; "Big Poro" (7 Might, tag Poro, BUFFED → 8, already 3 damage) in base.
 * P2: The List + Falling Star in hand, exactly 1 + 2 energy and [fury][fury]; a Bystander.
 */
function board() {
  return scenario()
    .active(P2)
    .legend(P1, THE_BOSS, "boss")
    .resources(P1, { power: { rainbow: 1 } })
    .resources(P2, { energy: 3, power: { fury: 2 } })
    .unit(P1, "base", { might: 7, name: "Big Poro", tags: ["Poro"] }, "pal", { buffed: true, damage: 3 })
    .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander")
    .hand(P2, THE_LIST, "list")
    .hand(P2, FALLING_STAR, "star");
}

async function passBoth(game: Game): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
}

/** P2 plays The List naming "Poro", then exhausts it at the Big Poro (8 → 6 this turn). */
async function listOnPal(): Promise<Game> {
  const game = await board().build();
  expect(game.state("pal").might).toBe(8);
  await game.p2.play("list");
  // rule 358 / 135.2.b.3 — a permanent's play finalizes at once and the
  // "as you play this, name a tag" step never reaches the Chain: nobody gets a
  // Reaction window here, the naming prompt is up immediately.
  expect(game.decision()).toMatchObject({ kind: "name", seat: P2 });
  await game.p2.name("Poro");
  expect(game.state("list").meta.namedTag).toBe("Poro");
  const offered = (game.p2.option("activate", "list")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
  expect(offered).toEqual(["pal"]); // only the unit with the named tag
  await game.p2.activate("list", undefined, { targets: "pal" });
  expect(game.state("list").isExhausted).toBe(true);
  await passBoth(game);
  expect(game.state("pal").might).toBe(6);
  return game;
}

describe("Ruling d9267faa529fc640 — Falling Star twice at a Listed, buffed unit: The Boss saves it from the first 3, the second 3 still lands", () => {
  test("setup: The List (naming Poro) drops the buffed Big Poro to 6; Falling Star may name it for BOTH instances", async () => {
    const game = await listOnPal();
    const targets = game.p2.option("cast", "star")?.fields.find((f) => f.name === "targets");
    expect(targets?.options).toContainEqual(["pal", "pal"]);
    await game.p2.cast("star", { targets: ["pal", "pal"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", targets: ["pal", "pal"] })]);
  });

  test("first 3 is lethal (3 + 3 ≥ 6) → The Boss asks P1; accepting REPLACES the death: Big Poro stays in base (recall, not to hand), healed, exhausted, buff spent — Boss exhausted, [rainbow] paid", async () => {
    const game = await listOnPal();
    await game.p2.cast("star", { targets: ["pal", "pal"] });
    await passBoth(game); // Falling Star starts resolving
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    await game.p1.yes();
    expect(game.zoneOf("pal")).toBe("base"); // not the trash, not the hand
    expect(game.p1.hand()).toEqual([]);
    expect(game.state("pal")).toMatchObject({ isBuffed: false, isExhausted: true });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.power("rainbow")).toBe(0);
  });

  test("…and the SECOND 3 still hits it (same location, still a legal choice): it ends in base with exactly 3 damage on a now 5-Might body (7 − List 2, buff gone) — alive, exhausted, unbuffed", async () => {
    const game = await listOnPal();
    await game.p2.cast("star", { targets: ["pal", "pal"] });
    await passBoth(game);
    await game.p1.yes();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("base");
    expect(game.state("pal")).toMatchObject({ damage: 3, isBuffed: false, isExhausted: true, might: 5 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("The List still applies to it: the unit keeps its Poro tag in base, and once The List is ready again (P2's next turn) Big Poro is again its legal object", async () => {
    const game = await listOnPal();
    await game.p2.cast("star", { targets: ["pal", "pal"] });
    await passBoth(game);
    await game.p1.yes();
    await game.settle();
    await game.advanceTurn(); // → P1
    await game.advanceTurn(); // → P2: The List readies
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("list").isReady).toBe(true);
    const offered = (game.p2.option("activate", "list")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("pal");
  });
});
