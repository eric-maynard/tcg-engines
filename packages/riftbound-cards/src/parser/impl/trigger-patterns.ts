/**
 * Trigger pattern table.
 */

// ============================================================================
// Triggered Ability Parser
// ============================================================================

/**
 * Patterns for triggered abilities
 */
export const TRIGGER_PATTERNS: {
  pattern: RegExp;
  event: string;
  on?: string;
  restrictions?: readonly { type: string; count?: number }[];
}[] = [
  // rule-id: ogn-067-298 — "to a battlefield" is captured (group 1) so the
  // parser can gate the trigger on a while-at-battlefield condition.
  { event: "play-self", pattern: /^When you play (?:me|this)(\s+to a battlefield)?,\s*/i },
  { event: "become-mighty", on: "self", pattern: /^When I become \[Mighty\],\s*/i },
  { event: "attack", on: "self", pattern: /^When I attack,\s*/i },
  { event: "defend", on: "self", pattern: /^When I defend,\s*/i },
  { event: "conquer", on: "self", pattern: /^When I conquer an open battlefield,\s*/i },
  { event: "conquer", on: "self", pattern: /^When I conquer after an attack,\s*/i },
  { event: "conquer", on: "self", pattern: /^When I conquer,\s*/i },
  { event: "hold", on: "self", pattern: /^When I hold,\s*/i },
  { event: "win-combat", on: "self", pattern: /^When I win a combat,\s*/i },
  { event: "die", on: "self", pattern: /^When I die,\s*/i },
  { event: "move", on: "self", pattern: /^When I move,\s*/i },
  { event: "move-to-battlefield", on: "self", pattern: /^When I move to a battlefield,\s*/i },
  { event: "attack", on: "friendly-units", pattern: /^When a friendly unit attacks,\s*/i },
  { event: "defend", on: "friendly-units", pattern: /^When a friendly unit defends,\s*/i },
  { event: "conquer", on: "friendly-units", pattern: /^When a friendly unit conquers,\s*/i },
  { event: "hold", on: "friendly-units", pattern: /^When a friendly unit holds,\s*/i },
  { event: "die", on: "friendly-units", pattern: /^When a friendly unit dies,\s*/i },
  {
    event: "move-to-battlefield",
    on: "friendly-units",
    pattern: /^When a friendly unit moves to a battlefield,\s*/i,
  },
  {
    event: "move-to-battlefield",
    on: "opponent",
    pattern: /^When an opponent moves to a battlefield(?:\s+other than mine)?,\s*/i,
  },
  { event: "die", on: "another-friendly-units", pattern: /^When another friendly unit dies,\s*/i },
  {
    event: "die",
    on: "another-friendly-non-recruit",
    pattern: /^When another non-Recruit unit you control dies,\s*/i,
  },
  {
    event: "die",
    on: "another-friendly-non-recruit",
    pattern: /^When a non-Recruit unit you control dies,\s*/i,
  },
  { event: "die", on: "enemy-units", pattern: /^When an enemy unit dies,\s*/i },
  { event: "attack", on: "controller-here", pattern: /^When you attack here,\s*/i },
  { event: "conquer", on: "controller-here", pattern: /^When you conquer here,\s*/i },
  { event: "conquer", on: "controller", pattern: /^When you conquer,\s*/i },
  {
    event: "recycle-cards-to-deck",
    on: "controller",
    pattern: /^When you recycle one or more cards to your Main Deck,\s*/i,
  },
  {
    event: "kill-enemy-with-spell",
    on: "controller",
    pattern: /^When you kill (?:a|an) (?:stunned\s+)?enemy unit with a spell,\s*/i,
  },
  {
    event: "kill-enemy",
    on: "controller",
    pattern: /^When you kill (?:a|an) (?:stunned\s+)?enemy unit,\s*/i,
  },
  { event: "hold", on: "controller-here", pattern: /^When you hold here,\s*/i },
  { event: "hold", on: "controller", pattern: /^When you hold,\s*/i },
  { event: "win-combat", on: "controller", pattern: /^When you win a combat,\s*/i },
  { event: "defend", on: "controller-here", pattern: /^When you defend here,\s*/i },
  { event: "play-spell", on: "controller", pattern: /^When you play a spell,\s*/i },
  { event: "play-spell", on: "opponent", pattern: /^When an opponent plays a spell,\s*/i },
  { event: "discard", on: "controller", pattern: /^When you discard a card,\s*/i },
  { event: "discard", on: "self", pattern: /^When you discard me,\s*/i },
  { event: "buff", pattern: /^When you buff a (?:friendly )?unit,\s*/i },
  { event: "buff", on: "self", pattern: /^When I'm buffed,\s*/i },
  { event: "spend-buff", pattern: /^When you spend a buff,\s*/i },
  { event: "recycle", on: "controller", pattern: /^When you recycle one or more cards,\s*/i },
  { event: "choose-or-ready", on: "self", pattern: /^When you choose or ready me,\s*/i },
  { event: "attach-equipment", on: "self", pattern: /^When you attach an Equipment to me,\s*/i },
  {
    event: "defend-or-play-from-hidden",
    on: "self",
    pattern: /^When I defend or I'm played from \[Hidden\],\s*/i,
  },
  {
    event: "look-at-deck",
    on: "controller",
    pattern: /^When you look at cards from the top of your deck[^,]*,\s*/i,
  },
  {
    event: "play-from-hidden",
    on: "self",
    pattern: /^When you play (?:this|me) from (?:face down|\[Hidden\]),\s*/i,
  },
  {
    event: "beginning-phase",
    on: "controller",
    pattern: /^At (?:the )?start of your Beginning Phase,\s*/i,
  },
  { event: "start-of-turn", on: "controller", pattern: /^At the start of your turn,\s*/i },
  { event: "end-of-turn", on: "controller", pattern: /^At the end of your turn,\s*/i },
  { event: "attack", on: "self", pattern: /^Whenever I attack,\s*/i },
  { event: "hold", on: "self", pattern: /^Whenever I hold,\s*/i },
  // "The first time ... each turn" restriction patterns
  {
    event: "conquer",
    on: "self",
    pattern: /^The first time I conquer each turn,\s*/i,
    restrictions: [{ type: "first-time-each-turn" }],
  },
  {
    event: "move",
    on: "self",
    pattern: /^The first time I move each turn,\s*/i,
    restrictions: [{ type: "first-time-each-turn" }],
  },
  {
    event: "play-spell",
    on: "controller",
    pattern: /^The first time you play a spell each turn,\s*/i,
    restrictions: [{ type: "first-time-each-turn" }],
  },
  {
    event: "discard",
    on: "controller",
    pattern: /^The first time you discard a card each turn,\s*/i,
    restrictions: [{ type: "first-time-each-turn" }],
  },
  // "The Nth time ... in a turn" restriction patterns
  {
    event: "move",
    on: "self",
    pattern: /^The third time I move in a turn,\s*/i,
    restrictions: [{ count: 3, type: "nth-time-each-turn" }],
  },
  // Compound trigger: "When I attack or defend, ..."
  { event: "attack-or-defend", on: "self", pattern: /^When I attack or defend,\s*/i },
  // "When a friendly unit attacks or defends alone, ..."
  {
    event: "attack-or-defend-alone",
    on: "friendly-units",
    pattern: /^When a friendly unit attacks or defends alone,\s*/i,
  },
  // "When you play another unit, ..."
  { event: "play-unit", on: "another-friendly-units", pattern: /^When you play another unit,\s*/i },
  // "When you play a unit, ..."
  { event: "play-unit", on: "friendly-units", pattern: /^When you play a unit,\s*/i },
  // "When you play a token unit, ..."
  { event: "play-token-unit", on: "controller", pattern: /^When you play a token unit,\s*/i },
  // "When you ready a friendly unit, ..."
  { event: "ready", on: "friendly-units", pattern: /^When you ready a friendly unit,\s*/i },
  // "When you stun an/one or more enemy unit(s), ..."
  {
    event: "stun",
    on: "enemy-units",
    pattern: /^When you stun (?:an|one or more) enemy units?,\s*/i,
  },
  // "When you buff me, ..."
  { event: "buff", on: "self", pattern: /^When you buff me,\s*/i },
  // "When a buffed friendly unit dies, ..."
  { event: "die", on: "friendly-units", pattern: /^When a buffed friendly unit dies,\s*/i },
  // "When a unit moves from here, ..."
  { event: "move-from-here", on: "any", pattern: /^When a unit moves from here,\s*/i },
  // "When you play a card from [Hidden], ..."
  {
    event: "play-from-hidden",
    on: "controller",
    pattern: /^When you play a card from \[Hidden\],\s*/i,
  },
  // "When you play a spell that costs N or more, ..."
  {
    event: "play-spell",
    on: "controller",
    pattern: /^When you play a spell that costs (?::rb_energy_\d+:|\d+) or more,\s*/i,
  },
  // "When I move from a battlefield, ..."
  { event: "move-from-battlefield", on: "self", pattern: /^When I move from a battlefield,\s*/i },
  // "When you use an activated ability of a gear, ..."
  {
    event: "use-activated-ability",
    on: "controller",
    pattern: /^When you use an activated ability of a gear,\s*/i,
  },
  // "When you draw your second card each turn, ..."
  {
    event: "draw",
    on: "controller",
    pattern: /^When you draw your second card each turn,\s*/i,
    restrictions: [{ count: 2, type: "nth-time-each-turn" }],
  },
  // "When you discard one or more cards, ..."
  { event: "discard", on: "controller", pattern: /^When you discard one or more cards,\s*/i },
  // "When I'm played and when I conquer, ..."
  {
    event: "play-self-or-conquer",
    on: "self",
    pattern: /^When I'm played and when I conquer,\s*/i,
  },
  // "When you play your second card in a turn, ..."
  {
    event: "play-card",
    on: "controller",
    pattern: /^When you play your second card in a turn,\s*/i,
    restrictions: [{ count: 2, type: "nth-time-each-turn" }],
  },
  // "When an enemy unit attacks a battlefield you control, ..."
  {
    event: "attack",
    on: "enemy-units",
    pattern: /^When an enemy unit attacks a battlefield you control,\s*/i,
  },
  // "When a player plays a spell, ..."
  { event: "play-spell", on: "any-player", pattern: /^When a player plays a spell,\s*/i },
  // "When a player plays a unit here, ..."
  { event: "play-unit", on: "any-player", pattern: /^When a player plays a unit here,\s*/i },
  // "When you conquer or hold, ..."
  { event: "conquer-or-hold", on: "controller", pattern: /^When you conquer or hold,\s*/i },
  // "When I win a combat, ..." (already have "When I win a combat," - make sure it exists)
  // "When you play me or when I hold, ..."
  {
    event: "play-self-or-hold",
    on: "self",
    pattern: /^When you play me or when I hold,\s*/i,
  },
  // "The first time a friendly unit dies each turn, ..." (Wraith of Echoes)
  {
    event: "die",
    on: "friendly-units",
    pattern: /^The first time a friendly unit dies each turn,\s*/i,
    restrictions: [{ type: "first-time-each-turn" }],
  },
  // "When this is played, discarded, or killed, ..." (Scrapheap)
  // Multi-event union encoded as a synthetic event name.
  {
    event: "play-discard-or-die-self",
    on: "self",
    pattern: /^When this is played, discarded, or killed,\s*/i,
  },
  // "When an opponent scores, ..." (Sumpworks Map)
  { event: "score", on: "opponent", pattern: /^When an opponent scores,\s*/i },
  // "When you play a unit during a showdown, ..." (Fresh Beans)
  {
    event: "play-unit",
    on: "controller",
    pattern: /^When you play a unit during a showdown,\s*/i,
    restrictions: [{ type: "during-showdown" }],
  },
  // "When you play a card with Power cost X or more, ..." (Yordle Explorer)
  {
    event: "play-card",
    on: "controller",
    pattern:
      /^When you play a card with Power cost (?::rb_rune_(?:fury|calm|mind|body|chaos|order|rainbow):)+ or more,\s*/i,
  },
  // "At the start of each player's Beginning Phase, ..." (Frozen Fortress)
  {
    event: "beginning-phase",
    on: "any-player",
    pattern: /^At the start of each player's Beginning Phase,\s*/i,
  },
  // "When a unit here is returned to a player's hand, ..." (Ripper's Bay)
  {
    event: "return-to-hand",
    on: "any",
    pattern: /^When a unit here is returned to a player's hand,\s*/i,
  },
  // "When a player chooses a friendly unit here with a spell for the first time each turn, ..." (The Dreaming Tree)
  {
    event: "choose-unit-with-spell",
    on: "controller-here",
    pattern:
      /^When a player chooses a friendly unit here with a spell for the first time each turn,\s*/i,
    restrictions: [{ type: "first-time-each-turn" }],
  },
  // "When a player plays a unit here, ..." (Valley of Idols) — already partially supported.
  // "When a showdown begins here, ..." (Diana, Lunari)
  {
    event: "showdown-begin",
    on: "controller-here",
    pattern: /^When a showdown begins here,\s*/i,
  },
  // "When an opponent plays a unit while I'm at a battlefield, ..." (Vex Apathetic)
  {
    event: "play-unit",
    on: "opponent",
    pattern: /^When an opponent plays a unit while I'm at a battlefield,\s*/i,
    restrictions: [{ type: "self-at-battlefield" }],
  },
  // "When you or an ally hold, ..." (Chem-Baroness)
  {
    event: "hold",
    on: "controller-or-allies",
    pattern: /^When you or an ally hold,\s*/i,
  },
  // "The first time a player plays a non-token unit here each turn, ..." (Star Spring)
  {
    event: "play-unit",
    on: "any-player",
    pattern: /^The first time a player plays a non-token unit here each turn,\s*/i,
    restrictions: [{ type: "first-time-each-turn" }, { type: "non-token" }],
  },
  // "When I become ready, ..." (Fretful Feline)
  // rule-id: ven-071-166 — engine emits/matches TriggerEvent "ready" (EVENT_MAP
  // in trigger-matcher.ts + trigger-types.ts); "become-ready" never matched.
  { event: "ready", on: "self", pattern: /^When I become ready,\s*/i },
  // "When you empower something [else], ..." (Matriarch of War, Soul's Reflection)
  {
    event: "empower",
    on: "controller",
    pattern: /^When you empower something(?: else)?,\s*/i,
  },
  // "When you banish a card [you own], ..." (Master of Shadows)
  {
    event: "banish",
    on: "controller",
    pattern: /^When you banish a card(?: you own)?,\s*/i,
  },
  // "When you play a card from anywhere other than your hand, ..." (Heart of the Tempest)
  {
    event: "play-card-not-from-hand",
    on: "controller",
    pattern: /^When you play a card from anywhere other than your hand,\s*/i,
  },
  // "When you play a card on an opponent's turn, ..." (Viktor, Innovator)
  {
    event: "play-card",
    on: "controller",
    pattern: /^When you play a card on an opponent's turn,\s*/i,
    restrictions: [{ type: "on-opponent-turn" }],
  },
  // "When an opponent plays a gear, ..." (Ravenbloom Prefect)
  { event: "play-gear", on: "opponent", pattern: /^When an opponent plays a gear,\s*/i },
  // "When combat starts here, ..." (Threshold of the Gray)
  { event: "combat-start", on: "controller-here", pattern: /^When combat starts here,\s*/i },
  // "When a combat that I was in ends, ..." (Affectionate Poro)
  { event: "combat-end", on: "self", pattern: /^When a combat that I was in ends,\s*/i },
  // "When you play your first card each turn, ..." (Astral Heron)
  {
    event: "play-card",
    on: "controller",
    pattern: /^When you play your first card each turn,\s*/i,
    restrictions: [{ count: 1, type: "nth-time-each-turn" }],
  },
  // "Once each turn, when an enemy unit here dies, ..." (Nasus)
  {
    event: "die",
    on: "enemy-units",
    pattern: /^Once each turn, when an enemy unit(?: here)? dies,\s*/i,
    restrictions: [{ type: "once-each-turn" }],
  },
  // "At the start of your Main Phase, ..." (Bottled Constellation)
  { event: "main-phase", on: "controller", pattern: /^At the start of your Main Phase,\s*/i },
  // "When you play me or the first time you play a non-token gear each turn, ..." (Jayce)
  {
    event: "play-self-or-play-gear",
    on: "self",
    pattern: /^When you play me or the first time you play a non-token gear each turn,\s*/i,
  },
  // "When you play this or at the start of your Beginning Phase, ..." (Forgotten Relic)
  {
    event: "play-self-or-beginning-phase",
    on: "self",
    pattern: /^When you play this or at the start of your Beginning Phase,\s*/i,
  },
];
