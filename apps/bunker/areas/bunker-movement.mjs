// All dimensions are meters. Static ground-level collision for a walking-only area.
export const bounds = { minX: -6.45, maxX: 6.45, minZ: -24.55, maxZ: 2.55 };
export const obstacles = [
  [-6.7, -1.75, -3.1, 2.7], [1.75, 6.7, -3.1, 2.7], // airlock shoulders
  [-1.85, -1.65, -6.8, -3.1], [-1.85, -1.65, -16.5, -8.6], // operations wall, door at -7.7
  [1.65, 1.85, -9, -3.1], [1.65, 1.85, -16.5, -10.8], // crew wall, door at -9.9
  [-6.6, -1.8, -3.3, -3.1], [1.8, 6.6, -3.3, -3.1],
  [-6.6, -1.8, -16.5, -16.3], [1.8, 6.6, -16.5, -16.3],
  [-6.3, -5.05, -11.8, -4.2], // operations consoles
  [-4.8, -4.1, -5.45, -4.75], [-4.8, -4.1, -7.85, -7.15],
  [-4.8, -4.1, -10.25, -9.55], // operators' chairs
  [-4.55, -2.65, -13.8, -11.7], // briefing table
  [-6.3, -5.25, -15.9, -13], // electronics racks
  [4.25, 6.3, -7.7, -4.1], [4.25, 6.3, -12, -8.4], // berth stacks
  [2.1, 3.05, -6.9, -3.8], [2.1, 3.05, -15.9, -12.1], // crew lockers
  [4.3, 6.3, -15.8, -13.1], // medical cot
  [-6.3, -5.15, -24, -18], // galley bench
  [-4.2, -2.2, -23.1, -20.1], // mess table
  [-4.6, -4.25, -23, -20.2], [-2.15, -1.8, -23, -20.2], // mess benches
  [2.5, 6.3, -24, -22], [5.1, 6.3, -21.7, -18], // power machinery
];

export function moveInBunker(position, dx, dz) {
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return position;
  const radius = .24;
  const free = (x, z) => x >= bounds.minX + radius && x <= bounds.maxX - radius &&
    z >= bounds.minZ + radius && z <= bounds.maxZ - radius &&
    !obstacles.some(([minX, maxX, minZ, maxZ]) =>
      x > minX - radius && x < maxX + radius && z > minZ - radius && z < maxZ + radius);
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .1));
  for (let i = 0; i < steps; i++) {
    if (free(position.x + dx / steps, position.z)) position.x += dx / steps;
    if (free(position.x, position.z + dz / steps)) position.z += dz / steps;
  }
  return position;
}
