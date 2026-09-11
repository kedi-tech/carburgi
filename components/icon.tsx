/**
 * Material Symbols Outlined, the icon set the design system draws with. The
 * name is the ligature — `local_gas_station`, `verified`, `warning` — exactly
 * as it appears in the design files.
 */
export default function Icon({
  name,
  size = 20,
  className = "",
  filled = false,
}: {
  name: string;
  size?: number;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`ms shrink-0 ${className}`}
      style={{
        fontSize: `${size}px`,
        width: `${size}px`,
        height: `${size}px`,
        fontVariationSettings: `"FILL" ${filled ? 1 : 0}, "wght" 400, "GRAD" 0, "opsz" ${size}`,
      }}
    >
      {name}
    </span>
  );
}
