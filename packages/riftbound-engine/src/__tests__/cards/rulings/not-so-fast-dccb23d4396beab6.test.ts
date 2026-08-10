/**
 * Ruling dccb23d4396beab6 — Not So Fast (SFD-045 → sfd-045-221) · [Reaction] · [2]+[calm]
 *     "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Mirror Image (UNL-200 → unl-200-219) · [3]+[rainbow][rainbow]
 *     "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that unit. Give it [Temporary]."
 *
 * Q: Can Not So Fast counter Mirror Image?
 * A: Yes — but only if the opponent chose one of YOUR units. Mirror Image is then an enemy spell choosing a unit friendly
 *    to you. If the opponent chose one of THEIR OWN units, Not So Fast has no legal object ("friendly"/"enemy" are relative
 *    to each card's controller). The spell's text need not literally say "friendly unit".
 * Rules: 106 (friendly/enemy are relative), 355.5 (chosen = targeted), 425.1 (countered ⇒ no effect).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const MIRROR_IMAGE = "unl-200-219";

/** P2's turn. P2: Mirror Image, [3]+2 rainbow, own Brute (5) in base. P1: Not So Fast, [2]+[calm], own Knight (4) in base. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { rainbow: 2 } })
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .unit(P2, "base", { might: 5, name: "Brute" }, "brute")
    .unit(P1, "base", { might: 4, name: "Knight" }, "knight")
    .hand(P2, MIRROR_IMAGE, "mirror")
    .hand(P1, NOT_SO_FAST, "nsf");
}

function nsfTargets(game: Game): string[] {
  const opt = game.p1.option("cast", "nsf");
  return (opt?.fields.find((f) => f.name === "targets" || f.arg === "targets")?.options ?? []).flat() as string[];
}

const tokensOf = (game: Game, seat: "p1" | "p2") => game[seat].base().filter((id) => game.state(id).isToken);

describe("Ruling dccb23d4396beab6 — Not So Fast vs Mirror Image depends on WHOSE unit was chosen", () => {
  test("Mirror Image choosing P1's Knight: it is an enemy spell that chose a unit friendly to P1 ⇒ Not So Fast may counter it; countered, no Reflection is ever played", async () => {
    const game = await board().build();
    await game.p2.cast("mirror", { targets: "knight" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mirror", controller: P2, targets: ["knight"] })]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(nsfTargets(game)).toContain("mirror");
    expect(game.p1.can("cast", "nsf")).toBe(true);
    await game.p1.cast("nsf", { targets: "mirror" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.zoneOf("mirror")).toBe("trash");
    expect(tokensOf(game, "p2")).toEqual([]); // countered: no Reflection token
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // no refund
    expect(game.violations()).toEqual([]);
  });

  test("Mirror Image choosing P2's OWN Brute: the chosen unit is an enemy unit from P1's perspective ⇒ Not So Fast has no legal object and cannot be played; Mirror Image resolves", async () => {
    const game = await board().build();
    await game.p2.cast("mirror", { targets: "brute" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(nsfTargets(game)).not.toContain("mirror");
    expect(game.p1.can("cast", "nsf")).toBe(false);
    const r = await game.p1.try((p) => p.cast("nsf", { targets: "mirror" }));
    expect(r.ok).toBe(false);
    await game.settle();
    expect(game.zoneOf("mirror")).toBe("trash");
    const toks = tokensOf(game, "p2");
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0]!)).toMatchObject({ controller: P2, name: "Brute" });
    expect(game.p1.hand()).toEqual(["nsf"]);
  });
});
