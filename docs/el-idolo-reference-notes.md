# El Ídolo — Reference Notes (for fantasy game inspiration)

Raw catalog of every mechanic, screen, and design pattern found in the two "El Ídolo" transcripts. Organized by system. Spanish terms kept as labels (they're the actual flavor text/mechanic names); English gloss alongside. Not yet mapped onto the fantasy spec — this is the source material to mine later.

## 1. Character creation flow

- Two creation paths shown: **random** ("🎲 Al azar" button — instant random build) or **manual**: pick nationality → league's country → league → club, then name + jersey number (tap the jersey to change number), then position (Delantero "9" vs Enganche "10", each with a one-line flavor description of what that position lives/dies by).
- Explicit tagline sets player expectations upfront: *"En un grande peleás todo desde el banco; en un chico sos titular y la gente te adora"* (big club = fight for bench minutes; small club = starter, beloved) — the game tells you the tradeoff before you choose, not after.
- After class/position is picked, a **3-card archetype roll** happens ("¿Qué clase de delantero sos? El dado trajo tres destinos. Elegí uno: te define para siempre" — "the dice brought three destinies, pick one: it defines you forever"). Each archetype = one flat +8 to a single stat, no downside, permanent, no respec. Examples: Killer del área (+8 Definición), Flecha (+8 Velocidad), Tanque (+8 Potencia).
- Creation screen also surfaces: the "Carrera del Día" daily-challenge teaser (shows today's forced starting club/position for everyone), and a "Tus últimas carreras" personal run-history list (device-local).

## 2. Core stats & meters

- **Media** (0-99): average of the 4 core attributes. **Explicitly does NOT rise from performance** — the game states this outright: *"OJO: NO sube por hacer goles... meter 30 goles te da idolatría y contratos, no media"* (scoring goals gives you reputation and contracts, not stat growth). Media only moves via preseason cards, random events, and age-decline. This is a deliberate separation: **career stats (goals/assists/matches) are a downstream reputation/currency signal, never a stat-growth input.**
- **4 core attributes**, each with a named secondary effect beyond raw Media contribution:
  - Definición (Pegada) — scores routine goals; also **feeds minigame hints** ("te da la pista en los minijuegos para definir las finales").
  - Velocidad — glass cannon: more goals, more injury risk.
  - Potencia (Gambeta) — balanced: modest goal boost + more stamina.
  - Liderazgo — wins locker-room politics, rallies the team for the title, **and unlocks a gated special ability at 75+** (captain's rally in the World Cup bracket minigame, see §11).
- **Resistencia** (stamina): doesn't count toward Media, but reduces veteran fatigue and injury-driven retirement risk. Declines naturally with age; shop items slow this decline.
- **Forma** (momentum): visual states seen — 🔥 (hot), 📈 (rising), ➖ (neutral), 📉 (falling), 🥶 (ice cold). Changes goal output for the season.
- **Fama** (fame): national profile. Drives offer quality and national-team call-up odds.
- **Ganado** (money earned, cumulative) — **is a separate number from**:
- **Valor** (market value) — fluctuates with age/performance/reputation independent of cash on hand. Epilogue tracks "Valor pico" (peak market value) separately from total earned. **This is a stat I hadn't captured before**: a "how sought-after are you" number, distinct from banked gold.
- **Idolatría** (per-faction reputation, 0-100): tiers ▫️ Uno más → 👏 Querido → 💙 Referente → ⭐ Ídolo → 🗿 Leyenda. UI always shows "Te faltan N pts para ser [next tier]." Tracked **per club**, shown historically per-club in the epilogue even after leaving.
- **Selección** (secondary prestige track): a whole separate progression alongside the club career — states seen: "Sin chance" → "En carpeta" → "Convocado," with its own running tally (caps · goals) tracked independently of club stats. Occasionally pulls the player into set-piece tournament bracket minigames (§11).

## 3. Season / chapter structure ("Potrero Deportivo" recap cards)

Every season ends on a recap card with a fixed anatomy:
- Dynamic all-caps **headline** picked from the season's single biggest event: *"BARRO, RUTA Y APRENDIZAJE"*, *"UNA MÁQUINA DE GOL"*, *"EL RIVAL LE PASÓ EL TRAPO"*, *"LA COPA AMÉRICA, POR TV"* (missed the big tournament — explicitly framed as bittersweet: *"Que duela sirve"*, "the sting is useful"), *"ILUSIÓN ROTA"*, *"SE ROMPIÓ TODO"* (season-ending injury), *"¡CAMPEONES!"*, *"¡GLORIA ETERNA!"*.
- **"Nota de la temporada"** — a season report-card grade (e.g. 6.4, 8.0, 9.9), separate from Media — a qualitative "how good was this stretch" score.
- Bullet recap: goals/assists/matches, league finish, continental cup result, **rival comparison update** (this season's head-to-head + cumulative career tally + note on rival's current club), callback to the season's random event, next season's continental competition preview.
- Single "Continuar" button closes the card.

## 4. Rival system (full detail)

- Rival is one specific named NPC ("Gastón Medina") with his own club, assigned at creation, persists the whole career.
- **Persistent HUD widget** every screen: "⚔️ G+A vs Medina" (combined goals+assists) with a running comparison.
- Every season recap explicitly states the rival's stats that season and whether *"te ganó la temporada"* — **season-level head-to-head is tracked separately from the cumulative career tally.**
- Rival's club is stated on every recap ("Hoy juega en Gimnasia de Mendoza") even though the player has no control over it — implies the rival is quietly simulated/advancing off-screen.
- Epilogue gives a dedicated final side-by-side comparison block across multiple metrics at once (goals · assists · titles), not just the single combined number: "Vos: 365⚽·167🎯·6🏆 — Gastón Medina: 248⚽·136🎯·1🏆." Achievement "El Duelo Eterno" = finish ahead on the combined metric.

## 5. Preseason stat-card system (confirms slot-filling technique)

Every season: *"El dado trajo tres mejoras. Elegí una"* — 3 random cards, rarity-tagged:
- **Common**: flat +3 to one stat.
- **Rara**: bigger boost, sometimes a clean +4/+5 to one stat, sometimes two positive stats combined ("+4 Liderazgo +1 Potencia"), sometimes an explicit tradeoff ("+5 Liderazgo −2 Velocidad", "+4 Potencia +1 Definición −2 Velocidad"). Rarity does not always imply a downside — both pure-bonus and tradeoff cards carry the "Rara" tag.
- **Dorada** (seen once): the biggest boost, mostly loaded onto a *secondary* stat with a token bump to a primary ("+1 Potencia +8 Resistencia").
- **Card flavor text is templated from two composable parts**: a training-action ("Piques cortos", "Trabajo de gimnasio", "Cambio de ritmo", "La arenga", "Cuerpo blindado"...) recombined with a context modifier ("bajo la lluvia", "con el profe encima", "en la playa", "a puertas cerradas", "en la altura", "de madrugada", "sin que te vea nadie", "con la Reserva", "en el potrero del barrio"...). **This confirms the slot-filling technique already planned for the fantasy spec is exactly what this game does** — a handful of action templates × a handful of context modifiers produces dozens of distinct-feeling card names from very little authored content.

## 6. Event categories (distinct tagged types, not all uniform)

Four+ distinct labeled categories, each with its own header/icon:

- **"Pasan cosas"** (Things happen) — routine narrative beats. Not all of these are real decisions — some are pure flavor with a single "continue" button and a small stat/fame nudge (dog runs onto the pitch; viral nutmeg clip; birth of a child). Real ones offer two options with different cost/benefit (boarding-house social life vs early sleep; sell image rights now vs bet on future value; invent your own goal celebration ⚠️ risky vs safe generic one).
- **"Golpe duro"** (Hard blow) — setback-flavored events specifically: underpaid-in-installments paycheck, food poisoning before a big match, season-ending torn ligament. Always framed as something *happening to* the player, sometimes with a single "cope with it" continue, sometimes with a genuine choice (endure silently vs take a side gig for extra cash).
- **"Decisión difícil"** (Hard decision) — the highest-stakes dilemmas, always explicitly two-sided: team betting pool gamble, a corruption/match-fixing bribe offer (with severe framing: *"si te agarran, no hay vuelta"* — if caught, no going back), the abroad-transfer decision, the petro-state mega-contract (explicit tradeoffs stated: huge money, but *"se te apagan un poco las stats y no te llama la Selección"*), a boot-sponsor choice (big brand = money + heavy PR obligations vs loyal brand = less money + no hassle).
- **"Mercado de pases"** (Transfer market) — its own distinct UI, see §13.
- **"Sala de prensa"** (Press room) — the personality-tag minigame, see §9.

## 7. Press conference / personality-tag minigame (full breakdown)

- 3 questions per press conference. Each question offers a **fixed subset of 4 tags** (Humilde / Canchero-Cocky / Personalidad-Confident / Formal) — not the full 10-tag roster, a dedicated smaller pool just for this minigame.
- Framing varies: sometimes tells you upfront which tone is favored ("Le gusta: 🙏 Humilde"); other times explicitly says you won't know until the end, and — important nuance — **the "correct" read is partly a function of the player's own stats** ("tu liderazgo y tu fama pesan tanto como el tono que elijas" — your leadership and fame matter as much as the tone you pick). The hidden target isn't purely fixed content; it shifts with character state.
- **One question is deliberately a trap**: the "obvious" matching tone is wrong; the game flags this explicitly in the reveal ("Pregunta capciosa: no le des lo que busca. Acá zafás con 🎩 Formal").
- Reveal screen ("Lo que buscaba") shows the interviewer's actual hidden read, then a transcript marking each of your 3 answers ✅/❌ against it, with a graduated outcome: 0-1 correct → neutral, no effect; 2 correct → small bonus (+1 Fama); 3 correct → presumably the flawless-read achievement ("Sin Filtro").

## 8. Action mini-games — five distinct types, not just one

1. **Timing bar** ("LA DEFINICIÓN" — The Finish): a marker slides along a bar; tap "Frenar" exactly over the green zone. Definición widens the green zone (easier, not just "better odds").
2. **Direction pick** ("MANO A MANO" — one-on-one vs keeper): keeper feints one way; pick a zone (left/center/right). Explicit "read" framing: higher Definición = better read of the keeper's tendency (a hint mechanic, not raw power).
3. **Extra-chance zone pick** ("CÓRNER" — decisive header): pick one of three target zones; the defense blocks two of them; a high stat (Potencia here) grants **an extra chance to still score even if marked** — stat manifests as a bonus attempt/reroll, a third distinct way a stat can interact with a minigame (vs "bigger hit zone" and "better hint").
4. **Grid gamble** ("FINAL DEL MUNDO DE CLUBES" — penalty shootout for the biggest possible stakes): 3 goals hidden among a 3×3 grid of 9 cells; pick 7 shots trying to find all 3. Explicitly **no stat influence** — pure luck for the highest-stakes moment ("Es a todo o nada. Elegí con el corazón"). Losing narrowly still gets a strong positive narrative frame ("Subcampeón del mundo" — runner-up, framed as an achievement in itself, not a failure).
5. **Memory match** ("La pizarra del DT" — The Coach's Chalkboard, for a big continental match): face-down tile board of "rehearsed plays," flip two at a time to find pairs, limited lives (💚×4), a stat-gated bonus life ("+80 Velocidad → 1 extra life"), fail state narrated as a mental mix-up rather than a hard stop.

**Pattern worth keeping**: every mini-game integrates its relevant stat differently (bigger success window / better hint / extra attempt / no influence at all / bonus life) rather than reusing the same "stat = win% modifier" formula every time — keeps them feeling mechanically distinct, not reskins of each other.

## 9. Bracket / tournament meta-minigame (World Cup, Copa América)

- A full parallel tournament bracket UI (Grupos → 16avos → 8vos → Cuartos → Semi → Final) tied to the national-team track. Group stage requires accumulating points across fixtures (need 4 to advance); knockout stage is win-or-out with penalties breaking ties.
- Player picks a hidden scoreline "cell" per fixture; results reveal progressively; a running "El camino" (the path) log lists every result so far.
- **Special once-per-tournament ability**: "📣 Arenga del capitán" (Captain's rally), gated behind Liderazgo ≥75, usable once per tournament (never in the final): **guarantees a win of the next match regardless of the hidden roll.** A stat-gated "ultimate move," scarce and impactful.
- Elimination is narrated with genuine weight even on a loss ("😞 Se terminó el sueño... A esperar cuatro años" — the dream is over, four more years to wait) rather than a flat "you lost" screen.

## 10. Economy — three shop tiers, not two

- **💪 Staff** (permanent passive boosts): cook, physio, sports psychologist, physical trainer, super-agent — each with a plain-language effect description, no numbers shown to the player.
- **⏳ Consumibles** (temporary, 1-2 seasons, repurchasable): pro boots (more goals this season), season physio (2 seasons, more stamina + less injury risk), sports supplements (1 season, more stamina/appearances), video analyst (1 season, more assists), "la cábala" — the lucky charm (1 season, luck boost in the title race). **This tier is new** — a middle ground between permanent Staff and cosmetic Lujo: scoped-duration, stackable-purchase power-ups.
- **💎 Lujo** (cosmetic only): sports car, house, mansion with pitch, yacht, private jet — no stat effect, pure flavor/flex.
- **Persistent HUD row** shows owned Staff icons and active Consumable icons (with remaining-duration counts) on every single screen, not just inside the shop — a visible "loadout" at a glance.

## 11. Transfer / clan-market mechanics (richer than previously captured)

- Tagline for every offer screen: *"El dado trajo estas ofertas. Elegí: ¿gloria o billetera?"* (glory or wallet?) — states the tension outright.
- Each offer card shows: club, wage, contract length, and a **relative playtime signal** ("≈ Minutos parecidos que ahora" / "⬇️ MENOS" / "⬆️ MÁS") — tells you upfront whether you'll get more or less opportunity at the new club.
- Every leaving-option shows the same two-line cost/benefit: *"Dejás [club]: -8 de idolatría"* / *"Allá arrancás: Uno más (X/100) — tu fama te precede"* — **confirms the fame-based head start is a partial number bump within the bottom tier**, not an automatic tier jump.
- "Renovación" (re-sign with current club) is always the first/default option, framed as continued progress toward the next tier rather than a reset.
- **"📞 Llamar al representante"** — reroll the offer table, explicitly capped at once per entire career.
- **"El club necesita vender"** — a variant where the *club* initiates the transfer window rather than the player browsing voluntarily (same offer mechanic, different narrative trigger).
- **"¿Cambiar de aire?"** — a third variant: player explicitly asks to be shopped around, costs reputation just for asking (word gets out), and is capped at a small number of uses per career ("Pedidos que te quedan: 2").

## 12. Injury & decline — no mid-career death

- Across this entire 40+ screen transcript, there is **no random mid-career death** — the only career-ending path shown is age/injury-driven decline culminating in a scripted retirement (§13). Injuries (torn ligament) cost a season's playing time, narrated with weight, but don't end the run.
- Stat decline is partly **automatic with age**, not only event-triggered — preseason stat reviews show ▼ arrows on stats (especially Resistencia, Velocidad, Definición) purely from aging, independent of any negative event. Shop retinue items explicitly slow this ("el declive de las piernas llega más tarde").

## 13. The scripted retirement finale — worth adopting almost as-is

At the point of terminal decline, the game triggers a **hand-authored, two-stage set piece**, not a generic content-bank event:

- Stage 1 ("89' · TU ÚLTIMO PARTIDO — La despedida"): rich scripted narration (stadium standing, banners with your name, parents in the stands), then an explicit risky-vs-safe choice with stated rewards for each ("🎲 Arriesgado +6 Fama +10 Idolatría" vs "🧊 Seguro +3 Fama +8 Idolatría") and a one-line philosophy: *"Cuanto más arriesgada la jugada, más gloria si sale. Vos sabrás."*
- Stage 2 (minute 90, outcome reveal): even the "safe" choice pays off with a poignant **full-circle narrative callback** — giving the moment to a young reserve player who mirrors the player's own career start twenty years earlier. Then transitions straight into the epilogue.

**This is the single most reusable idea in the whole transcript**: guarantee a hand-authored, two-beat, narratively resonant final scene at the end of every run (regardless of risky/safe pick) instead of resolving retirement through the generic content bank.

## 14. Epilogue screen anatomy (much richer than previously captured)

- **Auto-generated epithet**: a nickname pulled from a pool gated by which achievements/behaviors the run actually triggered, combined with the club most associated with that achievement — e.g. "El Campeón de Europa de Inter," "El G.O.A.T. de Barcelona," "El Extraterrestre de PSG," "El Vendido de Real Madrid" / "El Judas de Real Madrid" / "El Traidor de Borussia Dortmund" (betrayal-flavored nicknames for mercenary/traitor-style careers), "El Mejor del Mundo de X." **Nickname pool is split into behavior archetypes** (legendary / mercenary-traitor / etc.), not one universal pool.
- Card/sticker tier ("Figurita de bronce") appears tied to the **peak** reputation tier ever reached across the whole career, implying bronze/silver/gold/legendary card-frame art per tier.
- One-line graded verdict under the headline ("Buen jugador. Pero ídolo es otra cosa" — good player, but being an idol is something else) — varies with how close the run got to the top tier.
- Stats block includes **Valor pico** (peak market value) as its own tracked figure, separate from total money earned.
- **"Tu historia, club por club"**: full per-club history — years, matches/goals/assists at that club, the reputation tier+score reached *at that specific club*, trophies won there with year, plus a separate national-team line. Reputation history survives per-faction even after leaving, shown retrospectively.
- **"Copiar imagen de palmarés"**: one-tap shareable image export of the trophy case — a viral/social hook.
- **"🏅 Distinciones individuales"**: a category of *repeatable, counted* awards distinct from one-off achievements (e.g. "Equipo de la Temporada ×5," listing every specific year it happened) — a running tally with history, not a boolean flag.
- **"💔 Finales perdidas"**: a dedicated "heartbreak" section listing every lost final by name, opponent, and year — near-misses get their own permanent record, not just a mention buried in a season recap.
- Achievement descriptions in the epilogue are **re-rendered with the player's actual number** filled in (e.g. "Eterno: Jugaste hasta los 41" rather than the generic threshold text) — personalized at display time, not just a static description.
- Final rival comparison gets its own expanded block (not just the achievement bullet): full side-by-side multi-metric tally.
- **Score/ranking feedback**: exact composite score ("268k puntos de Gloria"), an honest propagation-delay note ("tu puntaje puede tardar hasta 2 minutos en aparecer"), and — even for a below-top-50 run — an encouraging retention hook ("¡Seguí jugando para escalar!").

## 15. Achievement design pattern

- **Graduated families rather than one-off thresholds**: many achievements come in explicit tiers on the same underlying stat — goals (100 / 300), games played (500 / 800), trophies (10 / 15 / 20), national-team goals (20 / 40), age at retirement (36 / 40), money earned (40M / 100M). Each tier is its own separate unlockable, not a single achievement with a bigger number.
- **Repeatable/counted awards** exist alongside one-off booleans (Team of the Season ×5, top scorer of the tournament 3×).
- Achievements are explicitly **cross-run, lifetime, cumulative** ("42/70" unlocked across every life ever played, not per-run), with a master "collect them all" trophy ("EL ÍDOLO" — unlock all 70 for the ultimate prize).
- A separate **cross-run meta-collection** exists on top of achievements: "Vitrina de copas" — every distinct trophy/competition type in the game (54 of them, down to every domestic cup of every country), tracked as a lifetime collect-them-all binder independent of any single run.

## 16. Leaderboard structure

- **Ranking del día** (daily) — separate from:
- **Ranking global** (all-time) — with **four sortable tabs**: 🗿 Gloria (composite score, default), 💰 Plata (wealth), ⚽ Goles, 🎯 Asist. — confirms category leaderboards from the same underlying data, exactly the pattern already planned.
- **🌟 Pibes maravilla** (elite separate bracket): explicitly, top-0.1% outlier runs are pulled OUT of the main global ranking into their own separate leaderboard so they don't permanently squat on the normal board's top spots. A clean solution to leaderboard staleness from outlier runs.
- **Tus últimas carreras**: personal run-history list, noted as device-local in this implementation.
- Each leaderboard row: nationality flag, position icon, name, auto-generated epithet + club, reputation-tier icon, club, career totals, sort-metric value.

## 17. Persistent HUD conventions

Every screen keeps visible: Media, name/position/number, club·year·age, league + Forma + Fama, core career counters (goals/assists/matches/titles), the 4 attributes + Resistencia with ▲/▼ deltas from the last preseason, Valor, Ganado, the rival-duel widget, the reputation-tier widget, national-team status, a shop icon, and a suitcase icon that appears only when transfer offers are currently available (a persistent "you have offers waiting" flag).

## 18. Quick-reference tables

A second independent extraction of the same game (a "resume from another AI") cross-checked cleanly against everything above — no contradictions, one extra tradeoff-card example worth logging, plus these compact tables worth keeping for quick lookup:

**Attribute → minigame influence** (confirms §8's "different stat per minigame" pattern)

| Attribute | Influences |
|---|---|
| Definición | 1v1 keeper-read, timing-bar zone size, shot accuracy |
| Velocidad | Extra life in memory minigame (≥80 threshold), breakaway success |
| Potencia | Aerial duel success even when marked |
| Liderazgo | Captain pep-talk unlock (≥75), idolatry gains, squad respect |
| Resistencia | Minutes played, injury resistance, late-career longevity |

**Idolatría tiers**: Uno más → Querido 👏 → Referente 💙 → Ídolo ⭐ (a 🗿 Leyenda tier appears in some runs above Ídolo).

**Selección status**: Sin chance → En carpeta → Convocado.

**One more preseason tradeoff card** not caught in the first pass: *"Sparring con el central (Rara) → +4 Potencia, +1 Definición, −1 Velocidad"* — a three-stat card (two positive, one negative), confirming tradeoff cards aren't always a clean single-gain/single-cost pair.

---

*Six of these sections have since been mapped into the build spec: market value as a distinct stat, the three-tier shop (Consumables added), a richer Archrival system, Career arcs/chapters with a season-shaped loop, a Legacy post-mortem scoring pass with auto-generated epithets, and an elite-tier leaderboard split-off. Still unmapped and available to pull from later: the five distinct mini-game *types* (only the direction-pick and card-pick versions are in the spec so far — the timing-bar, grid-gamble, and memory-match types aren't built yet), and the scripted two-stage retirement finale (the spec's Health/death section handles retirement generically, not as a mandatory hand-authored final scene).*
