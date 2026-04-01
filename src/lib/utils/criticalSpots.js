function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function getCriticalPositionsRequired(role) {
  const positionsTotal = Math.max(Number(role?.positions_total) || 0, 0);
  const explicitValue = role?.critical_positions_required;

  if (explicitValue !== undefined && explicitValue !== null && explicitValue !== '') {
    return clamp(Number(explicitValue) || 0, 0, positionsTotal);
  }

  return role?.critical ? positionsTotal : 0;
}

export function normalizeCriticalPositionsInput(value, positionsTotal) {
  const safeTotal = Math.max(Number(positionsTotal) || 0, 0);
  return clamp(Number(value) || 0, 0, safeTotal);
}

export function hasCriticalRequirement(role) {
  return getCriticalPositionsRequired(role) > 0;
}

export function getCriticalPositionsFilled(role) {
  const positionsFilled = Math.max(Number(role?.positions_filled) || 0, 0);
  return Math.min(positionsFilled, getCriticalPositionsRequired(role));
}

export function getCriticalOpenSpots(role) {
  return Math.max(getCriticalPositionsRequired(role) - (Number(role?.positions_filled) || 0), 0);
}

export function getNiceToHaveOpenSpots(role) {
  const positionsTotal = Math.max(Number(role?.positions_total) || 0, 0);
  const positionsFilled = Math.max(Number(role?.positions_filled) || 0, 0);
  const criticalPositionsRequired = getCriticalPositionsRequired(role);

  return Math.max(positionsTotal - Math.max(positionsFilled, criticalPositionsRequired), 0);
}
