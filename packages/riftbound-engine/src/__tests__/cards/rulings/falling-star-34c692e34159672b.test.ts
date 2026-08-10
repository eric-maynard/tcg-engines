/**
 * Ruling 34c692e34159672b — Falling Star (OGN-029 → ogn-029-298) · Spell · [2][fury][fury] · "Deal 3 to a unit. Deal 3 to a unit."
 *   × Karthus, Eternal (OGN-236 → ogn-236-298) · 3 Might · "Your [Deathknell] effects trigger an additional time."
 *   × Black Rose Dignitary (UNL-152 → unl-152-219) · 2 Might · "[Assault] [Deathknell] — Channel 1 rune exhausted."
 *
 * Q: If Falling Star kills Karthus and the Dignitary together, does the Karthus player pick who dies first to keep the
 *    doubled Deathknell?
 * A: The extra trigger happens and no ordering is needed: both die SIMULTANEOUSLY on the spell's resolution, and Karthus's
 *    PASSIVE is still applying at the moment the Dignitary's Deathknell is created — so it triggers twice.
 * Rules: 361/522 (passives apply continuously incl. the moment of the death event), 428 (simultaneous kills from one
 *        resolution), 808 (Deathknell), 383 (triggers → chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const KARTHUS = "ogn-236-298";
const BLACK_ROSE_DIGNITARY = "unl-152-219";

/** P1's turn with exactly [2][fury][fury]. P2 (the "Karthus player"): Karthus (3) + Dignitary (2) in base, no runes channeled. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .unit(P2, "base", KARTHUS, "karthus")
    .unit(P2, "base", BLACK_ROSE_DIGNITARY, "dignitary")
    .hand(P1, FALLING_STAR, "star");
}

/** Falling Star: 3 to Karthus, 3 to the Dignitary; both pass → it resolves. */
async function starBoth(): Promise<Game> {
  const game = await board().build();
  expect(game.p2.runes()).toEqual([]);
  await game.p1.cast("star", { targets: ["karthus", "dignitary"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", targets: ["karthus", "dignitary"] })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ruling 34c692e34159672b — Karthus and the Dignitary die together to Falling Star; the Dignitary's Deathknell still triggers twice", () => {
  test("1. simultaneous death: on resolution BOTH units are in the trash, and P2 was never asked to sequence the deaths (no P2 pick between the cast and the triggers)", async () => {
    const game = await starBoth();
    expect(game.zoneOf("karthus")).toBe("trash");
    expect(game.zoneOf("dignitary")).toBe("trash");
    expect(game.zoneOf("star")).toBe("trash");
    const d = game.decision();
    // Whatever is pending now is about the TRIGGERS (priority / their order), never "which unit dies first".
    expect(d?.kind === "pick").toBe(false);
  });

  test("2–3. Karthus's passive was still 'watching' at the moment of death: the Dignitary's Deathknell is on the chain TWICE (both P2's items)", async () => {
    const game = await starBoth();
    if (game.decision()?.kind === "order") {
      expect(game.decision()).toMatchObject({ kind: "order", seat: P2 });
      await game.acceptTriggerOrder();
    }
    const knells = game.chain().filter((c) => c.cardId === "dignitary" && c.triggered && c.controller === P2);
    expect(knells).toHaveLength(2);
    expect(game.chain().some((c) => c.cardId === "karthus")).toBe(false); // Karthus has no trigger of his own
  });

  test("result: both Deathknells resolve — P2 channels 2 runes, both exhausted", async () => {
    const game = await starBoth();
    const runeDeck = game.p2.runeDeck().length;
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p2.runes()).toHaveLength(2);
    expect(game.p2.runes({ ready: false })).toHaveLength(2);
    expect(game.p2.runeDeck()).toHaveLength(runeDeck - 2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: with Karthus NOT on the board, the Dignitary dying to Falling Star channels just 1 rune", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .unit(P2, "base", BLACK_ROSE_DIGNITARY, "dignitary")
      .unit(P2, "base", { might: 3, name: "Bystander" }, "bystander")
      .hand(P1, FALLING_STAR, "star")
      .build();
    await game.p1.cast("star", { targets: ["bystander", "dignitary"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain().filter((c) => c.cardId === "dignitary" && c.triggered)).toHaveLength(1);
    await game.settle();
    expect(game.zoneOf("dignitary")).toBe("trash");
    expect(game.p2.runes()).toHaveLength(1);
    expect(game.p2.runes({ ready: false })).toHaveLength(1);
  });

  test("contrast: Karthus alive and only the Dignitary killed (3 + 3 both to it) — also twice; the doubling does not depend on Karthus surviving vs dying alongside", async () => {
    const game = await board().build();
    await game.p1.cast("star", { targets: ["dignitary", "dignitary"] });
    await game.settle();
    expect(game.zoneOf("dignitary")).toBe("trash");
    expect(game.zoneOf("karthus")).toBe("base");
    expect(game.p2.runes({ ready: false })).toHaveLength(2);
  });
});
