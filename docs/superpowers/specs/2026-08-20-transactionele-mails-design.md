# Ontwerp: transactionele mails herzien

Datum: 2026-08-20
Status: ontwerp, goedgekeurd op hoofdlijnen, nog niet uitgevoerd

## Aanleiding

Het mailafzenderdomein is verhuisd van `mbt-gym.nl` naar `getbase.coach`
(zie het geheugenitem over het BASE-domein). Bij die verhuizing bleek dat de
mailtemplates op vijf plekken los van elkaar zijn gebouwd en al uit elkaar
gelopen zijn. Voordat we inhoud of vormgeving aanpassen, brengen we dat terug
naar een gedeelde basis.

## Huidige situatie

Vijf bestanden bouwen elk hun eigen mail-HTML, met elk een eigen kopie van het
kleurenpalet en een eigen `<!doctype html>` met tabelstructuur:

| Mail | Gebouwd in | Getriggerd door |
|---|---|---|
| Uitnodiging patiënt/atleet | `src/server/mail.ts` (`layout()` + `inviteMail()`) | `src/server/routers/invite.ts:239`, `:371` |
| Programma staat klaar | `src/app/api/email/send/route.ts` (inline) | `src/components/programs/ProgramBuilder.tsx:951` |
| Shop-bevestiging + factuur | `src/lib/shop/email/order-emails.ts` (`shell()`) | `src/lib/shop/fulfillment.ts:136` |
| Boekhoudkopie | idem | `src/lib/shop/fulfillment.ts:137` |
| Kritieke insight naar therapeut | `src/server/insights/dispatcher.ts` (`renderCriticalEmail()`) | insight-dispatch |
| Praktijk-footer | `src/server/email/footer.ts` | alleen ingevoegd in de programma-mail |

Geconstateerde drift en gebreken:

- `mail.ts` toont de wordmark "● BASE", de programma-mail toont nog
  "● MBT · GYM" met `<title>MBT·Gym</title>`.
- De praktijk-footer hangt onder één van de zes mails.
- De uitnodiging gebruikt het mailadres als naam van de therapeut:
  `therapistName: ctx.user!.email.split('@')[0]` (`invite.ts:243`). De
  ontvanger leest daardoor "jurre heeft je uitgenodigd", terwijl `firstName`,
  `lastName` en `jobTitle` in de database staan.
- `sendMail()` ondersteunt `replyTo`, maar geen enkele aanroep gebruikt het.
  Een patiënt die antwoordt, mailt naar `noreply@`.
- De donkere layout (`#0E2729`) wordt door sommige clients licht gerenderd,
  waardoor tekstcontrast wegvalt. Waargenomen bij de testmail van 2026-08-20.

## Besluiten

1. **De praktijk is de afzender, BASE is het gereedschap.** De ontvanger ziet
   de praktijk, niet het product.
2. **Praktijknaam en logo, verder BASE-vormgeving.** Eén vaste template. Per
   praktijk verschillen alleen de gegevens, niet de kleuren. Geen
   kleurinstellingen per praktijk, dus geen contrastrisico en geen beheerscherm.
3. **De patiëntgerichte app-mails krijgen de praktijk als afzender.** Dat zijn
   de uitnodiging en de programma-mail. De insight-alert valt daarbuiten: die
   gaat naar de therapeut zelf en komt van BASE. Het is een werksignaal, geen
   uiting van de praktijk naar buiten.
4. **Zonder praktijk valt de mail terug op BASE.** Geldt voor coaches, die per
   ontwerp `practiceId = null` hebben (`invite.ts:182`, vastgelegd in
   AGENTS.md), en voor therapeuten met onvolledige praktijkgegevens.
5. **De shop-mails blijven buiten scope.** `order-emails.ts` houdt zijn eigen
   `shell()`. De nieuwe shell wordt wel zo gebouwd dat de shop later kan
   overstappen zonder herontwerp.

## Architectuur

### `src/server/email/shell.ts` (nieuw)

Exporteert het palet en één `emailShell()`. Neemt afzender, kop, body-HTML,
optionele knop en footer, en levert het complete document. Enige plek met een
`<!doctype html>` voor app-mails.

De tabelgebaseerde structuur van de huidige `layout()` blijft, want die is
getest in Outlook, Gmail en Apple Mail. Geen flex of grid.

### `src/server/email/sender.ts` (nieuw)

Eén functie die uit een gebruiker afleidt wie de afzender is: weergavenaam,
logo, adresgegevens en mailadres voor reply-to. Dit is de enige plek die
besluit of het de praktijk of BASE wordt. De templates hoeven dat onderscheid
niet te kennen.

Terugvalvolgorde: praktijk met complete gegevens, anders BASE. De bestaande
`isPracticeUsable()` uit `footer.ts` levert de criteria (naam, adresregel,
plaats, en een mailadres of telefoonnummer).

### `src/server/email/footer.ts` (bestaand, verplaatst in gebruik)

Blijft ongewijzigd van vorm, maar wordt voortaan door de shell aangeroepen in
plaats van door één route. Krijgt een BASE-variant voor het geval zonder
praktijk.

### `src/server/mail.ts` (aangepast)

