/**
 * Ruling 3033614648d458b6 — Void Rush (SFD-188 → sfd-188-221) · Spell · [2][rainbow] · "Reveal the top 2 cards of your Main
 *     Deck. You may banish one, then play it, reducing its cost by [2]. Draw any you didn't banish."
 *   × Blood Rush (SFD-003 → sfd-003-221) · Action · [1] · "[Repeat] [1] … Give a unit [Assault 2] this turn."
 *
 * Q: Does Void Rush's reduction account for a Repeat cost the way it does the base cost (e.g. Blood Rush)?
 * A: No. Void Rush reduces only the BASE cost of the card it plays (130.4). Repeat is an optional ADDITIONAL cost paid in
 *    the Pay Costs step (354.2 / 820); if you choose to repeat you still owe the full, separate Repeat cost — the
 *    reduction neither covers nor discounts it.
 * Rules: 130.4 (cost effects use base cost), 354.2 (pay costs incl. additional), 356 (additional costs), 820 (Repeat).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_RUSH = "sfd-188-221";
const BLOOD_RUSH = "sfd-003-221";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit — the other revealed card (drawn)

/**
 * P1's turn with `energy` + one [rainbow] (Void Rush costs [2][rainbow]). Two friendly units (so a repeat has a second
 * object). Deck top→: Blood Rush, Skulker.
 */
function board(energy: number) {
  return scenario()
    .resources(P1, { energy, power: { rainbow: 1 } })
    .unit(P1, "base", { might: 2, name: "Ally A" }, "allyA")
    .unit(P1, "base", { might: 2, name: "Ally B" }, "allyB")
    .hand(P1, VOID_RUSH, "vr")
    .deck(P1, [BLOOD_RUSH, SKULKER], ["br", "sk"]);
}

