/**
 * Ruling 4666b47ea6999771 — Draven, Vanquisher (SFD-020 → sfd-020-221) · 4 Might
 *   "When I attack or defend, you may pay [fury]. If you do, give me +2 [Might] this turn."
 *
 * Q: Two Draven, Vanquishers fight. Who decides whether to pay the [fury] first — attacker or defender?
 * A: The DEFENDER. When combat begins the attacker's trigger goes on the Chain first and the defender's
 *    on top of it, so the defender's resolves first (LIFO) — and the [fury] is paid as the ability
 *    RESOLVES, not when it is put on the Chain.
 * Rules: 442.1.b.1 (attacker's combat triggers first, defender's after), 339 (Chain resolves LIFO),
 *        205 / 444.2 (a "pay … if you do" is a game action performed during resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DRAVEN_VANQUISHER = "sfd-020-221";

/** P1 attacks P2's battlefield; both sides field a Draven, Vanquisher and hold [fury]. */
function board() {
  return scenario()
    .resources(P1, { power: { fury: 2 } })
    .resources(P2, { power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", DRAVEN_VANQUISHER, "atk")
    .unit(P2, "bf1", DRAVEN_VANQUISHER, "def");
}

const chainIds = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) =>
  game.chain().map((c) => c.cardId);

describe("Ruling 4666b47ea6999771 — the defender's Draven trigger resolves (and pays) before the attacker's", () => {
  test("step by step: attacker's trigger is placed first, defender's on top; both pay at RESOLUTION, defender first", async () => {
    const game = await board().build();
    await game.p1.move("atk", "bf1");

    // 1. Both triggers sit on the Chain, attacker at the bottom (placed first), defender on top.
    expect(chainIds(game)).toEqual(["atk", "def"]);

    // 2. Finalization only asks whether to USE the ability; the prompt itself defers the payment.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    expect(game.decision()?.prompt).toContain("as it resolves");
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, timing: "FIN" });
    await game.p2.yes();
    // Nothing has been paid and nobody is bigger yet.
    expect(game.p1.power("fury")).toBe(2);
    expect(game.p2.power("fury")).toBe(2);
    expect(game.state("atk").might).toBe(4);
    expect(game.state("def").might).toBe(4);

    // 3. Priority passes, then the TOP item — the defender's — resolves and asks THEM to pay.
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, timing: "RES" });
    expect(game.decision()?.prompt).toContain("Pay");
    await game.p2.yes();

    // Defender is already +2 while the attacker's trigger is STILL waiting on the Chain.
    expect(game.p2.power("fury")).toBe(1);
    expect(game.state("def").might).toBe(6);
    expect(game.state("atk").might).toBe(4);
    expect(chainIds(game)).toEqual(["atk"]);

    // 4. Only now is the attacker asked.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "RES" });
    await game.p1.yes();
    expect(game.p1.power("fury")).toBe(1);
    expect(game.state("atk").might).toBe(6);
    expect(game.violations()).toEqual([]);
  });

  test("the defender can see nothing of the attacker's choice — declining first still leaves the attacker free to pay", async () => {
    const game = await board().build();
    await game.p1.move("atk", "bf1");
    await game.p1.yes();
    await game.p2.yes();
    await game.p2.passPriority();
    await game.p1.passPriority();

    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, timing: "RES" });
    await game.p2.no(); // defender declines the [fury]
    expect(game.p2.power("fury")).toBe(2);
    expect(game.state("def").might).toBe(4);

    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.yes(); // attacker, deciding afterwards, pays
    expect(game.p1.power("fury")).toBe(1);
    expect(game.state("atk").might).toBe(6);
    expect(game.state("def").might).toBe(4);
  });

  test("declining the finalization offer costs nothing and never asks for [fury] at all", async () => {
    const game = await board().build();
    await game.p1.move("atk", "bf1");
    await game.p1.no();
    await game.p2.no();
    expect(chainIds(game)).toEqual([]);
    expect(game.p1.power("fury")).toBe(2);
    expect(game.p2.power("fury")).toBe(2);
    expect(game.state("atk").might).toBe(4);
    expect(game.state("def").might).toBe(4);
  });
});
