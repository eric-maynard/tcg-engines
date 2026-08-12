/**
 * Ruling 6d7bb8df2f5f1f27 — Traveling Merchant (OGN-185 → ogn-185-298) · Unit · Chaos · [2] · 2 Might
 *     "When I move, discard 1, then draw 1."
 *   × Daring Poro (OGN-210 → ogn-210-298) · 2 Might · "[Assault]" (passive)
 *   × Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 Might · "When I attack, deal damage equal to my Might to an
 *     enemy unit here." (an attack TRIGGER)
 *
 * Q: Is there a window before a showdown starts where reactions can be played? Do Assault / "when I attack" open
 *    chains you can react to?
 * A: You cannot react to the move itself. Assault is passive — nothing goes on the chain. "When you move me"
 *    triggers are the ONLY pre-showdown items: they go on a chain and fully resolve BEFORE the showdown begins.
 *    "When I attack/defend" triggers go onto the initial chain only once the showdown has already begun.
 * Rules: 807.1.c (Assault is a passive keyword), 383 (only triggered abilities use the chain),
 *        448 (Cleanup after a Move action), 464.2.c.3 (designations as combat opens), 347 (showdown priority).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MERCHANT = "ogn-185-298";
const DARING_PORO = "ogn-210-298"; // 2 Might, [Assault]
const YASUO = "ogn-076-298"; // 6 Might, "When I attack, …"
const SKULKER = "ogn-175-298"; // 3-Might vanilla

/** P1's turn. P2 holds bf1 with a 6-Might Guard; P1 has Merchant / Poro / Yasuo / a vanilla body ready in base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Guard" }, "guard")
    .unit(P1, "base", MERCHANT, "merchant")
    .unit(P1, "base", DARING_PORO, "poro")
    .unit(P1, "base", YASUO, "yasuo")
    .unit(P1, "base", SKULKER, "plain")
    .hand(P1, SKULKER, "spare")
    .deck(P1, [SKULKER, SKULKER], ["d1", "d2"]);
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

describe("Ruling 6d7bb8df2f5f1f27 — the only pre-showdown chain is a 'when you move me' trigger", () => {
  test("a unit with no move text: the move goes straight into the showdown — no chain item existed for anyone to react to", async () => {
    const game = await board().build();
    await game.p1.move("plain", "bf1");
    expect(chainIds(game)).toEqual([]);
    expect(game.state("plain").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("[Assault] does NOT go on the chain: the Poro is already 3 Might the instant it is the attacker, with an empty chain", async () => {
    const game = await board().build();
    expect(game.state("poro").might).toBe(2);
    await game.p1.move("poro", "bf1");
    expect(chainIds(game)).toEqual([]);
    expect(game.state("poro")).toMatchObject({ combatRole: "attacker", might: 3 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("the Merchant's 'when I move' IS a chain item — and it sits there BEFORE the showdown: no combat designations yet", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    expect(chainIds(game)).toEqual(["merchant"]);
    expect(game.chain()[0]).toMatchObject({ controller: P1, triggered: true });
    expect(game.state("merchant").combatRole).toBeNull();
    expect(game.state("guard").combatRole).toBeNull();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("… and it is fully resolved before the showdown begins: discard 1 then draw 1 happens, and only then are attacker/defender assigned", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority(); // the move trigger resolves
    expect(chainIds(game)).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "RES" }); // which card to discard
    await game.p1.pick("spare");
    expect(game.p1.hand()).not.toContain("spare"); // discarded
    expect(game.zoneOf("spare")).toBe("trash");
    expect(game.p1.hand()).toContain("d1"); // drew 1
    expect(game.state("merchant").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("an 'when I attack' trigger is different: it appears only AFTER the showdown is staged (designations already assigned)", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    expect(chainIds(game)).toEqual(["yasuo"]);
    expect(game.chain()[0]?.triggered).toBe(true);
    expect(game.state("yasuo").combatRole).toBe("attacker"); // combat is already staged — this is the INITIAL chain
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.violations()).toEqual([]);
  });
});
