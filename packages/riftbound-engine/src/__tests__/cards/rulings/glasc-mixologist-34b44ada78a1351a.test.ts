/**
 * Ruling 34b44ada78a1351a — Glasc Mixologist (SFD-165 → sfd-165-221) · Unit · Order · 5 · 5 Might
 *     "[Deathknell] — You may play a unit with cost no more than [3] and no more than [rainbow] from your trash,
 *      ignoring its cost."
 *   × Karthus, Eternal (OGN-236 → ogn-236-298) · 3 · 3 Might "Your [Deathknell] effects trigger an additional time."
 *
 * Q: Two Mixologists at my battlefield die together in combat; both Deathknells go on the chain; the first
 *    to resolve plays Karthus from trash. Does the second Mixologist's Deathknell now trigger twice?
 * A: No. The number of Deathknell triggers is fixed at the moment of death from the board as it was then.
 *    Karthus was not on the board when they died, so exactly two triggers exist; the second resolves once.
 * Rules: 808.1.d.2 (Deathknell trigger count locked at death), 383 (triggered abilities), 326 (chain, LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GLASC = "sfd-165-221";
const KARTHUS = "ogn-236-298";
const SKULKER = "ogn-175-298"; // 3-cost vanilla unit
const PEBBLE = { cardType: "unit", energyCost: 1, might: 2, name: "Pebble" };

/**
 * P2's turn. P1 holds bf1 with two Mixologists (5 + 5). P1's trash: Karthus (3), a Skulker (3) and a Pebble (1)
 * — three legal Deathknell plays, so a would-be third trigger would still find something to play.
 * P2's 12-Might Titan attacks and kills both Mixologists at once.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", GLASC, "glascA")
    .unit(P1, "bf1", GLASC, "glascB")
    .trash(P1, KARTHUS, "karthus")
    .trash(P1, SKULKER, "skulker")
    .trash(P1, PEBBLE, "pebble")
    .unit(P2, "base", { might: 12, name: "Titan" }, "titan");
}

/** Titan attacks; both players pass focus; combat kills both Mixologists simultaneously. Stops at P1's first opt-in. */
async function bothDie(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("titan", "bf1");
  await game.p2.passFocus();
  await game.p1.passFocus();
  expect(game.zoneOf("glascA")).toBe("trash");
  expect(game.zoneOf("glascB")).toBe("trash");
  expect(game.zoneOf("karthus")).toBe("trash"); // NOT on the board at the moment of death
  return game;
}

const pickKeys = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** Pass chain priority round until something other than a priority window is pending. */
async function passBoth(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") return;
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling 34b44ada78a1351a — Karthus played by the first Mixologist Deathknell does not double the second", () => {
  test("at the moment of death exactly TWO Deathknell items are created (one per Mixologist), each with P1's 'you may' opt-in", async () => {
    const game = await bothDie();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "glascA", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "glascB", controller: P1, triggered: true }),
    ]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.chain()).toHaveLength(2);
  });

  test("resolution 1 plays Karthus from trash (P1 picks him, then his destination); resolution 2 then resolves ONCE — one more play, never a third", async () => {
    const game = await bothDie();
    await game.p1.yes();
    await game.p1.yes();
    await passBoth(game);
    // Resolution 1 (top of chain): P1 chooses which trash unit to play — Karthus.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickKeys(game.decision()).toSorted()).toEqual(["karthus", "pebble", "skulker"]);
    await game.p1.pick("karthus");
    if (game.decision()?.kind === "pick" && pickKeys(game.decision()).includes("base")) {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // P1 chooses where he is played
      await game.p1.pick("base");
    }
    // A unit played this way finalizes at once (no priority round for permanents).
    expect(game.zoneOf("karthus")).toBe("base"); // Karthus is NOW on the board …
    // … and exactly one Deathknell item remains: his presence adds nothing retroactively.
    expect(game.chain().filter((c) => c.cardId === "glascA" || c.cardId === "glascB")).toHaveLength(1);
    expect(game.chain()).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    await passBoth(game);
    // Resolution 2: one play from trash.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickKeys(game.decision()).toSorted()).toEqual(["pebble", "skulker"]);
    await game.p1.pick("skulker");
    if (game.decision()?.kind === "pick" && pickKeys(game.decision()).includes("base")) {
      await game.p1.pick("base");
    }
    await passBoth(game);
    // Done: no third Deathknell resolution — the Pebble is never offered, the chain is empty, P2's turn resumes.
    const after = await game.settle();
    expect(after.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.zoneOf("pebble")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // both plays ignored their costs
    expect(game.violations()).toEqual([]);
  });

  test("control: had Karthus already been ON THE BOARD when a Mixologist died, that Deathknell would trigger twice (two plays)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", GLASC, "glascA")
      .unit(P1, "base", KARTHUS, "karthus")
      .trash(P1, SKULKER, "skulker")
      .trash(P1, PEBBLE, "pebble")
      .unit(P2, "base", { might: 12, name: "Titan" }, "titan")
      .build();
    await game.p2.move("titan", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.zoneOf("glascA")).toBe("trash");
    expect(game.chain().filter((c) => c.cardId === "glascA")).toHaveLength(2); // one death, two triggers
    game.script(P1, [
      "yes",
      "yes",
      (d) => (pickKeys(d).includes("skulker") ? "skulker" : undefined),
      (d) => (pickKeys(d).includes("base") ? "base" : undefined),
      (d) => (pickKeys(d).includes("pebble") ? "pebble" : undefined),
      (d) => (pickKeys(d).includes("base") ? "base" : undefined),
    ]);
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.zoneOf("pebble")).toBe("base");
  });
});
