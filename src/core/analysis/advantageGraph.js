/**
 * Advantage Graph Component
 * Interactive SVG area chart displaying centipawn evaluation curve across game moves,
 * with zero-center baseline, current move indicator, and direct-click navigation.
 */

export class AdvantageGraph {
  /**
   * @param {HTMLElement} container Mount container
   * @param {object} options
   * @param {number[]} options.evalHistory Array of centipawn scores from move 0 to N
   * @param {number} [options.currentIndex=0] Current selected move index
   * @param {Function} [options.onSelectMove] Callback when a point is clicked
   */
  constructor(container, options = {}) {
    this.container = container;
    this.evalHistory = options.evalHistory || [0];
    this.currentIndex = options.currentIndex || 0;
    this.onSelectMove = options.onSelectMove || (() => {});
    this.svgElement = null;

    this.render();
  }

  update(evalHistory, currentIndex = null) {
    if (evalHistory) {
      this.evalHistory = evalHistory;
    }
    if (currentIndex !== null && currentIndex !== undefined) {
      this.currentIndex = currentIndex;
    }
    this.render();
  }

  setCurrentIndex(index) {
    this.currentIndex = index;
    const indicator = this.container.querySelector('.graph-needle');
    if (indicator) {
      const totalPoints = Math.max(1, this.evalHistory.length - 1);
      const width = this.container.clientWidth || 300;
      const x = (this.currentIndex / totalPoints) * width;
      indicator.setAttribute('x1', x);
      indicator.setAttribute('x2', x);
    }
  }

  render() {
    if (!this.container) return;

    const width = Math.max(280, this.container.clientWidth || 320);
    const height = 74;
    const midY = height / 2;
    const maxCp = 800; // clamp range: -800 to +800

    const totalPoints = Math.max(1, this.evalHistory.length - 1);

    // Compute coordinate points
    const points = this.evalHistory.map((score, idx) => {
      const x = (idx / totalPoints) * width;
      // Clamp score
      const clamped = Math.max(-maxCp, Math.min(maxCp, score));
      // In SVG: Y=0 is top (White), Y=height is bottom (Black)
      const y = midY - (clamped / maxCp) * (midY - 4);
      return { x, y, score, idx };
    });

    const pathD = points.reduce((acc, pt, i) => {
      return `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }, '');

    // Area polygon for White (above midY) and Black (below midY)
    const currentX = (this.currentIndex / totalPoints) * width;

    this.container.innerHTML = `
      <div class="advantage-graph-wrapper" style="position: relative; width: 100%; height: ${height}px; user-select: none;">
        <svg
          class="advantage-graph-svg"
          viewBox="0 0 ${width} ${height}"
          preserveAspectRatio="none"
          style="width: 100%; height: 100%; display: block; border-radius: 6px; overflow: hidden; background: var(--bg-surface-sunken, rgba(0,0,0,0.06)); cursor: pointer;"
        >
          <defs>
            <linearGradient id="whiteAdvGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#ffffff" stop-opacity="0.45" />
              <stop offset="100%" stop-color="#ffffff" stop-opacity="0.05" />
            </linearGradient>
            <linearGradient id="blackAdvGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.1" />
              <stop offset="100%" stop-color="#1e293b" stop-opacity="0.45" />
            </linearGradient>
          </defs>

          <!-- Middle Neutral Baseline -->
          <line
            x1="0"
            y1="${midY}"
            x2="${width}"
            y2="${midY}"
            stroke="var(--border-color, #94a3b8)"
            stroke-width="1"
            stroke-dasharray="3,3"
            opacity="0.5"
          />

          <!-- Advantage Curve -->
          <path
            d="${pathD}"
            fill="none"
            stroke="var(--accent-color, #3b82f6)"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />

          <!-- Current Move Needle -->
          <line
            class="graph-needle"
            x1="${currentX}"
            y1="0"
            x2="${currentX}"
            y2="${height}"
            stroke="var(--text-primary, #0f172a)"
            stroke-width="2"
            stroke-dasharray="2,2"
            opacity="0.8"
          />
        </svg>

        <!-- Labels -->
        <span style="position: absolute; top: 2px; left: 6px; font-size: 0.65rem; font-weight: 600; opacity: 0.55;">+White</span>
        <span style="position: absolute; bottom: 2px; left: 6px; font-size: 0.65rem; font-weight: 600; opacity: 0.55;">-Black</span>
      </div>
    `;

    const svg = this.container.querySelector('svg');
    if (svg) {
      svg.addEventListener('click', (e) => {
        const rect = svg.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, clickX / rect.width));
        const moveIdx = Math.round(ratio * totalPoints);
        this.currentIndex = moveIdx;
        this.setCurrentIndex(moveIdx);
        this.onSelectMove(moveIdx);
      });
    }
  }
}
