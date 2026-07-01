# Päevasõna

Iga päev ühe eesti sõna kuvav veebileht. Sõnad pärinevad Eesti Keele Instituudi Ekilex andmebaasist.

## Tehnoloogiad

- **Frontend:** HTML, CSS, vanilla JS — raamistikke ei kasutata
- **Fondid:** [Fraunces](https://fonts.google.com/specimen/Fraunces) (sõna pealkiri), [Lora](https://fonts.google.com/specimen/Lora) (sisu), [Inter](https://fonts.google.com/specimen/Inter) (UI elemendid) — Google Fonts
- **Andmeallikas:** [Ekilex API](https://ekilex.ee) — EKI ühendsõnastik
- **Skriptid:** Node.js (ES moodulid, `.mjs`)
- **Andmesalvestus:** staatilised JSON failid (`cache/`)

## Projekti struktuur

```
paevasona/
├── index.html          # Avaleht — päeva sõna
├── archive.html        # Arhiiv — kõik senised sõnad
├── info.html           # Info leht
├── style.css           # Kõigi lehtede stiilid
├── data/
│   └── data.json       # Sõnade plaan: mis sõna mis päeval (gitist väljas)
├── cache/
│   ├── index.json      # Arhiivi indeks: kuupäevad ja sõnad
│   └── YYYY-MM-DD.json # Sõna andmed (definitsioonid, näitelaused, allikaviited)
└── scripts/
    ├── fetch-word.mjs  # Fetchib ühe kuupäeva sõna
    └── fetch-all.mjs   # Fetchib kõigi kuupäevade sõnad
```

## Seadistamine

### 1. Keskkonna muutujad

Loo `.env` fail projekti juurkausta:

```
EKILEX_API_KEY=sinu_api_võti
EKILEX_API_URL=https://ekilex.ee
```

### 2. Sõnade plaan

Loo `data/data.json` fail (gitist väljas):

```json
[
  {"date": "2026-07-01", "word": "prouhjen"},
  {"date": "2026-07-02", "word": "mõnesugune"}
]
```

Kuupäevad formaadis `YYYY-MM-DD`. Sõnad peavad olema leitavad Ekilexist.

## Andmete uuendamine

### Ühe päeva sõna fetchimine

```bash
node scripts/fetch-word.mjs
```

Fetchib tänahuvuse kuupäeva sõna `data.json` põhjal. Konkreetse kuupäeva jaoks:

```bash
FETCH_DATE=2026-07-02 node scripts/fetch-word.mjs
```

### Kõigi sõnade fetchimine

```bash
# Fetchib ainult need kuupäevad, millel cache puudub
node scripts/fetch-all.mjs

# Uuendab kõiki, ka olemasolevaid (nt API muutuste korral)
node scripts/fetch-all.mjs --force
```

### Automaatne uuendamine (cron)

Näide — fetchib iga päev kell 06:00:

```
0 6 * * * cd /path/to/paevasona && node scripts/fetch-word.mjs
```

## Cache formaat

`cache/YYYY-MM-DD.json`:

```json
{
  "date": "2026-07-01",
  "word": "prouhjen",
  "wordId": 2229470,
  "lexemes": [
    {
      "dataset": "eki",
      "pos": ["nimisõna, substantiiv"],
      "definitions": ["(naljatlevalt, irooniliselt naise, proua kohta)"],
      "usages": [
        {
          "text": "See oli Rosie Sneddon, vana Pete Sneddoni prouhjen.",
          "sources": ["Toomas Taul 2011"]
        }
      ]
    }
  ]
}
```

`cache/index.json` — arhiivi indeks, mida arhiivileht kasutab:

```json
[
  {"date": "2026-07-01", "word": "prouhjen"},
  {"date": "2026-06-30", "word": "helepala"}
]
```
