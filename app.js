/* =========================================================================
   Bayes at the pool table — interactive model
   ========================================================================= */

(() => {
  "use strict";

  // ---------------------------------------------------------------- model
  // Positions 0.01, 0.02, …, 1.00 — a fine grid, so the white ball can sit
  // at (almost) any height, not just a handful of round numbers.
  const CANDIDATES = Array.from({ length: 100 }, (_, i) => (i + 1) / 100);
  const M = CANDIDATES.length;
  const PRIOR = 1 / M;
  const MAX_TOTAL = 40;

  const FELT = { x: 116, y: 52, w: 500, h: 280 };

  const DEFAULT_WHITE = 0.7;
  const DEFAULT_BALLS = [
    // seven below the line
    { bx: 0.12, h: 0.14 }, { bx: 0.24, h: 0.26 }, { bx: 0.36, h: 0.18 },
    { bx: 0.52, h: 0.32 }, { bx: 0.66, h: 0.22 }, { bx: 0.78, h: 0.44 },
    { bx: 0.88, h: 0.60 },
    // three above it
    { bx: 0.18, h: 0.86 }, { bx: 0.44, h: 0.78 }, { bx: 0.72, h: 0.92 }
  ];

  const state = {
    whiteH: DEFAULT_WHITE,
    balls: DEFAULT_BALLS.map((b, i) => ({ id: i + 1, bx: b.bx, h: b.h }))
  };
  let nextId = state.balls.length + 1;

  // -------------------------------------------------------------- elements
  const svg = document.getElementById("poolTable");
  const felt = document.getElementById("felt");
  const ballsGroup = document.getElementById("balls");
  const gutterGroup = document.getElementById("gutterBars");
  const heightLine = document.getElementById("heightLine");
  const whiteBall = document.getElementById("whiteBall");
  const ghostBall = document.getElementById("ghostBall");

  const sliders = {
    white: document.getElementById("whiteRange"),
    whiteOut: document.getElementById("whiteValue")
  };

  const counts = {
    below: document.getElementById("countBelow"),
    above: document.getElementById("countAbove")
  };

  const barsWrap = document.getElementById("bars");
  const chartX = document.getElementById("chartX");
  const chartY = document.getElementById("chartY");
  const priorLine = document.getElementById("priorLine");
  const gridlines = document.getElementById("gridlines");
  const chartDetail = document.getElementById("chartDetail");
  const announcer = document.getElementById("announcer");
  const lab = document.getElementById("lab");

  const stats = {
    peak: document.getElementById("statPeak"),
    peakPost: document.getElementById("statPeakPost"),
    total: document.getElementById("statTotal")
  };

  // ------------------------------------------------------------- geometry
  const yForH = (h) => FELT.y + FELT.h * (1 - h);
  const xForB = (bx) => FELT.x + FELT.w * bx;

  // ------------------------------------------------------------ math core
  function computePosterior(below, above) {
    const logL = CANDIDATES.map((r) => {
      let v = 0;
      if (below > 0) v += below * Math.log(r);
      if (above > 0) v += above * Math.log(1 - r);
      return v;
    });
    const maxLog = Math.max(...logL);
    const lik = logL.map((v) => Math.exp(v - maxLog));
    const sum = lik.reduce((a, b) => a + b, 0);
    return {
      lik: lik.map((v) => v / sum), // relative, rescaled (shape only)
      post: lik.map((v) => v / sum)
    };
  }

  // true likelihoods, for the readouts
  function trueLikelihoods(below, above) {
    return CANDIDATES.map((r) => {
      let v = 1;
      for (let i = 0; i < below; i++) v *= r;
      for (let i = 0; i < above; i++) v *= 1 - r;
      return v;
    });
  }

  const fmt4 = (x) => {
    if (x <= 0) return "0";
    if (x < 0.0001) return "<0.0001";
    return x.toFixed(4);
  };

  const fmtLik = (x) => {
    if (x <= 0) return "0";
    if (x < 0.00001) return x.toExponential(2);
    if (x < 0.01) return x.toFixed(7);
    return x.toFixed(4);
  };

  // ------------------------------------------------------- build the chart
  const columns = [];

  function buildChart() {
    for (let i = 0; i < M; i++) {
      const col = document.createElement("div");
      col.className = "col";
      col.dataset.i = String(i);

      const stack = document.createElement("div");
      stack.className = "stack";

      const bar = document.createElement("span");
      bar.className = "bar";

      const val = document.createElement("span");
      val.className = "val";

      stack.append(bar, val);
      col.append(stack);
      barsWrap.append(col);

      columns.push({ col, stack, val });

      col.addEventListener("pointerenter", () => showDetail(i));
      col.addEventListener("pointerleave", () => showPeakDetail());
      col.addEventListener("click", () => showDetail(i));
    }

    // A handful of height labels rather than one per bar.
    for (const r of [0.2, 0.4, 0.6, 0.8, 1]) {
      const tick = document.createElement("span");
      tick.textContent = r.toFixed(1);
      tick.style.left = r === 1 ? "100%" : `${((r * M - 0.5) / M) * 100}%`;
      tick.style.transform = r === 1 ? "translateX(-100%)" : "translateX(-50%)";
      chartX.append(tick);
    }
  }

  const gutterBars = [];

  function buildGutter() {
    for (let i = 0; i < M; i++) {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("class", "gbar");
      rect.setAttribute("height", "2.2");
      gutterGroup.append(rect);
      gutterBars.push(rect);
    }
  }

  // ---------------------------------------------------------- render loop
  let last = { below: null, above: null };

  function render() {
    const below = state.balls.filter((b) => b.h < state.whiteH).length;
    const above = state.balls.length - below;

    const { post } = computePosterior(below, above);
    const lik = trueLikelihoods(below, above);
    const maxP = Math.max(...post);
    const uniform = maxP - PRIOR < 1e-9;
    const peak = uniform ? -1 : post.indexOf(maxP);

    // numbers
    counts.below.textContent = String(below);
    counts.above.textContent = String(above);
    stats.total.textContent = String(below + above);

    // white ball + height line
    const wy = yForH(state.whiteH);
    whiteBall.setAttribute("transform", `translate(366 ${wy.toFixed(2)})`);
    whiteBall.setAttribute("aria-valuenow", String(Math.round(state.whiteH * 100)));
    whiteBall.setAttribute("aria-valuetext", `height ${state.whiteH.toFixed(2)}`);
    heightLine.setAttribute("y1", wy.toFixed(2));
    heightLine.setAttribute("y2", wy.toFixed(2));

    // balls
    ballsGroup.textContent = "";
    for (const b of state.balls) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "ball");
      g.dataset.id = String(b.id);
      g.dataset.h = String(b.h);

      const hit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      hit.setAttribute("r", "14");
      hit.setAttribute("fill", "transparent");

      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("r", "9");
      dot.setAttribute("fill", "url(#ballRed)");
      dot.setAttribute("stroke", "#5e1d15");
      dot.setAttribute("stroke-width", "0.7");
      dot.setAttribute("filter", "url(#ballShadow)");

      const shine = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      shine.setAttribute("r", "2.4");
      shine.setAttribute("cx", "-2.8");
      shine.setAttribute("cy", "-3.2");
      shine.setAttribute("fill", "#ffd9cf");
      shine.setAttribute("opacity", "0.45");

      g.append(hit, dot, shine);
      g.setAttribute("transform", `translate(${xForB(b.bx).toFixed(2)} ${yForH(b.h).toFixed(2)})`);
      ballsGroup.append(g);
    }

    // gutter bars, aligned with heights — a smooth profile of 100 thin rows
    const gutterMax = 74;
    for (let i = 0; i < M; i++) {
      const w = Math.max(0.8, (post[i] / maxP) * gutterMax);
      const y = yForH(CANDIDATES[i]);
      const rect = gutterBars[i];
      rect.setAttribute("width", w.toFixed(2));
      rect.setAttribute("x", (100 - w).toFixed(2));
      rect.setAttribute("y", (y - 1.1).toFixed(2));
      rect.classList.toggle("is-peak", i === peak);
    }

    // chart scale
    const target = Math.max(maxP, PRIOR) * 1.22;
    const caps = [0.02, 0.03, 0.04, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1];
    const cap = caps.find((v) => v >= target) || 1;
    let step;
    if (cap <= 0.02) step = 0.005;
    else if (cap <= 0.05) step = 0.01;
    else if (cap <= 0.1) step = 0.02;
    else if (cap <= 0.2) step = 0.05;
    else if (cap <= 0.5) step = 0.1;
    else step = 0.2;

    const ticks = [];
    for (let v = 0; v <= cap + 1e-9; v += step) ticks.push(Number(v.toFixed(4)));

    gridlines.textContent = "";
    chartY.textContent = "";
    for (const v of ticks) {
      const pct = (v / cap) * 100;
      const line = document.createElement("i");
      line.style.bottom = `${pct}%`;
      gridlines.append(line);

      const label = document.createElement("span");
      label.style.bottom = `${pct}%`;
      label.textContent = v === 0 ? "0" : String(Number(v.toFixed(3)));
      chartY.append(label);
    }

    // prior reference line
    priorLine.style.bottom = `${(PRIOR / cap) * 100}%`;
    priorLine.style.display = maxP - PRIOR > 1e-9 ? "" : "none";

    // bars
    for (let i = 0; i < M; i++) {
      const c = columns[i];
      c.stack.style.height = `${(post[i] / cap) * 100}%`;
      c.val.textContent = fmt4(post[i]);
      // only the peak carries a printed value; the rest is read on hover
      c.val.style.visibility = i === peak ? "visible" : "hidden";
      c.col.classList.toggle("is-peak", i === peak);
      c.col.dataset.post = post[i].toFixed(6);
      c.col.dataset.lik = String(lik[i]);
    }

    // stats
    stats.peak.textContent = peak === -1 ? "—" : CANDIDATES[peak].toFixed(2);
    stats.peakPost.textContent = peak === -1 ? fmt4(PRIOR) : fmt4(post[peak]);

    // slider
    if (document.activeElement !== sliders.white) {
      sliders.white.value = String(state.whiteH);
    }
    sliders.whiteOut.textContent = state.whiteH.toFixed(2);

    showPeakDetail(peak, lik);

    if (below !== last.below || above !== last.above) {
      last = { below, above };
      if (!dragging) {
        announcer.textContent =
          `${below} balls below, ${above} above. ` +
          (peak === -1
            ? `All heights are equally likely at ${fmt4(PRIOR)}.`
            : `Most likely height ${CANDIDATES[peak].toFixed(2)} with posterior probability ${fmt4(post[peak])}.`);
      }
    }
  }

  // --------------------------------------------------------------- detail
  function showDetail(i) {
    const c = columns[i];
    const lik = Number(c.col.dataset.lik || 0);
    const post = Number(c.col.dataset.post || 0);
    chartDetail.textContent =
      `r = ${CANDIDATES[i].toFixed(2)}, likelihood ${fmtLik(lik)}, posterior ${fmt4(post)}`;
  }

  function showPeakDetail(peak) {
    const p = typeof peak === "number" ? peak : -2;
    if (p < 0) {
      chartDetail.textContent = `Uniform across all ${M} heights`;
      return;
    }
    showDetail(p);
  }

  // ------------------------------------------------------------ mutations
  function clampedBall(h, bx) {
    return {
      h: Math.min(0.965, Math.max(0.035, h)),
      bx: Math.min(0.97, Math.max(0.03, bx))
    };
  }

  function addBallAt(h, bx) {
    if (state.balls.length >= MAX_TOTAL) return;
    const c = clampedBall(h, bx);
    state.balls.push({ id: nextId++, bx: c.bx, h: c.h });
    render();
  }

  function addBallOnSide(side) {
    if (state.balls.length >= MAX_TOTAL) return;
    const rand = (a, b) => a + Math.random() * (b - a);
    let lo, hi;
    if (side === "below") {
      lo = 0.035;
      hi = state.whiteH - 0.02;
    } else {
      lo = state.whiteH + 0.02;
      hi = 0.965;
    }
    if (hi <= lo) return;
    addBallAt(rand(lo, hi), rand(0.04, 0.96));
  }

  function removeLastOnSide(side) {
    for (let i = state.balls.length - 1; i >= 0; i--) {
      const isBelow = state.balls[i].h < state.whiteH;
      if ((side === "below") === isBelow) {
        state.balls.splice(i, 1);
        render();
        return;
      }
    }
  }

  function removeBall(id) {
    const i = state.balls.findIndex((b) => b.id === id);
    if (i === -1) return;
    state.balls.splice(i, 1);
    render();
  }

  function throwRandom(n) {
    for (let i = 0; i < n && state.balls.length < MAX_TOTAL; i++) {
      const h = 0.04 + Math.random() * 0.92;
      const bx = 0.04 + Math.random() * 0.92;
      state.balls.push({ id: nextId++, bx, h });
    }
    render();
  }

  function reset() {
    state.whiteH = DEFAULT_WHITE;
    state.balls = DEFAULT_BALLS.map((b, i) => ({ id: i + 1, bx: b.bx, h: b.h }));
    nextId = state.balls.length + 1;
    render();
  }

  // ---------------------------------------------------------- pointer I/O
  function toLocal(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  let dragging = false;
  let dragMoved = false;
  let suppressClick = false;

  function setWhiteFromPoint(local) {
    const h = (FELT.y + FELT.h - local.y) / FELT.h;
    state.whiteH = Math.min(0.96, Math.max(0.04, h));
    render();
  }

  whiteBall.addEventListener("pointerdown", (evt) => {
    evt.preventDefault();
    dragging = true;
    dragMoved = false;
    lab.classList.add("dragging");
    svg.setPointerCapture(evt.pointerId);
  });

  svg.addEventListener("pointermove", (evt) => {
    if (dragging) {
      dragMoved = true;
      setWhiteFromPoint(toLocal(evt));
      return;
    }
    if (evt.target === felt) {
      const local = toLocal(evt);
      const h = (FELT.y + FELT.h - local.y) / FELT.h;
      ghostBall.setAttribute("cx", local.x.toFixed(2));
      ghostBall.setAttribute("cy", local.y.toFixed(2));
      ghostBall.setAttribute("opacity", h > 0.035 && h < 0.965 ? "0.35" : "0");
    } else {
      ghostBall.setAttribute("opacity", "0");
    }
  });

  const endDrag = (evt) => {
    if (!dragging) return;
    dragging = false;
    suppressClick = dragMoved;
    lab.classList.remove("dragging");
    if (svg.hasPointerCapture(evt.pointerId)) svg.releasePointerCapture(evt.pointerId);
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  svg.addEventListener("pointerleave", () => {
    ghostBall.setAttribute("opacity", "0");
  });

  svg.addEventListener("click", (evt) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const target = evt.target;
    const ball = target.closest && target.closest(".ball");
    if (ball) {
      removeBall(Number(ball.dataset.id));
      return;
    }
    // A click on the white ball is a (failed) drag, not a new ball.
    if (target.closest && target.closest(".white-ball")) return;

    // Work from the pointer's coordinates rather than the event target, so
    // faded overlays (the hover ghost) can never swallow the click.
    const local = toLocal(evt);
    const h = (FELT.y + FELT.h - local.y) / FELT.h;
    const bx = (local.x - FELT.x) / FELT.w;
    if (h < 0 || h > 1 || bx < 0 || bx > 1) return;
    addBallAt(h, bx);
  });

  // keyboard for the white ball
  whiteBall.addEventListener("keydown", (evt) => {
    const big = evt.shiftKey ? 0.1 : 0.02;
    if (evt.key === "ArrowUp" || evt.key === "ArrowRight") {
      state.whiteH = Math.min(0.96, state.whiteH + big);
      render();
      evt.preventDefault();
    } else if (evt.key === "ArrowDown" || evt.key === "ArrowLeft") {
      state.whiteH = Math.max(0.04, state.whiteH - big);
      render();
      evt.preventDefault();
    } else if (evt.key === "Home") {
      state.whiteH = 0.96;
      render();
      evt.preventDefault();
    } else if (evt.key === "End") {
      state.whiteH = 0.04;
      render();
      evt.preventDefault();
    }
  });

  // ------------------------------------------------------------- controls
  document.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.act;
      if (act === "below-plus") addBallOnSide("below");
      else if (act === "below-minus") removeLastOnSide("below");
      else if (act === "above-plus") addBallOnSide("above");
      else if (act === "above-minus") removeLastOnSide("above");
      else if (act === "throw") throwRandom(10);
      else if (act === "reset") reset();
    });
  });

  sliders.white.addEventListener("input", () => {
    state.whiteH = Number(sliders.white.value);
    render();
  });

  // ------------------------------------------------------------ this page
  buildGutter();
  buildChart();
  render();
})();
