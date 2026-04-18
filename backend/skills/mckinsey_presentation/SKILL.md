# McKinsey Presentation Skill

Reference guidance for the Slide Writer stage. Apply every rule below before returning SlideContent JSON.

---

## Deck-level principles

- One thesis, five slides. Every slide earns its place against the thesis. If a slide does not advance the argument, it should not exist.
- Tell the story in the headlines. A reader who only reads the 5 headlines should get the full argument. Headlines are sentences, not topics.
- Two data slides, three text slides. Slides 3 and 4 show evidence; slides 1, 2, 5 anchor story. Do not try to put charts on every slide.
- Mirror the evidence slides. Slide 3 (what worked) and slide 4 (what's exposed) mirror each other in layout. Readers pattern-match immediately.
- End on the ask, not on a summary. Slide 5 leaves the reader with a decision to make. No "thank you" slides. No appendix. No agenda slide.

---

## Slide-level rules

### Headlines (slides 3, 4, 5)

- Action-first. Assert a finding.
- 6-12 words is the target. Never more than 14.
- Must name a specific dimension of the story, not a category.

**Weak:** "User Behavior"
**Strong:** "User reporting crossed target while credential submissions tripled"

### Callouts (slides 3, 4)

Each callout has three parts: number, label, context.

- Number is the hero: large, specific, real. Not rounded for aesthetics.
- Label is 4-8 words, describes what the number measures.
- Context is 12-20 words, gives the comparative frame (trend, benchmark, success criterion).
- Three callouts together must be MECE. No overlap.

**Weak callout:**
`"67%"` / `"Protection effectiveness"` / `"Auto-remediation held strong all quarter"`

**Strong callout:**
`"67.6%"` / `"Auto-remediation rate"` / `"Below the healthcare peer median of 75.0%, a 7.4-point gap that explains the 20 manual SOC interventions this quarter"`

### Recommendations (slide 5)

- Headline is action-first, 14 words maximum.
- Rationale is 24 words maximum, names a number and a deadline.
- Recommendations are MECE. Never two recs solving the same gap.
- One recommendation per kind where possible. Don't stack three POLICY recs.

**Weak:**
`"Invest in training"`

**Strong:**
`"Deploy mandatory phishing remediation training for the 24 highest-submitting users by end of April to bring credential submission below 3.0% before Q2 close"`

### The thesis slide (slide 2)

- Thesis comes verbatim from the brief. Do not rewrite.
- Tagline is exactly three words. Parallel structure preferred. Examples: "Protection Holds. Humans Bifurcate." or "Renewal Strong. Legal Lagging."
- No other copy on the slide.

### The title slide (slide 1)

- Customer name is the hero.
- No thesis preview. That is slide 2's job.
- Date, prepared-for, and attribution in restrained type.

---

## Voice and mechanics

- Active voice. Concrete subjects.
- Short sentences. 12-18 words on slides (tighter than the brief).
- No hedging adverbs: basically, essentially, generally, somewhat, fairly, quite.
- No buzzwords: leverage, robust, synergies, seamless, cutting-edge, best-in-class, world-class, game-changing, unlock, drive, empower, optimize, streamline, transform.
- No em dashes. Use periods or commas.
- No question marks on slides. Slides make statements.

---

## Audience-specific framing

### CISO deck

- Slide 2 thesis reads as an investment case.
- Slide 3 leads with protection effectiveness metrics that justify the spend.
- Slide 4 frames gaps as risks to the board.
- Slide 5 ask is budget, policy, or headcount. Name a dollar figure or a policy name where possible.
- Tone: restrained, declarative, board-room.

### CSM deck

- Slide 2 thesis reads as a value statement.
- Slide 3 leads with value realized and benchmark position.
- Slide 4 frames gaps as addressable expansion paths.
- Slide 5 ask is renewal confirmation or expansion engagement. Name the specific product, service, or workstream.
- Tone: consultative, commercial, forward-looking.

---

## Slide Writer checklist (apply before returning)

- [ ] Headline asserts a finding in 6-12 words (never more than 14).
- [ ] Every number on this slide has an evidence_ref that resolves in the brief.
- [ ] Callouts (if any) are exactly 3.
- [ ] Recommendations (if any) are exactly 3 and are MECE.
- [ ] No buzzwords from the kill list.
- [ ] No em dashes.
- [ ] Tagline on slide 2 is exactly 3 words.
- [ ] Audience framing is consistent with the specified audience.
- [ ] Slide content matches the plan entry's intent.
