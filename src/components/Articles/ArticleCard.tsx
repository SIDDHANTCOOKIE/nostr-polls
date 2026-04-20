import React from "react";
import {
  Avatar,
  Box,
  Card,
  CardActionArea,
  Chip,
  Typography,
} from "@mui/material";
import BookIcon from "@mui/icons-material/MenuBook";
import { Event, nip19 } from "nostr-tools";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../../hooks/useAppContext";
import { openProfileTab } from "../../nostr";
import { DEFAULT_IMAGE_URL } from "../../utils/constants";
import { calculateTimeAgo } from "../../utils/common";

interface ArticleCardProps {
  event: Event;
}

function getArticleMeta(event: Event) {
  const title = event.tags.find((t) => t[0] === "title")?.[1] || "Untitled Article";
  const image = event.tags.find((t) => t[0] === "image")?.[1];
  const summary = event.tags.find((t) => t[0] === "summary")?.[1];
  const identifier = event.tags.find((t) => t[0] === "d")?.[1] || "";
  const publishedAt = event.tags.find((t) => t[0] === "published_at")?.[1];
  return { title, image, summary, identifier, publishedAt };
}

export const ArticleCard: React.FC<ArticleCardProps> = ({ event }) => {
  const { profiles } = useAppContext();
  const navigate = useNavigate();

  const { title, image, summary, identifier, publishedAt } = getArticleMeta(event);
  const authorProfile = profiles?.get(event.pubkey);
  const authorName =
    authorProfile?.display_name ||
    authorProfile?.name ||
    (() => {
      const npub = nip19.npubEncode(event.pubkey);
      return npub.slice(0, 8) + "…";
    })();

  const displayTime = publishedAt
    ? calculateTimeAgo(parseInt(publishedAt, 10))
    : calculateTimeAgo(event.created_at);

  const naddr = nip19.naddrEncode({ kind: 30023, pubkey: event.pubkey, identifier });

  return (
    <Card variant="outlined" sx={{ m: 1 }}>
      <CardActionArea onClick={() => navigate(`/feeds/articles/${naddr}`)}>
        {image && (
          <Box
            component="img"
            src={image}
            alt={title}
            sx={{ width: "100%", height: 160, objectFit: "cover", display: "block" }}
          />
        )}

        <Box sx={{ p: 2, pb: 1.5 }}>
          <Chip
            icon={<BookIcon sx={{ fontSize: "14px !important" }} />}
            label="Article"
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: "0.68rem", "& .MuiChip-label": { px: 0.75 }, mb: 1 }}
          />

          <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.3, mb: 0.5 }}>
            {title}
          </Typography>

          {summary && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mb: 1.5,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                lineHeight: 1.5,
              }}
            >
              {summary}
            </Typography>
          )}

          {/* Author row */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 0.75, cursor: "pointer", "&:hover .author-name": { textDecoration: "underline" } }}
              onClick={(e) => { e.stopPropagation(); openProfileTab(nip19.npubEncode(event.pubkey), navigate); }}
            >
              <Avatar src={authorProfile?.picture || DEFAULT_IMAGE_URL} sx={{ width: 20, height: 20 }} />
              <Typography className="author-name" variant="caption" color="text.secondary" fontWeight={500}>
                {authorName}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
              {displayTime}
            </Typography>
          </Box>
        </Box>
      </CardActionArea>
    </Card>
  );
};
