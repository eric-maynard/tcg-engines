/**
 * Ruling 8d9a0446387025e1 — (no specific card) who orders several replacement effects on one event.
 *   Stand-in: two copies of Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · "If a friendly unit would
 *   die, kill this instead. Heal that unit, exhaust it, and recall it." — both replace the same death.
 *
 * Q: What is the priority order when several replacement effects apply during resolution?
 * A: The owner of the object the event acts on chooses the order they apply in (368; for an event on a
 *    player, that player chooses). The choice is a real one and it is made by that player, not by whoever
 *    controls the replacements or by the game.
 * Rules: 368 / 368.1 (replacement effects; the affected object's owner orders them), 365 / 366 ("instead"
 *        effects intercede in the execution of a game effect), 154.3 (finish a resolution before its
 *        consequences).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";

/** P1's turn. P1's 2-Might Doomed walks into P2's 5-Might Guard; P1 owns BOTH Hourglasses. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 2, name: "Doomed" }, "doomed")
    .gear(P1, ZHONYAS, "zh1")
    .gear(P1, ZHONYAS, "zh2");
}

/** Attack, pass Focus twice, and stop on the replacement-ordering prompt. */
async function atTheDeath(): Promise<Game> {
  const game = await board().interactive().build();
  await game.p1.move("doomed", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  return game;
}

describe("Ruling 8d9a0446387025e1 — the owner of the dying object orders the replacements that apply to it", () => {
  test("two replacements apply to one death → the OWNER of that unit (P1) is asked to order them, and both are listed", async () => {
    const game = await atTheDeath();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "RPL" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["zh1", "zh2"]);
    expect(d?.source?.cardId).toBe("doomed"); // the object the event acts on
    expect(d?.prompt.toLowerCase()).toContain("order");
    // nothing has been applied yet: both Hourglasses are still in play and the unit is still on the board
    expect(game.zoneOf("zh1")).toBe("base");
    expect(game.zoneOf("zh2")).toBe("base");
  });

  test("answering 'zh1 first' spends the FIRST Hourglass and saves the unit; the second is untouched", async () => {
    const game = await atTheDeath();
    await game.p1.pick("zh1");
    await game.settle();
    expect(game.zoneOf("zh1")).toBe("trash"); // killed instead of the unit
    expect(game.zoneOf("zh2")).toBe("base"); // never needed
    expect(game.zoneOf("doomed")).toBe("base"); // healed, exhausted and recalled
    expect(game.state("doomed")).toMatchObject({ damage: 0, isExhausted: true });
  });

  test("answering 'zh2 first' spends the OTHER one — the order the owner picks is what decides which effect intercedes", async () => {
    const game = await atTheDeath();
    await game.p1.pick("zh2");
    await game.settle();
    expect(game.zoneOf("zh2")).toBe("trash");
    expect(game.zoneOf("zh1")).toBe("base");
    expect(game.zoneOf("doomed")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("with only one replacement there is nothing to order — no ordering prompt is raised at all", async () => {
    const game = await scenario()
      .interactive()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 2, name: "Doomed" }, "doomed")
      .gear(P1, ZHONYAS, "zh1")
      .build();
    await game.p1.move("doomed", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.decision()?.timing).not.toBe("RPL");
    await game.settle();
    expect(game.zoneOf("zh1")).toBe("trash");
    expect(game.zoneOf("doomed")).toBe("base");
  });
});
