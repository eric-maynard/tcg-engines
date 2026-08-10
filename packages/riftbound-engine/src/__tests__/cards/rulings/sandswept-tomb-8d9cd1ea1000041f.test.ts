/**
 * Ruling 8d9cd1ea1000041f — Sandswept Tomb (VEN-164 → ven-164-166) · Battlefield "Each spell that chooses one or more units here
 *     that are friendly to it costs [rainbow] less."
 *   × Void Assault (UNL-202 → unl-202-219) · [2][rainbow] "Move a friendly unit, then move an enemy unit."
 *
 * Q: Does Sandswept Tomb discount Void Assault?
 * A: Only if the FRIENDLY unit Void Assault chooses is at the Tomb when cast ("friendly to it" = controlled by the caster). If
 *    the friendly unit is elsewhere the discount does not apply — the ENEMY unit being at the Tomb does not help.
 * Rules: 356.4 (cost reductions), 364 (battlefield abilities reach either player's spells), 740.1.a ("friendly").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SANDSWEPT_TOMB = "ven-164-166";
const VOID_ASSAULT = "unl-202-219";

/**
 * P1's turn with [2] and `power` rainbow. Live Sandswept Tomb controlled by P1: P1's Local (4) and P2's Intruder (3) stand there.
 * P1's Homebody (4) in base; P2's Far (3) at P2's bf2. Void Assault in hand.
 */
function board(power: number) {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: power > 0 ? { rainbow: power } : {} })
    .battlefield("tomb", { controller: P1, def: SANDSWEPT_TOMB, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "tomb", { might: 4, name: "Local" }, "local")
    .unit(P1, "base", { might: 4, name: "Homebody" }, "homebody")
    .unit(P2, "tomb", { might: 3, name: "Intruder" }, "intruder")
    .unit(P2, "bf2", { might: 3, name: "Far" }, "far")
    .hand(P1, VOID_ASSAULT, "va");
}

/** Legal [friendly, enemy] pairs currently offered for Void Assault. */
function legalPairs(game: Game): string[] {
  const opts = game.p1.option("cast", "va")?.fields.find((f) => f.arg === "targets")?.options ?? [];
  return (opts as string[][]).map((t) => t.join("→")).sort();
}

/** Answer Void Assault's destination prompts: friendly → bf2, enemy → base. */
async function resolveMoves(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "pick" && d.semantics === "destination") {
      expect(d.seat).toBe(P1);
      const friendly = d.source?.cardId !== undefined && game.state(d.source.cardId).controller === P1;
      await game.p1.pick(friendly ? "battlefield-bf2" : "base");
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
}

describe("Ruling 8d9cd1ea1000041f — Sandswept Tomb discounts Void Assault only when its FRIENDLY target is at the Tomb", () => {
  test("friendly unit AT the Tomb, zero power: [Local → …] pairs are legal (2 + [rainbow] − [rainbow] = 2) and casting spends exactly 2 energy, no power", async () => {
    const game = await board(0).build();
    const pairs = legalPairs(game);
    expect(pairs).toContain("local→far");
    expect(pairs).toContain("local→intruder");
    await game.p1.cast("va", { targets: ["local", "far"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "va", targets: ["local", "far"] })]);
    await resolveMoves(game);
    await game.settle();
    expect(game.zoneOf("va")).toBe("trash");
    expect(game.locationOf("local")).toBe("bf2");
    expect(game.locationOf("far")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("friendly unit NOT at the Tomb (Homebody in base): no discount even though the ENEMY Intruder is at the Tomb — with zero power no [Homebody → …] pair is legal and the cast is refused", async () => {
    const game = await board(0).build();
    const pairs = legalPairs(game);
    expect(pairs).not.toContain("homebody→intruder"); // enemy at the Tomb is not "friendly to" P1's spell
    expect(pairs).not.toContain("homebody→far");
    const r = await game.p1.try((p) => p.cast("va", { targets: ["homebody", "intruder"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("va")).toBe("hand");
    expect(game.p1.energy()).toBe(2);
  });

  test("…with one power available [Homebody → Intruder] is legal and the FULL [2][rainbow] is paid", async () => {
    const game = await board(1).build();
    expect(legalPairs(game)).toContain("homebody→intruder");
    await game.p1.cast("va", { targets: ["homebody", "intruder"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await resolveMoves(game);
    await game.settle();
    expect(game.zoneOf("va")).toBe("trash");
    expect(game.locationOf("homebody")).toBe("bf2");
    expect(game.locationOf("intruder")).toBe("base");
  });

  test("…and with one power but the friendly Local at the Tomb chosen, the discount still applies: the power is left untouched", async () => {
    const game = await board(1).build();
    await game.p1.cast("va", { targets: ["local", "far"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
  });
});
