// One Euro filter (Casiez et al. 2012): little jitter at rest, little lag in
// motion. The cutoff opens up with the (filtered) speed.
const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuro {
  value: number | null = null;
  speed = 0; // units per second, filtered

  constructor(private settings: () => { minCutoff: number; beta: number; dCutoff: number }) {}

  filter(x: number, dt: number) {
    if (this.value === null || dt <= 0) {
      this.value = x;
      this.speed = 0;
      return x;
    }
    const { minCutoff, beta, dCutoff } = this.settings();
    const dx = (x - this.value) / dt;
    this.speed += (dx - this.speed) * alpha(dCutoff, dt);
    const cutoff = minCutoff + beta * Math.abs(this.speed);
    this.value += (x - this.value) * alpha(cutoff, dt);
    return this.value;
  }

  reset() {
    this.value = null;
    this.speed = 0;
  }
}
