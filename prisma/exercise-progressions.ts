/**
 * Evidence-based progressie/regressie ketens voor oefeningen.
 * Geordend van MAKKELIJK naar MOEILIJK op basis van EMG % MVIC voor de primaire spiergroep.
 *
 * Bronnen: peer-reviewed EMG-studies 2000-2025 (zie emg_bovenste_core.md en emg_onderste_extremiteit.md).
 *
 * De seed-loop leest deze ketens en koppelt automatisch easierVariantId/harderVariantId.
 * Keten-eindpunten krijgen null voor easier (eerste) of harder (laatste).
 */

export const PROGRESSION_CHAINS: string[][] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // LOWER BODY
  // ═══════════════════════════════════════════════════════════════════════════

  // Squat-keten (quadriceps EMG %MVIC oplopend)
  // Bulgarian Split Squat: VM 85% MVIC [Mackey 2021]
  ['Wall Sit', 'Bodyweight Squat', 'Goblet Squat', 'Back Squat', 'Front Squat', 'Bulgarian Split Squat', 'Pistol Squat'],

  // Leg Press — aparte machine-keten (lagere activatie dan squats [Escamilla 2001])
  ['Leg Press', 'Back Squat'],

  // Hip Hinge / Glute-keten (gluteus maximus EMG %MVIC oplopend)
  // Hip Thrust: piek 216% MVIC [Contreras 2015]
  ['Glute Bridge', 'Single Leg Glute Bridge', 'Barbell Hip Thrust', 'Single Leg Hip Thrust', 'Romanian Deadlift (RDL)', 'Conventional Deadlift'],

  // Unilaterale hinge-progressie
  ['Single Leg Glute Bridge', 'Single Leg Deadlift', 'Single Leg Hip Thrust'],

  // Good Morning / Hinge kracht
  ['Kettlebell Swing', 'Good Morning', 'Romanian Deadlift (RDL)'],

  // Hamstrings isolatie (biceps fem/semitend %MVIC)
  // Nordic Curl: BF 74.8%, ST 78.3% [Krommes 2021]
  ['Leg Curl (machine)', 'Prone Leg Curl', 'Nordic Hamstring Curl'],

  // Gluteus medius — klinisch belangrijke keten
  // Side-Lying Hip Abduction: 81% GMed MVIC [Distefano 2009]
  ['Clamshell', 'Side-Lying Hip Abduction', 'Lateral Step-Up'],

  // Unilaterale functionele keten (combineert GMax + GMed)
  ['Step Up', 'Lateral Step-Up', 'Walking Lunge', 'Reverse Lunge', 'Lateral Lunge', 'Bulgarian Split Squat', 'Pistol Squat'],

  // Calf gastrocnemius (staande varianten, gestrekte knie)
  // Standing: ~52% MVIC gastroc [Hébert-Losier 2009]
  ['Calf Raise (staand)', 'Single Leg Calf Raise'],

  // Calf soleus (zittende variant, gebogen knie — isoleert soleus)
  ['Seated Calf Raise'],

  // ═══════════════════════════════════════════════════════════════════════════
  // UPPER BODY — PUSH
  // ═══════════════════════════════════════════════════════════════════════════

  // Horizontaal duwen (pectoralis + triceps EMG)
  // Bench press flat: max sternocostale [Rodríguez-Ridao 2020]
  // Push-up: triceps 73-109%, pec 95-105% [Kowalski 2022]
  ['Wall Push-Up', 'Incline Push-Up', 'Push-Up', 'Narrow-Grip Push-Up', 'Dumbbell Chest Press', 'Bench Press', 'Incline Bench Press', 'Parallel Bar Dips'],

  // Fly-isolatie (stretch-mediated hypertrofie)
  ['Dumbbell Fly', 'Cable Fly'],

  // Verticaal duwen (deltoïdeus anterior EMG)
  // Standing DB press: 33% ant delt MVIC [Saeterbakken 2013, Coratella 2020]
  ['Dumbbell Shoulder Press', 'Overhead Press'],

  // Lateral raise (deltoïdeus medialis — 30% MVIC [Coratella 2020])
  ['Cable Lateral Raise', 'Lateral Raise'],

  // ═══════════════════════════════════════════════════════════════════════════
  // UPPER BODY — PULL
  // ═══════════════════════════════════════════════════════════════════════════

  // Horizontaal trekken (lats + midden trap + rhomboids)
  // Chest-supported row: zelfde lat-activatie als bent-over, minder erector spinae [Fenwick 2009]
  ['Inverted Row', 'Chest-Supported Row', 'Cable Row (zittend)', 'Dumbbell Row (single arm)', 'Barbell Row'],

  // Verticaal trekken (latissimus dorsi)
  // Pull-up: Lats 117-130% MVIC supramaximaal [Youdas 2010]
  ['Lat Pulldown', 'Assisted Pull-Up', 'Chin-Up', 'Pull-Up'],

  // ═══════════════════════════════════════════════════════════════════════════
  // SHOULDERS / ROTATOR CUFF / SCAPULA
  // ═══════════════════════════════════════════════════════════════════════════

  // Rotator cuff externe rotatie (infraspinatus)
  // Sidelying ER: 62% infra, 67% teres minor MVIC [Reinold 2004]
  ['External Rotation (band)', 'Sidelying External Rotation'],

  // Scapulaire stabilisatie (onder trapezius, posterior delt)
  // Prone Y-raise: 85-97% lower trap MVIC [Cools 2007]
  ['Prone W-Raise', 'Prone T-Raise', 'Prone Y-Raise', 'YTWL Raises', 'Face Pull'],

  // ═══════════════════════════════════════════════════════════════════════════
  // ARMS
  // ═══════════════════════════════════════════════════════════════════════════

  // Biceps (brachii activatie oplopend)
  // Incline curl: langere ROM met stretch. EZ-bar: hogere EMG dan DB [Marcolin 2018]
  ['Hammer Curl', 'Reverse Curl', 'Bicep Curl', 'EZ-Bar Curl', 'Incline Dumbbell Curl', 'Preacher Curl'],

  // Triceps laterale/mediale kop
  // Rope pushdown: 74% MVIC lateraal/mediaal [Boehler 2011]
  ['Tricep Pushdown (kabel)', 'Skull Crusher', 'Tricep Dip', 'Parallel Bar Dips'],

  // Triceps lange kop (overhead focus — +40% hypertrofie [Maeo 2023])
  ['Overhead Triceps Extension'],

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE
  // ═══════════════════════════════════════════════════════════════════════════

  // Anterior core (rectus abdominis EMG oplopend)
  // Ab wheel: 63% upper rectus MVIC [Escamilla 2006]
  // Hanging knee-up: top-3 rectus abd activatie
  ['Crunch', 'Sit-Up', 'Dead Bug', 'Hollow Body Hold', 'Cable Crunch', 'Hanging Knee Raise', 'Hanging Leg Raise', 'Ab Wheel Rollout'],

  // Onderste rectus abdominis keten (reverse crunch = top voor onderste regio)
  ['Reverse Crunch', 'Hanging Knee Raise', 'Hanging Leg Raise'],

  // Anti-rotation / lateral core (McGill Big Three principe)
  // Bird Dog: #1 transversus abdominis activatie [Yoon 2024]
  ['Bird Dog', 'Dead Bug', 'Side Plank', 'Plank', 'Pallof Press'],

  // ═══════════════════════════════════════════════════════════════════════════
  // BACK EXTENSION
  // ═══════════════════════════════════════════════════════════════════════════

  // Rug extensie (erector spinae EMG)
  // Roman Chair back extension: 76-79% erector spinae [Callaghan 1998]
  ['Back Extension (Roman Chair)', 'Good Morning', 'Reverse Hyper'],

  // ═══════════════════════════════════════════════════════════════════════════
  // PLYOMETRICS
  // ═══════════════════════════════════════════════════════════════════════════

  // Plyo verticaal (gluteus maximus hiërarchie)
  // Hurdle jump: hoogste GMax activatie van alle sprongoefeningen [Ebben 2011]
  ['Broad Jump', 'Countermovement Jump', 'Box Jump', 'Depth Jump', 'Hurdle Jump'],

  // Plyo lateraal (gluteus medius)
  ['Split Jump / Lunge Jump', 'Crossover Jump'],

  // ═══════════════════════════════════════════════════════════════════════════
  // CARRIES
  // ═══════════════════════════════════════════════════════════════════════════

  // Carry progressie (bilateraal → unilateraal voor anti-laterale flexie)
  ['Farmer\'s Walk', 'Suitcase Carry'],

  // ═══════════════════════════════════════════════════════════════════════════
  // SPORT-SPECIFIEK (aanvullingen 2026-04-23)
  // ═══════════════════════════════════════════════════════════════════════════

  // Kettlebell deadlift — bilateraal → unilateraal (anti-rotatie progressie)
  ['Kettlebell deadlift', 'Single arm kettlebell deadlift'],
]
