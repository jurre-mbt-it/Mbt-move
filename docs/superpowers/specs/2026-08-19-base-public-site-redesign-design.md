# BASE publieke website, redesign voor fysiotherapiepraktijken

**Datum:** 19 augustus 2026

**Status:** door gebruiker goedgekeurde visuele richting en productflow

**Scope:** publieke rootpagina van `mbt-gym` op `/`

## 1. Doel

De publieke BASE-site positioneert BASE primair als platform voor fysiotherapeuten en praktijkhouders. De pagina laat niet alleen losse functies zien, maar volgt het volledige traject waarin BASE wordt gebruikt: na de intake een patiënt uitnodigen, programma's plannen, criteria koppelen, training registreren, totale belasting volgen en progressie evalueren.

De site moet binnen vijf seconden deze indruk geven:

> BASE is een premium trainings- en performanceplatform voor fysiotherapiepraktijken, gebouwd om het hele traject tussen intake en evaluatie zichtbaar te houden.

De bestaande positionering als algemene patiëntgerichte app verdwijnt van de voorgrond. Patiënten blijven onderdeel van het verhaal, maar de therapeut en praktijk zijn de primaire bezoeker en koper.

## 2. Goedgekeurde ontwerpbeslissingen

### 2.1 Visuele richting

De goedgekeurde richting is **Product Studio met crème basis**:

- rustige, vlakke crème achtergrond;
- petrol voor tekst, navigatie, kaders en productinterface;
- oranje uitsluitend voor primaire acties en belangrijke datapunten;
- echte BASE-schermen als hoofdbeeld;
- echte productschermen behouden hun donkere app-interface en worden niet opnieuw vormgegeven naar de lichte marketingsite;
- fotografie alleen ondersteunend en niet nodig voor de eerste release;
- stevige typografie in gewone kapitalisatie;
- monospace alleen voor echte cijfers, grafiekassen en compacte datalabels;
- compacte hero zonder decoratieve lege ruimte.

De volgende kenmerken van de huidige site verdwijnen:

- gradients en gekleurde gloedlagen;
- grain- of noise-textuur;
- de bewegende ticker;
- herhaalde monospace hoofdletters als algemeen stijlelement;
- afgeronde SaaS-kaarten als standaardoplossing voor iedere sectie;
- een hero die vrijwel het hele scherm vult zonder productbewijs.

### 2.2 Palet

De implementatie gebruikt bestaande merkvariabelen waar die passen en voegt alleen een lichte publieke ondergrond toe.

| Rol | Waarde | Gebruik |
|---|---:|---|
| Crème basis | `#F2EEE6` | pagina-achtergrond en lichte vlakken |
| Crème hoog | `#F8F4ED` | productframes en afwisselende secties |
| Petrol | `var(--p-bg)` / `#0E2729` | donkere secties en productinterface |
| Petrol tekst | `#143132` | tekst op crème |
| Oranje | `var(--p-brand)` / `#E87A55` | primaire CTA en belangrijke data |
| Gedempte tekst | `#566B69` | lopende tekst op crème |
| Lichte lijn | `rgba(20,49,50,0.18)` | sectiescheidingen en kaders |

Er komt geen tweede bijna identieke oranje merkkleur naast `--p-brand`.

### 2.3 Typografie

- `Archivo` blijft het primaire font en wordt lokaal geladen via de bestaande fontconfiguratie.
- Koppen gebruiken een zware, niet-uitgerekte variant met normale kapitalisatie.
- Lopende tekst gebruikt Archivo op regulier gewicht.
- `Martian` wordt beperkt tot numerieke productdata, grafiekassen en technische labels die daadwerkelijk data voorstellen.
- Geen overmatige letterspatiëring.
- Geen volledige zinnen in hoofdletters.
- De typografische hiërarchie komt uit maat, gewicht en witruimte, niet uit decoratieve labels.

## 3. Inhoudelijke productflow

De intake en klinische werkhypothese blijven buiten BASE. De publieke site begint bewust bij het moment waarop BASE actief wordt.

### Stap 1. Patiënt toevoegen en uitnodigen

