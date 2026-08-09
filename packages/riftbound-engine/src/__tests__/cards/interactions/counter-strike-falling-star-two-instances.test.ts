/**
 * Interaction: Counter Strike (sfd-194-221, Reaction, 2+[C]) "Choose a unit. The next time that unit
 *   would be dealt damage this turn, prevent it. Draw 1."
 *   × Falling Star (ogn-029-298, 2+[fury][fury]) "Deal 3 to a unit. Deal 3 to a unit."
 *   × Void Gate (ogn-296-298, battlefield) "Spells and abilities deal 1 Bonus Damage to units here.
 *   (Each instance of damage the spell deals to a unit here is increased by 1.)"
 *   on Vanguard Sergeant (ogn-219-298, vanilla 4 Might).
 *
 * Question: P2's Sergeant sits at Void Gate. P1 plays Falling Star choosing the Sergeant for BOTH
 * instances; P2 responds with Counter Strike on the Sergeant. Does Counter Strike eat both hits or
 * only the first? Does it swallow the Void Gate bonus on that first hit? Does the Sergeant die?
 *   Contrast (i): same play at a plain battlefield — Sergeant lives with 3 damage.
 *   Contrast (ii): instead of a spell, two attackers (3 + 2 Might) deal combat damage to the
 *   Counter-Struck Sergeant — is simultaneous combat damage one "time" (all 5 prevented)?
 *
 * Rules: 437.1.a.1 / 715.4.a (Prevent counts Bonus Damage in what it prevents), 437.1.b.2 (always the
 * NEXT damage), 437.4 (fully prevented damage was never dealt), 715.1 / 715.2 (Bonus Damage applies
 * per Deal instance / per target separately), 465.2.c.1.a + 465.2.d (assigned combat damage is dealt
 * simultaneously — one event), 465.2.c.10 (a Counter-Struck unit can still be dealt damage, so it is
 * NOT exempt from mandatory lethal assignment).
 *
 * Expected: Counter Strike resolves first (LIFO): P2 draws 1, a one-shot prevent sits on the
 * Sergeant. Falling Star = two Deal instances, each 3+1 = 4 at Void Gate. Instance #1: all 4
 * prevented (bonus included), shield spent. Instance #2: 4 dealt = Might 4 → Sergeant dies.
 * (i) Off the Gate: 0 then 3 → survives with 3. (ii) Combat: the 3+2 = 5 arrives as ONE simultaneous
 * event → all prevented; Sergeant takes 0 and deals its 4 back (3 lethal to the 3-Might attacker,
 * 1 to the 2-Might one, who is recalled and healed); bf1 stays P2's.
 */
