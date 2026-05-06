import { Box, Button, Typography } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";

interface FeedErrorProps {
  message?: string;
  onRetry: () => void;
}

const FeedError = ({ message = "Couldn't load feed", onRetry }: FeedErrorProps) => (
  <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 6, gap: 1.5 }}>
    <Typography variant="body2" color="text.secondary">{message}</Typography>
    <Button variant="outlined" size="small" startIcon={<RefreshIcon />} onClick={onRetry}>
      Retry
    </Button>
  </Box>
);

export default FeedError;