Na de intake voert de therapeut de patiënt in BASE in. Vanuit dezelfde flow kan direct een uitnodiging worden verstuurd. De patiënt krijgt toegang tot het toegewezen traject.

### Stap 2. Programma's en plannen in de week zetten

De therapeut kan meerdere programma's tegelijk aan één patiënt koppelen. Dagelijkse oefeningen, een krachtschema en een meerweeks trainingsplan kunnen naast elkaar in dezelfde week staan.

De planning ondersteunt twee vormen:

- flexibel doorlopende programma's;
- programma's of workouts op vaste dagen.

Meerweekse trainingsplannen kunnen als geheel op de kalender van de patiënt worden gezet.

### Stap 3. Criteria, protocollen en testen koppelen

Voor langere revalidaties kan de therapeut een bestaand protocol aan het traject koppelen, bijvoorbeeld een VKB-traject. De therapeut kan ook losse testen toevoegen of een eigen testbatterij samenstellen.

Patiënt en therapeut zien dezelfde voortgangsinformatie:

- doelen;
- criteria;
- uitgevoerde en geplande testen;
- behaalde en nog openstaande onderdelen;
- ontwikkeling over het traject.

BASE ondersteunt de beslissing, maar neemt de klinische regie niet over. De therapeut interpreteert de informatie en wijzigt het formele programma.

### Stap 4. Training door patiënt en therapeut loggen

De patiënt logt toegewezen trainingen. De therapeut kan een trainingssessie tijdens een fysiotherapieafspraak eveneens direct registreren.

Daardoor telt training tijdens de behandeling mee in dezelfde totale belasting als andere kracht- en cardiotraining.

### Stap 5. Belastingcurve en voortgang volgen

De belastingcurve is een centraal productbeeld, geen losse illustratie. Hij maakt zichtbaar hoe belasting zich over meerdere weken ontwikkelt en uit welke bronnen die belasting bestaat.

De website laat minimaal deze bronnen zien:

- door de patiënt gelogde programma's;
- door de therapeut gelogde therapiesessies;
- eigen training en wearable-data bij een atletenaccount.

De site belooft geen automatische medische beslissing. De curve geeft context voor evaluatie en bijsturing door de therapeut.

### Stap 6. Evalueren en rapporteren

Tijdens evaluaties worden doelen, criteria, testen, uitvoering en belasting naast elkaar bekeken. Relevante voortgang kan als verzorgde PDF worden gedeeld met de patiënt en verwijzer.

### Uitbreiding. Atletenaccount

Het atletenaccount wordt als aanvullende mogelijkheid getoond, zonder prijs of betaalmodel te noemen.

Een patiëntaccount bevat:

- toegewezen programma's;
- doelen, testen en voortgang;
- registratie van uitvoering, belasting en klachtrespons.

Een atletenaccount voegt toe:

- eigen workouts maken en loggen;
- wearables koppelen;
- extra gezondheids- en hersteldata beschikbaar maken voor begeleiding.

De homepage noemt pas een prijs wanneer betaling en facturatie daadwerkelijk zijn ingericht.

## 4. Paginastructuur

### 4.1 Navigatie

Links staat het woordmerk BASE. Rechts staan:

- Werkwijze;
- Platform;
- Voor praktijken;
- Inloggen;
- Plan een demo.

Op mobiel blijven BASE, Inloggen en Plan een demo direct zichtbaar. De overige ankerlinks mogen vervallen. Er is geen hamburgermenu nodig voor drie secundaire ankerlinks.

### 4.2 Hero

**Kicker:** `Van programma tot voortgangsrapport`

**Kop:** `Houd het hele traject in beeld.`

De begeleidende tekst legt in gewone taal uit dat programma's, trainingen, criteria en metingen samenkomen en dat therapeut en patiënt dezelfde voortgang zien.

Primaire CTA: `Plan een demo`

Secundaire CTA: `Bekijk de werkwijze`

Rechts staat een groot, echt en geanonimiseerd therapeutenscherm. Het beeld bevat een overzicht van actieve programma's, criteria en de belastingcurve. Er worden geen verzonnen klantcijfers of prestatieclaims gebruikt.

