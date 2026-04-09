# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## AI-First Contribution Workflow

This codebase is a **Hybrid Intelligence Project**. While maintained by humans, most development is performed by AI Agents. We prioritize **Architecture & Planning** over raw code generation.

### The Golden Rule: No Code Without Logs

Before writing implementation code, you **must** create or update a Memory Bank log:

```bash
cp .ai_memory/TEMPLATE.md .ai_memory/<feature-branch>.md
```

### Workflow

1. **Plan** - Create Memory Bank log with your approach
2. **Steering PR** - For complex features, submit plan-only PR first
3. **Implement** - Follow your documented plan
4. **Gauntlet** - Pre-empt the 3-agent review

## Key Commands

```bash
# Development
bun install          # Install dependencies
bun test             # Run all tests
bun run check-types  # TypeScript check
bun run format       # Format code (Oxc formatter)
bun run lint         # Run linter

# CI Pipeline
bun run ci-check     # Run all checks
```

## Code Style Requirements

- **No `any` types** - Use `unknown` if truly unknown
- **Type-only imports** - `import type { ... }`
- **Branded types** - `CardId`, `PlayerId`, `ZoneId`
- **Immutable state** - All changes via Immer
- **TDD** - Write tests first, 95%+ coverage target

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files | kebab-case | `card-instance.ts` |
| Types | PascalCase | `CardInstance` |
| Functions | camelCase | `createCard()` |
| Constants | SCREAMING_SNAKE | `MAX_HAND_SIZE` |

### Import Order

1. Type-only imports (`import type`)
2. External packages
3. Internal packages (`@tcg/core`)
4. Relative imports

## Project Structure

```
tcg-engines/
├── .ai_memory/           # Memory Bank (development logs)
├── .claude/
│   ├── agents/           # Specialized AI agents
│   ├── commands/         # Slash command skills
│   ├── rules/            # Coding standards
│   └── skills/           # Domain-specific knowledge
├── .cursor/rules/        # Cursor AI configuration
├── agent-os/
│   ├── product/          # Mission, roadmap, philosophy
│   └── standards/        # Technical standards
└── packages/             # Source code
```

## The Gauntlet: 3-Agent Review

Your code will be reviewed by three specialized agents:

| Agent | Focus | Invoke |
|-------|-------|--------|
| **Linter** | Style, formatting, TypeScript | `gauntlet-linter` |
| **Analyst** | Game logic, rules, patterns | `gauntlet-analyst` |
| **Tech Lead** | Architecture, DRY, performance | `gauntlet-tech-lead` |

## Architecture Principles

### Game Engine vs Core Engine

**Game Engine (`packages/riftbound-engine/`)** contains:
- Card definitions and abilities
- Game-specific move implementations
- Rule-specific validations

**Core Engine (`packages/core/`)** contains:
- Move validation framework
- Zone management
- State management (Immer)
- Network synchronization

### Key Pattern

```typescript
// Use core zone operations
moveCard(state, { from: 'hand', to: 'field', cardId });

// NOT manual manipulation
state.hand.splice(index, 1);
```

## Riftbound Engine Architecture

### Package Layout

```
packages/riftbound-engine/src/
├── abilities/              # Ability system
│   ├── effect-executor.ts  # Executes 34+ effect types (draw, damage, kill, heal, etc.)
│   ├── trigger-matcher.ts  # Matches game events to triggered abilities on board cards
│   ├── trigger-runner.ts   # Fires triggers and executes their effects
│   ├── static-abilities.ts # Recalculate-from-scratch continuous effect layer
│   ├── replacement-effects.ts # "Instead of..." event interception
│   ├── target-resolver.ts  # Resolves target DSL to actual card IDs
│   └── game-events.ts      # All game event types (19 events)
├── chain/
│   └── chain-state.ts      # Chain (spell stack) + Showdown state machine
├── cleanup/
│   └── state-based-checks.ts # Death checks, gear recall, static recalc, combat pending
├── combat/
│   └── combat-resolver.ts  # Mutual simultaneous damage model (rule 626)
├── game-definition/
│   ├── definition.ts       # GameDefinition wiring
│   ├── flow/turn-flow.ts   # 6-phase turn: awaken→beginning→channel→draw→main→ending
│   └── moves/              # 60+ move definitions across 10 files
├── keywords/
│   └── keyword-effects.ts  # 16 keywords (Assault, Shield, Tank, Backline, etc.)
├── operations/
│   └── card-lookup.ts      # CardDefinitionRegistry for runtime card data
├── types/
│   ├── game-state.ts       # RiftboundGameState, RiftboundCardMeta, GrantedKeyword
│   └── moves.ts            # RiftboundMoves interface (all move parameter types)
├── bot/                    # AI bot with 4 strategies
├── deckbuilder/            # Deck validation and building
├── modes/                  # 5 game modes (Duel, Match, FFA3, FFA4, 2v2)
└── views/                  # Player view (information hiding)
```

