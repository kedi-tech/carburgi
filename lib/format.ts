const MONTHS_FR = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

/** "il y a 12 min", "il y a 3 h", "il y a 4 j" — or "jamais". */
export function elapsedLabel(iso: string | null): string {
  if (!iso) {
    return "jamais";
  }
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return "—";
  }
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) {
    return "à l’instant";
  }
  if (minutes < 60) {
    return `il y a ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `il y a ${hours} h`;
  }
  return `il y a ${Math.floor(hours / 24)} j`;
}

export function dateLabel(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${date.getDate()} ${MONTHS_FR[date.getMonth()]} · ${hours}:${minutes}`;
}

/** French thousands grouping: 20000 -> "20 000". */
export function grouped(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function percent(ratio: number | null): string {
  if (ratio === null) {
    return "—";
  }
  return `${Math.round(ratio * 100)} %`;
}

/**
 * "Almamy · Kaloum · Conakry", with repeats dropped.
 *
 * Outside Conakry a station's `city` and its zone label are frequently the same
 * word, and "Boké · Boké" reads like a bug. Empty parts disappear too, so a
 * station with no quartier does not render a dangling separator.
 */
export function placeLabel(parts: (string | null | undefined)[]): string {
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const part of parts) {
    const value = part?.trim();
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    kept.push(value);
  }

  return kept.length > 0 ? kept.join(" · ") : "—";
}

/**
 * What an administrator types as a Guinean number, as the API stores it:
 * E.164, `+224` and nine digits. Accepts the local form ("622 33 44 55"),
 * the prefixed forms ("224…", "00224…", "+224…") and any spacing; anything
 * else is null rather than a guess.
 */
export function normalizeGuineaPhone(input: string): string | null {
  let digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.startsWith("224")) {
    digits = digits.slice(3);
  }
  return /^\d{9}$/.test(digits) ? `+224${digits}` : null;
}

/** "+224622334455" -> "+224 622 33 44 55". */
export function phoneLabel(phoneNumber: string | null): string {
  if (!phoneNumber) {
    return "—";
  }
  const local = phoneNumber.replace("+224", "");
  if (local.length !== 9) {
    return phoneNumber;
  }
  return `+224 ${local.slice(0, 3)} ${local.slice(3, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
}
