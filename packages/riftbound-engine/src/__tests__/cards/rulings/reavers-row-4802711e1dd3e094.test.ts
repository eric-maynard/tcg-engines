/**
 * Ruling 4802711e1dd3e094 — Reaver's Row (OGN-285 → ogn-285-298, Battlefield)
 *   "When you defend here, you may move a friendly unit here to base."
 *   × Shen, Kinkou (ogn-241-298) · [3][order] · 3 Might · "[Reaction] (… including to a battlefield you control.) [Shield 2] [Tank]"
 *
 * Q: If my unit at Reaver's Row retreats when attacked, can Shen be played from hand onto the now-empty battlefield
 *    during the showdown?
 * A: Yes — you keep control of the battlefield (merely Contested) until the combat's final resolution, so it is still
 *    "a battlefield you control". You may play Shen in response to the Row trigger (your unit is still there when Shen
 *    enters), or wait for that chain to resolve and play Shen afterwards as a new chain.
 * Rules: 190.4.b (control is not lost while a combat is ongoing there), 813 / Reaction unit "to a battlefield you
 *        control", 464.2.c.3.a (a unit arriving mid-combat becomes a Defender), 466.3/466.5.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const SHEN_KINKOU = "ogn-241-298";

/** P2's turn. P1's lone Lookout (2) holds Reaver's Row (live); P1 has Shen in hand + [3][order]. P2's Raider (4) attacks. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 3, power: { order: 1 } })
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "row", { might: 2, name: "Lookout" }, "lookout")
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, SHEN_KINKOU, "shen");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Raider attacks; P1 opts into the Row trigger (lone Lookout auto-bound) → the trigger is pending on the combat chain. */
async function rowTriggerPending(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "row");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" }, timing: "FIN" });
  await game.p1.yes();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("lookout");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P1, triggered: true })]);
  return game;
}

/** Pass priority around until the chain is empty (the Row trigger resolves: Lookout → base). */
async function resolveChain(game: Game): Promise<void> {
  while (game.chain().length > 0 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
}

describe("Ruling 4802711e1dd3e094 — Shen may be Reaction-played onto Reaver's Row after the defender retreats", () => {
  test("after the Row trigger resolves the Lookout is in base and NO friendly unit remains at the Row — yet P1 still controls it (Contested by P2, combat ongoing)", async () => {
    const game = await rowTriggerPending();
    await resolveChain(game);
    expect(game.locationOf("lookout")).toBe("base");
    expect(game.p1.units("row")).toEqual([]);
    expect(game.gameState.battlefields.row).toMatchObject({ contested: true, controller: P1 });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "row" });
  });

  test("option B (wait for the chain to resolve): with Focus in the showdown P1 may play Shen from hand TO THE ROW as a new chain — 'a battlefield you control'", async () => {
    const game = await rowTriggerPending();
    await resolveChain(game);
    // The attacker holds Focus first; once P2 passes, P1 acts.
    if (game.actingSeat() === P2) {
      await game.p2.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("play", "shen")).toBe(true);
    const dests = game.p1.option("play", "shen")?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect(dests).toContain("battlefield-row");
    await game.p1.play("shen", { to: "row" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("shen")).toBe("battlefield-row");
    expect(game.state("shen").combatRole).toBe("defender"); // 464.2.c.3.a
  });

  test("…Shen then defends alone: Shield 2 makes him 5 vs the Raider's 4 — the Raider dies, Shen holds, P1 keeps the Row and P2 scores nothing", async () => {
    const game = await rowTriggerPending();
    await resolveChain(game);
    if (game.actingSeat() === P2) {
      await game.p2.passFocus();
    }
    await game.p1.play("shen", { to: "row" });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("shen")).toBe("battlefield-row");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.locationOf("lookout")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("option A (in response to the Row trigger): Shen enters the Row immediately while the Lookout is still there; then the trigger resolves and only the Lookout retreats", async () => {
    const game = await rowTriggerPending();
    // Find P1's priority window on the pending trigger.
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("play", "shen")).toBe(true);
    await game.p1.play("shen", { to: "row" });
    expect(game.zoneOf("shen")).toBe("battlefield-row");
    expect(game.p1.units("row").sort()).toEqual(["lookout", "shen"]); // both present when Shen enters
    expect(game.chain().map((c) => c.cardId)).toEqual(["row"]); // a unit resolves at once; the trigger is still pending
    await resolveChain(game);
    expect(game.locationOf("lookout")).toBe("base");
    expect(game.p1.units("row")).toEqual(["shen"]);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
  });
});
