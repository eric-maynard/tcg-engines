/**
 * Ruling d41ee10ba234ff65 — Guardian Angel (sfd-051-221) × Lonely Poro (sfd-036-221) (Zhonya's ogn-077-298 cited as analogous)
 *   Guardian Angel — Equipment · +1 Might: "If I would die, kill Guardian Angel instead. Heal me, exhaust me, and recall me."
 *   Lonely Poro — Unit · 2 Might: "[Deathknell] — If I died alone, draw 1."
 *
 * Q: Does Guardian Angel prevent Lonely Poro from drawing?
 * A: Yes. Guardian Angel REPLACES the death: the Poro is healed and recalled instead of being killed, so it never dies /
 *    never goes to the trash — the Deathknell condition is not met and no card is drawn.
 * Rules: 369.1 / 370 (replacement effect), 808.1.d.1 (Deathknell = killed and put into the trash).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUARDIAN_ANGEL = "sfd-051-221";
const LONELY_PORO = "sfd-036-221";
/** Inline P2 spell: deal 3 to a unit (lethal for the 3-Might equipped Poro). */
const BOLT = { abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 1, name: "Test Bolt", timing: "action" } as const;

/** P2's turn 3. P1's Lonely Poro sits ALONE at P1's bf1 (wearing Guardian Angel when `withGA`); P2 has Bolt + [1] and an 8-Might Bruiser. */
function board(withGA: boolean) {
  const s = scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P2, "base", { might: 8, name: "Bruiser" }, "bruiser")
    .hand(P2, BOLT, "bolt")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
  return withGA
    ? s.unit(P1, "bf1", LONELY_PORO, "poro", { equippedWith: ["ga"] }).card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "poro" }, owner: P1, zone: "bf1" })
    : s.unit(P1, "bf1", LONELY_PORO, "poro");
}

describe("Ruling d41ee10ba234ff65 — Guardian Angel's save means Lonely Poro never died: no Deathknell draw", () => {
  test("control (no Guardian Angel): Bolt kills the lone Poro → Deathknell 'died alone' → P1 draws 1", async () => {
    const game = await board(false).build();
    const hand = game.p1.hand().length;
    await game.p2.cast("bolt", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.p1.hand()).toContain("d1");
  });

  test("with Guardian Angel: the lethal Bolt's death is REPLACED — GA is killed instead, the Poro is healed, exhausted and recalled to base (never in the trash)…", async () => {
    const game = await board(true).build();
    expect(game.state("poro")).toMatchObject({ attachments: ["ga"], might: 3 });
    await game.p2.cast("bolt", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.state("poro")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 2 });
    expect(game.p1.trash()).toEqual(["ga"]); // the Poro was never put there
  });

  test("…so its Deathknell never triggers: no trigger on the chain at any point, P1 draws NOTHING (hand and deck unchanged)", async () => {
    const game = await board(true).build();
    const hand = game.p1.hand().length;
    await game.p2.cast("bolt", { targets: "poro" });
    let poroTrigger = false;
    for (let i = 0; i < 10; i++) {
      if (game.chain().some((c) => c.cardId === "poro" && c.triggered)) {
        poroTrigger = true;
      }
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(poroTrigger).toBe(false);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.p1.deck().slice(0, 2)).toEqual(["d1", "d2"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("same in combat: the Bruiser's lethal combat damage is replaced by GA — Poro recalled alive, bf1 conquered by P2, and still no Deathknell draw", async () => {
    const game = await board(true).build();
    const hand = game.p1.hand().length;
    await game.p2.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.state("poro").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.violations()).toEqual([]);
  });
});
