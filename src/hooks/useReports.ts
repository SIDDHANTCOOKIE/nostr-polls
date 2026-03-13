import { useContext } from "react";
import { ReportsContext } from "../contexts/reports-context";

export function useReports() {
  const ctx = useContext(ReportsContext);
  if (!ctx) throw new Error("useReports must be used within ReportsProvider");
  return ctx;
}