### 4.3 Doorlopende werkwijze

Een horizontale route op desktop en verticale route op mobiel toont:

1. Uitnodigen;
2. Plannen;
3. Criteria koppelen;
4. Trainen en loggen;
5. Voortgang volgen;
6. Evalueren.

Dit is de inhoudelijke ruggengraat van de pagina.

### 4.4 Programmeren

Een echt weekplannerscherm laat meerdere programma's over meerdere weken zien. Dit beeld volgt exact de bestaande BASE-planner en wordt niet vervangen door een generieke weekagenda.

De zichtbare structuur bestaat uit:

- een smalle weekrail links met labels als `W31`, `W32` en `W33`;
- maandag tot en met zondag als zeven vaste kolommen;
- kalenderweken als hoge horizontale rijen;
- de datum linksboven in iedere dagcel;
- een vaste achtste kolom `WEEKTOTAAL`;
- subtiele petrol rasterlijnen en afgeronde buitenhoeken;
- gedempte datums voor dagen buiten de actieve maand;
- oranje datums voor dagen binnen de actieve maand;
- programma's en workouts als echte planner-items binnen de dagcellen;
- weekbelasting, sessieaantal en duur in de kolom `WEEKTOTAAL` wanneer die gegevens beschikbaar zijn.

Voor de publieke site wordt het echte donkere scherm als breed productbeeld op het crème vlak geplaatst. De marketinglayout verandert de planner zelf niet. De tekst naast of boven het beeld benoemt flexibel plannen, vaste dagen, meerdere gelijktijdige programma's en meerweekse trainingsplannen.

### 4.5 Criteria en testen

Een echt revalidatie- of testscherm toont een traject met fasen, behaalde criteria en nog openstaande testen. De tekst benoemt bestaande protocollen, losse testen en eigen testbatterijen.

### 4.6 Totale trainingsbelasting

Een brede petrol sectie toont de belastingcurve prominent. De legenda onderscheidt programma, therapiesessie en aanvullende training. Deze sectie legt expliciet uit dat door de therapeut gelogde training tijdens een afspraak meetelt.

### 4.7 Patiëntaccount en atletenaccount

Een rustige vergelijking laat zien wat beide accounts kunnen. Dit is geen prijstabel. Het atletenaccount wordt gepositioneerd als uitbreiding voor iemand die ook zelfstandig traint en wearables gebruikt.

### 4.8 Evalueren en rapporteren

Een echt of gesaniteerd voortgangsrapport toont hoe testontwikkeling en trainingsbelasting in een PDF worden samengebracht. De tekst noemt patiënt en verwijzer als ontvangers.

### 4.9 Praktijkcontext en slot-CTA

Een compacte sectie vermeldt dat BASE vanuit de dagelijkse sportfysiotherapie bij Movement Based Therapy in Amsterdam is ontwikkeld. Zonder beschikbare, goedgekeurde praktijkfotografie blijft deze sectie tekstueel.

De pagina sluit af met:

**Kop:** `Bekijk hoe BASE in je praktijk werkt.`

**CTA:** `Plan een demo`

## 5. Productbeelden en privacy

De definitieve site gebruikt echte BASE-schermen, vastgelegd met lokale demo- of seeddata.

Vereisten:

- geen echte patiëntnamen, geboortedata, e-mailadressen of medische details;
- geen productieomgeving fotograferen;
- iedere screenshot toont uitsluitend informatie die ook in de begeleidende tekst wordt uitgelegd;
- screenshots worden als WebP geëxporteerd naar `public/base-site/`;
- essentiële informatie blijft als HTML-tekst beschikbaar en zit niet alleen in een afbeelding;
- ieder beeld krijgt een beschrijvende alt-tekst;
- een screenshot wordt pas toegevoegd nadat gecontroleerd is dat alle data fictief is.

Benodigde beelden:

1. therapeutoverzicht met programma's, criteria en belastingcurve;
2. weekplanner als echte meerweekse matrix met weekrail, zeven dagkolommen en `WEEKTOTAAL`, gevuld met meerdere gelijktijdige programma's uit fictieve demo-data;
3. revalidatietraject of testbatterij met criteria;
4. patiënt- of atletenweek met toegewezen en eigen training;
5. voortgangsrapport in PDF-vorm.

