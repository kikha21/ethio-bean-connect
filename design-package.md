# ETHIO BEAN CONNECT — Design Package

Tier 1, single journey. Written before generation, consumed by the build.
Every viewer-facing line below ships verbatim.

---

## 1. The brand premise

The one word is **lot**. Not "coffee" in the abstract: a lot is a real, specific
batch with one origin, one grade, one quantity, one washing station behind it.
The whole site teaches one sentence: **every lot has a buyer, and Ethio Bean
Connect knows which one.** Every section serves that. The problem section says
why lots go unmatched. The origins section says what makes a lot what it is.
The interactive moment lets the visitor seal a lot with their own hand. The form
posts a lot. If a section does not serve the premise, it is cut.

## 2. Palette as CSS tokens

Sampled from the client's own logo (forest green, coffee brown, gold trade
routes) and from the footage's highland grade.

```css
:root{
  --canvas:#0E130F;          /* deep highland green-black, never pure black */
  --canvas-2:#141B15;        /* second ground for alternating sections */
  --panel:#1A231B;           /* cards, the lot slip */
  --panel-edge:#2B3A2C;      /* hairline separators */
  --border-strong:#485C49;   /* interactive borders, 3:1 on canvas */
  --accent:#C8A44A;          /* the logo's gold: CTA, seal, the thread */
  --accent-hover:#E0BC61;
  --accent-muted:rgba(200,164,74,.20);
  --green:#2F6B34;           /* the logo's green */
  --green-lift:#5E9A5A;
  --bean:#5A3A22;            /* the logo's brown */
  --text-primary:#F3F0E6;
  --text-secondary:#A9B5A6;
}
```

**Declared deviation.** Dark canvas with a gold accent is on the skill's banned
list as a default reach. It is not a default reach here: green, brown and gold
are the client's own logo colours, and the footage is a gold-lit green highland.
It is earned by (a) sampling from the delivered footage, (b) refusing the third
leg of that cliché, the high-contrast display serif, (c) inventing the gold
origin thread as the signature, and (d) never using the stock centred-hero,
three-card, big-serif template layout.

## 3. The type trio

- **Display: Archivo** (700), uppercase, tight tracking. Institutional and
  confident, echoing the logo's inscriptional caps without the fashion serif.
- **Body: Source Sans 3** (400, 600). Quiet, highly legible, gets out of the way.
- **Mono: IBM Plex Mono** (400, 500). Lot numbers, grades, prices, dates. The
  language of a grading slip.

Not Inter. Not Roboto. Weights trimmed to exactly these, with `preconnect`.

## 4. The band map

Hero height 520vh, so the scroll range is 420vh. Ranges are starting points,
validated by the flick test.

| Band | Range | Footage moment | Copy (verbatim) | Entrance |
|---|---|---|---|---|
| 1 | 0.00 to 0.30 | Hanging beneath cloud, highlands below, mist drifting | "Ethiopia grows the coffee the world is asking for." | Drift-down: words start above their place and fall in, echoing the descent about to begin |
| 2 | 0.35 to 0.65 | Falling through the mist, droplets catching the lens | "Finding the right buyer is the hard part." | Blur-to-sharp: two stacked copies crossfade, echoing the mist clearing |
| 3 | 0.72 to 1.00 | Settled close among ripe red cherries, morning light | Headline: "Every lot has a buyer." Subline: "We find them. You keep trading." CTA row. | Word-by-word rise into a staged settle: headline words, then subline at k 0.66, then the CTA row at k 0.78 |

Action lane: the footage's subject sits centre and right. All three bands live
in the left column, in the shadowed canopy region composed for them.

## 5. The static-hero copy block

For phones and reduced motion, composed over the ending frame.

- Headline: **"Every lot has a buyer."**
- Subline: **"Ethio Bean Connect puts Ethiopian coffee suppliers in front of the exporters who need their lots."**
- CTA: **"Post your lot"**, with the quiet link **"Looking for coffee instead?"**

## 6. The below-fold outline

Every section funnels to the single anchor `#post`.

