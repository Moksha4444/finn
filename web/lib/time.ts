// Timestamps for people: "11 Nov, 5:29 pm". The data keeps ISO / exchange format; only the display changes.
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "17:29" -> "5:29 pm"
export const clock = (hhmm: string) => {
  const h = +hhmm.slice(0, 2);
  return `${h % 12 || 12}:${hhmm.slice(3, 5)} ${h < 12 ? "am" : "pm"}`;
};

// An IST wall-clock string as filed ("2026-11-11 17:29", or ISO with a T) -> "11 Nov, 5:29 pm"
export const stamp = (s: string) => `${+s.slice(8, 10)} ${MON[+s.slice(5, 7) - 1]}, ${clock(s.slice(11, 16))}`;

// Any ISO instant -> the same, in IST
export const istStamp = (iso: string) => stamp(new Date(Date.parse(iso) + 330 * 60e3).toISOString());
