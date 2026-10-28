# 🎡 Ruletka v1.1

Ruletka jako strona WWW — zakręć kołem i sprawdź swoje szczęście.

## Funkcje

- 🎡 Koło losujące z dowolnymi polami (imiona, hasła, cokolwiek) — wygląd ruletki kasynowej: zielone sukno, segmenty czerwone/czarne, złote separatory i piasta.
- 🔢 Konfigurowalna liczba rund w jednej grze (1–30).
- 📜 Historia rund i podsumowanie gry.
- 🔊 Delikatne dźwięki koła (WebAudio, bez plików).
- 💾 Ustawienia zapisują się w przeglądarce.
- 📱 Działa na telefonie.

## Uruchamianie lokalnie

```bash
npm start
# otwórz http://localhost:4173
```

## Testy

```bash
npm test      # testy logiki + sprawdzenie składni
npm run smoke # smoke test UI (jsdom)
```

## Publikacja

Statyczne pliki strony znajdują się w katalogu `docs/` — można go wgrać na dowolny hosting statyczny (GitHub Pages, Netlify, Vercel, Cloudflare Pages…).

## Historia wersji

- v1.1 — wygląd ruletki kasynowej, czytelne etykiety na kole, dźwięk, neutralna historia.
- v1.0 — pierwsza wersja.
