// A signed percentage is a change only when the sign starts the token: "+4.1%", "(−3.6% vs Nifty)".
// In a range ("10-12%", "8−10%") the dash follows a digit and is not a minus (13 Nov: "10–12%" coloured 12 red).
export const SIGNED_NUM = /((?<![\w.%)\]])[+−-]\d+(?:\.\d+)?%)/;
