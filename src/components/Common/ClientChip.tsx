import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

function deriveHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

interface ClientChipProps {
  tags: string[][];
}

export const ClientChip: React.FC<ClientChipProps> = ({ tags }) => {
  const name = tags.find((t) => t[0] === "client")?.[1];
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";

  if (!name) return null;

  const hue = deriveHue(name);
  const dot = `hsl(${hue}, 65%, ${dark ? 60 : 50}%)`;
  const text = `hsl(${hue}, 25%, ${dark ? 70 : 42}%)`;
  const bg = `hsl(${hue}, 40%, ${dark ? 18 : 96}%)`;

  return (
    <Box sx={{ mt: 1 }}>
      <Box
        component="span"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.6,
          px: 0.9,
          py: 0.3,
          borderRadius: "6px",
          bgcolor: bg,
        }}
      >
        <Box
          component="span"
          sx={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            bgcolor: dot,
            flexShrink: 0,
          }}
        />
        <Typography
          component="span"
          sx={{
            fontSize: "0.68rem",
            fontWeight: 500,
            letterSpacing: "0.02em",
            color: text,
            lineHeight: 1,
          }}
        >
          {name}
        </Typography>
      </Box>
    </Box>
  );
};