Alle vijf productbeelden zijn vereist voor oplevering. Een ontbrekend beeld wordt niet vervangen door een generieke mockup of stockdashboard; de implementatie is dan nog niet gereed voor release.

## 6. Componentarchitectuur

De publieke pagina blijft server-rendered en bevat geen dynamische patiëntdata.

Voorgestelde componenten in `src/components/base-site/`:

- `BaseLanding.tsx`, paginacompositie en inhoud;
- `BaseNav.tsx`, woordmerk, ankerlinks, login en demo-CTA;
- `BaseHero.tsx`, positionering en hoofdproductbeeld;
- `JourneyFlow.tsx`, de zes stappen;
- `ProgramsSection.tsx`, meerdere programma's en plannen;
- `CriteriaSection.tsx`, protocollen, testen en gedeelde voortgang;
- `LoadCurveSection.tsx`, uitleg plus belastingcurve;
- `AccountTypesSection.tsx`, patiënt versus atleet;
- `ReportSection.tsx`, evaluatie en PDF;
- `BaseFooter.tsx`, praktijklink, privacy, contact en login;
- `Reveal.tsx`, alleen behouden voor subtiele onthulling bij scrollen;
- `LoadCurve.tsx`, gericht refactoren naar de nieuwe lichte sectie met één geanimeerde SVG-curve en een vaste legenda voor programma, therapiesessie en aanvullende training.

De bestaande `AuthHashCatcher` en server-side redirect voor ingelogde gebruikers blijven ongewijzigd.

De CSS blijft geïsoleerd in `base-site.module.css`. Herhaalde kleuren, maten en ritmes worden als lokale CSS-variabelen op `.page` gedefinieerd.

## 7. Dataflow en interactie

De publieke pagina is statisch vanuit gebruikersperspectief:

- geen API-aanroepen;
- geen patiëntdata;
- geen client-side formulier;
- ankerlinks scrollen naar secties;
- `Inloggen` gaat naar `/login`;
- `Plan een demo` opent een vooraf ingevulde e-mail naar `jurre@movementbasedtherapy.nl`;
- Supabase-hashlinks blijven via `AuthHashCatcher` naar `/auth/callback` gaan;
- ingelogde gebruikers worden server-side direct naar hun eigen portaal gestuurd.

Aanbevolen onderwerp voor de demo-e-mail: `BASE demo voor mijn praktijk`.

## 8. Responsief gedrag

### Desktop, vanaf 960 px

- hero en productsecties gebruiken twee kolommen;
- de producttour staat horizontaal;
- screenshots mogen visueel groot zijn, maar blijven binnen de pagina-shell;
- donkere bewijssecties lopen over de volle contentbreedte.

### Tablet, 600 tot 959 px

- twee kolommen worden gestapeld;
- de zes stappen staan van 760 tot 959 px in drie kolommen en van 600 tot 759 px in twee kolommen;
- productbeeld volgt direct na de bijbehorende uitleg;
- van 600 tot 759 px verdwijnen de drie ankerlinks en blijven BASE, Inloggen en Plan een demo zichtbaar.

### Mobiel, tot 599 px

- één kolom;
- koppen blijven links uitgelijnd;
- de workflow wordt een verticale route;
- screenshots zijn horizontaal scrollvrij en schalen binnen de viewport;
- primaire en secundaire CTA staan onder elkaar en vullen beide de beschikbare breedte;
- BASE, Inloggen en Plan een demo blijven zichtbaar;
- er mag nergens horizontale pagina-overflow ontstaan.

## 9. Beweging en states

- Geen ticker of continu bewegende decoratie.
- Scroll-reveals beperken zich tot opacity en maximaal 12 px verticale verplaatsing.
- De belastingcurve tekent één keer wanneer hij voor het eerst in beeld komt.
- `prefers-reduced-motion` schakelt alle niet-essentiële animatie uit.
- Links en knoppen krijgen hover-, focus- en active-states.
- Focus is zichtbaar met de bestaande oranje merkkleur.
- CTA's blijven links of knoppen met duidelijke tekst, zonder icoon als versiering.

