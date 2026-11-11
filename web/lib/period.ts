// Results column header: "Sep ’26". Anything unrecognised is shown as printed.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Filings print it many ways ("September 30, 2026", "30th Sep'26", "3 Months ended 30.09.2026", ...).
export function period(p: string) {
  const num = p.match(/\b\d{1,2}[./-](\d{1,2})[./-](?:\d{2})?(\d{2})\b/);
  if (num && MONTHS[+num[1] - 1]) return `${MONTHS[+num[1] - 1]} ’${num[2]}`;
  const m = MONTHS.find((x) => new RegExp(`\\b${x}`, "i").test(p));
  const y = p.match(/(?:\d{2}|['\s-])(\d{2})\b(?!.*\d)/); // the last 2-digit year in the string
  return m && y ? `${m} ’${y[1]}` : p;
}
