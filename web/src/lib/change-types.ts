export const CHANGE_TYPES = {
  flood: { label: "Flood", color: "#3987e5" },
  fire_scar: { label: "Fire scar", color: "#d95926" },
  harvest: { label: "Harvest", color: "#199e70" },
  deforestation: { label: "Deforestation", color: "#9085e9" },
  glacier_movement: { label: "Glacier movement", color: "#8fd3e8" },
  ground_deformation: { label: "Ground deformation", color: "#d55181" },
  other: { label: "Other change", color: "#8b8b86" },
} as const;

export type ChangeType = keyof typeof CHANGE_TYPES;

export const isChangeType = (value: string): value is ChangeType => value in CHANGE_TYPES;
