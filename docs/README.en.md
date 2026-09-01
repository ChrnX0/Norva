# NORVA

[Português](../README.md) · **English** · [Español](README.es.md)

Management software for people who **make and distribute**: from recipe to real
cost, from production to lot, from the cold room to the store, and from what
shipped to the profit that should have come back.

It starts life at a popsicle and ice cream factory, but nothing about ice cream
is hardcoded — the packaging hierarchy, the modules and the roles are all
configurable, because the product is meant to ship on the Android and Apple
stores.

> **Status: Phase 1 — what you make and what it costs.** On top of the phase 0
> base (ledger, multi-company, capability permissions, design system, i18n) the
> input, recipe, product and purchase screens now run, with cost recalculating
> as you type. Production, lots and distribution come next.

---

## The gap this fills

Research across five markets (Brazil, Spanish-speaking Latin America, the
Anglophone world, Italy and India) found the same split every time:

| Region | Solves well | Ignores |
|---|---|---|
| 🇧🇷 Brazil | Store POS **or** heavy industrial ERP | The small manufacturer who distributes |
| 🇦🇷🇨🇱🇲🇽🇨🇴 LATAM | Hospitality POS | Production as industry |
| 🇺🇸🇬🇧 Anglophone | Recipe cost, traceability | Mobile, affordable pricing |
| 🇮🇹 Italy | Technical balancing (PAC/POD) | Stock, distribution, money |
| 🇮🇳 India | Distribution, cold chain | Small scale, simplicity |

Each region solves one piece. **Nobody joins them.** And the sector's number one
complaint is not a missing feature — it is **onboarding and support**. That is
why the setup assistant, which a person completes alone without a consultant, is
treated here as a headline capability rather than a detail.

---

## The nine foundations

None of them can be added later.

**F1 · Immutable ledger.** There is no `current_stock` column. Balance is the
sum of an append-only list of movements. That buys, for free: history, audit,
correction by reversal instead of deletion, reports that cannot disagree with
the history, and offline sync without conflicts. Immutability is enforced by a
*database trigger*, not by convention.

**F2 · Frozen cost.** Every movement stores the cost at that instant. Changing
the price of sugar in March must not rewrite January's margin.

**F3 · Offline-first.** A cold room is a metal box and a delivery route has no
signal. Ids are generated on the device, so replaying a queue twice is harmless.

**F4 · Multi-tenant from line one.** `company_id` on every table, isolation
enforced by RLS on the server.

**F5 · Modules on a switch.** A disabled module is **invisible**, never greyed
out — a locked field reads as a shakedown. Disabling never deletes data.

**F6 · Permission by capability, never by screen.** A role is a bundle of
capabilities. Hiding a button is decoration, not security.

**F7 · "It depends" becomes data.** Every store and customer carries an
agreement card (price list, delivery days, approval, credit, return policy). The
system does not have *the* flow — it has that customer's flow.

**F8 · Collect the signal now, switch the intelligence on later.** Daily
temperature and coordinates are stored from day one even while unused: history
cannot be created retroactively.

**F9 · Money in integer cents.** Never a float.

---

## Design

**Color is an accent, never a surface.** Eight pastel ambients (one per area)
say *where you are*; four saturated signals say *what is happening*. The two
families never mix, separated by saturation and role. An area's color appears in
exactly four places: the card's 3px rail, the header icon, the primary button,
and a chart stroke.

**Life comes from motion.** Nothing blinks; pulses run between 2.6 and 3.2s. At
most two animated elements per screen. Only what is genuinely live may pulse — a
pulse beside a frozen number is a visual lie. `prefers-reduced-motion` turns it
all off and the screen stays complete.

**Cognitive accessibility outranks aesthetics.** Never an icon alone · one
primary action per screen, labelled with a verb · confirmation written out in
full · **color never travels alone, always with the word** · 17pt body, one step
above the market default, because this is read in a warehouse under bad light.

**Type: IBM Plex Sans + IBM Plex Mono.** A technical choice, not an aesthetic
one — tabular figures (otherwise the value column dances on every update) and a
monospaced sibling in which `0` and `O`, `1` and `l` cannot blur. Someone will
type lot codes wearing gloves, in the cold, off a wet label.

---

## Running

```bash
npm install
npx expo start
```

Verification:

```bash
npm run typecheck   # types
npm test            # the cost engine, including invoice → recipe → product
npm run db:verify   # stands up a throwaway Postgres and proves what the schema promises
```

---

## Layout

```
app/                    routes (Expo Router)
src/config/brand.ts     name, mark and deep link - single point
src/theme/              tokens and theme provider
src/domain/             ledger, money, recipe, moving average, packaging
src/data/               local SQLite and the single query path
src/components/         Card, Chip, Button, UnitStepper, PulseDot, CountUp…
src/i18n/               pt-BR · es · en, with per-locale money and dates
supabase/migrations/    versioned schema (not applied to any project)
```

The brand name lives only in `src/config/brand.ts` and `app.json`. Rebranding is
a file edit, not a refactor — a deliberate decision while the Brazilian
trademark search is still outstanding.

---

## What is left, and needs a human

- **Formal trademark filing at INPI.** The clearance search came back green for
  Brazil; filing is still the owner's act. The search itself is not automatable:
  INPI requires a gov.br login and WIPO's database sits behind a CAPTCHA.
- **Supabase project.** Migrations are ready; applying them needs an account.
- **Expo/EAS account** for builds and OTA updates.
- **Domain.**

---

## License

Proprietary. All rights reserved.
