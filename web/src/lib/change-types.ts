export const CHANGE_TYPES = {
  flood: { label: "Flood", color: "#2a78d6" },
  fire_scar: { label: "Fire scar", color: "#eb6834" },
  harvest: { label: "Harvest", color: "#1baf7a" },
  deforestation: { label: "Deforestation", color: "#6250d6" },
  glacier_movement: { label: "Glacier movement", color: "#3fa7c9" },
  ground_deformation: { label: "Ground deformation", color: "#e87ba4" },
  other: { label: "Other change", color: "#a3a3a3" },
} as const;

export type ChangeType = keyof typeof CHANGE_TYPES;

export const isChangeType = (value: string): value is ChangeType => value in CHANGE_TYPES;