import { describe, expect, test } from "bun:test";
import type { DistributeDecision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const COUNTER_STRIKE = "sfd-194-221";
const FALLING_STAR = "ogn-029-298";
const VOID_GATE = "ogn-296-298";
const SERGEANT = "ogn-219-298"; // Vanguard Sergeant — vanilla 4 Might

/** Flatten the `targets` field of a seat's cast option into the distinct tuples offered. */
function targetTuples(game: Game, seat: "p1" | "p2", alias: string): string[][] {
  const field = game[seat].option("cast", alias)?.fields.find((f) => f.name === "targets");
  return (field?.options ?? []).map((v) => (Array.isArray(v) ? [...v] : [v]) as string[]);
}

/**
 * P1's open turn. bf1 is either a LIVE Void Gate (P2's) or an inert plain battlefield, held by P2's
 * Sergeant. P1: Falling Star + exactly 2 energy / 2 fury; a 5-Might bystander in base so "a unit" is
 * a real choice. P2: Counter Strike + exactly 2 energy / 1 calm.
 */
function board(opts: { atGate: boolean }) {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", opts.atGate ? { controller: P2, def: VOID_GATE, inert: false, owner: P2 } : { controller: P2 })
    .unit(P2, "bf1", SERGEANT, "sarge")
    .unit(P1, "base", { might: 5, name: "Bystander" }, "buddy")
    .hand(P1, FALLING_STAR, "fs")
    .hand(P2, COUNTER_STRIKE, "cs");
}

/** P1 casts Falling Star (Sergeant ×2) and passes; P2 responds with Counter Strike on the Sergeant. */
async function starThenCounter(game: Game): Promise<void> {
  await game.p1.cast("fs", { targets: ["sarge", "sarge"] });
  expect(game.p2.can("cast", "cs")).toBe(false); // 312.2: P1 still holds priority over its own spell
  await game.p1.passPriority();
  expect(game.p2.can("cast", "cs")).toBe(true); // Reaction, Closed state, P2 has priority
  await game.p2.cast("cs", { targets: "sarge" });
}

describe("Counter Strike × Falling Star (same unit twice) × Void Gate", () => {
  test("Falling Star offers the Sergeant for BOTH instances — [sarge, sarge] is a legal tuple ('a unit' / 'a unit', no 'another')", async () => {
    const game = await board({ atGate: true }).build();
    const tuples = targetTuples(game, "p1", "fs");
    expect(tuples).toContainEqual(["sarge", "sarge"]);
    expect(tuples).toContainEqual(["buddy", "sarge"]);
    await game.p1.cast("fs", { targets: ["sarge", "sarge"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fs", controller: P1, targets: ["sarge", "sarge"], triggered: false })]);
  });

  test("LIFO: Counter Strike sits above Falling Star and resolves first — P2 draws 1, the one-shot prevent is tracked on the Sergeant, Falling Star still waiting, no damage yet", async () => {
    const game = await board({ atGate: true }).build();
    await starThenCounter(game);
    expect(game.chain().map((c) => c.name)).toEqual(["Falling Star", "Counter Strike"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    const p2Hand = game.p2.hand().length; // Counter Strike already left the hand
    const p2Deck = game.p2.deck().length;
    await game.p2.passPriority();
    await game.p1.passPriority(); // Counter Strike (only) resolves
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p2.deck()).toHaveLength(p2Deck - 1);
    expect(game.state("sarge").meta.preventNextDamageInstance).toBe(true);
    expect(game.state("sarge").damage).toBe(0);
    expect(game.chain().map((c) => c.name)).toEqual(["Falling Star"]);
  });

  test("AT VOID GATE: instance #1 (3+1 = 4, bonus included — 437.1.a.1 / 715.4.a) is wholly prevented and spends the shield; instance #2 deals 3+1 = 4 = Might → the Sergeant DIES", async () => {
    const game = await board({ atGate: true }).build();
    await starThenCounter(game);
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.zoneOf("fs")).toBe("trash");
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.state("buddy").damage).toBe(0); // never chosen
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("AT VOID GATE, control (no Counter Strike): 4 + 4 = 8 on a 4-Might unit — dead after the first instance already; confirms each instance carries its own +1 (715.2)", async () => {
    const game = await board({ atGate: true }).build();
    await game.p1.cast("fs", { targets: ["sarge", "sarge"] });
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("trash");
    // Single instance at the Gate on a fresh board: buddy (base, not "here") takes a plain 3, the Sergeant HERE takes 3+1 = 4 and dies.
    const split = await board({ atGate: true }).build();
    await split.p1.cast("fs", { targets: ["buddy", "sarge"] });
    await split.settle();
    expect(split.state("buddy").damage).toBe(3);
    expect(split.zoneOf("sarge")).toBe("trash");
  });

  test("contrast (i) — PLAIN battlefield: instance #1 (3) prevented → 0 and not 'dealt' (437.4); instance #2 lands for 3 < 4 → the Sergeant SURVIVES with exactly 3 damage, shield consumed", async () => {
    const game = await board({ atGate: false }).build();
    await starThenCounter(game);
    await game.settle();
    expect(game.zoneOf("fs")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
    expect(game.state("sarge").damage).toBe(3);
    expect(game.state("sarge").meta.preventNextDamageInstance).toBeFalsy();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("contrast (i) control — plain battlefield, no Counter Strike: 3 + 3 = 6 ≥ 4 kills the Sergeant, so it is Counter Strike (not the missing Gate) that saves it above", async () => {
    const game = await board({ atGate: false }).build();
    await game.p1.cast("fs", { targets: ["sarge", "sarge"] });
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("trash");
  });

  describe("contrast (ii) — two attackers' COMBAT damage is one simultaneous event (465.2.c.1.a / 465.2.d)", () => {
    /** P1's turn; P2's Sergeant alone on a plain bf1; P1 has a 3-Might and a 2-Might raider in base; P2 holds Counter Strike. */
    function combatBoard() {
      return scenario()
        .resources(P2, { energy: 2, power: { body: 1 } })
        .battlefield("bf1", { controller: P2 })
        .unit(P2, "bf1", SERGEANT, "sarge")
        .unit(P1, "base", { might: 3, name: "Big Raider" }, "big")
        .unit(P1, "base", { might: 2, name: "Small Raider" }, "small")
        .hand(P2, COUNTER_STRIKE, "cs");
    }

    /** Both raiders attack bf1; P1 passes Focus; P2 Counter-Strikes the Sergeant and it resolves. Stops before combat damage. */
    async function attackAndShield(game: Game): Promise<void> {
      await game.p1.move(["big", "small"], "bf1");
      expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
      expect(game.p2.can("cast", "cs")).toBe(false); // attacker holds Focus first
      await game.p1.passFocus();
      expect(game.p2.can("cast", "cs")).toBe(true);
      await game.p2.cast("cs", { targets: "sarge" });
      await game.p2.passPriority();
      await game.p1.passPriority();
      expect(game.zoneOf("cs")).toBe("trash");
      expect(game.state("sarge").meta.preventNextDamageInstance).toBe(true);
    }

    test("the Counter-Struck Sergeant is still the (only, mandatory) assignment target — 465.2.c.10 names Counter Strike: it CAN be dealt damage, so it is not exempt; P2 in turn must assign its 4 with lethal-first buckets (3 to Big, then the rest)", async () => {
      const game = await combatBoard().build();
      await attackAndShield(game);
      // Pass focus around until combat damage is assigned; P1's 5 has a single legal recipient (forced), P2 is asked.
      let asked: DistributeDecision | undefined;
      for (let i = 0; i < 8; i++) {
        const d = game.decision();
        if (!d || (d.kind === "action" && d.context === "main")) {
          break;
        }
        if (d.kind === "distribute") {
          asked = d;
          break;
        }
        if (d.kind === "action") {
          await game.seat(d.seat).pass();
        } else {
          break;
        }
      }
      expect(asked).toBeDefined();
      expect(asked?.seat).toBe(P2);
      expect(asked?.total).toBe(4);
      expect(asked?.buckets.map((b) => ({ card: b.card, lethal: b.lethal }))).toEqual(
        expect.arrayContaining([
          { card: "big", lethal: 3 },
          { card: "small", lethal: 2 },
        ]),
      );
      expect(asked?.defaultAllocation).toEqual({ big: 3, small: 1 });
    });

    test("all 5 (3 + 2, dealt simultaneously) is 'the next time' → wholly prevented: Sergeant takes 0 and survives; its 4 kills Big (3 lethal first) and puts 1 on Small, who is recalled home and healed; bf1 stays P2's, nobody scores, shield spent", async () => {
      const game = await combatBoard().script(P2, [{ allocation: { big: 3, small: 1 }, kind: "distribute" }]).build();
      await attackAndShield(game);
      await game.settle();
      expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
      expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
      expect(game.state("sarge").damage).toBe(0);
      expect(game.state("sarge").meta.preventNextDamageInstance).toBeFalsy(); // one event, one use — consumed
      expect(game.zoneOf("big")).toBe("trash");
      expect(game.zoneOf("small")).toBe("base"); // attackers lost → survivors recalled
      expect(game.state("small").damage).toBe(0); // healed at combat cleanup
      expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
      expect(game.p1.points()).toBe(0);
      expect(game.p2.points()).toBe(0);
      expect(game.violations()).toEqual([]);
    });

    test("control — same attack WITHOUT Counter Strike: 3 + 2 = 5 ≥ 4 kills the Sergeant; Big dies to the 4, Small conquers bf1 for P1", async () => {
      const game = await combatBoard().script(P2, [{ allocation: { big: 3, small: 1 }, kind: "distribute" }]).build();
      await game.p1.move(["big", "small"], "bf1");
      await game.settle();
      expect(game.zoneOf("sarge")).toBe("trash");
      expect(game.zoneOf("big")).toBe("trash");
      expect(game.locationOf("small")).toBe("bf1");
      expect(game.state("small").damage).toBe(0);
      expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
      expect(game.p1.points()).toBe(1);
    });
  });
});
