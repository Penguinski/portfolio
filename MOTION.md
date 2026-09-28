# Entry stagger

Open any portfolio page with `?motion=1` (for example `/about/?motion=1`) to
show the tuning panel. Toggle **Attivo**, adjust **Intervallo** or **Ritardo
massimo**, then select **Riprova ingresso**. Preview values stay in the current
tab's session; opening a normal URL uses the published defaults. **Ripristina**
restores the defaults; **Chiudi** closes the panel and restores them for the
next batch.

Published settings are at the top of `assets/motion-settings.js`:

| Setting | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Set `false` to return to simultaneous entry. |
| `stepMs` | `45` | Preferred interval between elements. |
| `maxDelayMs` | `300` | Maximum delay before the final element starts. |
| `rowTolerancePx` | `2` | Treat nearly identical top coordinates as one row. |

Elements enter from top to bottom, then left to right within each row. Lines
inside one text element share the same delay. Large batches use a shorter
interval to fit the maximum delay, retaining their spatial order. New scroll
batches respect elements still waiting to begin; the delay budget remains
bounded. Each page gets a fresh scroll sequence.

The same scheduler handles the initial introduction, incoming page transitions
and scroll reveals on Work, About and the project pages. Exit and shared-element
movement retain their existing timing. Reduced-motion preferences bypass the
stagger and existing movement animations.

The served CSS/JS bundles are currently the repository's source of truth. The
readable settings module is imported by `assets/styles-D6VA2fPk.js`; scroll
reveals consume its delay through `--reveal-delay` in the shared stylesheet.

On touch devices, a successful email copy displays “Email copied” for two
seconds before returning to the address, using opacity/blur without changing
the control's size. Desktop retains its copy/check icons.
