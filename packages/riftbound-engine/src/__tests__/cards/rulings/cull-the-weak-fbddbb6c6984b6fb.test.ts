/**
 * Ruling fbddbb6c6984b6fb — Cull the Weak (OGN-209 → ogn-209-298) · Spell · 2+[order] · "Each player kills one of their units."
 *   × Not So Fast (SFD-045 → sfd-045-221) · [Reaction] · 2+[calm] · "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × [Deflect] ("Opponents must pay [rainbow] to choose me with a spell or ability.")   (Cull sfd-134 is only a name-collision in the Q.)
 *
 * Q: Does Cull the Weak target?
 * A: No. Nothing is chosen when it is put on the chain; each player picks and kills one of their own units as it RESOLVES. So it owes no
 *    Deflect surcharge and Not So Fast (which needs a spell that chooses a friendly unit) cannot counter it.
 * Rules: 355.10.e (per-player instructions don't target), 809.1.c–d (Deflect taxes choosing), 425 / Not So Fast's targeting requirement.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";
const NOT_SO_FAST = "sfd-045-221";

/**
 * P1's turn. P1: Pawn (1) in base, Cull the Weak + EXACTLY 2+[order] (no spare power for any Deflect pip). P2: a lone [Deflect] Poro (2)
 * in base, Not So Fast in hand with 2+[calm] ready for it.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .unit(P1, "base", { might: 1, name: "Pawn" }, "pawn")
    .unit(P2, "base", { keywords: ["Deflect"], might: 2, name: "Deflect Poro" }, "poro")
    .hand(P1, CULL_THE_WEAK, "cull")
    .hand(P2, NOT_SO_FAST, "nsf");
}

/** Drive to the open main phase: pass priority, take forced single picks, record every non-action prompt. */
async function resolveAll(game: Game): Promise<Decision[]> {
  const prompts: Decision[] = [];
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
      continue;
    }
    prompts.push(d);
    if (d.kind === "pick" && d.min === 1 && d.options.length === 1) {
      await game.seat(d.seat).pick(d.options[0]!.key);
    } else if (d.kind === "pick") {
      await game.seat(d.seat).pick(d.options[0]!.key);
    } else {
      break;
    }
  }
  return prompts;
}

describe("Ruling fbddbb6c6984b6fb — Cull the Weak does not target: no Deflect, no Not So Fast", () => {
  test("put on the chain with NO chosen object: the cast has no enemy target to name, costs exactly 2+[order] despite the enemy Deflect unit, and the chain item lists no targets", async () => {
    const game = await board().build();
    expect(game.state("poro").keywords).toContain("Deflect");
    expect(game.p1.can("cast", "cull")).toBe(true);
    const offered = (game.p1.option("cast", "cull")?.fields.find((f) => f.arg === "targets")?.options ?? []) as unknown[];
    expect([...new Set(offered.flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))]).not.toContain("poro");
    await game.p1.cast("cull");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // no [rainbow] owed
    const item = game.chain()[0];
    expect(item).toMatchObject({ cardId: "cull", controller: P1 });
    expect(item?.targets ?? []).not.toContain("poro");
  });

  test("Not So Fast cannot answer it: with Cull the Weak on the chain and 2+[calm] in pool, P2 (holding priority) is NOT offered the counter — the spell chooses no friendly unit", async () => {
    const game = await board().build();
    await game.p1.cast("cull");
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "nsf")).toBe(false);
    const r = await game.p2.try((p) => p.cast("nsf", { targets: "cull" }));
    expect(r.ok).toBe(false);
    expect(game.p2.resources()).toEqual({ energy: 2, power: { calm: 1 } });
  });

  test("control: Not So Fast IS live against a spell that does choose P2's unit (a targeted 'deal 2') — so the refusal above is about targeting, not resources", async () => {
    const zap = { abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 1, name: "Zap", timing: "action" };
    const game = await board().hand(P1, zap, "zap").resources(P1, { energy: 4, power: { order: 1, fury: 1 } }).build();
    await game.p1.cast("zap", { targets: "poro" }); // pays Deflect out of the spare power
    await game.p1.passPriority();
    expect(game.p2.can("cast", "nsf")).toBe(true);
    expect(game.p2.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options).toContainEqual(["zap"]);
  });

  test("resolution: each player kills one of THEIR units, chosen then — P1's Pawn and P2's Deflect Poro both die; no Deflect payment or counter window ever came up", async () => {
    const game = await board().build();
    await game.p1.cast("cull");
    const prompts = await resolveAll(game);
    expect(prompts.some((p) => p.seat === P1 && (p.kind === "yes-no" || p.kind === "integer"))).toBe(false);
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.zoneOf("nsf")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 2, power: { calm: 1 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
