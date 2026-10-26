// Easing functions: t in [0, 1] -> eased progress (back/elastic may overshoot).
const c1 = 1.70158, c3 = c1 + 1;
export const EASINGS = {
  linear: t => t,
  easeInQuad: t => t * t,
  easeOutQuad: t => 1 - (1 - t) * (1 - t),
  easeInOutCubic: t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
  easeInOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  easeOutBack: t => 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2,
  easeOutElastic: t => t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI / 3)) + 1,
  easeOutBounce: t => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375;
    return n * (t -= 2.625 / d) * t + .984375;
  },
};

// Frame-rate independent exponential approach toward a target.
export const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

// Shortest signed angle from a to b.
export const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// Critically damped spring (no overshoot); state = { value, velocity }.
export function spring(state, target, frequency, dt) {
  const w = 2 * Math.PI * frequency, x = state.value - target;
  const exp = Math.exp(-w * dt), v = state.velocity;
  state.value = target + (x + (v + w * x) * dt) * exp;
  state.velocity = (v - w * (v + w * x) * dt) * exp;
  return state.value;
}
