/**
 * Rule 460.2.c.7 — damage-assignment requirement fusion (batch 15, agent Y).
 *
 * The `collectDamageRequirements(unit, meta)` helper fuses a unit's
 * printed-keyword priorities with its `meta.grantedKeywords` priorities
 * (and any explicit `meta.damageAssignmentPriority` override) into the
 * deduped + sorted requirement list the resolver consumes.
 *
 * Combat-staging in `runCombatResolution` populates
 * `CombatUnit.damageAssignmentRequirements` from this helper so the
 * resolver's existing rule-460.2.c.7 hook actually has data to work with.
 *
 * Batch 14 (W) plumbed the resolver hook; batch 15 (Y) populates the data.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { CombatUnit } from "../../combat/combat-resolver";
import { distributeDamage, resolveCombat } from "../../combat/combat-resolver";
import {
  KEYWORD_DAMAGE_PRIORITIES,
  collectDamageRequirements,
  withDamageRequirements,
} from "../../combat/damage-requirements";

describe("KEYWORD_DAMAGE_PRIORITIES — keyword → priority source of truth", () => {
  test("Tank = -1 (first), Backline = +1 (last), Patrolling = +1 (last)", () => {
    expect(KEYWORD_DAMAGE_PRIORITIES.Tank).toBe(-1);
    expect(KEYWORD_DAMAGE_PRIORITIES.Backline).toBe(1);
    expect(KEYWORD_DAMAGE_PRIORITIES.Patrolling).toBe(1);
  });
});

describe("collectDamageRequirements — keyword + meta fusion", () => {
  test("no relevant keywords + no meta → empty list", () => {
    expect(collectDamageRequirements({ keywords: ["Assault"] })).toEqual([]);
    expect(collectDamageRequirements({ keywords: [] }, {})).toEqual([]);
  });

  test("only printed Tank → single requirement (-1)", () => {
    expect(collectDamageRequirements({ keywords: ["Tank"] })).toEqual([-1]);
  });

  test("only printed Backline → single requirement (+1)", () => {
    expect(collectDamageRequirements({ keywords: ["Backline"] })).toEqual([1]);
  });

  test("granted Tank on a unit with no printed priority → single requirement (-1)", () => {
    const out = collectDamageRequirements(
      { keywords: ["Assault"] },
      { grantedKeywords: [{ duration: "static", keyword: "Tank" }] },
    );
    expect(out).toEqual([-1]);
  });

  test("printed Patrolling + granted Tank → BOTH requirements, sorted ascending [-1, +1]", () => {
    // The W blocker test case: a unit with printed [Patrolling] and a
    // Granted [Tank] (rule 460.2.c.7 — assigner chooses which applies).
    const out = collectDamageRequirements(
      { keywords: ["Patrolling"] },
      { grantedKeywords: [{ duration: "static", keyword: "Tank" }] },
    );
    expect(out).toEqual([-1, 1]);
  });

  test("printed Tank + granted Backline → [-1, +1] (sorted, deduped)", () => {
    const out = collectDamageRequirements(
      { keywords: ["Tank"] },
      { grantedKeywords: [{ duration: "static", keyword: "Backline" }] },
    );
    expect(out).toEqual([-1, 1]);
  });

  test("printed Backline + granted Patrolling → [+1] (deduped — same priority)", () => {
    const out = collectDamageRequirements(
      { keywords: ["Backline"] },
      { grantedKeywords: [{ duration: "static", keyword: "Patrolling" }] },
    );
    expect(out).toEqual([1]);
  });

  test("explicit damageAssignmentPriority override composes with keyword priorities (assigner-choice)", () => {
    // Rule 460.2.c.2 — an explicit effect-granted "must be assigned first"
    // Adds its own requirement alongside any printed keyword's. The full
    // List is then offered to the assigner under .c.7.
    const out = collectDamageRequirements(
      { keywords: ["Patrolling"] },
      { damageAssignmentPriority: -5 },
    );
    expect(out).toEqual([-5, 1]);
  });

  test("irrelevant granted keywords (Shield, Assault) ignored", () => {
    const out = collectDamageRequirements(
      { keywords: ["Tank"] },
      {
        grantedKeywords: [
          { duration: "static", keyword: "Assault", value: 3 },
          { duration: "static", keyword: "Shield", value: 1 },
        ],
      },
    );
    expect(out).toEqual([-1]);
  });
});

describe("withDamageRequirements — populates CombatUnit field", () => {
  function baseUnit(overrides: Partial<CombatUnit> = {}): CombatUnit {
    return {
      baseMight: 3,
      currentDamage: 0,
      id: "u1",
      keywords: [],
      owner: "p1",
      ...overrides,
    };
  }

  test("no relevant keywords → returns unit unchanged", () => {
    const u = baseUnit({ keywords: ["Assault"] });
    const out = withDamageRequirements(u);
    expect(out).toBe(u);
    expect(out.damageAssignmentRequirements).toBeUndefined();
  });

  test("printed Patrolling + granted Tank → unit with reqs [-1, 1]", () => {
    const u = baseUnit({ keywords: ["Patrolling"] });
    const out = withDamageRequirements(u, {
      grantedKeywords: [{ duration: "static", keyword: "Tank" }],
    });
    expect(out.damageAssignmentRequirements).toEqual([-1, 1]);
    expect(out.id).toBe("u1");
    expect(out.baseMight).toBe(3);
  });
});

describe("Resolver integration — Patrolling + granted Tank example", () => {
  function makeUnit(over: Partial<CombatUnit> & Pick<CombatUnit, "id">): CombatUnit {
    return {
      baseMight: 3,
      currentDamage: 0,
      keywords: [],
      owner: "p1",
      ...over,
    } as CombatUnit;
  }

  test("default: smallest priority wins — Tank (printed [Patrolling] + granted Tank) sorts FIRST", () => {
    // Build the unit via the helper so the requirement list matches what
    // Combat-staging will populate at runtime.
    const caitlyn = withDamageRequirements(
      makeUnit({ id: "caitlyn", keywords: ["Patrolling"] }),
      { grantedKeywords: [{ duration: "static", keyword: "Tank" }] },
    );
    // Sanity: the helper populated the list as expected.
    expect(caitlyn.damageAssignmentRequirements).toEqual([-1, 1]);

    const grunt = makeUnit({ baseMight: 2, id: "grunt" });
    // Default resolver: smallest = -1 wins → caitlyn assigned first.
    const assignment = distributeDamage([grunt, caitlyn], 3);
    expect(assignment.caitlyn).toBe(3);
    expect(assignment.grunt ?? 0).toBe(0);
  });

  test("hook override: Patrolling chosen → caitlyn sorts LAST", () => {
    const caitlyn = withDamageRequirements(
      makeUnit({ id: "caitlyn", keywords: ["Patrolling"] }),
      { grantedKeywords: [{ duration: "static", keyword: "Tank" }] },
    );
    const grunt = makeUnit({ baseMight: 2, id: "grunt" });
    // Hook: assigner picks the LARGEST (Patrolling = +1) for caitlyn.
    const assignment = distributeDamage([grunt, caitlyn], 2, (u, reqs) =>
      u.id === "caitlyn" ? Math.max(...reqs) : undefined,
    );
    // Grunt (priority 0) sorts before caitlyn (priority +1).
    expect(assignment.grunt).toBe(2);
    expect(assignment.caitlyn ?? 0).toBe(0);
  });

  test("resolveCombat surfaces the requirement-based ordering through to the full result", () => {
    const caitlyn = withDamageRequirements(
      makeUnit({ id: "caitlyn", keywords: ["Patrolling"] }),
      { grantedKeywords: [{ duration: "static", keyword: "Tank" }] },
    );
    const grunt = makeUnit({ baseMight: 2, id: "grunt" });
    const attacker = makeUnit({ baseMight: 4, id: "attacker", owner: "p2" });
    const result = resolveCombat([attacker], [grunt, caitlyn]);
    // 4 damage, default (Tank-first): caitlyn lethal (3), grunt gets 1.
    expect(result.damageAssignment.caitlyn).toBe(3);
    expect(result.damageAssignment.grunt ?? 0).toBe(1);
    expect(result.killed).toContain("caitlyn");
    expect(result.killed).not.toContain("grunt");
  });
});