`sendMail()` krijgt een afzendernaam en een reply-to. Het adres blijft
`noreply@getbase.coach`, alleen de weergavenaam wisselt. Dat vraagt geen
DNS-werk: de weergavenaam is vrij op een geverifieerd domein.

`layout()` verdwijnt, `inviteMail()` gaat over de shell.

### Aanroepende code

- `invite.ts`: geeft de echte therapeutnaam door in plaats van het lokale deel
  van het mailadres, en laadt de praktijk mee.
- `api/email/send/route.ts`: verliest zijn inline layout en zijn eigen palet.
- `dispatcher.ts`: `renderCriticalEmail()` gaat over de shell, met BASE als
  afzender. De bestaande query blijft ongewijzigd: er is geen praktijk nodig.

## Inhoud per mail

Register 8 (BASE app-copy) voor de patiëntgerichte mails, register 4 (mail aan
collega) voor de insight-alert. De blacklist uit `docs/tone-of-voice.md` geldt
onverkort: geen em-dashes, volledige zinnen, geen holle woorden, geen emoji.

### Uitnodiging

Dit is het eerste contact met de app, dus instruerend en nuchter. Niet de
speelse toon van reminders: de ontvanger weet nog niet wat BASE is.

- Onderwerp: `{Therapeut} heeft je uitgenodigd voor BASE`
- Kop: `Hallo {voornaam}`
- Aanhef: `{Therapeut}, {functietitel} bij {praktijk}, heeft een account voor
  je klaargezet in BASE. Daar staat je trainingsschema en daar log je hoe het
  gaat.`
- Knop: `Start onboarding`
- Uitleg: `Klik op de knop en vul je geboortejaar in. Je krijgt daarna een code
  van zes cijfers in deze mailbox. Met die code log je in.`
- Blok `VERLOOPT` met de datum, ongewijzigd.
- Terugvallink voor wie de knop niet kan gebruiken, ongewijzigd.

Wijziging ten opzichte van nu: de therapeut wordt bij naam en functietitel
genoemd in plaats van met het lokale deel van zijn mailadres, en de praktijk
wordt genoemd.

### Programma staat klaar

- Onderwerp: `Je programma staat klaar · {programma}`
- Kop: `Hallo {voornaam}`
- Aanhef: `{Therapeut} heeft een programma voor je klaargezet.`
- Blok met programmanaam en startdatum, ongewijzigd.
- Optioneel blok `BERICHT VAN JE THERAPEUT`, ongewijzigd.
- Optioneel blok met de toegangscode, ongewijzigd.
- Knop: `Programma openen`, of `Inloggen met code` als er een code is.

Wijziging ten opzichte van nu: de wordmark "● MBT · GYM" en `<title>MBT·Gym</title>`
verdwijnen, het praktijkblok komt eronder in plaats van de hardgecodeerde regel
"MOVEMENT BASED THERAPY · movementbasedtherapy.nl".

### Insight-alert

Register 4: cijfers voorop, compact, geen aanloop. De huidige tekst zit hier al
dicht bij en blijft grotendeels staan.

- Onderwerp: `[KRITIEK] {titel}`, ongewijzigd. De haakjes maken hem scanbaar in
  een volle inbox.
- Label `KRITIEK KLINISCH SIGNAAL`, titel, suggestie en patiëntnaam blijven.
- De disclaimer blijft, ingekort. Dit is geen indekkende dooddoener maar een
  inhoudelijke afbakening van wat de engine wel en niet doet, dus die valt niet
  onder de blacklist.
- Knop: `Bekijk in dashboard`.
- Afsluitende regel over waarom je de melding krijgt en waar je hem uitzet,
  ongewijzigd.
- Afzender is BASE, geen praktijkblok.

### Antwoorden

Alle patiëntgerichte mails krijgen een reply-to op het praktijkmailadres. Nu
antwoordt een patiënt naar `noreply@`, waar niemand meekijkt. De insight-alert
houdt geen reply-to, want daar valt niets te beantwoorden.

## Testbaarheid

Elke template wordt een pure functie van gegevens naar HTML, zonder netwerk of
database. Daardoor te testen zonder mail te versturen. De drie gevallen die
apart getest moeten worden: complete praktijk, onvolledige praktijk, en coach
zonder praktijk.

## Vervolgacties buiten de code

- `compliance/avg-verwerkers.md` regel 27 beschrijft wat er via Resend gaat als
  "voornaam + programma in mail". De insight-alert stuurt de volledige
  patiëntnaam plus een klinisch signaal, dus een gezondheidsgegeven. Dat is
  bestaand gedrag en geen gevolg van deze herziening, maar de omschrijving in
  het register klopt niet en moet bijgewerkt. Zelfde controle voor de DPIA.
- Het afzenderdomein in de compliance-documenten staat nog op `mbt-gym.nl`.

## Openstaand

- Contrast van de donkere layout in clients die hem licht renderen.
- De weergavenaam van de afzender per praktijk betekent dat één domein onder
  meerdere namen mailt. Bij lage volumes geen probleem, maar het is een punt
  om in de gaten te houden nu `getbase.coach` nog geen reputatie heeft.