### How a Game Turn Works

```
Awaken   → Ready all cards, clear stun (rule 515.1)
Beginning → Kill Temporary units, Hold scoring, start-of-turn triggers (rule 515.2)
Channel  → Channel 2 runes from rune deck (rule 515.3)
Draw     → Draw 1 card, Burn Out if empty, empty rune pool (rule 515.4)
Main     → Player-driven: play cards, activate abilities, move units, combat
Ending   → Clear damage, expire turn-scoped keywords/mightModifier, empty pools (rule 517)
```

### How Effects Execute

1. Card ability has an `effect` object (e.g., `{ type: "damage", amount: 3, target: { type: "unit" } }`)
2. `executeEffect()` switches on `effect.type` (34 cases)
3. Targets resolved via `resolveTarget()` → actual card IDs on board
4. State mutations via `EffectContext` (zones, counters, cards APIs)
5. `checkBecomesMighty()` fires if Might crosses 5+ threshold
6. `performCleanup()` runs after chain resolution (death checks, static recalc, etc.)

### How Combat Works (rule 626)

Mutual simultaneous damage — NOT "winner deals excess":
1. Calculate attacker total Might (base + Assault + buffs + equipment + static)
2. Calculate defender total Might (base + Shield + buffs + equipment + static)
3. Attackers deal FULL Might as damage to defenders (Tank first, Backline last)
4. Defenders deal FULL Might as damage to attackers (Tank first, Backline last)
5. Both happen simultaneously — units with damage >= Might die
6. Outcome: all defenders dead + attacker survives → conquer; otherwise → attacker recalled

### How the Chain Works (rules 532-544)

LIFO spell stack with priority passing:
1. Player plays spell → goes on chain (Neutral Closed state)
2. Priority passes: opponent can respond with Reaction → adds to chain
3. When both pass → top item resolves, its effect executes
4. Passes reset, repeat until chain empty → back to Neutral Open
5. Showdowns work similarly with Focus instead of Priority

### How Static Abilities Work

Recalculate-from-scratch after every state mutation:
1. Strip all `duration: "static"` keywords and `staticMightBonus` from all board cards
2. Scan all board cards for `type: "static"` abilities
3. Evaluate conditions (while-at-battlefield, while-mighty, while-buffed, etc.)
4. Apply effects to matching targets (modify-might, grant-keyword)
5. Runs as Step 3 of `performCleanup()`

### Card Data Pipeline

```
Card .ts files (rulesText only) → Parser (packages/riftbound-cards/src/parser/)
  → Enrichment (enrich-cards.ts) → Structured abilities on card objects
  → CardDefinitionRegistry (runtime) → Engine reads abilities during gameplay
```

### Key Types

| Type | Location | Purpose |
|------|----------|---------|
| `RiftboundGameState` | `types/game-state.ts` | Full game state (players, battlefields, rune pools, turn) |
| `RiftboundCardMeta` | `types/game-state.ts` | Per-card runtime state (damage, buffed, stunned, equipped, keywords) |
| `RiftboundMoves` | `types/moves.ts` | All 60+ move parameter types |
| `ExecutableEffect` | `abilities/effect-executor.ts` | Effect object passed to executor |
| `EffectContext` | `abilities/effect-executor.ts` | APIs available during effect execution |
| `CombatUnit` | `combat/combat-resolver.ts` | Simplified unit for combat calculation |
| `ChainItem` | `chain/chain-state.ts` | Spell/ability on the chain stack |
| `GrantedKeyword` | `types/game-state.ts` | Temporarily granted keyword with duration |

## Available Skills & Agents

See `agents.md` for the complete reference of available agents and skills.

### Quick Reference

| Need | Resource |
|------|----------|
| Code style | `.claude/rules/code-style.md` |
| TCG concepts | `.claude/rules/domain-concepts.md` |
| Error handling | `.claude/rules/error-handling.md` |
| Lorcana cards | `.claude/skills/lorcana-cards/` |
| Lorcana rules | `.claude/skills/lorcana-rules/` |
| Philosophy | `agent-os/product/philosophy.md` |

## Testing

This project follows strict TDD:

1. **Write tests first** - Before implementing
2. **Red-Green-Refactor** - Failing test → Pass → Clean up
3. **95%+ coverage** - Comprehensive coverage required

## Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

Types: feat, fix, docs, style, refactor, test, chore

Example: feat(core): add zone shuffling operation
```