**A. The three walls** (the pains, in the buyers' own words)
- Kicker: "What actually goes wrong"
- "Quality swings between harvests." / "A roaster wants the same coffee twice. Two harvests rarely give it to them, and one bad delivery ends the relationship."
- "Paperwork loses contracts." / "Europe now wants to know the exact ground a lot grew on. Lots with thin origin records get turned away at the door."
- "Suppliers wait to get paid." / "Coffee goes out, money comes back late or partly. Washing stations carry that risk alone."

**B. How it works** (four equal steps, each with a hand-drawn SVG icon so no step is unequal)
1. "Post the lot" / "Origin, grade, quantity, what you want for it. Two minutes."
2. "We check it" / "Grade, moisture, and the origin record, before anyone sees it."
3. "We match it" / "We already know which exporters are short of exactly your lot."
4. "You trade" / "You agree the price. We stay in it until the coffee moves."

**C. Today's market** (the price panel)
- Kicker: "Indicative levels"
- Heading: "What lots are moving at"
- Honesty line, verbatim: "These are indicative levels, not a quote. Every lot is priced on its own cup, grade and moisture. Ask us and we will confirm the same day."
- Reads from `assets/market.json`, with a real "Last updated" date rendered from the file. No invented live feed.

**D. Origins** (the gold thread branches here, one dot per origin)
- Kicker: "Where the lots come from"
- Heading: "Seven origins, and what each one actually gives you."
- Yirgacheffe — Gedeo, 1,800 to 2,200 m, washed G1 reliably available, floral and citrus, tea-like body.
- Guji — Oromia, 1,900 to 2,300 m, washed and natural G1, stone fruit and sweet spice.
- Sidamo — Sidama, 1,600 to 2,200 m, G2 and G1, berry sweetness, round body.
- Jimma — Oromia, 1,400 to 2,000 m, mostly G3 and G4, heavy body, low acidity, volume work.
- Limu — Oromia, 1,400 to 2,000 m, washed G2, balanced and winey.
- Nekemte (Lekempti) — East Wollega, 1,500 to 2,100 m, G4 and G5, fruity and bold.
- Harar — Eastern highlands, 1,500 to 2,100 m, natural, blueberry and wine, little G1.
- Closing line: "This season the south is down and the west is having a bumper year. If your usual origin is short, we will tell you where the volume actually is."

**E. The interactive moment: seal a lot**
- Kicker: "Try it"
- Heading: "This is what a sealed lot looks like."
- Instruction: "Press and hold the seal."
- On completion, the lot slip's fields light in sequence and a lot number is issued.
- Release early and the seal eases back down, it never snaps.
- Reduced motion gets the finished, sealed state with no hold required.

**F. What we check** (the trust furniture, answering the objections found in research)
- Heading: "Nothing leaves here unchecked."
- "Grade and screen size, against the grading certificate."
- "Moisture, before the lot is offered."
- "Origin record, down to the washing station, for European buyers who need it."
- "A sample in your hands before you commit to a container."

**G. FAQ** (the real objections, in buyers' words)
- "Can I get a sample before I commit?" / "Yes, and you should. Nothing goes to container without a sample you have cupped and approved. The contract is written against that sample."
- "How do I know the delivery matches the sample?" / "The contract names the grade and the cup. If a delivery does not meet the description it is written against, it is not your problem to absorb."
- "When does the supplier get paid?" / "We agree the payment terms in writing before the coffee moves, and we hold both sides to them. Suppliers waiting months for money is the thing this business exists to stop."
- "Can you handle the European traceability paperwork?" / "We collect origin records at the washing station level as part of checking a lot, so it is ready when a buyer asks rather than scrambled for afterwards."
- "What does Ethio Bean Connect cost?" / "We take a commission on a completed deal, agreed with you up front. Nothing to post a lot, nothing to look."

**H. The form** (`#post`, two tabs, "I have coffee" default)
- Heading: "Post your lot."
- Tab labels: "I have coffee" / "I need coffee"
- Required: name, company, email, phone, coffee type, origin, grade.
- Optional and clearly marked: quantity, notes.
- Client changed this on 2026-08-31, reversing the original brief: quantity
  became optional, origin and grade became required. A broker can find a buyer
  from origin and grade alone; the tonnage is usually still being counted.
- Coffee type, origin and grade each carry an **Other** option that reveals a
  free-text box, because no fixed list covers Ethiopian coffee. The typed value
  flows into the enquiry as if it had been a listed option.
- Button: "Send it to us"
- Success state: "Got it. We will come back to you within one working day."
- Handling: decided with the client before build. Default is a mailto to their
  own inbox, stated plainly under the button, with a form service offered as the
  upgrade once they want submissions in a dashboard.

**I. Footer**
- The logo, the line "Connecting Ethiopian coffee suppliers and exporters."
- Links: Market, Origins, How it works, Post your lot, Privacy, Terms.
- Contact: phone, WhatsApp, email, address. (Awaiting real details from client.)
- Language: English | አማርኛ

## 7. The vector layer plan

- **The signature: the gold origin thread.** One continuous SVG path, the same
  gold as the logo's trade routes, entering at the hero settle and running the
  whole page. It draws itself on scroll with `stroke-dashoffset`, and branches
  to a small dot beside each of the seven origins. Remove it and the page
  changes: it is the spine everything hangs from.
- **The seal.** A hand-drawn SVG stamp for the interactive moment, its ring
  filling as the visitor holds.
- **Four step icons**, drawn by hand, one visual weight, so no step reads as
  the odd one out.
- **Whisper particles:** slow motes drifting in the settle and behind the
  origins section, opacity under 0.2, 20s cycles, negative delays.
- **The environment layer:** one fixed background behind everything, a warm
  highland haze gradient drifting on a 90 second cycle plus fine grain, so the
  page reads as one place.
- Reduced motion: every one of these shows its final state, drives stopped.

## 8. The engineering list

Blob fetch behind the honest loading ring with the 20s watchdog. dt-normalized
lerp in a rAF loop that rests. Gated seeks with the deadlock escape on `error`.
Delta-gated DOM writes, 10Hz throttle on any scroll text. Band pacing validated
by the flick test at 120, 240 and 360px. The four-layer legibility system, worst
frame audited at 3.5:1 or better. Five static-hero gates, identical strings in
CSS and JS, armed and disarmed from live change listeners. Complete and
beautiful without the video. `overflow-x: clip` on html and body. Reduced motion
honoured live in both directions. The full quality floor from the skill.

## 9. The copy gate

Every viewer-facing line above ships verbatim. Before anyone sees the built
page it must grep clean: zero em dashes, zero instances of leverage, seamless,
empower, unlock, robust, actionable, data-driven, solutions. Then the body copy
sweep for AI tells. The deliberate devices in this package stay: "We find them.
You keep trading." is a planned staccato pair, not drift.
