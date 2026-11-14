# AEGIS — Fonti NASA candidate

**Ricerca:** 14 novembre 2026. Nessun file di studio importato nel backend durante questa ricognizione.

## Primo candidato: sonno da actigrafia

[UTMB Bedrest Campaign 1 Actigraphy — NASA NLSP](https://nlsp.nasa.gov/search/data/details/e26501eb-7d7a-5012-8c8e-c5bdb3eecaf6?dataType=DATASETS)

Il catalogo NASA lo indica come **Available online**, con dati processati di durata, latenza ed efficienza del sonno per partecipanti a una campagna terrestre di bed rest. Sono elencati tre file, inclusi ReadMe e dati analizzati.

È un candidato per una prima importazione sul sonno; non rappresenta telemetria ISS né copre automaticamente umore e reattività. Download dei file, colonne effettive, granularità, unità e condizioni di riutilizzo devono ancora essere verificati. Non chiamarlo dataset già scaricato o integrato.

## Candidato pertinente ma con accesso controllato: PVT su ISS

[Psychomotor Vigilance Test on ISS — NASA NLSP](https://nlsp.nasa.gov/search/data/details/f39b0243-b8f5-5a2a-8905-e5c694b44c22?dataType=EXPERIMENTS)

DOI: `10.83263/z81f-k208`. Il catalogo dichiara dati completi ma **restricted-access**, protetti per privacy e disponibili tramite richiesta. È pertinente alla reattività e ai fattori associati; non è un CSV pubblico immediatamente utilizzabile. Non dipendere dall'ottenimento dell'accesso per completare l'MVP.

## Candidato secondario: ritmi circadiani

[DSO 484 — Assessment of Circadian Shifting in Astronauts by Bright Light — NASA NLSP](https://nlsp.nasa.gov/search/data/details/1bb44ffb-b00d-521a-bbeb-d8fcd036ad83?dataType=EXPERIMENTS)

La scheda elenca contenuti open-access, fra cui un Excel di acrofasi e ritardi di fase ormonali, e altre variabili ad accesso controllato. È meno adatto al primo import: non è una serie ordinaria di durata e qualità del sonno. Anche qui i file binari e le colonne non sono stati ispezionati.

## Chiarimento nella community Space Apps

[Datasets for Create Health Monitoring Software for Astronauts — discussione #2025](https://github.com/nasa/spaceapps/discussions/2025)

Una risposta etichettata **Navigator answered** suggerisce di esplorare OSDR e NLSP e, dove mancano dati, usare simulazioni chiaramente dichiarate. È un orientamento nel forum, non una nuova regola di gara o una garanzia di ammissibilità. I requisiti della challenge e di submission restano il riferimento ufficiale.

## Decisione operativa

Seguire [DATA_STRATEGY.md](DATA_STRATEGY.md): verificare prima i file di actigrafia e il dizionario, poi costruire un adattatore nell'archivio di ricerca separato. Conservare il percorso personale e i dati sintetici con etichette esplicite. Non riempire variabili mancanti con valori inventati e non trasferire risultati di popolazione nella baseline personale.
