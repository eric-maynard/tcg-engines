/**
 * Ruling 036a394f0ac50f0e — Void Assault (UNL-202 → unl-202-219) · Spell · Body/Chaos · 2 + hybrid pip
 *   "Move a friendly unit, then move an enemy unit. (If they both move to a battlefield you don't control,
 *    you're the attacker.)"
 *   × Kha'Zix, Mutating Horror (unl-143-219) "When I attack or defend, if an enemy unit is alone here, give
 *     me +2 [Might] this turn and gain 2 XP."  × Ferrous Forerunner (sfd-021-221, 6 Might).
 *
 * Q: Kha'Zix on one battlefield; on the other the opponent has Ferrous Forerunner, another unit and a hidden
 *    (facedown) card. Void Assault moves Kha'Zix in and Ferrous Forerunner to base. Does Kha'Zix get +2?
 * A: Yes. "Alone" (740.2.a) counts only units; a facedown card is not a unit. Once Void Assault finishes
 *    resolving Kha'Zix gains Attacker; at that moment the only enemy UNIT there is the other one, so the
 *    condition holds, the trigger goes on the chain and resolves: +2 Might, +2 XP.
 * Rules: 740.2.a (alone), 383.4.e (attack triggers on gaining the designation), 464.2 (designations at
 *        cleanup after the move), 172/723 (facedown cards are not units).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_ASSAULT = "unl-202-219";
const KHAZIX = "unl-143-219";
const FERROUS_FORERUNNER = "sfd-021-221";
const HIDDEN_FILLER = "ogs-011-024"; // Flash — any card works as the facedown object

function board() {
  return scenario()
    .xp(P1, 0)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", KHAZIX, "kz")
    .unit(P2, "bf2", FERROUS_FORERUNNER, "ferrous")
    .unit(P2, "bf2", { might: 3, name: "Other Guy" }, "other")
    .facedown(P2, "bf2", HIDDEN_FILLER, "hiddenCard")
    .hand(P1, VOID_ASSAULT, "va");
}

/** Pass priority and answer each move-destination prompt per `dest` until Kha'Zix's trigger (or a showdown) shows up. */
async function resolveVoidAssault(game: Game, dest: Record<string, string>): Promise<string[]> {
  const asked: string[] = [];
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "pick") {
      const unit = d.source?.cardId ?? Object.keys(dest).find((u) => d.prompt.includes(`[${u}]`)) ?? "?";
      asked.push(unit);
      const want = dest[unit] ?? "base";
      const key = d.options.find((o) => o.key === want || o.key === `battlefield-${want}`)?.key;
      if (!key) {
        throw new Error(`destination ${want} not offered for ${unit}: ${d.options.map((o) => o.key).join("|")}`);
      }
      await game.seat(d.seat).pick(key);
      continue;
    }
    if (d.kind === "action" && d.context === "chain" && game.chain().some((c) => c.cardId === "va")) {
      await game.seat(d.seat).pass();
      continue;
    }
    break;
  }
  return asked;
}

describe("Ruling 036a394f0ac50f0e — Void Assault: Kha'Zix attacks where one enemy unit + a facedown card remain → he IS facing a lone unit", () => {
  test("setup facts: bf2 holds two enemy units and one facedown card; the facedown card is not a unit", async () => {
    const game = await board().build();
    expect(game.p2.units("bf2").sort()).toEqual(["ferrous", "other"]);
    expect(game.p2.facedown("bf2")).toEqual(["hiddenCard"]);
    expect(game.zoneOf("hiddenCard")).toBe("facedown-bf2");
    expect(game.state("hiddenCard").cardType).not.toBe("unit");
    expect(game.state("kz")).toMatchObject({ location: "bf1", might: 4 });
  });

  test("ruling 036a394f0ac50f0e — Kha'Zix → bf2, Ferrous Forerunner → base: Kha'Zix becomes the attacker, 'an enemy unit is alone here' is TRUE (hidden card ignored) → trigger on the chain → +2 Might (6) and +2 XP", async () => {
    const game = await board().build();
    await game.p1.cast("va", { targets: ["kz", "ferrous"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    const asked = await resolveVoidAssault(game, { ferrous: "base", kz: "bf2" });
    expect(asked).toEqual(["kz", "ferrous"]); // friendly first, then enemy
    expect(game.zoneOf("va")).toBe("trash");
    // After resolution: Kha'Zix is at bf2 as the attacker; Ferrous went home; the facedown card is still there.
    expect(game.locationOf("kz")).toBe("bf2");
    expect(game.locationOf("ferrous")).toBe("base");
    expect(game.p2.base()).toContain("ferrous");
    expect(game.p2.units("bf2")).toEqual(["other"]);
    expect(game.p2.facedown("bf2")).toEqual(["hiddenCard"]);
    expect(game.state("kz").combatRole).toBe("attacker");
    expect(game.state("other").combatRole).toBe("defender");
    // The condition was met when he gained Attacker ⇒ his trigger is on the chain (not yet resolved: still 4, XP 0).
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kz", controller: P1, triggered: true })]);
    expect(game.state("kz").might).toBe(4);
    expect(game.p1.xp()).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("kz").might).toBe(6);
    expect(game.p1.xp()).toBe(2);
    // Combat then plays out: 6 vs 3 — Other Guy dies, Kha'Zix conquers bf2.
    await game.settle();
    expect(game.zoneOf("other")).toBe("trash");
    expect(game.locationOf("kz")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — if Ferrous Forerunner is NOT moved away (a base Decoy is dragged INTO bf2 instead), several enemy units remain: no trigger, no XP, Kha'Zix fights at 4", async () => {
    const game = await board().unit(P2, "base", { might: 1, name: "Decoy" }, "decoy").build();
    await game.p1.cast("va", { targets: ["kz", "decoy"] });
    await resolveVoidAssault(game, { decoy: "bf2", kz: "bf2" });
    expect(game.locationOf("kz")).toBe("bf2");
    expect(game.p2.units("bf2").sort()).toEqual(["decoy", "ferrous", "other"]);
    expect(game.state("kz").combatRole).toBe("attacker");
    expect(game.chain().some((c) => c.cardId === "kz")).toBe(false);
    expect(game.state("kz").might).toBe(4);
    expect(game.p1.xp()).toBe(0);
  });
});
