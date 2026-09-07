# Backup del sito precedente

`old-site-root-6f179230.zip` contiene il sito che era pubblicato alla radice di `ksw.ski` prima della migrazione del 7 settembre 2026.

- Commit di origine: `6f1792300dea28d2942a19abfc75654bccbf44a4`
- Sorgente GitHub Pages: branch `main`, cartella `/`
- Contenuto: pagine HTML del vecchio sito, `404.html`, `CNAME`, CSS, JavaScript, PDF e l'intera cartella `resources`
- Esclusioni intenzionali: `.git`, questa cartella `backups`, la build `/v2` e la nuova build alla radice

Per ripristinare l'intero stato pubblicato precedente, il metodo più sicuro è creare un commit che riporti l'albero al commit di origine indicato sopra. Per ripristinare manualmente soltanto il vecchio sito alla radice, rimuovere prima le cartelle della nuova build (`about`, `assets`, `fonts`, `previews`, `projects`, `social`, `v2`) e `icon.ico`, quindi estrarre l'archivio nella radice del repository. Il file `CNAME` nell'archivio deve restare `ksw.ski`.
