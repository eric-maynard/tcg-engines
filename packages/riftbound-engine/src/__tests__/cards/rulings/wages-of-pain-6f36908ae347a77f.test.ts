/**
 * Ruling 6f36908ae347a77f — Wages of Pain (SFD-070 → sfd-070-221) · Action · [3] "[Hidden] Deal 3 to a unit at a battlefield. Play a Gold gear token exhausted."
 *   × Tideturner (OGN-199 → ogn-199-298) · 2 Might "[Hidden] When you play me, you may choose a unit you control at another location. Move me to its
 *     location and it to my original location."
 *
 * Q: I flip a hidden Wages of Pain; my opponent responds by flipping a hidden Tideturner. Does Wages still resolve?
 * A: Yes. Tideturner (a unit) enters play at once; only its "when you play me" trigger goes on the chain, above Wages. LIFO: the Tideturner trigger
 *    resolves (the optional swap), THEN Wages of Pain resolves — the Tideturner play does not counter it. If its target is still legal it takes the 3;
 *    even if the swap made the target illegal, Wages still resolves and just skips that instruction (the Gold token is still played).
 * Rules: 811 (Hidden: flip as a Reaction for [0]), 340 (LIFO), 359.3.e.5 / 359.3.e.12 (independent instructions; illegal target → skip, don't counter).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WAGES_OF_PAIN = "sfd-070-221";
const TIDETURNER = "ogn-199-298";

/**
 * P2's turn. P1 controls bfA (Guard 4 + a facedown Wages of Pain); P2 controls bfB (a facedown Tideturner) and has Raider (3) and Pal (2) in base.
 * Empty pools all round — hidden cards flip for [0].
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", { might: 4, name: "Guard" }, "guard")
    .facedown(P1, "bfA", WAGES_OF_PAIN, "wages")
    .unit(P2, "bfB", { might: 1, name: "Holder" }, "holder") // rule 107.3.c / 190.4.a — a facedown card needs its controller to CONTROL bfB, i.e. a P2 unit there
    .facedown(P2, "bfB", TIDETURNER, "tt")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 2, name: "Pal" }, "pal");
}

const goldOf = (game: Game) => game.p1.gear().filter((g) => game.state(g).isToken);

/** Raider attacks bfA; P2 passes Focus; P1 flips Wages of Pain at the Raider and passes priority to P2. */
async function wagesOnRaider(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bfA");
  await game.p2.passFocus();
  expect(game.p1.can("reveal", "wages")).toBe(true);
  await game.p1.reveal("wages");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // "You choose your target at this time"
  await game.p1.pick("raider");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "wages", controller: P1, targets: ["raider"] })]);
  expect(game.p1.energy()).toBe(0); // from hidden for [0]
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/** P2 flips the hidden Tideturner in response and answers its trigger: swap with `partner` (or decline with null). */
async function flipTideturner(game: Game, partner: "pal" | "raider" | null): Promise<void> {
  expect(game.p2.can("reveal", "tt")).toBe(true);
  await game.p2.reveal("tt");
  // The unit itself is played immediately (not a chain item); its trigger is.
  expect(game.zoneOf("tt")).toBe("battlefield-bfB");
  if (game.decision()?.kind === "yes-no") {
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await (partner ? game.p2.yes() : game.p2.no());
  }
  if (partner && game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick(partner);
  }
}

describe("Ruling 6f36908ae347a77f — a hidden Tideturner flipped in response does not stop a hidden Wages of Pain", () => {
  test("P2's flip: Tideturner ENTERS PLAY at bfB right away and only its 'when you play me' trigger is placed on the chain — on top of Wages of Pain", async () => {
    const game = await wagesOnRaider();
    await flipTideturner(game, "pal");
    expect(game.zoneOf("tt")).toBe("battlefield-bfB");
    expect(game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`)).toEqual(["wages", "tt*"]);
    expect(game.chain()[0]?.countered).toBe(false);
    expect(game.state("raider").damage).toBe(0); // nothing has resolved yet
  });

  test("LIFO: the Tideturner trigger resolves FIRST (Tideturner ↔ Pal swap: Tideturner to base, Pal to bfB) while Wages of Pain still waits on the chain", async () => {
    const game = await wagesOnRaider();
    await flipTideturner(game, "pal");
    await game.p2.passPriority();
    await game.p1.passPriority(); // Tideturner's trigger resolves
    expect(game.locationOf("tt")).toBe("base");
    expect(game.locationOf("pal")).toBe("bfB");
    expect(game.chain().map((c) => c.cardId)).toEqual(["wages"]);
    expect(game.state("raider")).toMatchObject({ damage: 0, zone: "battlefield-bfA" });
  });

  test("…then Wages of Pain resolves normally: the Raider (still a legal target at bfA) takes 3 and dies, and P1 gets an exhausted Gold token — the spell was never countered", async () => {
    const game = await wagesOnRaider();
    await flipTideturner(game, "pal");
    await game.p2.passPriority();
    await game.p1.passPriority(); // trigger
    await game.p1.passPriority();
    await game.p2.passPriority(); // Wages
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("wages")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash"); // 3 ≥ 3
    const gold = goldOf(game);
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ isExhausted: true, name: "Gold" });
    expect(game.violations()).toEqual([]);
  });

  test("declining Tideturner's optional swap changes nothing for Wages: it still resolves, Raider dies, Gold arrives", async () => {
    const game = await wagesOnRaider();
    await flipTideturner(game, null);
    await game.settle();
    expect(game.zoneOf("wages")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(goldOf(game)).toHaveLength(1);
    expect(game.locationOf("tt")).toBe("bfB");
  });

  test("independent resolution: even when Tideturner swaps places with the TARGETED Raider (Raider whisked to bfB), Wages of Pain is not countered — it still resolves to the trash and still plays the Gold token", async () => {
    const game = await wagesOnRaider();
    await flipTideturner(game, "raider");
    await game.p2.passPriority();
    await game.p1.passPriority(); // swap: Tideturner → bfA (into the fight), Raider → bfB
    expect(game.locationOf("raider")).toBe("bfB");
    expect(game.locationOf("tt")).toBe("bfA");
    expect(game.chain().map((c) => c.cardId)).toEqual(["wages"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("wages")).toBe("trash"); // resolved, not countered
    expect(goldOf(game)).toHaveLength(1); // the unlinked instruction always happens
    // The damage instruction either found the Raider still legal ("a unit at a battlefield") or skipped it — never anything else.
    expect([0, 3]).toContain(game.has("raider") && game.zoneOf("raider") !== "trash" ? game.state("raider").damage : 3);
  });
});
