"use client";

import { useEffect, useState } from "react";

import Icon from "@/components/icon";

/**
 * Conakry time, in the header. Guinea is on GMT year-round with no daylight
 * saving, so the console states the timezone it is reasoning in rather than
 * the viewer's — an administrator reading "il y a 45 min" needs to know which
 * clock that is measured against.
 *
 * Rendered empty on the server: the first paint must not disagree with the
 * client's, and there is no useful time to show before hydration.
 */
export default function Clock() {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => {
      setTime(
        new Intl.DateTimeFormat("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Africa/Conakry",
        }).format(new Date()),
      );
    };
    tick();
    const timer = window.setInterval(tick, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="hidden items-center gap-1.5 rounded bg-white/10 px-2.5 py-1 text-data text-white md:flex">
      <Icon name="schedule" size={16} className="text-secondary-container" />
      <span className="tnum">Conakry GMT {time ?? "--:--"}</span>
    </div>
  );
}
