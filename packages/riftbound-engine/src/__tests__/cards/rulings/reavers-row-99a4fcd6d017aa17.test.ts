/**
 * Ruling 99a4fcd6d017aa17 — Reaver's Row (OGN-285 → ogn-285-298, Battlefield) "When you defend here, you may move a friendly unit
 *   here to base."
 *   × Gust (OGN-169 → ogn-169-298, Reaction, 1) "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × "Phoenix" = Immortal Phoenix (ogn-037-298) · 3 Might · [Assault 2] (+2 [Might] while I'm an attacker).
 *
 * Q: Phoenix attacks Reaver's Row (3 → 5 as attacker); the Row's trigger moves the lone defender away. Does Phoenix drop back to
 *    3 before the showdown continues and become Gust-able?
 * A: No. Only the moved unit loses its (defender) status; the attacker designation lasts until the combat ends, and combat does not
 *    end just because no opposing units remain at that instant. Phoenix stays a 5-Might attacker throughout — including while the
 *    Row's trigger is on the chain — so Gust (≤ 3 Might) never has it as a legal target.
 * Rules: 464.2 (Attacker/Defender designations last for the combat), 323.2.c (a unit that leaves loses its designation),
 *        Assault (while an attacker), 383.4.f (defend trigger on the initial chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const GUST = "ogn-169-298";
const IMMORTAL_PHOENIX = "ogn-037-298";

/** P1's turn. P2 holds the live Reaver's Row with a lone 2-Might Lookout and has Gust + exactly [1]. P1's ready Phoenix (3, Assault 2) in base. */
function board() {
  return scenario()
    .resources(P2, { energy: 1 })
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false })
    .unit(P2, "row", { might: 2, name: "Lookout" }, "lookout")
    .unit(P1, "base", IMMORTAL_PHOENIX, "phoenix")
    .hand(P2, GUST, "gust");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const gustTargets = (game: Game) =>
  (game.p2.option("cast", "gust")?.fields.find((f) => f.arg === "targets")?.options ?? []).flat() as string[];

/** Phoenix attacks the Row; P2 accepts the Row trigger and names the Lookout. Returns with the trigger on the chain. */
async function attackRowTriggerPending(): Promise<Game> {
  const game = await board().build();
  expect(game.state("phoenix").might).toBe(3);
  await game.p1.move("phoenix", "row");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, defendingPlayer: P2, isCombatShowdown: true });
  expect(game.state("phoenix")).toMatchObject({ combatRole: "attacker", might: 5 }); // Assault 2 live
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "row" } });
  await game.p2.yes();
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    await game.p2.pick("lookout");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P2, targets: ["lookout"], triggered: true })]);
  return game;
}

describe("Ruling 99a4fcd6d017aa17 — Phoenix keeps Assault (5) after Reaver's Row empties the defence; Gust never reaches it", () => {
  test("while the Row's trigger is on the chain Phoenix is already a 5-Might attacker: in P2's priority window Gust does NOT list Phoenix (only the 2-Might Lookout) and a forced Gust at Phoenix is rejected", async () => {
    const game = await attackRowTriggerPending();
    // Walk to P2's priority window on this chain.
    for (let i = 0; i < 3 && game.decision()?.seat !== P2; i++) {
      await game.acting().passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state("phoenix")).toMatchObject({ combatRole: "attacker", might: 5 });
    expect(gustTargets(game)).toContain("lookout");
    expect(gustTargets(game)).not.toContain("phoenix");
    const r = await game.p2.try((p) => p.cast("gust", { targets: "phoenix" }));
    expect(r.ok).toBe(false);
  });

  test("the trigger resolves: the Lookout goes to P2's base and loses 'defender' — Phoenix RETAINS 'attacker' and stays 5; the combat has not ended (showdown still open, nothing scored yet)", async () => {
    const game = await attackRowTriggerPending();
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("lookout")).toBe("base");
    expect(game.state("lookout").combatRole).toBe(null);
    expect(game.state("phoenix")).toMatchObject({ combatRole: "attacker", might: 5, zone: "battlefield-row" });
    expect(showdown(game)?.active).toBe(true);
    expect(game.gameState.battlefields.row?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("in the showdown that follows, whenever P2 may act Gust STILL can't target Phoenix (5 > 3); passing it out, Phoenix conquers the Row and only then reverts to 3", async () => {
    const game = await attackRowTriggerPending();
    let p2Windows = 0;
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action" && d.seat === P2) {
        p2Windows += 1;
        expect(game.state("phoenix").might).toBe(5);
        expect(gustTargets(game)).not.toContain("phoenix");
      }
      if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(p2Windows).toBeGreaterThan(0);
    await game.settle();
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("phoenix")).toMatchObject({ combatRole: null, might: 3, zone: "battlefield-row" }); // combat over → Assault off
    expect(game.zoneOf("gust")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });
});
