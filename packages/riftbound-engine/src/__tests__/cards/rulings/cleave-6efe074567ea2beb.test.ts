/**
 * Ruling 6efe074567ea2beb — Cleave (OGN-004 → ogn-004-298) · Fury Action · [1] "Give a unit [Assault 3] this turn."
 *   × Reaver's Row (OGN-285 → ogn-285-298) · Battlefield "When you defend here, you may move a friendly unit here to base."
 *
 * Q: Can the attacker play an Action (Cleave) after the Reaver's Row 'When you defend' trigger resolves — even if the defender
 *    chose not to retreat anything?
 * A: Yes. Attack/defend triggers form the initial chain; once it has fully resolved the ATTACKER holds Focus and may play
 *    Actions before combat damage; players then alternate until all pass. Nuance: the Row's unit is chosen when the trigger
 *    goes on the chain, but whether to move it is decided as it resolves.
 * Rules: 442–444 (initial chain of attack/defend triggers), 347 (attacker has Focus first once the chain is empty),
 *        341 (Actions need Focus + empty chain), 348 (showdown ends only when all pass), 465 (combat damage after that).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";
const REAVERS_ROW = "ogn-285-298";

/** P1's turn with exactly [1] and Cleave. P2 holds the live Reaver's Row with DefA (2) and DefB (2). P1's 5-Might Raider in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false, owner: P2 })
    .unit(P2, "row", { might: 2, name: "DefA" }, "da")
    .unit(P2, "row", { might: 2, name: "DefB" }, "db")
    .unit(P1, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P1, CLEAVE, "cleave");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Raider attacks the Row → the defend trigger asks P2 (the defender). */
async function attackRow(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "row");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "row", defendingPlayer: P2, isCombatShowdown: true });
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "row" } });
  return game;
}

/** Pass priority round until the initial chain is empty. */
async function drainInitialChain(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d: Decision | null = game.decision();
    if (d?.kind === "action" && d.context === "chain" && d.passKey) {
      await game.seat(d.seat).pass();
      continue;
    }
    break;
  }
  expect(game.chain()).toEqual([]);
}

describe("Ruling 6efe074567ea2beb — after the Reaver's Row defend trigger, the attacker has Focus and may Cleave before damage", () => {
  test("defender declines to retreat: the initial chain clears with both defenders in place, NO combat damage yet, and the ATTACKER (P1) holds Focus in the open showdown — Cleave (an Action) is legal", async () => {
    const game = await attackRow();
    await game.p2.no();
    await drainInitialChain(game);
    expect(game.locationOf("da")).toBe("row");
    expect(game.locationOf("db")).toBe("row");
    expect(game.state("raider").damage).toBe(0);
    expect((game.gameState.damageLog ?? []).filter((r) => r.combat)).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "cleave")).toBe(true);
  });

  test("ruling: P1 Cleaves the Raider; it resolves (Assault 3 → 8 while attacking); only when both then pass does combat damage happen — 8 kills both defenders, the Raider (took 4) conquers the Row", async () => {
    const game = await attackRow();
    await game.p2.no();
    await drainInitialChain(game);
    await game.p1.cast("cleave", { targets: "raider" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cleave", controller: P1, targets: ["raider"] })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Cleave resolves
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("raider").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("raider").might).toBe(8);
    expect(game.zoneOf("da")).toBe("battlefield-row"); // still no damage: Focus keeps alternating first
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await game.settle(); // all pass → combat damage
    expect(game.zoneOf("da")).toBe("trash");
    expect(game.zoneOf("db")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-row");
    expect(game.state("raider").damage).toBe(0); // took 4 < 5, healed at cleanup
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("same if the defender DOES retreat one (DefB to base): the Row item resolves off the initial chain, then P1 has Focus and can still Cleave before damage", async () => {
    const game = await attackRow();
    await game.p2.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "row" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["da", "db"]);
    await game.p2.pick("db");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P2, targets: ["db"], triggered: true })]);
    await drainInitialChain(game);
    expect(game.locationOf("db")).toBe("base");
    expect(game.locationOf("da")).toBe("row");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "cleave")).toBe(true);
    await game.p1.cast("cleave", { targets: "raider" });
    await game.settle();
    expect(game.zoneOf("da")).toBe("trash");
    expect(game.zoneOf("db")).toBe("base");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
  });

  // RULING-CONFLICT: riftjudge 6efe074567ea2beb adds a nuance — the Row's unit is chosen when the trigger is put on the chain,
  // but whether to actually move it is decided as the trigger RESOLVES, so the defender could still keep it after naming it.
  // CR 383.3.a / 383.3.a.1 say the opposite for a "you may" that is the FIRST part of a triggered ability's effect ("you may
  // move a friendly unit here to base"): the controller decides whether to perform the ability during FINALIZATION, and that
  // decision is "solely whether or not to perform said triggered ability" — there is no second say on resolution. The engine
  // follows the Core Rules, and the green test above depends on that same finalization-time opt-in.
  test("CR 383.3.a — the Row's whole opt-in happens at finalization (yes → name the unit); no second 'move it?' on resolution", async () => {
    const game = await attackRow();
    await game.p2.yes();
    await game.p2.pick("db");
    let askedAtResolution = false;
    for (let i = 0; i < 8; i++) {
      const d: Decision | null = game.decision();
      if (d?.kind === "action" && d.context === "chain" && d.passKey) {
        await game.seat(d.seat).pass();
        continue;
      }
      if (d?.kind === "yes-no" && d.seat === P2 && game.chain().length <= 1) {
        askedAtResolution = true;
      }
      break;
    }
    expect(askedAtResolution).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("db")).toBe("base");
  });
});
