// BR-10: all money is integer paise. Format only here.
export const rupees = (paise: number) =>
  "₹" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const toPaise = (rupeeStr: string) => {
  if (!/^-?\d+(\.\d{1,2})?$/.test(rupeeStr.trim())) throw new Error("Invalid amount");
  const [i, f = ""] = rupeeStr.trim().replace("-", "").split(".");
  const v = Number(i) * 100 + Number(f.padEnd(2, "0"));
  return rupeeStr.trim().startsWith("-") ? -v : v;
};
