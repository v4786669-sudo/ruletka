# 🎡 Ruletka v1.3

Ruletka jako strona WWW — zakręć kołem i sprawdź swoje szczęście.

## Funkcje

- 🎡 Koło losujące z dowolnymi polami (imiona, hasła, cokolwiek) — wygląd ruletki kasynowej: zielone sukno, segmenty czerwone/czarne, złote separatory i piasta.
- 🎰 **Kolejność rund** — ustawiasz listę par „X → Y”: każda para to 2 obroty (najpierw X, potem Y). Pary można dodawać, usuwać i przestawiać (↑/↓). Imiona już wylosowane są POMIJANE przy kolejnych obrotach.
- 🖐️ **Ręczne rundy** — jedno kliknięcie **Start** = jeden obrót. Wynik pokazuje wielki overlay na środku ekranu („Wypadło: X”); zamykasz go kliknięciem (lub Escape) i kręcisz dalej.
- 🚫 **Eliminacja** — wylosowane imię ZNIKA z koła, które ma coraz mniej segmentów. Gdy koło jest puste: kolejna seria z odnowionym kołem albo koniec gry.
- 🔢 **Serie** — w ustawieniach liczba serii 1–20 (domyślnie 2). Gdy sekwencja par się kończy, a na kole zostali gracze — losowanie spośród pozostałych. Po ostatniej serii „Koniec gry — kliknij Start”; kolejny Start zaczyna nową grę od serii 1.
- ⚙️ **Ustawienia w prawym górnym rogu** — przycisk ⚙️ w nagłówku otwiera okno ustawień zwykłym klikiem.
- 📜 Bez historii i podsumowania — koło, overlay wyniku i wskaźnik „Seria X z N · Na kole: Y”.
- 🔊 Delikatne dźwięki koła (WebAudio, bez plików).
- 💾 Ustawienia zapisują się w przeglądarce pod kluczem `ruletka-v3` (stary klucz `ruletka-v2` jest migrowany automatycznie — serie ustawiane na 1).
- 📱 Działa na telefonie.

## Uruchamianie lokalnie

```bash
npm start
# otwórz http://localhost:4173
```

## Testy

```bash
npm test      # testy logiki (docs/core.js) + sprawdzenie składni
npm run smoke # smoke test UI (jsdom): boot, branding, overlay wyniku, eliminacja, serie, koniec gry, migracja v2→v3
```

## Publikacja

Statyczne pliki strony znajdują się w katalogu `docs/` — można go wgrać na dowolny hosting statyczny (GitHub Pages, Netlify, Vercel, Cloudflare Pages…).

## Historia wersji

- v1.3 — ręczne rundy z overlayem wyniku, eliminacja wylosowanych imion z koła, serie z odnowieniem koła.
- v1.2 — mechanika „kolejność rund” jako lista par, ustawienia w prawym górnym rogu, przycisk Start odgrywa całą sekwencję, usunięta historia i podsumowanie, naprawione bugi.
- v1.1 — wygląd ruletki kasynowej, czytelne etykiety na kole, dźwięk, neutralna historia.
- v1.0 — pierwsza wersja.
