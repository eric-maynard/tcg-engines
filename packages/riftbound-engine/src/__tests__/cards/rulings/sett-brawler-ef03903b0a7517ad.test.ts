/**
 * Ruling ef03903b0a7517ad — Sett, Brawler (OGN-164 → ogn-164-298) · [5][body] 4 [Might]
 *   "When I'm played and when I conquer, buff me.
 *    Spend my buff: Give me +4 [Might] this turn."
 *
 * Q: Can I activate Sett's "Spend my buff" ability while he is DEFENDING?
 * A: No. The ability carries neither [Action] nor [Reaction], so it is a plain activated ability: your turn,
 *    Open state, no showdown. Defending happens on the opponent's turn inside a showdown, so it is unavailable —
 *    the buff has to wait for your own turn.
 * Rules: 145.2 (activated abilities: your Main Phase, Open state), 310 (Open/Closed), RiftJudge FAQ #8278.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SETT = "ogn-164-298";

/** P2's turn. Sett (already buffed) holds P1's bf1; P2 walks a Raider in so Sett becomes a DEFENDER. */
function defending() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SETT, "sett", { buffed: true })
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider");
}

/** P1's own turn, Open state, Sett buffed and standing at bf1 unopposed. */
function ownTurn() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SETT, "sett", { buffed: true });
}

describe("Ruling ef03903b0a7517ad — Sett's 'Spend my buff' is a plain activated ability: never while defending", () => {
  test("premise: on P1's own turn in an Open state the buffed Sett CAN spend his buff for +4 Might", async () => {
    const game = await ownTurn().build();
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 }); // 4 printed + the +1 buff
    expect(game.p1.can("activate", "sett")).toBe(true);
    await game.p1.activate("sett");
    await game.settle();
    expect(game.state("sett").might).toBe(8); // 4 printed + 4 this turn (buff spent)
    expect(game.state("sett").isBuffed).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("as a DEFENDER inside a showdown the ability is not on P1's menu and a forced activation is rejected", async () => {
    const game = await defending().build();
    await game.p2.move("raider", "bf1");
    expect(game.state("sett").combatRole).toBe("defender");
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.p1.can("activate", "sett")).toBe(false);
    const r = await game.p1.try((p) => p.activate("sett"));
    expect(r.ok).toBe(false);
    expect(game.state("sett").isBuffed).toBe(true); // the buff was not spent
    expect(game.state("sett").might).toBe(5);
  });

  test("nor after passing Focus — the whole showdown is off-limits, and Sett fights at 5, not 9", async () => {
    const game = await defending().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("activate", "sett")).toBe(false);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.state("sett").isBuffed).toBe(true); // still unspent after combat
    expect(game.violations()).toEqual([]);
  });

  test("on P1's own turn but with a chain open (Closed state) it is likewise unavailable", async () => {
    const game = await ownTurn()
      .resources(P1, { energy: 1 })
      .hand(P1, { abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }], cardType: "spell", domain: "body", energyCost: 1, name: "Study" }, "study")
      .build();
    await game.p1.cast("study");
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("activate", "sett")).toBe(false);
    await game.settle();
    expect(game.p1.can("activate", "sett")).toBe(true); // Open again
  });
});
