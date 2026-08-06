/**
 * Ruling 608d69cb66cfff4d — Temporal Breach (VEN-066 → ven-066-166, Spell, [2][mind], Hidden)
 *   "Banish a unit, then its owner plays it to the same location, ignoring its cost."
 *   × Brynhir Thundersong (ogn-026-298, 6, 5 Might) "When you play me, opponents can't play cards this turn."
 *
 * Q: What if Brynhir prevents the owner of the unit banished by Temporal Breach from playing cards?
 * A: The unit remains banished. Breach still resolves: the banish completes normally, the "its owner plays it"
 *    instruction is an impossible action for that opponent and is skipped (as with Rockfall Path).
 * Rules: 358.3.a, 419.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEMPORAL_BREACH = "ven-066-166";
const BRYNHIR = "ogn-026-298";

/**
 * Inline MODEL of Temporal Breach's effect using the engine's own banish → "owner plays it (pending value),
 * ignoring cost" primitives (the shape Arcane Shift uses). Only used to isolate the Brynhir half of the ruling
 * while the real ven-066-166 effect is unparsed. NB: the model lets the owner choose the location; the real card
 * fixes "the same location".
 */
const BREACH_MODEL = {
  abilities: [
    {
      effect: {
        effects: [
          { target: { type: "unit" }, type: "banish" },
          { ignoreCost: true, target: { type: "pending-value" }, type: "play" },
        ],
        pendingValue: { source: 0 },
        type: "sequence",
      },
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "mind",
  energyCost: 2,
  name: "Temporal Breach (inline model)",
  powerCost: ["mind"],
  timing: "standard",
};

/** P1's turn: 8 energy + 1 mind (Brynhir 6 + Breach 2+[mind]); P2's damaged, READY 3-Might unit (cost 3) alone at bf1; P2 has no resources. */
function board(breachDef: string | typeof BREACH_MODEL, opts: { brynhir: boolean }) {
  const b = scenario()
    .resources(P1, { energy: opts.brynhir ? 8 : 2, power: { mind: 1 } })
    .resources(P2, { energy: 0 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { energyCost: 3, might: 3, name: "P2 Veteran" }, "victim", { damage: 1 })
    .hand(P1, breachDef, "breach");
  return opts.brynhir ? b.hand(P1, BRYNHIR, "bryn") : b;
}

/** P1 plays Brynhir and lets her play trigger resolve: opponents can't play cards this turn. */
async function brynhirResolved(game: Game): Promise<void> {
  await game.p1.play("bryn");
  expect(game.chain().some((i) => i.cardId === "bryn" && i.triggered)).toBe(true);
  await game.settle();
  expect(game.zoneOf("bryn")).toBe("base");
  expect(game.chain()).toEqual([]);
}

/** Cast Breach at the victim (with or without an exposed target field) and pass twice so it resolves. */
async function castBreachAtVictim(game: Game): Promise<void> {
  const opt = game.p1.option("cast", "breach");
  expect(opt).toBeDefined();
  const hasTargets = opt?.fields.some((f) => f.name === "targets");
  await game.p1.cast("breach", hasTargets ? { targets: "victim" } : {});
  expect(game.p1.resources().power.mind).toBe(0);
  await game.p1.passPriority();
  await game.p2.passPriority();
}

/** Drain: pass priorities; if the owner is (wrongly or rightly) asked where to put the unit, prefer bf1. */
async function drain(game: Game): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return;
    }
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick") {
      const bf = d.options.find((o) => /bf1/.test(o.key)) ?? d.options[0];
      await game.seat(d.seat).pick(bf?.key as string);
    } else {
      return;
    }
  }
}

describe("Ruling 608d69cb66cfff4d — Temporal Breach under Brynhir Thundersong: the unit stays banished", () => {
  // Expected: Brynhir resolved; Breach banishes P2's unit (completes normally), then "its owner plays it" is impossible
  // for P2 this turn → skipped; the unit REMAINS in P2's banishment; Breach finishes resolving (→ trash); nothing pending.
  // Actual: ven-066-166's effect is an unparsed raw stub — Breach resolves doing nothing; the unit never leaves bf1.
  test.failing("BUG: ruling 608d69cb66cfff4d — with Brynhir resolved, Breach banishes P2's unit and the replay is skipped: it stays banished (engine: Temporal Breach effect unimplemented)", async () => {
    const game = await board(TEMPORAL_BREACH, { brynhir: true }).build();
    await brynhirResolved(game);
    await castBreachAtVictim(game);
    await drain(game);
    expect(game.zoneOf("victim")).toBe("banishment");
    expect(game.p2.banishment()).toContain("victim");
    expect(game.p2.units()).toEqual([]);
    expect(game.zoneOf("breach")).toBe("trash"); // the spell still resolved fully
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1, context: "main" });
  });

  // Contrast, no Brynhir. Expected: the unit is banished and immediately replayed by its OWNER to the SAME location,
  // ignoring cost (P2 has 0 energy) — it returns to bf1 as a fresh object: damage gone, and exhausted like any played
  // unit; nothing stays in banishment. Actual: raw stub — nothing happens (unit keeps its 1 damage, stays ready).
  test.failing("BUG: ruling 608d69cb66cfff4d — contrast without Brynhir: banished then replayed free by P2 to bf1 as a fresh (undamaged, exhausted) unit (engine: effect unimplemented)", async () => {
    const game = await board(TEMPORAL_BREACH, { brynhir: false }).build();
    expect(game.state("victim")).toMatchObject({ damage: 1, isExhausted: false });
    await castBreachAtVictim(game);
    await drain(game);
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
    expect(game.state("victim").controller).toBe(P2);
    expect(game.state("victim").damage).toBe(0);
    expect(game.state("victim").isExhausted).toBe(true);
    expect(game.p2.energy()).toBe(0); // cost ignored
    expect(game.p2.banishment()).toEqual([]);
    expect(game.zoneOf("breach")).toBe("trash");
  });

  // ── inline model: isolates the Brynhir half on the engine's banish→instructed-play primitive ─────────────

  test("model sanity (no Brynhir): the banish → 'owner plays it, ignoring cost' primitive works — P2 gets a pending play and puts the unit back at bf1 for free", async () => {
    const game = await board(BREACH_MODEL, { brynhir: false }).build();
    await castBreachAtVictim(game);
    // The instructed play is P2's pending chain item.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "victim", controller: P2 })]);
    await drain(game);
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
    expect(game.state("victim").controller).toBe(P2);
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  // Expected (358.3.a): once Brynhir's play effect has resolved, the model's "owner plays it" step is impossible for P2 —
  // no pending play for P2 is created/finalized and the unit stays in P2's banishment. Actual: Brynhir's
  // "opponents can't play cards" only gates hand plays; the effect-instructed play still goes on the chain and P2
  // puts the unit back on the board.
  test.failing("BUG: ruling 608d69cb66cfff4d — (inline model) Brynhir's restriction must also make an effect-INSTRUCTED play impossible: unit stays banished (engine: P2 replays it anyway)", async () => {
    const game = await board(BREACH_MODEL, { brynhir: true }).build();
    await brynhirResolved(game);
    await castBreachAtVictim(game);
    // No play may be started for P2 this turn: nothing of P2's is pending on the chain …
    expect(game.chain().filter((i) => i.controller === P2)).toEqual([]);
    await drain(game);
    // … and the banish, which completed normally, stands.
    expect(game.zoneOf("victim")).toBe("banishment");
    expect(game.p2.units()).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1, context: "main" });
  });
});
