/**
 * Interaction: Kog'Maw, Caustic (ogn-190-298) "[Deathknell] — Deal 4 to all units at my battlefield."
 *   × Unyielding Spirit (ogn-145-298) "[Reaction] Prevent all spell and ability damage this turn."
 *
 * Question: it is P1's turn, P1's Kog'Maw has just died and its Deathknell is on the chain. P2 — the
 * NON-turn player — wants the Reaction but has an empty pool and unexhausted runes.
 *  (a) May P2 tap a rune right now?
 *  (b) Are "Not your turn" or "Can't exhaust runes during {phase} phase" ever the right refusal here?
 *  (c) What actually blocks a NON-Reaction card in P2's hand at this moment?
 *  (d) Does any of it change when the chain is open during the ENDING phase instead?
 *
 * Rules:
 *  - 429.3 / 429.3.a — Add abilities with the Reaction tag may be activated at any time spells or
 *    abilities require resources to be paid, and they finalize and resolve immediately. The rule
 *    names no phase and no turn owner, so a phase- or turn-based refusal is never the right answer.
 *  - 357.1.a — during the pay-costs step the controller may use Reaction Adds.
 *  - 429.4 / 429.4.a — Adding is a Limited Action: players Add only when directed to.
 *  - 159.2.b.2 / 358.4 / 813 — [Reaction] may be played in a Closed State; a card without it may not.
 *  - 309.2 / 310.1.a — a chain existing IS the Closed State; the default permission (own turn,
 *    Neutral Open) is what [Reaction] overrides.
 *  - 323.4 / 323.5 — the Deathknell triggers in Cleanup step 3a and the unit is trashed in 3b.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KOGMAW = "ogn-190-298"; // 1 Might champion, [Deathknell] deal 4 at my battlefield
const UNYIELDING_SPIRIT = "ogn-145-298"; // [Reaction] · 1 + [body] · prevent all spell/ability damage
const HEXTECH_RAY = "ogn-009-298"; // [Action] · 1 + [fury] · deal 3 to a unit at a battlefield
const CLEAVE = "ogn-004-298"; // [Action] · 1 · a NON-Reaction card for P2's hand
const DAZZLING_AURORA = "ogn-160-298"; // gear · "At the end of your turn, …" — opens an ending-phase chain

function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", KOGMAW, "kog")
    .unit(P1, "bf1", { might: 4, name: "Buddy" }, "buddy")
    .runes(P2, "body", 2)
    .hand(P2, UNYIELDING_SPIRIT, "spirit")
    .hand(P2, CLEAVE, "cleave")
    .hand(P1, HEXTECH_RAY, "ray");
}

/** P1 rays its own Kog'Maw; stop with the Deathknell on the chain and P2 holding priority. */
async function deathknellPending(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) {
  await game.p1.cast("ray", { targets: "kog" });
  await game.p1.passPriority();
  await game.p2.passPriority(); // the Ray resolves; 323.4/323.5 kill Kog'Maw and queue its Deathknell
  await game.p1.passPriority(); // the turn player passes on the Deathknell
  expect(game.zoneOf("kog")).toBe("trash");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", controller: P1, triggered: true })]);
  expect(game.actingSeat()).toBe(P2);
}

