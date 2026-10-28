# 🎡 Fake Roulette v1.0

Fałszywa ruletka jako strona WWW — koło wygląda jak prawdziwe losowanie, ale wynik każdej rundy można wcześniej ustawić.

## Funkcje (v1.0)

- 🎯 **Wybory** — dowolna lista pól na kole (dodawanie / usuwanie / zmiana nazw).
- 🔗 **Połączenia** — reguły „A → B”: gdy w rundzie N wypadnie A, runda N+1 na pewno wylosuje B.
  Przykład: `Sofia → Wania` — pierwszy obrót wypada Sofia, drugi obrót wypada Wania.
  Można dodawać dowolną liczbę połączeń, w tym łańcuchy `A → B → C`.
- 🔢 **Rundy** — liczba obrotów w jednej grze (1–30).
- 🎭 **Wymuszanie wyników** — opcjonalna lista wymuszonych wyników od rundy 1 (najwyższy priorytet).
- 💾 Ustawienia zapisują się w przeglądarce (localStorage).
- 📜 Historia rund z oznaczeniem źródła wyniku: losowo / połączenie / wymuszone.

## Priorytet ustalania wyniku rundy

1. Wymuszenie (sekcja „Wymuszanie wyników”),
2. Połączenie z poprzedniego wyniku (pierwsze pasujące wygrywa),
3. Losowanie.

## Uruchamianie lokalnie

```bash
python3 -m http.server 4173
# otwórz http://localhost:4173
```

lub `npm start`.

## Testy

```bash
npm test
# równoważnie: node --test test/core.test.js && node --check app.js && node --check core.js
```

## Publikacja

Cała aplikacja to pliki statyczne: `index.html`, `styles.css`, `app.js`, `core.js`.
Można je wgrać na dowolny hosting statyczny:

- **GitHub Pages** — utwórz repo, wgraj pliki, włącz Pages z gałęzi `main`.
- **Netlify Drop** — spakuj pliki do zip i przeciągnij na <https://app.netlify.com/drop>.
- **Vercel / Cloudflare Pages** — podłącz repo lub wgraj katalog przez CLI.

## Roadmap

- v1.1: kilka połączeń z tego samego źródła (cyklicznie), wagi wyborów, dźwięk obrotu.
- v1.2: udostępnianie ustawień przez link/QR, motywy, statystyki wyników.