## 10. Foutafhandeling en veilige grenzen

De pagina heeft geen eigen formulier of backendactie. Daardoor zijn runtime-foutstates beperkt.

- Productbeelden worden als statische imports via `next/image` geladen, zodat een ontbrekend bestand de build laat falen in plaats van een leeg vlak in productie te geven.
- De mailto-CTA heeft daarnaast het e-mailadres zichtbaar in de contactsectie, zodat contact mogelijk blijft als een mailclient niet automatisch opent.
- De bestaande login- en auth-callbackroutes worden niet aangepast.
- Er worden geen geautomatiseerde behandelbeslissingen, diagnoses of programma-aanpassingen beloofd.
- De belastingcurve wordt beschreven als informatie voor klinische interpretatie, niet als automatische progressiepoort.
- De site noemt geen prijs, abonnement of betaling voor het atletenaccount totdat dit productmatig is ingericht.

## 11. Metadata en taal

Nieuwe metadata richt zich op praktijken.

**Titel:** `BASE voor fysiotherapiepraktijken`

**Beschrijving:** `Programmeer, monitor en evalueer revalidatie en training in één platform. BASE brengt programma's, criteria, metingen en trainingsbelasting samen.`

Alle copy volgt `docs/tone-of-voice.md`:

- direct, nuchter en concreet;
- geen campagnevondsten;
- geen automatische klinische claims;
- geen em-dashes;
- geen overmatige hoofdletters;
- volledige zinnen;
- praktische productinformatie voorop.

## 12. Verificatie en acceptatiecriteria

### Functioneel

- ankerlinks landen op de juiste sectie;
- `/login` blijft werken;
- Supabase-hashlinks blijven via `AuthHashCatcher` werken;
- ingelogde gebruikers blijven vanaf `/` naar hun eigen portaal gaan;
- beide demo-CTA's openen dezelfde vooraf ingevulde e-mail;
- praktijk-, privacy- en contactlinks werken.

### Visueel

- geen gradient, grain of ticker;
- crème is de dominante achtergrond;
- petrol en oranje volgen de afgesproken rollen;
- productbeelden zijn echte, gesaniteerde BASE-schermen;
- het weekplannerbeeld gebruikt de bestaande meerweekse matrix en geen nagebouwde dagkaarten;
- Martian Mono komt alleen voor bij echte data;
- geen horizontale overflow op 390 px breedte;
- desktopweergave werkt op 1440 x 1000;
- mobiele weergave werkt op 390 x 844;
- tekst overlapt geen productbeelden;
- de belastingcurve is zichtbaar als centraal onderdeel van het traject.

### Toegankelijkheid

- één `h1`, daarna logische `h2`- en `h3`-structuur;
- alle afbeeldingen hebben bruikbare alt-tekst;
- essentiële betekenis staat ook als HTML-tekst op de pagina;
- focus-states zijn zichtbaar;
- kleurcontrast voldoet minimaal aan WCAG AA voor tekst;
- reduced motion wordt gerespecteerd;
- alle interactieve elementen zijn via toetsenbord bereikbaar.

### Kwaliteitscontrole

Voor oplevering worden minimaal uitgevoerd:

```bash
npm run lint
npm test
npm run build
```

Daarnaast worden screenshots op desktop en mobiel visueel gecontroleerd. De contentcontrole bevestigt dat:

- alle getoonde data fictief is;
- het atletenaccount geen prijsclaim bevat;
- de intake niet als BASE-functie wordt gepresenteerd;
- de therapeut verantwoordelijk blijft voor interpretatie en formele programmawijzigingen;
- productclaims overeenkomen met de werkende functies in de repository.

## 13. Buiten scope

- prijs- of abonnementsmodel;
- online afrekenen;
- demo-aanvraagformulier of CRM-integratie;
- automatische producttour met video;
- nieuwe klinische functionaliteit in BASE;
- wijzigingen aan patiënt-, atleet- of therapeutportalen;
- nieuwe praktijkfotografie produceren;
- redesign van de loginpagina of de app zelf.
