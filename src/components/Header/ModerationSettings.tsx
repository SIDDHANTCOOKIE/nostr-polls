import { Box, Slider, Typography } from "@mui/material";
import { useReports } from "../../hooks/useReports";

export function ModerationSettings() {
  const { wotReportThreshold, setWotReportThreshold } = useReports();

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom>
        Content Filtering
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Automatically hide posts and profiles that have been reported by people
        in your Web of Trust. Set to 0 to disable.
      </Typography>

      <Box sx={{ px: 1, mt: 3 }}>
        <Typography gutterBottom>
          Hide after{" "}
          <strong>
            {wotReportThreshold === 0
              ? "disabled (show everything)"
              : `${wotReportThreshold} report${wotReportThreshold === 1 ? "" : "s"}`}
          </strong>{" "}
          from your WoT
        </Typography>
        <Slider
          value={wotReportThreshold}
          onChange={(_, val) => setWotReportThreshold(val as number)}
          min={0}
          max={10}
          step={1}
          marks
          valueLabelDisplay="auto"
          sx={{ maxWidth: 400 }}
        />
        <Typography variant="caption" color="text.secondary">
          Content reported by {wotReportThreshold || "any number of"} or more
          people you follow (or their follows) will be hidden. You can always
          choose to reveal hidden items individually.
        </Typography>
      </Box>
    </Box>
  );
}
