/**
 * Ruling 7fe9b424a625e39c — Stalwart Poro (OGN-052 → ogn-052-298) · 2 Might · "[Shield] (+1 [Might] while I'm a defender.)"
 *   × Traveling ("Wandering") Merchant (ogn-185-298) · 2 Might · "When I move, discard 1, then draw 1."
 *   (Cannon Barrage ogn-127-298 is only mentioned as a spell that needs combat anyway.)
 *
 * Q: A unit with a move trigger moves to a defended battlefield and its trigger draws me a spell. Can I play that
 *    spell before the showdown begins / before the defender's Shield is on?
 * A: No. The move trigger resolves; with the chain empty and no further triggers the showdown begins IMMEDIATELY —
 *    nobody gets priority on an empty chain in between — so the first moment the drawn spell is playable is inside
 *    the showdown, where the Poro is already a shielded defender.
 * Rules: 340.2 / 344 (empty chain → Cleanup → showdown begins), 464.2 (combat showdown; designations), 729 (Shield).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STALWART_PORO = "ogn-052-298";
const TRAVELING_MERCHANT = "ogn-185-298";
const HEXTECH_RAY = "ogn-009-298"; // [1][fury] Action: "Deal 3 to a unit at a battlefield." — the spell the trigger draws

/**
 * P1's turn with [1][fury]. P2 holds bf1 with Stalwart Poro (2). P1: Traveling Merchant in base, one discard-fodder
 * card in hand, and Hextech Ray on top of the deck (the card the move trigger will draw).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", STALWART_PORO, "poro")
    .unit(P1, "base", TRAVELING_MERCHANT, "merchant")
    .hand(P1, { cardType: "unit", energyCost: 5, might: 5, name: "Fodder" }, "fodder")
    .deck(P1, [HEXTECH_RAY], ["ray"]);
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Ruling 7fe9b424a625e39c — no window for the move-trigger's drawn spell before the showdown (and the Poro's Shield)", () => {
  test("the move puts the Merchant's trigger on the chain in a CLOSED state: P1's only options are pass/concede — Ray isn't even drawn yet, and no showdown has begun (Poro still a plain 2)", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
    expect(game.p1.hand()).toEqual(["fodder"]);
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.state("poro")).toMatchObject({ combatRole: null, might: 2 });
  });

  test("the trigger resolves (discard Fodder, draw Ray) and the VERY NEXT decision is already the showdown: Ray is in hand, the Poro is a 3-Might shielded defender — there was no neutral/open window in between", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    const seen: string[] = [];
    const note = () => {
      const d = game.decision();
      seen.push(`${d?.kind}:${d?.kind === "action" ? d.context : ""}:${game.p1.hand().includes("ray") ? "ray" : "-"}:${showdown(game)?.active ? "sd" : "-"}`);
    };
    note();
    await game.p1.passPriority();
    note();
    await game.p2.passPriority();
    note(); // discard prompt (forced: only Fodder)
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("fodder");
      note();
    }
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.p1.hand()).toEqual(["ray"]);
    // Every state in which Ray was in hand is a showdown state; no "main"/"free" action window ever appeared.
    expect(seen.some((s) => s.includes(":main:") || s.includes(":free:"))).toBe(false);
    expect(seen.filter((s) => s.includes(":ray:")).every((s) => s.endsWith(":sd"))).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("poro")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.state("merchant").combatRole).toBe("attacker");
  });

  test("so the first time Ray is castable the Shield is already up: casting it at the Poro hits a 3-Might defender (3 damage → dies at exactly lethal), never a 2-Might one pre-showdown", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("fodder");
    }
    expect(game.p1.can("cast", "ray")).toBe(true);
    expect(game.state("poro").might).toBe(3);
    await game.p1.cast("ray", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
