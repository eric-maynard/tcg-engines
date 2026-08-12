/**
 * Ruling eb10a65828c4bbfd — Leona, Determined (OGN-238 → ogn-238-298) · 4 Might · 4 + [order]
 *   "[Shield] (+1 [Might] while I'm a defender.)
 *    When I attack, stun an enemy unit here. (It doesn't deal combat damage this turn.)"
 *
 * Q: When Leona enters a battlefield with an enemy, does that enemy deal no damage — is that all?
 * A: Yes, essentially. Her attack trigger goes on the chain and stuns one enemy unit THERE; a stunned
 *    unit contributes no Might in the combat damage step, so it deals 0 to Leona. The stun does not
 *    kill it — it still needs damage ≥ its full Might to die — and if the defender survives, Leona
 *    (having failed to conquer) is recalled to base. Stunned status ends in the end-of-turn cleanup.
 * Rules: 423.1.b (stunned units contribute no Might in the combat damage step), 423.1.c (still needs
 *        full Might in damage to die), 423.1.a.2 (stun ends at step 3d), 466.4 (attacker recalled).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LEONA = "ogn-238-298";

/** P1's Leona in base; P2 holds bf1 with a 7-Might Colossus, plus optional extra defenders. */
function board(opts: { footman?: boolean; stunnedTitan?: boolean } = {}) {
  let s = scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", LEONA, "leona")
    .unit(P2, "bf1", { might: 7, name: "Colossus" }, "colossus");
  if (opts.footman) {
    s = s.unit(P2, "bf1", { might: 7, name: "Footman" }, "footman");
  }
  if (opts.stunnedTitan) {
    s = s.unit(P2, "bf1", { might: 7, name: "Titan" }, "titan", { stunned: true });
  }
  return s;
}

/** Resolve chain items without touching the open showdown. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 12 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
}

describe("Ruling eb10a65828c4bbfd — Leona's attack trigger stuns one enemy here, and a stunned unit deals no combat damage", () => {
  test("the attack puts a TRIGGER on the chain, whose target Leona's controller picks among the enemies HERE; nothing is stunned until it resolves", async () => {
    const game = await board({ footman: true }).build();
    await game.p1.move("leona", "bf1");
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", timing: "FIN" });
    expect(d.options.map((o) => o.card).sort()).toEqual(["colossus", "footman"]);
    await game.p1.pick("colossus");
    expect(game.chain().map((c) => c.cardId)).toEqual(["leona"]);
    expect(game.state("colossus").isStunned).toBe(false); // not yet — the trigger is still on the chain
    await drainChain(game);
    expect(game.state("colossus").isStunned).toBe(true);
    expect(game.state("footman").isStunned).toBe(false); // only ONE enemy is stunned
  });

  test("the stunned defender deals 0 in the combat damage step — Leona takes no damage at all", async () => {
    const game = await board().build();
    await game.p1.move("leona", "bf1"); // sole enemy ⇒ the trigger's target is forced
    await drainChain(game);
    expect(game.state("colossus").isStunned).toBe(true);
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.state("leona").damage).toBe(0);
    expect(game.zoneOf("leona")).not.toBe("trash");
  });

  test("the stun does not kill: the 7-Might Colossus survives Leona's 4 and stays put, so Leona is recalled to base", async () => {
    const game = await board().build();
    await game.p1.move("leona", "bf1");
    await drainChain(game);
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.zoneOf("colossus")).toBe("battlefield-bf1");
    expect(game.locationOf("leona")).toBe("base");
    expect(game.gameState.battlefields.bf1).toMatchObject({ controller: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("stunned status lapses in the end-of-turn cleanup", async () => {
    const game = await board().build();
    await game.p1.move("leona", "bf1");
    await drainChain(game);
    expect(game.state("colossus").isStunned).toBe(true);
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    await game.advanceTurn();
    expect(game.state("colossus").isStunned).toBe(false);
  });

  // RULING-CONFLICT: riftjudge eb10a65828c4bbfd says an already-stunned unit cannot be chosen for
  // Leona's stun; CR 423.1.a.1 says the opposite in so many words ("They may choose a unit that's
  // already stunned, but if they do, [the stun-watcher] will not trigger") — engine follows CR.
  test("an already-stunned enemy IS still an offerable choice for the trigger (423.1.a.1) — it simply gains nothing", async () => {
    const game = await board({ stunnedTitan: true }).build();
    await game.p1.move("leona", "bf1");
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(d.options.map((o) => o.card).sort()).toEqual(["colossus", "titan"]);
    await game.p1.pick("titan");
    await drainChain(game);
    expect(game.state("titan").isStunned).toBe(true); // was and remains stunned
    expect(game.state("colossus").isStunned).toBe(false); // the un-stunned one was left alone
  });
});
