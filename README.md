# 🎡 Ruletka v1.2

Ruletka jako strona WWW — zakręć kołem i sprawdź swoje szczęście.

## Funkcje

- 🎡 Koło losujące z dowolnymi polami (imiona, hasła, cokolwiek) — wygląd ruletki kasynowej: zielone sukno, segmenty czerwone/czarne, złote separatory i piasta.
- 🎰 **Kolejność rund** — ustawiasz listę par „X → Y”: każda para to 2 obroty (najpierw X, potem Y), a koło odgrywa całą listę automatycznie w zadanej kolejności. Pary można dodawać, usuwać i przestawiać (↑/↓).
- ⚙️ **Ustawienia w prawym górnym rogu** — przycisk ⚙️ w nagłówku otwiera okno ustawień zwykłym klikiem.
- 🎡 Przycisk **Start** — jedno kliknięcie odgrywa całą sekwencję rund (animacja ~4,2 s + pauza ~1,4 s między rundami); podczas gry jest zablokowany, po końcu znów aktywny.
- 📜 Bez historii i podsumowania — tylko koło, duży wynik „Wypadło: X” i przygaszony wskaźnik postępu „Runda N z M”.
- 🔊 Delikatne dźwięki koła (WebAudio, bez plików).
- 💾 Ustawienia zapisują się w przeglądarce pod kluczem `ruletka-v2` (stary klucz `ruletka-v1` jest migrowany automatycznie — połączenia stają się parami).
- 📱 Działa na telefonie.

## Uruchamianie lokalnie

```bash
npm start
# otwórz http://localhost:4173
```

## Testy

```bash
npm test      # testy logiki (docs/core.js) + sprawdzenie składni
npm run smoke # smoke test UI (jsdom): boot, branding, ustawienia ⚙️, sekwencja rund, zapis ustawień, migracja v1→v2
```

## Publikacja

Statyczne pliki strony znajdują się w katalogu `docs/` — można go wgrać na dowolny hosting statyczny (GitHub Pages, Netlify, Vercel, Cloudflare Pages…).

## Historia wersji

- v1.2 — mechanika „kolejność rund” jako lista par, ustawienia w prawym górnym rogu, przycisk Start odgrywa całą sekwencję, usunięta historia i podsumowanie, naprawione bugi.
- v1.1 — wygląd ruletki kasynowej, czytelne etykiety na kole, dźwięk, neutralna historia.
- v1.0 — pierwsza wersja.
