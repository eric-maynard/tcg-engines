/**
 * Ruling 0411eded39dee5cd — (general Deflect question) illustrated with Pouty Poro (OGN-013 → ogn-013-298, 2 Might, [Deflect]),
 *   Hextech Ray (OGN-009 → ogn-009-298, [1][fury] "Deal 3 to a unit at a battlefield"), Firestorm (OGS-002 → ogs-002-024,
 *   [6][fury] "Deal 3 to all enemy units at a battlefield") and Volibear, Furious (OGN-041 → ogn-041-298, "When I attack, deal 5
 *   damage split among any number of enemy units here").
 *
 * Q: Must Deflect be paid when a spell targets a battlefield / affects all units rather than choosing the Deflect unit?
 * A: Deflect is owed only when you directly target/choose the Deflect unit. Battlefield-wide or "all units" effects choose no
 *    unit ⇒ no Deflect. Split/distributed damage where YOU choose to include a Deflect unit ⇒ pay Deflect once per Deflect unit
 *    chosen. Choices your opponent makes never cost you Deflect.
 * Rules: 809.1 (Deflect: opponents pay [A] to CHOOSE me with a spell or ability), 355.10 (what counts as choosing/targeting),
 *        355.14 (split damage: the recipients are chosen targets).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const POUTY_PORO = "ogn-013-298";
const HEXTECH_RAY = "ogn-009-298";
const FIRESTORM = "ogs-002-024";
const VOLIBEAR = "ogn-041-298";

type PickD = Extract<Decision, { kind: "pick" }>;
type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

const targetsOffered = (game: Game, alias: string): string[] => {
  const f = game.p1.option("cast", alias)?.fields.find((x) => x.arg === "targets");
  return [...new Set((f?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
};

describe("Ruling 0411eded39dee5cd — Deflect is paid only for directly choosing the Deflect unit", () => {
  test("direct target: with exactly [1][fury] Hextech Ray can NOT be aimed at the Poro (Deflect unaffordable) — only the Grunt is offered; with one extra power the Poro is offered and casting on it spends that power too", async () => {
    const poor = await scenario()
      .turn(3)
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", POUTY_PORO, "poro")
      .unit(P2, "bf1", { might: 2, name: "Grunt" }, "grunt")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    expect(poor.state("poro").keywords).toContain("Deflect");
    expect(targetsOffered(poor, "ray")).toEqual(["grunt"]);
    expect((await poor.p1.try((p) => p.cast("ray", { targets: "poro" }))).ok).toBe(false);

    const rich = await scenario()
      .turn(3)
      .resources(P1, { energy: 1, power: { fury: 1, calm: 1 } }) // the [calm] is the "power of any domain" for Deflect
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", POUTY_PORO, "poro")
      .unit(P2, "bf1", { might: 2, name: "Grunt" }, "grunt")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    expect(targetsOffered(rich, "ray").toSorted()).toEqual(["grunt", "poro"]);
    await rich.p1.cast("ray", { targets: "poro" });
    expect(rich.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } }); // 1 + [fury] + Deflect [A]
    await rich.settle();
    expect(rich.zoneOf("poro")).toBe("trash"); // 3 ≥ 2
    expect(rich.violations()).toEqual([]);
  });

  test("area effect: Firestorm ('all enemy units at a battlefield') chooses a BATTLEFIELD, not units — cast with exactly [6][fury] it still hits (and kills) the Deflect Poro, no Deflect asked or paid", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 6, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", POUTY_PORO, "poro")
      .unit(P2, "bf1", { might: 4, name: "Grunt" }, "grunt")
      .unit(P2, "base", { might: 4, name: "Homebody" }, "home")
      .hand(P1, FIRESTORM, "fs")
      .build();
    const offered = targetsOffered(game, "fs");
    expect(offered).not.toContain("poro"); // no unit is chosen …
    expect(offered).toContain("bf1"); // … a battlefield is
    await game.p1.cast("fs");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // exactly the printed cost
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("grunt")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.state("home").damage).toBe(0); // not "at a battlefield"
    expect(game.violations()).toEqual([]);
  });

  test("split damage: Volibear's 'deal 5 split among any number of enemy units here' — the recipient pick shows a Deflect surcharge of 1 on the Poro (0 on the Grunt); choosing BOTH costs exactly one power (once for the one Deflect unit), then P1 distributes the 5", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", POUTY_PORO, "poro")
      .unit(P2, "bf1", { might: 6, name: "Grunt" }, "grunt")
      .unit(P1, "base", VOLIBEAR, "voli")
      .build();
    await game.p1.move("voli", "bf1");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, targeting: "split-targets", timing: "FIN" });
    const opts = (d as PickD).options;
    expect(opts.find((o) => (o.card ?? o.key) === "poro")?.deflect).toBe(1);
    expect(opts.find((o) => (o.card ?? o.key) === "grunt")?.deflect ?? 0).toBe(0);
    await game.p1.pick("poro", "grunt");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // one Deflect paid for the one Deflect unit chosen
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", targets: ["poro", "grunt"], triggered: true })]);
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 5 });
    await game.p1.distribute({ grunt: 3, poro: 2 });
    // Stop before combat to read the split's effect.
    for (let i = 0; i < 4 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("poro")).toBe("trash"); // 2 ≥ 2
    expect(game.state("grunt").damage).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("split damage without the spare power: the Poro can't be included (it is not offered as a recipient), the Grunt alone can take all 5 for free", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", POUTY_PORO, "poro")
      .unit(P2, "bf1", { might: 6, name: "Grunt" }, "grunt")
      .unit(P1, "base", VOLIBEAR, "voli")
      .build();
    await game.p1.move("voli", "bf1");
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card ?? o.key)).not.toContain("poro");
      await game.p1.pick("grunt");
    }
    for (let i = 0; i < 6 && game.state("grunt").damage === 0; i++) {
      const x = game.decision();
      if (x?.kind === "distribute") {
        await game.p1.distribute({ grunt: 5 });
      } else if (x?.kind === "action" && x.context === "chain") {
        await game.seat(x.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.state("grunt").damage).toBe(5);
    expect(game.state("poro")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });
});
