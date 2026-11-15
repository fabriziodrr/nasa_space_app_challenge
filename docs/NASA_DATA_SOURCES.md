# AEGIS — Candidate NASA Sources

**Research:** 14 November 2026. No study file imported into the backend during this reconnaissance.

## First candidate: actigraphy sleep

[UTMB Bedrest Campaign 1 Actigraphy — NASA NLSP](https://nlsp.nasa.gov/search/data/details/e26501eb-7d7a-5012-8c8e-c5bdb3eecaf6?dataType=DATASETS)

The NASA catalog marks it as **Available online**, with processed sleep duration, latency, and efficiency data for participants in a ground-based bed rest campaign. Three files are listed, including ReadMe and analyzed data.

It is a candidate for a first sleep import; it does not represent ISS telemetry nor does it automatically cover mood and responsiveness. File download, actual columns, granularity, units, and reuse conditions still need to be verified. Do not call it an already downloaded or integrated dataset.

## Relevant but controlled-access candidate: PVT on ISS

[Psychomotor Vigilance Test on ISS — NASA NLSP](https://nlsp.nasa.gov/search/data/details/f39b0243-b8f5-5a2a-8905-e5c694b44c22?dataType=EXPERIMENTS)

DOI: `10.83263/z81f-k208`. The catalog declares complete data but **restricted-access**, protected for privacy and available via request. It is relevant to responsiveness and associated factors; it is not a publicly usable CSV immediately. Do not depend on obtaining access to complete the MVP.

## Secondary candidate: circadian rhythms

[DSO 484 — Assessment of Circadian Shifting in Astronauts by Bright Light — NASA NLSP](https://nlsp.nasa.gov/search/data/details/1bb44ffb-b00d-521a-bbeb-d8fcd036ad83?dataType=EXPERIMENTS)

The sheet lists open-access content, including an Excel file of acrophases and hormonal phase delays, and other controlled-access variables. It is less suitable for the first import: it is not a regular series of sleep duration and quality. Binary files and columns have not been inspected here either.

## Space Apps community clarification

[Datasets for Create Health Monitoring Software for Astronauts — discussion #2025](https://github.com/nasa/spaceapps/discussions/2025)

A response labeled **Navigator answered** suggests exploring OSDR and NLSP and, where data are missing, using clearly declared simulations. It is forum guidance, not a new competition rule or an eligibility guarantee. Challenge and submission requirements remain the official reference.

## Operational decision

Follow [DATA_STRATEGY.md](DATA_STRATEGY.md): verify actigraphy files and dictionary first, then build an adapter in the separate research repository. Keep personal path and synthetic data with explicit labels. Do not fill missing variables with invented values and do not transfer population results into the personal baseline.
