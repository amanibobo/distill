export const CHANGE_TYPES = {
  flood: { label: "Flood", color: "#2a78d6" },
  fire_scar: { label: "Fire scar", color: "#eb6834" },
  harvest: { label: "Harvest", color: "#1baf7a" },
  crop_growth: { label: "Crop growth", color: "#1baf7a", hatched: true },
  deforestation: { label: "Deforestation", color: "#6250d6" },
  glacier_movement: { label: "Glacier movement", color: "#3fa7c9" },
  ground_deformation: { label: "Ground deformation", color: "#e87ba4" },
  other: { label: "Other change", color: "#a3a3a3" },
} as const;

export type ChangeType = keyof typeof CHANGE_TYPES;

export const isHatched = (t: ChangeType) => "hatched" in CHANGE_TYPES[t];

// Crop growth shares harvest's green as one agriculture family; the hatch tells them apart.
export function swatch(t: ChangeType): string {
  const c = CHANGE_TYPES[t].color;
  return isHatched(t) ? `repeating-linear-gradient(135deg, ${c} 0 1.5px, transparent 1.5px 3.5px)` : c;
}

export const isChangeType = (value: string): value is ChangeType => value in CHANGE_TYPES;
