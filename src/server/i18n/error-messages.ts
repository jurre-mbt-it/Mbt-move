/**
 * Nederlandse foutmelding → Engelse, toegepast in de tRPC-errorFormatter als
 * `ctx.user.locale === 'EN'`. Zo hoeft geen enkele throw-site te veranderen en
 * blijft elke melding voor Nederlandse gebruikers letterlijk wat hij was.
 *
 * Alleen statische meldingen: een bericht met een ingevuld getal of naam erin
 * matcht niet en blijft Nederlands. Dat zijn therapeut-meldingen in de planner
 * en het rehab-beheer, geen patiënt-pad.
 *
 * De test in __tests__/error-messages.test.ts leest alle routers en faalt als
 * een statische Nederlandse melding hier ontbreekt. Voeg je een melding toe,
 * voeg hier dan de vertaling toe.
 */
export const ERROR_MESSAGES: Record<string, string> = {
  // Toegang en koppelingen
  'Geen actieve behandelrelatie met deze patiënt': 'No active treatment relationship with this patient',
  'Geen actieve koppeling met deze patiënt': 'No active link with this patient',
  'Geen toegang tot deze patiënt': 'No access to this patient',
  'Geen toegang tot dit item': 'No access to this item',
  'Patiënt niet gevonden of geen toegang.': 'Patient not found or no access.',
  'Atleet niet gevonden of geen toegang.': 'Athlete not found or no access.',
  'Activiteit niet gevonden of geen toegang.': 'Activity not found or no access.',
  'Niet gevonden of geen toegang.': 'Not found or no access.',
  'Patiënt niet gevonden': 'Patient not found',
  'Patient is niet aan jou of jouw praktijk gekoppeld': 'Patient is not linked to you or your practice',
  'Dit is niet jouw koppeling': 'This is not your link',
  'Alleen patiënten en atleten': 'Patients and athletes only',
  'Deze patiënt is niet inactief': 'This patient is not inactive',
  'Kan rol van deze gebruiker niet wijzigen': 'Cannot change this user’s role',
  'User is geen therapeut': 'User is not a therapist',

  // Sessies, programma's en planning
  'Geplande workout niet gevonden': 'Planned workout not found',
  'Deze geplande workout hoort niet bij jou': 'This planned workout is not yours',
  'Dit programma hoort niet bij jou': 'This program is not yours',
  'Oefening hoort niet bij dit programma': 'Exercise is not part of this program',
  'Sessie niet gevonden': 'Session not found',
  'Sessie niet gevonden.': 'Session not found.',
  'Oefening niet gevonden.': 'Exercise not found.',
  'Programma niet gevonden': 'Program not found',
  'Testbatterij niet gevonden': 'Test battery not found',
  'Datum mag niet in de toekomst liggen.': 'Date cannot be in the future.',
  'Datum ligt te ver in het verleden (max. 1 jaar).': 'Date is too far in the past (max. 1 year).',
  'Ongeldige datum': 'Invalid date',
  'Ongeldige weekgrens.': 'Invalid week boundary.',
  'Ongeldige datumgrens.': 'Invalid date boundary.',
  'Bron en doel zijn dezelfde week': 'Source and target are the same week',
  'Bron-week niet gevonden': 'Source week not found',
  'Doel-week bevat al items. Stel replace=true om te overschrijven.':
    'Target week already has items. Set replace=true to overwrite.',
  'Ongeldige workout-structuur': 'Invalid workout structure',
  'Dit sjabloon is van een collega. Beheer het via het plan zelf.':
    'This template belongs to a colleague. Manage it from the plan itself.',

  // Rehab en testen
  'Geen lopend traject voor deze patiënt': 'No active rehab episode for this patient',
  'Geen lopend traject gevonden': 'No active rehab episode found',
  'Alleen globale, actieve catalogus-testen kunnen aan een criterium gekoppeld worden':
    'Only global, active catalogue tests can be linked to a criterion',
  'Protocol bestaat niet of is inactief': 'Protocol does not exist or is inactive',
  'Het traject van deze patiënt is inmiddels gewijzigd. Ververs het scherm en kies de uitkomst opnieuw.':
    'This patient’s rehab episode has changed in the meantime. Refresh the screen and choose the outcome again.',
  'Dit traject loopt al.': 'This rehab episode is already active.',
  'Er is al een nieuwer traject gestart. Dit traject kan niet meer heropend worden.':
    'A newer rehab episode has already been started. This one can no longer be reopened.',
  'Er loopt al een traject voor deze patiënt.': 'A rehab episode is already active for this patient.',
  'Er is inmiddels iets vastgelegd op het nieuwere traject van deze patiënt. Ververs het scherm en probeer het opnieuw.':
    'Something has since been recorded on this patient’s newer rehab episode. Refresh the screen and try again.',
  'Criterium hoort niet bij dit traject': 'Criterion is not part of this rehab episode',
  'Test niet in catalogus': 'Test not in catalogue',
  'Test bestaat niet': 'Test does not exist',
  'Geen tests uit de catalogus om als batterij op te slaan.': 'No catalogue tests to save as a battery.',
  'Voeg eerst tests toe.': 'Add tests first.',
  'Vul eerst scores/hoeken in.': 'Fill in scores/angles first.',
  'Mobility Assessment is niet geactiveerd voor jouw account. Neem contact op met een admin.':
    'Mobility Assessment is not enabled for your account. Contact an admin.',
  'Assessment is niet geactiveerd voor jouw account. Neem contact op met een admin.':
    'Assessment is not enabled for your account. Contact an admin.',
  'Patiënt heeft bezwaar gemaakt tegen de Clinical Insight Engine. Kan niet activeren.':
    'Patient has objected to the Clinical Insight Engine. Cannot enable.',

  // Tags
  'Te korte tag': 'Tag is too short',

  // Account, MFA en AVG
  'Schakel eerst MFA (Authenticator) in voordat je backup-codes genereert.':
    'Enable MFA (Authenticator) before generating backup codes.',
  'Ongeldige backup-code.': 'Invalid backup code.',
  'Deze code is al gebruikt.': 'This code has already been used.',
  'Account is al verwijderd.': 'Account has already been deleted.',
  'Account is al definitief verwijderd; niet meer terug te draaien.':
    'Account has already been permanently deleted; this cannot be undone.',
  'Deze gebruiker heeft geen deletion-verzoek.': 'This user has no deletion request.',

  // Uitnodigen en koppelen
  'Geen therapeut gevonden met dit e-mailadres. Vraag de beheerder om een account.':
    'No therapist found with this email address. Ask the administrator for an account.',
  'Je kunt jezelf niet uitnodigen.': 'You cannot invite yourself.',
  'Dit e-mailadres hoort bij een bestaand therapeut- of admin-account.':
    'This email address belongs to an existing therapist or admin account.',
  'Deze gebruiker is al bekend en niet aan jou of jouw praktijk gekoppeld.':
    'This user already exists and is not linked to you or your practice.',
  'Kan deze uitnodiging niet opnieuw versturen.': 'Cannot resend this invitation.',
  'Deze gebruiker bestaat al.': 'This user already exists.',
  'Als coach kun je alleen atleten uitnodigen.': 'As a coach you can only invite athletes.',
  'Alleen een beheerder kan een coach-account aanmaken.': 'Only an administrator can create a coach account.',
  'Dit e-mailadres is al in gebruik door een ander account.': 'This email address is already in use by another account.',
  'Patiënt heeft geen geboortedatum, vul die eerst in voordat je opnieuw uitnodigt.':
    'Patient has no date of birth; fill that in before inviting again.',
  'Invite is al gebruikt': 'Invite has already been used',
  'Te veel pogingen. Neem contact op met je therapeut voor een nieuwe invite.':
    'Too many attempts. Contact your therapist for a new invite.',
  'Kon op dit moment geen code versturen. Probeer het straks opnieuw.':
    'Could not send a code right now. Try again later.',
  // Samengesteld uit twee literals in invite.ts; de sleutel is de volledige zin.
  'We kunnen geen actieve uitnodiging vinden. Klopt je e-mail en geboortejaar? Heb je al eerder ingelogd? Dan log je in met alleen je e-mail via "Al een account?" hieronder.':
    'We cannot find an active invitation. Are your email and year of birth correct? Signed in before? Then sign in with just your email via "Already have an account?" below.',
}

export function translateErrorMessage(message: string): string {
  return ERROR_MESSAGES[message] ?? message
}