/** Cast Void Rush, let it resolve, and banish-and-play Blood Rush from the reveal. Returns with Blood Rush's play under way. */
async function rushIntoBloodRush(energy: number): Promise<Game> {
  const game = await board(energy).build();
  await game.p1.cast("vr");
  expect(game.p1.resources()).toEqual({ energy: energy - 2, power: { rainbow: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Void Rush resolves → reveal 2
  const d = game.decision();
  expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "from-revealed" });
  // Blood Rush ([1] − [2] → free) is always playable; the [3] Skulker only when [1] is left for it.
  expect((d as Extract<Decision, { kind: "pick" }>).options.map((o) => o.card)).toContain("br");
  await game.p1.pick("br");
  return game;
}

const assault = (game: Game, unit: string) => game.state(unit).grantedKeywords.filter((k) => k.keyword === "Assault");

describe("Ruling 3033614648d458b6 — Void Rush discounts only the base cost of the card it plays; Repeat is a separate, full-price additional cost", () => {
  test("base cost: Blood Rush ([1]) played off Void Rush costs [1] − [2] → nothing — P1's remaining energy is untouched; it resolves once (one unit gains Assault 2) and the un-banished Skulker is drawn", async () => {
    const game = await rushIntoBloodRush(3); // 1 energy left after Void Rush
    // rule 820.1.c.1 / 356.2.b — with [1] still in the pool the [Repeat] tier is
    // payable, so playing the spell offers it; this line is about the BASE cost,
    // so decline it.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "br" } });
    await game.p1.no();
    // Blood Rush's object is chosen as it is played.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("allyA");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "br", controller: P1, targets: ["allyA"] })]);
    expect(game.p1.energy()).toBe(1); // the reduced base cost was [0]
    await game.settle();
    expect(game.zoneOf("br")).toBe("trash");
    expect(game.zoneOf("sk")).toBe("hand"); // "Draw any you didn't banish"
    expect(assault(game, "allyA")).toEqual([{ duration: "turn", keyword: "Assault", value: 2 }]);
    expect(assault(game, "allyB")).toEqual([]);
    expect(game.p1.energy()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("with [0] left after Void Rush the leftover of the [2] discount does NOT pay for Repeat: no payable Repeat is offered and the effect happens exactly once", async () => {
    const game = await rushIntoBloodRush(2); // 0 energy left
    let repeatAccepted = false;
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && (d.context === "main" || d.passKey))) {
        break;
      }
      if (d.kind === "yes-no") {
        // An opt-in for the Repeat cost, if surfaced at all, must not be acceptable with 0 energy.
        expect(d.canAccept).toBe(false);
        await game.p1.no();
      } else if (d.kind === "integer") {
        expect(d.max).toBe(0);
        await game.p1.chooseX(0);
      } else if (d.kind === "pick") {
        await game.p1.pick(d.options[0]!.key);
      } else {
        repeatAccepted = true;
        break;
      }
    }
    expect(repeatAccepted).toBe(false);
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("br")).toBe("trash");
    const withAssault = ["allyA", "allyB"].filter((u) => assault(game, u).length > 0);
    expect(withAssault).toHaveLength(1); // executed once only
  });

  // Expected (820 / 354.2 / 820.2.a): while Blood Rush is being played off Void Rush with [2] still in P1's pool, P1 is
  // offered its optional Repeat additional cost at the FULL [1]; accepting charges exactly 1 (2 → 1) and EACH of the two
  // executions names its own object, so both allies end with Assault 2.
  // Actual: the Repeat offer and its [1] charge are correct, but an effect-driven play binds ONE target for the whole
  // item (`putPlayedSpellOnChain` → `bindPlayedSpellTarget` asks once, then wraps the effect in `_repeatExecutions`), so
  // only one target prompt is raised and BOTH executions hit allyA. The hand-cast path gets this right via
  // `independentTargets` because `cast` supplies 1+repeatN targets up front; the effect-driven path has no equivalent
  // per-execution slot walk (the `finalizePendingItems` multi-slot walk only runs for status="pending" items).
  test("ruling 3033614648d458b6 — Repeat's SECOND execution is never given its own target on a card played via Void Rush (820.2.a)", async () => {
    const game = await rushIntoBloodRush(4); // 2 energy left — enough for Repeat [1] but proves it is not free either
    let offered = false;
    // rule 820.2.a — each execution picks its own object; spend them on different allies.
    const picked: string[] = [];
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && (d.context === "main" || d.passKey))) {
        break;
      }
      if (d.kind === "yes-no" && d.seat === P1) {
        offered = true;
        expect(d.canAccept).not.toBe(false);
        await game.p1.yes();
      } else if (d.kind === "integer" && d.seat === P1) {
        offered = true;
        expect(d.max).toBeGreaterThanOrEqual(1);
        await game.p1.chooseX(1);
      } else if (d.kind === "pick") {
        // first execution → allyA, repeated execution → allyB
        const want = d.options.find((o) => !picked.includes(o.key)) ?? d.options[0]!;
        picked.push(want.key);
        await game.p1.pick(want.key);
      } else {
        break;
      }
    }
    expect(offered).toBe(true);
    expect(game.p1.energy()).toBe(1); // full Repeat [1] paid out of the 2 — not covered by Void Rush's discount
    await game.settle();
    expect(assault(game, "allyA")).toEqual([{ duration: "turn", keyword: "Assault", value: 2 }]);
    expect(assault(game, "allyB")).toEqual([{ duration: "turn", keyword: "Assault", value: 2 }]);
  });

  test("control: cast from HAND, Blood Rush's Repeat is an int field {0,1} on the cast and repeating costs [1] base + [1] Repeat = 2, hitting both units", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 2, name: "Ally A" }, "allyA")
      .unit(P1, "base", { might: 2, name: "Ally B" }, "allyB")
      .hand(P1, BLOOD_RUSH, "br")
      .build();
    const repeatField = game.p1.option("cast", "br")?.fields.find((f) => f.name === "repeatCount");
    expect(repeatField?.options).toEqual([1]);
    await game.p1.cast("br", { repeat: 1, targets: ["allyA", "allyB"] });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(assault(game, "allyA")).toHaveLength(1);
    expect(assault(game, "allyB")).toHaveLength(1);
  });
});
