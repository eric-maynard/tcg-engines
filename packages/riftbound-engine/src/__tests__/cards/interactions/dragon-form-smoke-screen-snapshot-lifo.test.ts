/**
 * Interaction: Dragon Form (ven-116-166) · Spell · Order · 3 · standard speed · [Flow] [3]
 *     "Choose a unit. Its base Might becomes 5 this turn."                                          — P2's
 *   × Smoke Screen (ogn-093-298) · Spell · Mind · 2 + [mind] · [Reaction]
 *     "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."                                — P1's
 *   on P2's Daring Poro (ogn-210-298, 2 Might, [Assault]) at bf1; Case C adds B.F. Sword (sfd-161-221, +3).
 *   (+ Grand Duelist sfd-205-221 "When one of your units becomes [Mighty], you may exhaust me…" as P2's legend in
 *    one test — an OBSERVATION PROBE for 709/710 only.)
 *
 * Question. What is the Poro's Might when both spells have resolved, depending on the ORDER they resolve in?
 *   Case A — Smoke Screen resolves first (Poro is 2 → can only lose 1), Dragon Form afterwards: 1 or 4?
 *   Case B — Dragon Form resolves first (Poro is 5), Smoke Screen afterwards: ?
 *   Case C — Poro wears B.F. Sword (2+3 = 5) when Smoke Screen resolves, then Dragon Form: per-layer computation.
 *   Timing note: Dragon Form has no [Action]/[Reaction], so P2 can never RESPOND with it; the "Dragon Form on top
 *   of Smoke Screen" order is reached legally the other way round — P2 casts Dragon Form on its own turn and P1
 *   answers with the Reaction, which then resolves first (LIFO). The "Dragon Form first" order is P2 letting
 *   Dragon Form resolve and P1 finding a later window (here: P2's Flow re-cast on another unit) for Smoke Screen.
 *
 * Rules: 477.1.a.1 (Might ASSIGNMENT — "becomes 5" — is layer 1, applied before all arithmetic regardless of
 * timestamp, 480.1), 477.3.b + 477.3.e.2.b (a limited decrease from a non-passive source is SNAPSHOTTED at the
 * limited amount when it first applies and remembered for its duration), 477.3.d (attached Might bonuses are
 * layer-3 arithmetic), 477.3.e.1 / e.2 (increases before decreases), 709 / 710 (a unit whose Might goes from <5
 * to ≥5 "becomes Mighty").
 *
 * Expected: A — Smoke Screen against a 2 snapshots −1; Dragon Form: base 5, then −1 → 4 (NOT 1: "minimum of 1"
 * is not a continuous clamp). B — Dragon Form → 5; Smoke Screen against 5 snapshots the full −4 → 1. Same two
 * cards, opposite order: 4 vs 1. C — at Smoke Screen time 2+3 = 5 → snapshots −4 (→ 1); Dragon Form: base 5,
 * +3 sword = 8, −4 = 4. Everything lapses at end of turn: printed 2 (+3 if equipped). Reaching 5 via Dragon Form
 * is "becoming Mighty".
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAGON_FORM = "ven-116-166";
const SMOKE_SCREEN = "ogn-093-298";
const DARING_PORO = "ogn-210-298";
const BF_SWORD = "sfd-161-221";
const GRAND_DUELIST = "sfd-205-221"; // probe legend: "When one of your units becomes [Mighty], you may exhaust me to channel 1 rune exhausted."

interface BoardOpts {
  sword?: boolean;
  probeLegend?: boolean;
}

/**
 * P2's turn. P2: Daring Poro at its own bf1 (optionally wearing B.F. Sword), a vanilla Pal (3) in base, Dragon Form
 * in hand + a second copy in the trash (Flow), 6 energy. P1: Smoke Screen in hand, 2 energy + 1 mind.
 */
function board(o: BoardOpts = {}) {
  let b = scenario()
    .active(P2)
    .battlefield("bf1", { controller: P2 })
    .resources(P2, { energy: 6 })
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .unit(P2, "base", { might: 3, name: "Pal" }, "pal")
    .hand(P2, DRAGON_FORM, "form")
    .trash(P2, DRAGON_FORM, "formFlow")
    .hand(P1, SMOKE_SCREEN, "smoke");
  b = o.sword
    ? b.unit(P2, "bf1", DARING_PORO, "poro", { equippedWith: ["sword"] }).card("sword", { def: BF_SWORD, meta: { attachedTo: "poro" }, owner: P2, zone: "bf1" })
    : b.unit(P2, "bf1", DARING_PORO, "poro");
  if (o.probeLegend) {
    b = b.legend(P2, GRAND_DUELIST, "duelist");
  }
  return b;
}

