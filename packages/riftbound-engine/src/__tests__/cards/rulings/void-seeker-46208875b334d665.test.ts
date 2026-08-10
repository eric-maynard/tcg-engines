/**
 * Ruling 46208875b334d665 — Void Seeker (OGN-024 → ogn-024-298) · Action · [3][fury] "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Stupefy (OGN-095 → ogn-095-298) · Reaction · [1] "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *   × Immortal Phoenix (OGN-037 → ogn-037-298) "When you kill a unit with a spell, you may pay [1][fury] to play me from your trash."
 *
 * Q: A 5-Might unit carries 4 damage from Void Seeker; Stupefy then drops it to 4 Might and it dies. Does the Phoenix trigger?
 * A: No. The spell that resolved immediately before the lethal cleanup was Stupefy, which dealt no damage; Void Seeker gets
 *    no credit either because another spell resolved in between. (Takeaway: reduce Might first, THEN cast the damage spell.)
 * Rules: 323.5 (cleanup kills lethally-damaged units), 383.2.c.1 ("kill with a spell" credit), FAQ on kill credit.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const STUPEFY = "ogn-095-298";
const IMMORTAL_PHOENIX = "ogn-037-298";

/**
 * P1's turn. P2's 5-Might Brute at P2's bf1. P1: Void Seeker + Stupefy in hand, Immortal Phoenix in trash,
 * [5] + 2 fury (Void Seeker 3+fury, Stupefy 1, Phoenix 1+fury).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute")
    .hand(P1, VOID_SEEKER, "seeker")
    .hand(P1, STUPEFY, "stupefy")
    .trash(P1, IMMORTAL_PHOENIX, "phoenix");
}

/** Pass/decline everything up to the open main phase, recording every non-action prompt shown to P1. */
async function drain(game: Game): Promise<string[]> {
  const prompts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      prompts.push(`${d.seat}:${d.kind}:${d.source?.cardId ?? ""}:${d.prompt}`);
      if (d.kind === "yes-no") {
        await game.seat(d.seat).no();
      } else {
        break;
      }
    }
  }
  return prompts;
}

describe("Ruling 46208875b334d665 — a unit finished off by Stupefy's Might reduction was not 'killed with' Void Seeker: no Phoenix trigger", () => {
  test("Void Seeker resolves: Brute (5 Might) carries 4 damage and lives", async () => {
    const game = await board().build();
    await game.p1.cast("seeker", { targets: "brute" });
    await game.settle();
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.state("brute")).toMatchObject({ damage: 4, might: 5, zone: "battlefield-bf1" });
  });

  // Expected: no Phoenix offer at all — Stupefy (the spell resolving right before the lethal cleanup) dealt no damage,
  // and Void Seeker's damage is stale (another spell resolved in between), so nobody "killed a unit with a spell".
  // Actual: the engine credits the cleanup death to a spell and asks P1 "Pay [1][fury] to use Immortal Phoenix".
  test("ruling 46208875b334d665 — engine offers the Immortal Phoenix trigger when Stupefy's -1 Might (no damage) finishes off a Void-Seeker-damaged unit", async () => {
    const game = await board().build();
    await game.p1.cast("seeker", { targets: "brute" });
    await game.settle();
    await game.p1.cast("stupefy", { targets: "brute" });
    const prompts = await drain(game);
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("trash");
    expect(prompts.filter((p) => p.includes("phoenix"))).toEqual([]);
    expect(prompts).toEqual([]);
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } }); // the Phoenix's [1][fury] was never asked for
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast (the ruling's takeaway): Stupefy FIRST (5 → 4), then Void Seeker's 4 damage kills — that IS a spell kill, and the Phoenix asks P1 to pay [1][fury]", async () => {
    const game = await board().build();
    await game.p1.cast("stupefy", { targets: "brute" });
    await game.settle();
    expect(game.state("brute")).toMatchObject({ damage: 0, might: 4 });
    await game.p1.cast("seeker", { targets: "brute" });
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || d.context === "main" || !d.passKey) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "phoenix" } });
  });
});
