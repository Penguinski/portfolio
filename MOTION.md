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
| `stepMs` | `75` | Preferred interval between elements. |
| `maxDelayMs` | `475` | Maximum delay before the final element starts. |
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
reveals pass their delay through `--reveal-delay` to `assets/scroll-reveal.js`.
That module owns an explicit opacity/blur/transform animation, preventing hidden
CSS transitions and viewport changes from shortening the visible reveal in Safari.
The initial introduction and page transition masks keep their existing animation
engine. Transition overlays use the same font antialiasing as the original body.

On touch devices, a successful email copy displays “Email copied” for two
seconds before returning to the address, using opacity/blur without changing
the control's size. Desktop retains its copy/check icons.

## Navigation continuity

Internal navigation prepares shared destination images (or the page hero) while the current page is still
visible. The exit/shared/entry timings and scroll reveals are unchanged. Image
and font failures are non-fatal; once destination HTML is available, an animation
failure settles the destination in the same document instead of reloading it.
Native navigation remains the fallback for unavailable HTML and reduced motion.

Each pushed history entry stores its previous portfolio entry. Reloading a project
or About can therefore retain the existing Back to Work behavior and restore the
previous Work scroll position without a separate persistent history database.

Run the transaction regression tests with:

```sh
node --test tests/navigation-continuity.test.mjs
```
