/**
 * Ruling d1d191e51da2266a — Iterative Design (VEN-051 → ven-051-166) · Spell · Mind · 4 · "Play a 3 [Might] Mech unit token.
 *   [Flow] [2][mind] (You may play this from your trash for its Flow cost. Then banish it.)"
 *   × Virtuoso (Jhin legend, UNL-181 → unl-181-219) "When you play a spell, if you spent [4] or more, you may banish it. Then,
 *     if there are four spells banished with me, put each in its trash, channel 4 runes, and draw 1."
 *   (× Time Warp ogn-122-298 — cited only as the same "banish it" principle.)
 *
 * Q: I Flow my Iterative Design — is it banished by my Jhin legend or by Flow?
 * A: By Flow. Flow's "then banish it" takes it as it leaves the chain, before Virtuoso could act; and via Flow you only
 *    spent 2, so Virtuoso's "if you spent [4] or more" fails anyway. It still counts as a spell you PLAYED (play-a-spell
 *    triggers fire), but the banishment is Flow's — it does not count toward Jhin's four.
 * Rules: 829 (Flow: alternative cost from trash, then banish), 394–397 (Linked abilities: only cards banished "with me"
 *        count), 383 (play-a-spell triggers), Virtuoso's spent-energy condition.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ITERATIVE_DESIGN = "ven-051-166";
const VIRTUOSO = "unl-181-219";
const SOME_SPELL = "ogn-083-298"; // Consult the Past — stands in for spells Virtuoso banished earlier
/** "When you play a spell, draw 1" — an independent witness that a spell WAS played. */
const SCRIBE = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "play-spell", on: "controller" }, type: "triggered" }],
  cardType: "unit",
  might: 1,
  name: "Scribe",
} as const;

/**
 * P1's turn. Virtuoso legend that has ALREADY banished three spells "with me" (b1–b3 in banishment, linked). Iterative
 * Design once in the trash ("iterT") and once in hand ("iterH"). Scribe in base. 6 energy + [mind]; no runes channeled;
 * known deck.
 */
function board() {
  return scenario()
    .card("virtuoso", { def: VIRTUOSO, meta: { exiledByThis: ["b1", "b2", "b3"] } as Record<string, unknown>, owner: P1, zone: "legendZone" })
    .banishment(P1, SOME_SPELL, "b1")
    .banishment(P1, SOME_SPELL, "b2")
    .banishment(P1, SOME_SPELL, "b3")
    .resources(P1, { energy: 6, power: { mind: 1 } })
    .trash(P1, ITERATIVE_DESIGN, "iterT")
    .hand(P1, ITERATIVE_DESIGN, "iterH")
    .unit(P1, "base", SCRIBE, "scribe")
    .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** Resolve everything, saying YES to any Virtuoso opt-in; report whether Virtuoso ever asked. */
async function resolveWatchingVirtuoso(game: Game): Promise<boolean> {
  let offered = false;
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      expect(d.source?.cardId).toBe("virtuoso");
      offered = true;
      await game.p1.yes();
    } else if (d.kind === "order") {
      await game.seat(d.seat).order([]);
    } else if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  return offered;
}

const linked = (game: Game) => (game.state("virtuoso").meta.exiledByThis ?? []) as readonly string[];
const mechs = (game: Game) => game.p1.units("base").filter((u) => game.state(u).name === "Mech");

describe("Ruling d1d191e51da2266a — a Flowed Iterative Design is banished by Flow, not by Virtuoso", () => {
  test("Flow: Iterative Design is castable from the trash only via Flow and costs [2][mind] — 2 energy spent, not 4", async () => {
    const game = await board().build();
    const flow = game.p1.option("cast", "iterT")?.fields.find((f) => f.arg === "flow");
    expect(flow?.options).toEqual([true]);
    await game.p1.cast("iterT", { flow: true });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "iterT", controller: P1 })]);
  });

  test("it resolves (a 3-Might Mech token) and IS a played spell (Scribe's play-a-spell trigger draws 1) — but Virtuoso never offers its banish (spent 2 < 4) and the card lands in banishment via FLOW: not linked to Virtuoso", async () => {
    const game = await board().build();
    await game.p1.cast("iterT", { flow: true });
    const offered = await resolveWatchingVirtuoso(game);
    expect(offered).toBe(false);
    expect(mechs(game)).toHaveLength(1);
    expect(game.state(mechs(game)[0] as string).might).toBe(3);
    expect(game.p1.hand()).toEqual(["iterH", "d1"]); // Scribe: a spell was played
    expect(game.zoneOf("iterT")).toBe("banishment"); // Flow's "then banish it"
    expect(linked(game)).toEqual(["b1", "b2", "b3"]); // NOT banished "with" Virtuoso
  });

  test("so it does not make Jhin's fourth: four spells now sit in banishment, yet Virtuoso's payoff (linked spells to trash, channel 4 runes, draw 1) does NOT happen", async () => {
    const game = await board().build();
    await game.p1.cast("iterT", { flow: true });
    await resolveWatchingVirtuoso(game);
    expect(game.p1.banishment().sort()).toEqual(["b1", "b2", "b3", "iterT"]);
    expect(game.p1.runes()).toHaveLength(0); // no "channel 4 runes"
    expect(game.zoneOf("b1")).toBe("banishment"); // linked spells not put in the trash
    expect(game.p1.hand()).toEqual(["iterH", "d1"]); // only Scribe's draw, no Virtuoso draw
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control — the same spell hard-cast from HAND for its full 4: Virtuoso offers the banish; accepting makes it the fourth spell banished WITH Virtuoso and the payoff fires (all four to trash, 4 runes channeled, draw 1)", async () => {
    const game = await board().build();
    await game.p1.cast("iterH");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 1 } }); // spent 4
    const offered = await resolveWatchingVirtuoso(game);
    expect(offered).toBe(true);
    expect(mechs(game)).toHaveLength(1);
    expect(game.p1.banishment()).toEqual([]);
    expect(new Set(game.p1.trash())).toEqual(new Set(["iterT", "b1", "b2", "b3", "iterH"]));
    expect(game.p1.runes()).toHaveLength(4);
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]); // Scribe's draw + Virtuoso's draw
    expect(linked(game)).toEqual([]);
  });
});
