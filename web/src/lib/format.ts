const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const full = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const shortDate = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));
export const longDate = (iso: string) => full.format(new Date(`${iso}T00:00:00Z`));

export function area(km2: number) {
  if (km2 >= 100) return `${Math.round(km2).toLocaleString("en-US")} km²`;
  if (km2 >= 10) return `${km2.toFixed(0)} km²`;
  return `${km2.toFixed(1)} km²`;
}

export const percent = (x: number) => `${Math.round(x * 100)}%`;
