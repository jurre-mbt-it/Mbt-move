# Uitnodiging opent de app, en een mail bij toevoegen aan een groep

Datum: 17-09-2026. Twee wensen van Jurre.

1. De uitnodigingsmail stuurde de patiënt naar de webapp. Daar vroeg hij een
   inlogcode aan, en in de app moest hij dat daarna nog een keer doen. Eén
   mail te veel. De link in de mail moet de app openen en de patiënt meteen
   inloggen.
2. Wie aan een groep wordt toegevoegd, hoort daar niets van. De atleet moet
   een mail krijgen, zichzelf uit de groep kunnen halen via die mail, en dat
   later ook altijd zelf kunnen doen in de app en het portaal.

## 1. Uitnodiging

### Wat er gebeurt

- De therapeut nodigt uit zoals nu (web: naam, e-mail, geboortejaar, rol; app:
  hetzelfde formulier, dat nu ook `invite.create` gebruikt en een
  geboortejaar vraagt).
- De mail bevat één link: `https://getbase.coach/uitnodiging/<token>`. Op een
  telefoon opent die pagina de BASE-app (`mbtgym://uitnodiging?token=…`). De
  app wisselt het token in voor een sessie en de patiënt is ingelogd. Geen
  code, geen tweede mail.
- Op een computer, of zonder app, biedt dezelfde pagina "Doorgaan in de
  browser": dat logt op dezelfde manier in op het webportaal. Plus de knop
  naar de App Store.
- De link is zeven dagen geldig (was 24 uur voor het geboortejaarpad). Het
  oude pad (e-mail + geboortejaar + code op `/login/code` en in de app) blijft
  bestaan als terugvaloptie en voor wie de mail kwijt is.

### Token

- `token = <inviteId>.<hmac>`; sleutel afgeleid van `SUPABASE_SERVICE_ROLE_KEY`
  (geen nieuwe env, geen migratie). Puur en getest in
  `src/server/lib/signed-link.ts`.
- `invite.peek({ token })` (publiek): status en voornaam, therapeutnaam,
  praktijknaam voor de landingspagina. Geen e-mailadres.
- `invite.claim({ token })` (publiek, mutatie): controleert handtekening,
  geldigheid en gebruik; ratelimit per IP en per uitnodiging; maakt de
  Supabase-gebruiker aan als die nog niet bestaat (zoals `invite.request`);
  `generateLink({ type: 'magiclink' })` en geeft `{ email, tokenHash, type }`
  terug. De client doet `verifyOtp({ token_hash, type })` en daarna
  `invite.finalize` zoals nu. Een gebruikte of verlopen uitnodiging geeft een
  duidelijke fout zonder e-mailadres.
- De handtekening is het bewijs van bezit van de mail, precies wat de
  bestaande Supabase-magiclink ook was. Na `finalize` staat `usedAt` en werkt
  de link niet meer.

### Bouwstenen

- Web: `src/server/lib/signed-link.ts` (+tests), `invite.peek`,
  `invite.claim`, `CODE_TTL_HOURS = 168`, mailcopy in `inviteMail`,
  pagina `src/app/uitnodiging/[token]/page.tsx` (publiek in `proxy.ts`).
- App: route `app/uitnodiging.tsx` (publiek in de AuthGate), `patient-invite`
  op `invite.create` met geboortejaar.

## 2. Groepen

### Wat er gebeurt

- Bij `athleteGroups.addMembers` krijgt elk nieuw lid een mail: wie hem heeft
  toegevoegd, aan welke groep, wat dat betekent (groepstrainingen komen in je
  kalender als "Onderdeel van …", je eigen schema blijft staan) en één knop
  "Uit de groep stappen".
- De knop opent `https://getbase.coach/groep/verlaten/<token>` zonder login:
  de pagina toont de groep en vraagt bevestiging. Daarna staat de atleet niet
  meer in de groep. De eigenaar van de groep krijgt daar een korte mail van.
- In de app (profiel) en op het portaal (profiel) staat een blok Groepen met
  per groep een knop om eruit te stappen. Zelfde effect.

### Regels

- Uit de groep stappen doet precies wat `removeMember` doet: lidmaatschap
  weg, de al verstuurde trainingen blijven in de kalender staan zonder
  groepsverwijzing. Eén helper `verwijderLid` voor alle drie de paden.
- Token: `<membershipId>.<hmac>` met scope `group-leave`. Een token voor een
  lidmaatschap dat al weg is geeft "je staat niet meer in deze groep", geen
  fout.
- Mails gaan via de gedeelde shell met de coach of praktijk als afzender.
  Mislukt een mail, dan mislukt het toevoegen niet; het staat in het log.

### Bouwstenen

- `athleteGroups.mine` (protected), `athleteGroups.leave` (protected),
  `athleteGroups.leavePreview` en `athleteGroups.leaveByToken` (publiek),
  mails `groupAddedMail` en `groupLeftMail` in `src/server/mail.ts`.
- Web: pagina `src/app/groep/verlaten/[token]/page.tsx` (publiek),
  component `src/components/groups/MyGroups.tsx` op beide profielpagina's.
- App: blok Groepen op het profieltabblad voor patiënt en atleet.

## Buiten scope

Pushmelding bij toevoegen aan een groep; universal links (AASA/assetlinks),
die vragen een nieuwe native build met Apple Team ID en Android-certificaat.
De custom scheme `mbtgym://` volstaat zolang de app geïnstalleerd is.
