/**
 * Ruling 2b7458ab2218e6b9 — Deathgrip (SFD-163 → sfd-163-221) · Reaction · [2][order]
 *   "Kill a friendly unit. If you do, give +[Might] equal to its Might to another friendly unit this
 *    turn. Draw 1."
 *
 * Q: Can I play Deathgrip without two friendly units?
 * A: No. The spell names two friendly units — the victim and the recipient of the Might — so both
 *    must exist for it to be played; with a single friendly unit on the board it is not a legal play.
 *   Nuance: if the recipient leaves the board before resolution the kill still happens and the
 *   unlinked "Draw 1" still happens; only the Might bonus is lost.
 * Rules: 355.8 / 358.1 (a spell needs a legal set of chosen objects), 355.10 (objects chosen as the
 *        spell resolves are not play-time targets), 359.3.e.5 / .14.b ("If you do", unlinked draw).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEATHGRIP = "sfd-163-221";
const FILLER = "ogn-175-298";

/** P1's turn with exactly [2][order]; `allies` friendly units stand at P1's bf1 / base. */
function board(allies: number) {
  let s = scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P2, "base", { might: 4, name: "Enemy" }, "enemy") // an ENEMY unit is no help at all
    .deck(P1, [FILLER, FILLER], ["d1", "d2"])
    .hand(P1, DEATHGRIP, "grip");
  for (let i = 1; i < allies; i++) {
    s = s.unit(P1, "base", { might: 2, name: `Ally ${i}` }, `ally${i}`);
  }
  return s;
}

describe("Ruling 2b7458ab2218e6b9 — Deathgrip needs two friendly units", () => {
  test("with two friendly units it is a legal play and only the VICTIM is named at play time", async () => {
    const game = await board(2).build();
    expect(game.p1.can("cast", "grip")).toBe(true);
    const targets = (game.p1.option("cast", "grip")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets.toSorted()).toEqual(["ally1", "victim"]);
  });

  test("it resolves as the ruling describes: the victim dies, a DIFFERENT friendly unit gets +3, and P1 draws 1", async () => {
    const game = await board(2).build();
    const hand0 = game.p1.hand().length;
    await game.p1.cast("grip", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("ally1")).toMatchObject({ might: 5, mightModifier: 3 });
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
    expect(game.zoneOf("grip")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 2b7458ab2218e6b9 says both units are "locked as targets when the
  // spell is placed on the chain"; CR 355.10 makes an object chosen while the spell RESOLVES not a
  // play-time target, and this card's recipient is exactly that ("give … to another friendly unit"
  // is an instruction, not a targeting clause) — engine follows CR and asks for the recipient on
  // resolution.
  test("the recipient is chosen when Deathgrip resolves, not when it is played", async () => {
    const game = await board(3).build();
    await game.p1.cast("grip", { targets: "victim" });
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["ally1", "ally2"]);
    await game.p1.pick("ally2");
    await game.settle();
    expect(game.state("ally2").might).toBe(5);
    expect(game.state("ally1")).toMatchObject({ might: 2, mightModifier: 0 });
  });

  // Expected (355.8 / 358.1): with only one friendly unit there is no legal "another friendly unit",
  // so Deathgrip cannot be played at all.
  // Actual: the engine only checks the victim at play time (the recipient is a resolution-time
  // choice), so the cast is offered and goes through, killing the lone ally for nothing but a card.
  test.failing(
    "BUG: ruling 2b7458ab2218e6b9 — with a single friendly unit Deathgrip is still castable (engine checks only the victim at play time)",
    async () => {
      const game = await board(1).build();
      expect(game.p1.units().length + game.p1.units("bf1").length).toBeGreaterThan(0);
      expect(game.p1.can("cast", "grip")).toBe(false);
    },
  );

  test("what the engine does instead with a single friendly unit: the victim dies, nobody is asked for a recipient, and the unlinked Draw 1 still happens", async () => {
    const game = await board(1).build();
    const hand0 = game.p1.hand().length;
    await game.p1.cast("grip", { targets: "victim" });
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("enemy")).toMatchObject({ might: 4, mightModifier: 0 }); // never a candidate
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
    expect(game.violations()).toEqual([]);
  });
});
