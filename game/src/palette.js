// EMBERLINE look plan, in one place. A dusk-lit decommissioned solar yard: cold blue-grey
// concrete and asphalt, rust-orange containers, dark solar panels, one amber accent for
// the player's side and one teal accent for the second site. The same names are the CSS
// custom properties in index.html, so the page and the scene share one palette.
export const PALETTE = {
  sky: '#1a2028',
  ground: '#23262b',
  concrete: '#3a3f46',
  concreteDark: '#2c3138',
  rust: '#a35a2c',
  container: '#b96a2e',
  containerB: '#7d6a4a',
  panel: '#1d2f4a',
  panelEdge: '#33507a',
  ink: '#ece7db',
  muted: '#8b939c',
  accent: '#ffb02e',
  ally: '#3fb8a6',
  enemy: '#e5484d',
  siteA: '#ffb02e',
  siteB: '#3fb8a6',
  wood: '#6b543a',
};

export function hex(name) {
  return PALETTE[name];
}
