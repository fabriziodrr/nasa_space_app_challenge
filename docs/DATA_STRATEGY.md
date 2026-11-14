# AEGIS — Gestione dei dati e integrazione di fonti di ricerca

**Stato:** piano di integrazione; catalogo e archivio di ricerca non ancora implementati.

La base operativa esistente è descritta in [DATA_BACKEND.md](DATA_BACKEND.md). Prima di adattare gli schemi occorre verificare i dataset effettivamente disponibili, le loro colonne e le condizioni di accesso.

## 1. Tre tipi di dati

| Tipo | Contenuto | Uso |
|---|---|---|
| Osservazioni personali | Check-in, test di reattività e futuri segnali acquisiti dall'utente | Dashboard personale e contesto del compagno |
| Dati di ricerca | File pubblicati con soggetti, protocolli e variabili propri | Esplorazione, verifica delle trasformazioni e confronti di ricerca espliciti |
| Dati sintetici | Esempi costruiti per test e demo | Dimostrazione del flusso, sempre etichettata |

Una pubblicazione scientifica è una fonte di evidenza, non necessariamente un dataset disponibile. Un record di catalogo senza file accessibili non va presentato come dati importati.

I dati di ricerca non devono entrare automaticamente nello storico personale, nella baseline o nel contesto del compagno. La baseline personale si costruisce da sessioni dello stesso utente raccolte in condizioni comparabili.

## 2. Confine iniziale fra archivi

Per il primo import proponiamo un archivio di ricerca separato dall'attuale SQLite operativo. Gli endpoint personali restano collegati al solo archivio operativo. La separazione fisica rende verificabile che un'importazione di studio non modifichi la storia dell'utente.

Il solo campo `synthetic` oggi non è sufficiente per identificare dati reali di ricerca: `false` non significa necessariamente dato personale. Il futuro archivio di ricerca deve utilizzare identificativi di dataset e partecipante nel proprio namespace.

Non aggiungiamo un modello clinico, soglie di popolazione o un processo di addestramento soltanto perché un dataset è disponibile: ogni uso richiede una domanda e variabili appropriate.

## 3. Percorso di ingestione

1. **Catalogare:** registrare identificativo ufficiale, titolo, URL, eventuale DOI, popolazione, accessibilità, versione e condizioni d'uso.
2. **Acquisire:** conservare il file originale senza modificarlo; registrare data di acquisizione e hash SHA-256. Non versionare grandi file o dati personali in Git.
3. **Ispezionare:** descrivere colonne, unità, scale, frequenza, numero di soggetti, valori mancanti e protocollo di raccolta.
4. **Mappare:** creare un adattatore specifico e versionato, conservando campo originale e trasformazione applicata.
5. **Validare:** rifiutare o mettere in quarantena le righe incoerenti, producendo un rapporto di importazione; non eliminarle silenziosamente.
6. **Conservare:** importare atomicamente le righe accettate nell'archivio di ricerca. Identificativi e hash impediscono duplicazioni involontarie.
7. **Esporre:** offrire viste dedicate ai dati di ricerca, con provenienza visibile e senza mescolarle ai parametri personali.

Prima del download verificare eventuali restrizioni o obblighi di attribuzione: l'accessibilità sul web non equivale automaticamente a una licenza di riutilizzo senza condizioni.

## 4. Provenienza minima

Per ogni import: `dataset_id`, `source_url`, `source_version`, `retrieved_at`, `file_sha256`, `adapter_version`, condizioni d'uso e rapporto di validazione.

Per ogni riga: identificativo originale del soggetto pseudonimo, file e posizione d'origine, misura, valore, unità o scala, riferimento temporale, metodo di acquisizione, qualità e trasformazioni.

Un giorno di missione o un tempo relativo non deve diventare un timestamp UTC inventato. Mantenere il riferimento temporale originale finché non è disponibile una conversione documentata.

## 5. Regole per sonno, umore e reattività

- **Sonno:** separare durata riferita, misure actigrafiche ed eventuali stadi del sonno. Durata non equivale a qualità. Se una scala di qualità manca, mantenerla assente.
- **Umore:** mantenere nome e ancoraggi della scala originale. Stress, sonnolenza e umore sono variabili distinte; non convertirle automaticamente nell'attuale `mood_rating` 1–5.
- **Reattività:** preservare protocollo, durata, dispositivo, trial e definizioni di lapses/falsi avvii quando disponibili. Una media o una statistica pubblicata non permette di ricostruire trial individuali.
- **Disponibilità:** un dataset può coprire soltanto una delle dimensioni. Non inventare le altre per completare una demo.
- **Popolazione:** distinguere astronauti, partecipanti ad analoghi e volontari terrestri. Un soggetto di uno studio non corrisponde a un soggetto di un altro studio.

## 6. Limiti attuali degli schemi

Gli schemi operativi sono adeguati al primo esempio, ma non sono ancora un formato universale di ricerca:

- Il sonno richiede sia durata sia qualità; uno studio può pubblicarne una sola.
- L'umore richiede anche alertness; queste misure possono essere raccolte in momenti differenti.
- La reattività accetta soltanto `aegis-pvt-demo-v1`; non assegnarlo a test NASA con un protocollo diverso.
- L'import attuale accetta timestamp assoluti con fuso; alcuni studi usano tempi relativi.

Gli adattatori devono quindi essere progettati dopo l'ispezione dei dati. Non forzare il dataset negli schemi attuali attraverso valori inventati o conversioni senza giustificazione.

## 7. Cosa riceve il compagno

Nel percorso personale, il compagno riceve lo snapshot del soggetto attivo, qualità e provenienza delle misure, disponibilità dei dati e limiti del confronto. Le informazioni mancanti devono restare esplicite.

Un eventuale strumento di ricerca è separato e restituisce anche dataset, popolazione e protocollo. Se viene mostrato un confronto con uno studio, deve essere denominato confronto di ricerca e non baseline personale o giudizio di salute.

L'LLM può spiegare risultati già calcolati. Non sceglie autonomamente quali studi o soggetti mescolare e non esegue trasformazioni numeriche invisibili alla dashboard.

## 8. Criterio per scegliere il primo dataset

Priorità a un dataset con file realmente accessibili, dizionario dei dati, condizioni d'uso verificabili e almeno una variabile utile a sonno o reattività. La presenza di dati longitudinali e identificativi pseudonimi stabili permette analisi entro soggetto.

Meglio completare un'importazione riproducibile di una sola dimensione che promettere una copertura di sonno, umore e reattività non presente nei file. Se esistono soltanto metadati o accesso controllato, documentarlo e mantenere gli esempi sintetici etichettati.
