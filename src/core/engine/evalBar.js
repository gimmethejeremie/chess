/**
 * Interactive Evaluation Bar Component (Lichess & Chess.com style)
 * Slender advantage meter showing centipawn evaluation (+1.4, -0.8, M1)
 * with smooth vertical animations.
 */

export class EvaluationBar {
  /**
   * @param {HTMLElement} container
   * @param {Object} [options]
   * @param {'white'|'black'} [options.orientation='white']
   * @param {boolean} [options.visible=true]
   */
  constructor(container, options = {}) {
    this.container = container;
    this.orientation = options.orientation || 'white';
    this.visible = options.visible !== undefined ? options.visible : true;
    this.score = 0; // centipawns

    this.mount();
  }

  mount() {
    this.container.innerHTML = `
      <div class="eval-bar-wrapper ${this.visible ? '' : 'hidden'}" role="meter" aria-label="Game Advantage Evaluation">
        <div class="eval-bar-fill-black"></div>
        <div class="eval-bar-label" id="eval-score-label">0.0</div>
        <div class="eval-bar-fill-white" style="height: 50%;"></div>
      </div>
    `;

    this.wrapperEl = this.container.querySelector('.eval-bar-wrapper');
    this.whiteFillEl = this.container.querySelector('.eval-bar-fill-white');
    this.labelEl = this.container.querySelector('#eval-score-label');
  }

  setOrientation(orientation) {
    this.orientation = orientation;
    this.update(this.score);
  }

  setVisible(visible) {
    this.visible = visible;
    if (this.wrapperEl) {
      this.wrapperEl.classList.toggle('hidden', !visible);
    }
  }

  toggleVisible() {
    this.setVisible(!this.visible);
    return this.visible;
  }

  /**
   * Updates evaluation bar based on centipawn score
   * @param {number} score Centipawns from White's perspective
   */
  update(score) {
    this.score = score;
    if (!this.whiteFillEl || !this.labelEl) return;

    let whitePercent = 50;
    let labelText = '0.0';

    if (Math.abs(score) >= 20000) {
      // Checkmate
      const isWhiteWinning = score > 0;
      whitePercent = isWhiteWinning ? 100 : 0;
      labelText = isWhiteWinning ? '+M' : '-M';
    } else {
      // Standard Lichess logistic winning probability formula
      const winProbability = 1 / (1 + Math.pow(10, -score / 400));
      whitePercent = Math.max(5, Math.min(95, Math.round(winProbability * 100)));

      const pawnDiff = (score / 100).toFixed(1);
      labelText = score > 0 ? `+${pawnDiff}` : `${pawnDiff}`;
      if (Math.abs(score) < 10) labelText = '0.0';
    }

    // Adjust for board orientation
    const fillHeight = this.orientation === 'white' ? whitePercent : (100 - whitePercent);
    this.whiteFillEl.style.height = `${fillHeight}%`;
    this.labelEl.textContent = labelText;

    // Label styling position
    if (fillHeight > 50) {
      this.labelEl.style.color = '#1e293b';
      this.labelEl.style.bottom = '6px';
      this.labelEl.style.top = 'auto';
    } else {
      this.labelEl.style.color = '#f8fafc';
      this.labelEl.style.top = '6px';
      this.labelEl.style.bottom = 'auto';
    }
  }

  destroy() {
    this.container.innerHTML = '';
  }
}
