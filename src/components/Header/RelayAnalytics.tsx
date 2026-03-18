import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { nostrRuntime } from "../../singletons";
import { SubscriptionDebugInfo } from "../../nostrRuntime/types";

function summariseFilters(filters: SubscriptionDebugInfo["filters"]): string {
  return filters
    .map((f) => {
      const parts: string[] = [];
      if (f.kinds?.length) parts.push(`kind:${f.kinds.join(",")}`);
      if (f.authors?.length) parts.push(`authors:${f.authors.length}`);
      if (f.ids?.length) parts.push(`ids:${f.ids.length}`);
      if ((f as any)["#e"]?.length) parts.push(`#e:${(f as any)["#e"].length}`);
      if ((f as any)["#p"]?.length) parts.push(`#p:${(f as any)["#p"].length}`);
      if ((f as any)["#t"]?.length) parts.push(`#t:${(f as any)["#t"].join(",")}`);
      if (f.limit) parts.push(`limit:${f.limit}`);
      return parts.join(" ") || "{}";
    })
    .join(" | ");
}

function fmtMs(ms?: number): string {
  if (ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtAge(startedAt: number): string {
  return fmtMs(Date.now() - startedAt);
}

function buildRelayStats(subs: SubscriptionDebugInfo[]): { url: string; subCount: number; eventCount: number }[] {
  const map = new Map<string, { subCount: number; eventCount: number }>();
  for (const sub of subs) {
    for (const url of sub.relays) {
      const existing = map.get(url) ?? { subCount: 0, eventCount: 0 };
      existing.subCount++;
      existing.eventCount += sub.eventCount;
      map.set(url, existing);
    }
  }
  return Array.from(map.entries())
    .map(([url, stats]) => ({ url, ...stats }))
    .sort((a, b) => b.subCount - a.subCount);
}

export const RelayAnalytics: React.FC = () => {
  const [subs, setSubs] = useState<SubscriptionDebugInfo[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const tick = () => {
      setSubs(nostrRuntime.debug.listSubscriptions());
      setNow(Date.now());
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, []);

  const relayStats = buildRelayStats(subs);

  return (
    <Box>
      {/* Per-relay summary */}
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
        Relay activity
      </Typography>
      {relayStats.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ ml: 1, mt: 0.5 }}>
          No active subscriptions
        </Typography>
      ) : (
        <Table size="small" sx={{ mb: 3 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, fontSize: "0.7rem" }}>Relay</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, fontSize: "0.7rem", width: 60 }}>Subs</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, fontSize: "0.7rem", width: 70 }}>Events</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {relayStats.map((r) => (
              <TableRow key={r.url}>
                <TableCell sx={{ fontFamily: "monospace", fontSize: "0.75rem", wordBreak: "break-all" }}>
                  {r.url.replace(/^wss?:\/\//, "")}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: "0.75rem" }}>{r.subCount}</TableCell>
                <TableCell align="right" sx={{ fontSize: "0.75rem" }}>{r.eventCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Active subscriptions */}
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
        Active subscriptions ({subs.length})
      </Typography>
      {subs.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ ml: 1, mt: 0.5 }}>
          None
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, fontSize: "0.7rem" }}>Filter</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: "0.7rem", width: 50 }}>Relays</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: "0.7rem", width: 55 }}>Events</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: "0.7rem", width: 65 }}>1st evt</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: "0.7rem", width: 65 }}>EOSE</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: "0.7rem", width: 55 }}>Age</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {subs.map((sub) => {
              const firstLatency = sub.firstEventAt ? sub.firstEventAt - sub.startedAt : undefined;
              const eoseLatency = sub.eoseAt ? sub.eoseAt - sub.startedAt : undefined;
              const age = now - sub.startedAt;
              const isStale = !sub.eoseReceived && age > 2500;
              return (
                <Tooltip
                  key={sub.id}
                  title={
                    <Box sx={{ fontFamily: "monospace", fontSize: "0.7rem" }}>
                      <div>Relays: {sub.relays.join(", ")}</div>
                      <div>Ref count: {sub.refCount}</div>
                      {sub.isChunked && <div>Chunked subscription</div>}
                    </Box>
                  }
                  placement="left"
                >
                  <TableRow sx={{ opacity: isStale ? 0.5 : 1 }}>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: "0.7rem", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {summariseFilters(sub.filters)}
                    </TableCell>
                    <TableCell sx={{ fontSize: "0.75rem" }}>{sub.relays.length}</TableCell>
                    <TableCell sx={{ fontSize: "0.75rem" }}>{sub.eventCount}</TableCell>
                    <TableCell sx={{ fontSize: "0.75rem", color: firstLatency !== undefined && firstLatency > 1000 ? "warning.main" : "inherit" }}>
                      {fmtMs(firstLatency)}
                    </TableCell>
                    <TableCell sx={{ fontSize: "0.75rem", color: !sub.eoseReceived ? (isStale ? "error.main" : "text.secondary") : eoseLatency !== undefined && eoseLatency > 1000 ? "warning.main" : "success.main" }}>
                      {sub.eoseReceived ? fmtMs(eoseLatency) : isStale ? "timeout" : "…"}
                    </TableCell>
                    <TableCell sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                      {fmtAge(sub.startedAt)}
                    </TableCell>
                  </TableRow>
                </Tooltip>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Box>
  );
};
