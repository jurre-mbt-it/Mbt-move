/**
 * Release notes voor MBT-Gym.
 *
 * - Entries staan in nieuwste-eerst-volgorde.
 * - De `id` is wat we in localStorage opslaan onder `LAST_SEEN_RELEASE_KEY`;
 *   matched dat niet met `releaseNotes[0].id`, dan toont de "wat is nieuw"
 *   popup de nieuwe entry.
 * - Bullets gebruiken markdown-vrij plain text; rendering is in
 *   `/components/system/WhatsNewModal.tsx` + `/therapist/release-notes`.
 */

export interface ReleaseNote {
  id: string          // stable identifier (YYYY-MM-DD-slug)
  date: string        // ISO date, gebruikt voor sorteren / weergave
  title: string
  highlight?: string  // korte 1-zin samenvatting boven de lijst
  items: string[]
}

export const LAST_SEEN_RELEASE_KEY = 'mbt-last-seen-release'

export const releaseNotes: ReleaseNote[] = [
  {
    id: '2026-08-01-patient-op-inactief-en-revalidatietrajecten',
    date: '2026-08-01',
    title: 'Patiënten op inactief zetten, met een archief en trajecthistorie',
    highlight: 'Een patiënt die je niet meer behandelt hoort niet meer in je werklijst, maar zijn dossier hoort wel te blijven staan. Dat kan nu: je zet iemand op inactief, hij verhuist naar het archief, en je haalt hem er met één knop weer bij.',
    items: [
      'Op inactief zetten: in het actiemenu op de patiëntpagina staat "Op inactief zetten". Je kiest een reden, kunt een toelichting kwijt, en de lopende programma\'s gaan standaard mee dicht. Dit is iets anders dan de koppeling verbreken: daar raak je je toegang kwijt, hier raakt niets kwijt.',
      'Het archief: boven je patiëntenlijst staan twee standen, "In behandeling" en "Archief". Wie je op inactief zet verdwijnt uit de eerste en komt in de tweede te staan, met de datum en de reden erbij. Aandacht, belasting en therapietrouw zeggen daar niets meer, dus die kolommen zijn vervangen.',
      'Het dossier blijft leesbaar. Sessies, metingen, testuitslagen, pijnregistraties, hardloopanalyses: alles staat er nog, precies zoals je het achterliet. Op inactief zetten haalt alleen de persoon uit je werklijst, je signalen en de dagelijkse herinneringen. Er wordt niets verwijderd.',
      'Weer in behandeling nemen: bovenaan het dossier van een gearchiveerde patiënt staat een banner met wie de behandeling wanneer afsloot en waarom, plus de knop om hem terug te halen. De programma\'s die bij het afsluiten dichtgingen komen dan mee terug, met hun startdatum opgeschoven over de onderbreking heen.',
      'Nodig je iemand opnieuw uit, dan wordt hij daarmee ook weer actief. Je hoeft dus niet eerst in het archief te zoeken. De programma\'s die bij het afsluiten dichtgingen komen langs die weg niet terug: daarvoor gebruik je "Weer in behandeling" op het dossier.',
      'Revalidatie werkt nu per traject. Sluit je een protocol af, dan sluit je dat traject af, met een uitkomst (criteria behaald, voortijdig gestopt, doorverwezen, terugval) en een optionele toelichting. Start je later een nieuw traject, dan begint dat met lege criteria. De vinkjes van het vorige traject komen dus niet terug, en dat is de bedoeling: een tweede knieblessure is geen voortzetting van de eerste.',
      'Onder het lopende traject staat "Eerdere trajecten": per traject de periode, de uitkomst en hoeveel criteria er behaald zijn. Klikken opent het afgesloten traject met alle metingen erin, alleen om te lezen. Was afsluiten een misklik, dan haal je het meest recente traject met "Heropenen" weer terug.',
      'De week-planner toont gearchiveerde patiënten onder een eigen kopje, zodat je hun weken kunt teruglezen. Plannen kan daar niet meer: een gearchiveerde patiënt krijgt geen nieuwe trainingen in de app te zien, en dan is inplannen wat je niet kunt versturen alleen maar verwarrend.',
    ],
  },
  {
    id: '2026-06-24-meerdere-programmas-en-controle-signaal',
    date: '2026-06-24',
    title: "Meerdere programma's per patiënt + controle-signaal bij oude schema's",
    highlight: "Een patiënt kan nu meerdere programma's tegelijk volgen, bijvoorbeeld dagelijkse iso's én een krachtschema 3×/week, netjes gescheiden. En je krijgt een seintje als een schema te lang ongewijzigd is.",
    items: [
      'Meerdere programma\'s naast elkaar: koppel zoveel programma\'s aan een patiënt als nodig. "+ Programma toevoegen" staat altijd klaar op de patiëntpagina, ook als er al een programma loopt, geen overschrijven meer.',
      'De patiënt ziet ze gescheiden: bij meerdere actieve programma\'s verschijnt bovenaan het schema een kiezer (bv. "Dagelijkse iso\'s" / "Krachtschema") om tussen de schema\'s te wisselen. Je hoeft niet eerst het ene af te ronden voordat het andere zichtbaar wordt.',
      'Vinkjes kloppen per programma: een afgeronde krachtsessie telt alleen mee bij het krachtschema, niet bij de iso\'s. Op het dashboard staat elk programma als eigen kaart.',
      'Controle-signaal: blijft een actief schema langer dan 8 weken ongewijzigd, dan krijg je een seintje om te controleren of het nog passend is, op je dashboard ("Schema\'s om te controleren") en als badge op de programmakaart van de patiënt.',
      'Zelf de looptijd bepalen: bij het maken van een programma stel je in "Controleren na … weken" (leeg = standaard 8). Vul je bijvoorbeeld 12 in, dan komt het seintje pas na 12 weken, jouw waarde overrulet de standaard.',
      'Schema gecontroleerd en nog goed? Klik "✓ Gecontroleerd" om de teller te resetten zonder iets te wijzigen. Een echte aanpassing aan het schema reset de teller vanzelf.',
    ],
  },
  {
    id: '2026-06-07-interactieve-weekplanner',
    date: '2026-06-07',
    title: 'Interactieve week-planner, workouts met inhoud + snellere app',
    highlight: 'De week-planner is nu volledig interactief: sleep workouts, kopieer dagen, en bouw per workout oefeningen of cardio op vanuit een zijpaneel.',
    items: [
      'Workouts verslepen: pak een workout in de kalender en sleep \'m naar een andere dag, hij springt direct mee en wordt meteen opgeslagen.',
      'De "+"-knop in een dag opent een menu: Workout toevoegen, Vanuit sjabloon, of Kopieer dag.',
      'Meerdere dagen tegelijk kopiëren: houd de muis ingedrukt en sleep over meerdere dagen om ze te selecteren, en sleep dat blok daarna naar een doeldag.',
      'Klik een workout aan en er schuift rechts een paneel open met de inhoud, de kalender krimpt netjes mee.',
      'Oefeningen toevoegen aan een workout: in het paneel kies je oefeningen uit de bibliotheek, automatisch voorgefilterd op het type van de workout (kracht, mobiliteit, plyo, stabiliteit), die filter kun je altijd uitklikken. Per oefening stel je sets × reps in.',
      'Cardio-workouts krijgen een eigen parametervenster: type (hardlopen, fietsen, roeien, …), duur, afstand, hartslagzone en intervallen.',
      'Een workout opslaan als schema (komt in je praktijk-programma\'s) of kopiëren naar dezelfde dag, rechtstreeks vanuit het paneel.',
      'Notitie-veld bij het toevoegen van een workout, zodat je een aandachtspunt of instructie per dag kunt meegeven.',
      'Programma\'s: nieuwe knop "Nieuw Cardio" vervangt de losse Walk-Run- en Workout Builder-knoppen. De walk-run opbouwschema\'s met templates per klacht blijven bereikbaar bovenaan het cardio-aanmaakscherm.',
      'Assessment opent nu met een keuze tussen Mobility Assessment en Hardloopanalyse.',
      'Snellere app: pagina\'s tonen tijdens het laden nette skeletons in plaats van een lege pagina, en worden alvast voorgeladen wanneer je over een link of patiënt hovert.',
    ],
  },
  {
    id: '2026-05-14-rehab-view-en-exercise-defaults',
    date: '2026-05-14',
    title: 'Read-only revalidatie voor patiënten + slimmere oefening-defaults',
    highlight: 'Patiënten zien nu hun criteria-protocol mee, en oefeningen openen met de juiste parameters (seconden voor isometrisch werk, meters voor sleeën en carries).',
    items: [
      'Patiëntenoverzicht onderscheidt atleten: per kaart een gouden ATLEET-badge en filterpills bovenaan voor Alle / Patiënten / Atleten.',
      'Snelle workout op het atleet-dashboard: + knop in het midden van de onderbalk linkt direct naar een quick workout.',
      'Revalidatie-protocol voor patiënten: heeft een patiënt een actief criteria-protocol, dan ziet die op zijn dashboard een tegel "Mijn revalidatie". Klikken opent een read-only overzicht van fases en criteria, groen/oranje/rood per criterium. De patiënt kan niets wijzigen; jij blijft als therapeut de statussen aanpassen.',
      'Isometrische oefeningen openen voortaan in seconden: Plank, Side Plank, Wall Sit, Dead Hang, Bird Dog, Hollow Body Hold, McGill Side Bridge, Copenhagen Side Plank, Bear Crawl, Suitcase Hold en Mid-Range Hip Thrust Hold krijgen automatisch sec als unit + 30 sec als startwaarde wanneer je ze aan een programma toevoegt.',
      'Sleeën en carries krijgen "Afstand" als standaard extra-parameter (20m default): Sled push/pull/drag, Farmer\'s Walk, Suitcase/Front-Rack/Overhead Carry, Yoke Walk, Bear Hug Carry, Goblet Carry en Mixed Carry.',
      'Twee nieuwe oefeningen toegevoegd: Ring Row (bodyweight pull-horizontal, beginner) en Sled Push (Chest Press), slee duwen vanuit een bench-press positie, concentric-only.',
      'Parameter-menu bug opgelost: bij "Start behandeling" werd het + PARAMETER uitklap-menu afgesneden door de volgende oefening, staat nu netjes bovenop.',
    ],
  },
  {
    id: '2026-05-11-live-behandeling-uitbreiding',
    date: '2026-05-11',
    title: 'Live behandeling uitgebreid + sessie achteraf bewerken',
    highlight: 'Meer controle tijdens en na de behandeling: per-set gewichten, extra parameters, supersets, en correcties achteraf.',
    items: [
      'Starttijd van de live behandeling kun je nu aanpassen, handig als je later bent begonnen dan dat je het scherm opende.',
      'Geen hardcoded 3×10 meer: bij vrije workout en quick-add start je met lege velden, bij Volg programma worden de echte programma-parameters (sets, reps, supersets, extra parameters) overgenomen.',
      'Gewicht splitst zich automatisch in één invoerveld per set, zodat je per set een ander gewicht kunt loggen.',
      'Per oefening kun je extra parameters toevoegen: Tempo, RPE, Pauze, Afstand, Hartslag, Moeite, Band kleur, dezelfde set als in de schema-bouwer.',
      'Supersets via A/B/C-labels: koppel oefeningen tijdens de behandeling en zie ze visueel gegroepeerd.',
      'Sessies bewerken na afronden: in het patiëntdossier zit nu een BEWERK-knop op elke gelogde sessie, corrigeer datum, tijd, duur, pijn/RPE, of vergeten parameters.',
      'Release notes pagina: bereikbaar via de sidebar. Bij elke nieuwe release zie je hier wat er is veranderd.',
    ],
  },
]

export function latestRelease(): ReleaseNote | null {
  return releaseNotes[0] ?? null
}
