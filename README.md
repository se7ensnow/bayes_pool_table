# bayes_pool_table

An interactive explainer of Bayes' theorem built around the classic pool-table thought experiment: a white ball sits at an unknown spot on the table, red balls are thrown at random, and each "above / below" observation updates our belief about where the white ball is.

The page walks through the prior, the likelihood and the posterior, then lets you throw balls yourself and watch the posterior distribution sharpen with every throw.

**Live site:** https://se7ensnow.github.io/bayes_pool_table/

## Files

- `index.html`, `styles.css`, `app.js` — the website (plain static HTML/CSS/JS, no build step)
- `bayes_theorem_updated_2.md` — the written explanation the page is based on
- `*.png` — illustrations

## Running locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server
```

The site is published with GitHub Pages from the root of the `main` branch.