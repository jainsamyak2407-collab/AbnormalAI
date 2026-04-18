# McKinsey Writing Skill

## Governing principle
Every brief section must answer one question before the reader asks it: "So what?" State the conclusion first. Support it with evidence. Close with the implication.

## The Pyramid Principle

Structure every section in three layers:

1. **Governing claim** — the section headline. One declarative sentence naming the finding and its direction. The reader must be able to stop here and know what happened.
2. **Supporting facts** — two to four sentences citing evidence. Each fact must connect back to the governing claim. No orphan data points.
3. **Implication** — the so_what field. One sentence stating what this means for the customer. Forward-looking. Actionable.

## Writing mechanics

### Sentence construction
- Target 15–20 words per sentence.
- Active voice. Subject performs the action. "Abnormal blocked 284 attacks." Not "284 attacks were blocked."
- One idea per sentence.
- Vary sentence length for rhythm. Short sentences punch. Longer sentences develop context with subordinate clauses only when the relationship between ideas warrants the complexity.

### Headlines
- Action-first. State the finding, not the topic.
  - BAD: "VIP Exposure"
  - GOOD: "VIP inbox attacks fell 67% across the quarter, approaching the board success criterion"
- Include a number when one is available.
- Maximum 15 words.
- No trailing punctuation.

### Numbers
- Every number needs a comparative frame: trend, benchmark, or success criterion.
  - BAD: "Abnormal blocked 1,847 threats."
  - GOOD: "Abnormal blocked 1,847 threats — 23% more than the prior quarter, placing Meridian at industry p89."
- Round to the meaningful digit. Do not report 67.3% when 67% carries the same precision.
- Percentages before counts when the ratio is the story. Counts before percentages when the volume is the story.

### Forbidden words
Never use: leverage, robust, synergies, seamless, cutting-edge, best-in-class, world-class, game-changing, transformative, holistic, paradigm, ecosystem (in a security context), innovative, solution (as a standalone noun), journey (in a business context), deep dive, circle back, move the needle, low-hanging fruit, boil the ocean.

### Forbidden constructions
- Em dashes. Use commas, semicolons, or periods.
- Passive constructions when active is possible.
- "It is worth noting that..."
- "As we can see from the data..."
- "In conclusion..."
- Hedging openers: "It appears that", "It seems like", "One could argue"
- Filler transitions: "Additionally", "Furthermore", "Moreover" — find the logical connection and name it.

## Evidence integration

### In-line chips
Reference evidence as `[E{n}]` chips. Place the chip immediately after the claim it supports, before the period. Example: "The auto-remediation rate of 67.6% sits below the industry p50 of 75.0% [E12]."

### Density
- Minimum 2 chips per section prose_inline.
- Maximum 1 chip per sentence.
- Never stack chips: `[E3][E4]` — cite the more specific one.
- Chips should appear distributed across the prose, not clustered at the end.

### Integrity rule
Never invent a number. Every quantitative claim must map to an evidence record. If the evidence does not support a claim, remove the claim.

## Audience calibration

### CISO voice
- Frame around risk and investment. The reader is responsible for the board.
- Lead with the risk that was managed, then the protection that managed it.
- Recommendations name a budget, policy, or headcount action.
- Tone: declarative, restrained, confident. No sales language.
- Time horizon: current quarter + next 90 days.

### CSM voice  
- Frame around value realized and forward opportunity. The reader is building a renewal case.
- Lead with the protection value delivered, then the benchmark position, then the gap to close.
- Recommendations name an expansion path, renewal trigger, or training program.
- Tone: consultative, commercial, forward-looking. Collaborative "we."
- Time horizon: quarter-in-review + renewal cycle.

## Thesis construction

The governing thesis must:
- Name a specific number or outcome
- Make an argument (not a description)
- Point toward an action or implication

BAD: "Abnormal Security protected Meridian Healthcare in Q1 2026."
GOOD: "Meridian cut VIP inbox exposure by 67% while closing its user reporting gap — the auto-remediation shortfall and acquisition hygiene lag remain the two risks requiring investment this quarter."

## Executive summary bullets

Three bullets, each:
- One sentence, maximum 25 words
- Names a number and its direction
- Carries at least one evidence_ref
- Covers a distinct narrative dimension (protection volume, human layer, posture/gap)

## Recommendations

Each recommendation must include:
- A specific action (not "improve" or "enhance" — a verb + object: "enforce MFA on T-002", "schedule phishing simulation for Legal department")
- An expected impact stated as an outcome with a timeframe
- A rationale that names the evidence gap
- A risk if unaddressed — stated as a concrete consequence, not a vague concern
- At least one evidence_ref grounding the recommendation

## Closing ask

- One to two sentences.
- Names the single most important decision the reader must make.
- CISO: "To close the auto-remediation gap and complete the T-002 integration, we are requesting a $X budget approval and policy mandate at the April board meeting."
- CSM: "We recommend scheduling a 30-minute renewal alignment call with your CISO before May 15 to confirm the T-002 expansion scope."
