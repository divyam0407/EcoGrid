# EcoGrid final submission package

This folder contains the F1–F4 technical report, editable slide deck, implementation notes, diagram sources/exports and a presenter walkthrough. The source repository remains authoritative; this folder explains the implementation as inspected for F5. No application logic or database schema was changed for this package.

## Deliverables

- `EcoGrid_Final_Project_Report.docx` — formal editable report.
- `output/EcoGrid_Final_Presentation_Final.pptx` — 15-slide editable presentation.
- `01-project-overview.md` through `07-limitations-and-future-work.md` — technical documentation chapters.
- `demo-walkthrough.md` — 8–12 minute presenter guide; account password is intentionally not reproduced.
- `diagrams/*.mmd` — editable Mermaid sources; `diagrams/rendered/*.png` — diagram exports.
- `assets/` — diagram images used by DOCX.

## Source of truth and claims

Implementation descriptions were checked against the current Prisma schema, Express routes, Python service, tests and existing demo documentation. ABC University is fictional and its records are synthetic. The local walkthrough requires credentials already documented in the project’s local demo instructions; passwords and `.env` values are deliberately excluded here. Do not interpret solver status `OPTIMAL` as realized savings. Savings are `ESTIMATED_UNVERIFIED`.

## Open the report and presentation

Open the DOCX and PPTX in Microsoft Word/PowerPoint, LibreOffice, or compatible editors. The PPTX uses editable text and shapes. Mermaid files are plain-text editable diagram sources. Screenshots of a live application were unavailable as trustworthy submission assets, so none are fabricated.

## Verification

The report records milestone-specific evidence and its limits. Document package integrity, rendering, slide count and `git diff --check` should be checked when these deliverables are finalized. This documentation task does not rerun application suites or claim new application test results.
