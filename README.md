# 📅 Gestione Presenze

App web per la gestione delle presenze lavorative. Nessun backend richiesto — tutto gira nel browser con `localStorage`.

## Funzionalità

- **Calendario mensile** — naviga per mese, visualizza le presenze di ogni persona
- **Gestione persone** — aggiungi o rimuovi dipendenti dalla sidebar
- **Tipi di presenza** supportati:
  - `P` Presenza in ufficio
  - `SW` Smart Working
  - `Fp` / `Fc` Ferie Anno Precedente / Corrente
  - `M` Malattia
  - `A41` Permesso personale
  - `A44` Visita medica
  - `RC` Riposo compensativo
  - `PB` Festività soppressa
  - `PE` Permesso esame
  - `PL` Permesso L.104
  - `PS` Permesso sindacale
  - `MP` Motivi personali
- **Importazione Excel** — supporta il formato `Foglio-presenze` (struttura mensile righe 8–19, colonne giornaliere 3–33)
- **Esportazione JSON** — backup dati locale
- **Riepilogo annuale** — tabella mensile con totali per ogni persona
- **Persistenza** — dati salvati nel `localStorage` del browser

## Utilizzo

### Avvio locale

```bash
# Con Python
python3 -m http.server 8080

# Oppure con Node.js
npx serve .
```

Apri `http://localhost:8080` nel browser.

### Deploy su GitHub Pages

1. Fai il fork o carica la cartella in un repository GitHub
2. Vai su **Settings → Pages**
3. Seleziona il branch `main` e la cartella `/ (root)`
4. Salva — la app sarà disponibile su `https://<utente>.github.io/<repo>/`

## Struttura del progetto

```
presenze-app/
├── index.html      # Struttura HTML e modali
├── style.css       # Stile completo
├── app.js          # Logica applicativa e import/export
└── README.md       # Questa documentazione
```

## Formato Excel importabile

Il file `.xlsx` deve contenere un foglio con queste caratteristiche:

| Riga | Contenuto |
|------|-----------|
| 0 | Intestazioni: `Anno`, `Matricola`, `Cognome e nome del dipendente` |
| 1 | Valori: anno, matricola, nome |
| 7 | Numeri dei giorni (1–31) nelle colonne 3–33 |
| 8–19 | Codici presenza mese per mese (Gennaio=8, Dicembre=19) |

Codici ammessi nelle celle: `P`, `SW`, `Fp`, `Fc`, `M`, `A41`, `A44`, `RC`, `PB`, `PE`, `PL`, `PS`, `MP`.

## Sincronizzazione dati (GitHub Gist)

Per rendere i dati **permanenti e condivisi** tra dispositivi, l'app supporta il salvataggio su un Gist privato di GitHub:

1. Vai su [github.com/settings/tokens/new](https://github.com/settings/tokens/new?scopes=gist&description=Presenze+App) e crea un **Personal Access Token** con scope `gist`
2. Nell'app, clicca **Sincronizzazione Gist** (sidebar o menu mobile)
3. Incolla il token → clicca **Connetti e salva**
4. L'app creerà automaticamente un Gist privato e vi salverà i dati ad ogni modifica
5. Su qualsiasi altro dispositivo: apri l'app, inserisci lo stesso token e lo stesso Gist ID → i dati vengono caricati automaticamente

> Il Gist ID viene mostrato dopo la prima connessione — annotalo per usarlo su altri dispositivi.

**Senza Gist configurato:** i dati vengono salvati solo nel `localStorage` del browser (si perdono se si cancella la cache o si cambia browser).

## Dati e privacy

Tutti i dati vengono salvati **esclusivamente nel browser locale** tramite `localStorage`. Nessun dato viene inviato a server esterni.

Per un backup, usa il pulsante **Esporta JSON** nella sidebar.

## Dipendenze

- [SheetJS (xlsx)](https://github.com/SheetJS/sheetjs) — lettura file Excel (caricato da CDN)

Nessuna altra dipendenza. Nessun framework. Nessun build step.

---

*Ispirato al formato "Foglio presenze 2.5" by Marco Barontini — [www.marbaro.it](https://www.marbaro.it)*