describe("Kog'Maw Deathknell × Unyielding Spirit — Adding runes on the enemy's chain", () => {
  test("(a) YES: the non-turn player may Add while the enemy chain is open — tap and recycle are both on P2's menu", async () => {
    const game = await board().build();
    await deathknellPending(game);
    // DESIGN: paying is manual (DESIGN.md "Paying costs" — a deliberate deviation from 357.1.a /
    // 429.4.a's "only when Game Effects direct them"): a seat with priority may Add first and play
    // second, rather than the engine crediting ready runes at play time. The rules answer to (a) —
    // "yes, P2 may tap that rune now" (429.3) — is what the engine delivers either way.
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.can("tapRune")).toBe(true);
    const keys = game.p2.legal().map((o) => o.key);
    expect(keys).toContain("exhaustRune:k1");
    expect(keys).toContain("recycleRune:k1");
    await game.p2.tapRune("k1");
    await game.p2.recycleRune("k2", "body");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { body: 1 } });
    expect(game.violations()).toEqual([]);
  });

  test("(a) the paid-for [Reaction] goes on TOP of the Deathknell, resolves first, and prevents all 4 of its damage", async () => {
    const game = await board().build();
    await deathknellPending(game);
    await game.p2.tapRune("k1");
    await game.p2.recycleRune("k2", "body");
    await game.p2.cast("spirit");
    // 813 / 159.2.b.2 — a [Reaction] is legal in the Closed State and lands above the trigger.
    expect(game.chain().map((i) => i.cardId)).toEqual(["kog", "spirit"]);
    await game.settle();
    expect(game.zoneOf("buddy")).toBe("battlefield-bf1");
    expect(game.state("buddy").damage).toBe(0); // "prevent ALL spell and ability damage this turn"
    expect(game.zoneOf("spirit")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(a) control: without the Reaction the Deathknell's 4 damage lands and kills the 4-Might unit", async () => {
    const game = await board().build();
    await deathknellPending(game);
    await game.p2.passPriority();
    await game.settle();
    expect(game.zoneOf("buddy")).toBe("trash");
  });

  test("(b) 'Not your turn' is a lie: it is emphatically NOT P2's turn and the tap is legal anyway (429.3)", async () => {
    const game = await board().build();
    await deathknellPending(game);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.isTurnPlayer()).toBe(false);
    expect(game.p2.can("tapRune")).toBe(true);
  });

  test("(b) the only legitimate rune refusal here is 'already exhausted' — a spent rune is simply not on the menu", async () => {
    const game = await board().rune(P2, "body", { alias: "spent", exhausted: true }).build();
    await deathknellPending(game);
    expect(game.state("spent").isExhausted).toBe(true);
    expect(game.p2.legal().map((o) => o.key)).not.toContain("exhaustRune:spent");
    expect(game.p2.runes({ ready: true })).not.toContain("spent");
    expect(await game.p2.try((p) => p.tapRune("spent"))).toMatchObject({ ok: false });
    expect(game.p2.can("tapRune")).toBe(true); // the ready ones are still fine
  });

  test("(c) what blocks a NON-Reaction card is the chain permission, not whose turn it is — the [Reaction] in the same hand IS playable", async () => {
    const game = await board().build();
    await deathknellPending(game);
    await game.p2.tapRune("k1");
    await game.p2.recycleRune("k2", "body");
    // Same seat, same instant, same pool: the discriminator is the printed [Reaction] tag
    // (358.4 / 159.2.b.2), so a "Not your turn" message would be describing the wrong rule.
    expect(game.p2.can("cast", "spirit")).toBe(true);
    expect(game.p2.can("cast", "cleave")).toBe(false);
    const refused = await game.p2.try((p) => p.cast("cleave"));
    expect(refused.ok).toBe(false);
    expect(game.zoneOf("cleave")).toBe("hand"); // refused, not half-played
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog" })]);
  });

  test("(d) the ENDING phase behaves identically — 429.3 names no phase", async () => {
    const game = await board().gear(P1, DAZZLING_AURORA, "aurora").build();
    await game.p1.endTurn();
    // An "at the end of your turn" trigger closes the state during the Ending Phase.
    expect(game.phase()).toBe("ending");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);

    expect(game.p2.can("tapRune")).toBe(true); // no phase-based refusal exists
    await game.p2.tapRune("k1");
    await game.p2.recycleRune("k2", "body");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { body: 1 } });
    expect(game.p2.can("cast", "spirit")).toBe(true); // [Reaction] in a Closed State, any phase
    expect(game.p2.can("cast", "cleave")).toBe(false); // still the chain permission, not the phase
    expect(game.violations()).toEqual([]);
  });
});