/** Pass priority around until the chain is empty. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

/** Order "Smoke Screen resolves, then Dragon Form": P2 casts Dragon Form on the Poro; P1 answers with Smoke Screen on the Poro; LIFO. */
async function smokeThenForm(o: BoardOpts = {}): Promise<Game> {
  const game = await board(o).build();
  await game.p2.cast("form", { targets: "poro" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.cast("smoke", { targets: "poro" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["form", "smoke"]); // smoke on top
  await drainChain(game);
  return game;
}

/**
 * Order "Dragon Form resolves, then Smoke Screen": P2 casts Dragon Form on the Poro and it resolves (5); P2 then
 * Flows the trash copy onto Pal, and in THAT window P1 Smoke Screens the Poro (resolves before the Flow copy).
 */
async function formThenSmoke(o: BoardOpts = {}): Promise<Game> {
  const game = await board(o).build();
  await game.p2.cast("form", { targets: "poro" });
  await drainChain(game);
  expect(game.state("poro").might).toBe(o.sword ? 8 : 5);
  await game.p2.cast("formFlow", { flow: true, targets: "pal" });
  await game.p2.passPriority();
  await game.p1.cast("smoke", { targets: "poro" });
  await drainChain(game);
  return game;
}

describe("timing premise — Dragon Form cannot be a response; Smoke Screen can", () => {
  test("Dragon Form is standard speed: castable by P2 in its own open main phase; P1 has no window for Smoke Screen in P2's Neutral Open state, so P2 must act first", async () => {
    const game = await board().build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "form")).toBe(true);
    expect(game.p1.can("cast", "smoke")).toBe(false); // no priority for P1 in P2's Neutral Open state
  });

  test("once P2's Dragon Form is on the chain and P2 passes, P1 holds priority and Smoke Screen ([Reaction]) is offered with Poro and Pal as candidates; P2 could NOT add the trash Dragon Form (Flow) on top — standard speed (829.1.b.2)", async () => {
    const game = await board().build();
    await game.p2.cast("form", { targets: "poro" });
    expect(game.p2.can("cast", "formFlow")).toBe(false); // holding priority on its own chain is not standard timing
    await game.p2.passPriority();
    expect(game.p1.can("cast", "smoke")).toBe(true);
    const field = game.p1.option("cast", "smoke")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
    expect(offered).toEqual(["pal", "poro"]);
  });
});

describe("Case A — Smoke Screen resolves against a 2 (snapshots −1), Dragon Form afterwards: 4, not 1", () => {
  test("mid-chain checkpoint: after Smoke Screen alone resolves the Poro is 1 (2 − 1, floor hit) while Dragon Form still waits on the chain", async () => {
    const game = await board().build();
    await game.p2.cast("form", { targets: "poro" });
    await game.p2.passPriority();
    await game.p1.cast("smoke", { targets: "poro" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // top item (smoke) resolves
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["form"]);
    expect(game.state("poro").might).toBe(1);
  });

  test("after Dragon Form resolves too: layer 1 base = 5, layer 3 the REMEMBERED −1 → Poro is 4 (477.1.a.1, 477.3.b) — the 'minimum of 1' was consumed at application, it is not a standing clamp", async () => {
    const game = await smokeThenForm();
    expect(game.zoneOf("form")).toBe("trash");
    expect(game.state("poro")).toMatchObject({ might: 4, zone: "battlefield-bf1" });
    expect(game.p2.energy()).toBe(3);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  });

  test("end of turn: both 'this turn' effects lapse — on P1's turn the Poro is its printed 2 again", async () => {
    const game = await smokeThenForm();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("poro")).toMatchObject({ baseMight: 2, might: 2, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });
});

describe("Case B — Dragon Form resolves first (5), Smoke Screen afterwards snapshots the full −4: 1", () => {
  test("Dragon Form alone: the 2-Might Poro reads 5", async () => {
    const game = await board().build();
    await game.p2.cast("form", { targets: "poro" });
    await drainChain(game);
    expect(game.state("poro").might).toBe(5);
  });

  test("then Smoke Screen against a 5: −4 fits above the floor → Poro is 1; (Pal, the Flow copy's target, is 5; the Flow copy is banished)", async () => {
    const game = await formThenSmoke();
    expect(game.state("poro")).toMatchObject({ might: 1, zone: "battlefield-bf1" });
    expect(game.state("pal").might).toBe(5);
    expect(game.zoneOf("formFlow")).toBe("banishment");
    expect(game.p2.energy()).toBe(0);
  });

  test("same two cards, opposite resolution order → 4 (Case A) vs 1 (Case B)", async () => {
    const a = await smokeThenForm();
    const b = await formThenSmoke();
    expect([a.state("poro").might, b.state("poro").might]).toEqual([4, 1]);
  });

  test("end of turn: Poro back to 2, Pal back to 3", async () => {
    const game = await formThenSmoke();
    await game.advanceTurn();
    expect(game.state("poro").might).toBe(2);
    expect(game.state("pal").might).toBe(3);
  });
});

describe("Case C — Poro wearing B.F. Sword (+3): Smoke Screen sees 5 and snapshots −4; Dragon Form then gives 5 + 3 − 4 = 4", () => {
  test("premise: the equipped Poro is 2 + 3 = 5", async () => {
    const game = await board({ sword: true }).build();
    expect(game.state("poro")).toMatchObject({ attachments: ["sword"], baseMight: 2, might: 5 });
  });

  test("mid-chain checkpoint: Smoke Screen alone against the equipped 5 → full −4 → 1", async () => {
    const game = await board({ sword: true }).build();
    await game.p2.cast("form", { targets: "poro" });
    await game.p2.passPriority();
    await game.p1.cast("smoke", { targets: "poro" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["form"]);
    expect(game.state("poro").might).toBe(1);
  });

  test("after Dragon Form: layer 1 base 5; layer 3 increases first (+3 sword, 477.3.d/e.1) = 8, then the snapshotted −4 (477.3.e.2) → 4", async () => {
    const game = await smokeThenForm({ sword: true });
    expect(game.state("poro")).toMatchObject({ attachments: ["sword"], might: 4 });
  });

  test("contrast, equipped Poro in the other order (Dragon Form first → 8, then Smoke Screen −4) is ALSO 4 — with the sword the floor never bites, so order stops mattering", async () => {
    const game = await formThenSmoke({ sword: true });
    expect(game.state("poro").might).toBe(4);
  });

  test("end of turn: the equipped Poro returns to 2 + 3 = 5", async () => {
    const game = await smokeThenForm({ sword: true });
    await game.advanceTurn();
    expect(game.state("poro")).toMatchObject({ attachments: ["sword"], might: 5 });
  });
});

/** Drive to the open main phase, declining (and counting) every "becomes [Mighty]" opt-in the probe legend raises for P2. */
async function countMightyOptIns(game: Game): Promise<number> {
  let optIns = 0;
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P2 && d.source?.cardId === "duelist") {
      optIns++;
      await game.p2.no();
      continue;
    }
    await game.settle({ maxSteps: 1 });
  }
  return optIns;
}

describe("709/710 — reaching 5 through Dragon Form is 'becoming Mighty'", () => {
  // Expected: the Poro's Might changes from 2 (< 5) to 5 (≥ 5) as Dragon Form resolves → it "becomes Mighty"
  // (709/710), so Grand Duelist's "When one of your units becomes [Mighty]" opt-in is raised for P2 — exactly as
  // it is when a +N pump crosses the line. Actual: the base-Might SET never checks the Mighty threshold, so no
  // become-mighty event fires and the legend stays silent.
  test("Dragon Form taking the 2-Might Poro to 5 is 'becoming Mighty' — the probe legend's opt-in must be raised for P2 (709, 710)", async () => {
    const game = await board({ probeLegend: true }).build();
    await game.p2.cast("form", { targets: "poro" });
    const optIns = await countMightyOptIns(game);
    expect(game.state("poro").might).toBe(5);
    expect(optIns).toBe(1);
  });

  test("control: the Case A line (2 → 1 → 4) never reaches 5 → the probe legend raises nothing and stays ready", async () => {
    // Case A with the probe: Smoke Screen first (2 → 1), then Dragon Form (→ 4): 4 < 5, nobody became Mighty.
    const noMighty = await board({ probeLegend: true }).build();
    await noMighty.p2.cast("form", { targets: "poro" });
    await noMighty.p2.passPriority();
    await noMighty.p1.cast("smoke", { targets: "poro" });
    const optIns = await countMightyOptIns(noMighty);
    expect(noMighty.state("poro").might).toBe(4);
    expect(optIns).toBe(0);
    expect(noMighty.state("duelist").isExhausted).toBe(false);
  });
});
