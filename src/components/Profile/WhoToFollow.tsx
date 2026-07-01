import React, { useEffect, useState } from "react";
import { Avatar, Box, Button, CircularProgress, Typography } from "@mui/material";
import { nip19 } from "nostr-tools";
import { useNavigate } from "react-router-dom";
import { useUserContext } from "../../hooks/useUserContext";
import { useListContext } from "../../hooks/useListContext";
import { useAppContext } from "../../hooks/useAppContext";
import { openProfileTab } from "../../nostr";
import { DEFAULT_IMAGE_URL } from "../../utils/constants";

const MAX_SUGGESTIONS = 12;

/**
 * "People you may know" — a horizontal rail of follow suggestions sourced from
 * the web-of-trust worker (2nd-degree pubkeys ranked by how many of the user's
 * follows follow them). Renders nothing until recommendations exist, so it's
 * safe to drop atop any discovery surface.
 */
export const WhoToFollow: React.FC = () => {
  const { user } = useUserContext();
  const { getFollowRecommendations, followPubkey } = useListContext();
  const { profiles, fetchUserProfileThrottled } = useAppContext();
  const navigate = useNavigate();
  const [followingPks, setFollowingPks] = useState<Set<string>>(new Set());

  const recommendations = getFollowRecommendations(MAX_SUGGESTIONS);

  // Warm the profile cache for the suggested pubkeys so names/avatars render.
  useEffect(() => {
    recommendations.forEach((r) => {
      if (!profiles?.get(r.pubkey)) fetchUserProfileThrottled(r.pubkey);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendations.length]);

  // Delegate to the shared follow flow, which publishes the updated kind-3 AND
  // commits it to the durable contacts cache + in-memory follows (dropping the
  // person from the list on the next render via getFollowRecommendations). These
  // suggestions only exist when the user already has a contact list, so allow the
  // empty case rather than surfacing the no-list warning here.
  const handleFollow = async (pk: string) => {
    if (!user || followingPks.has(pk)) return;
    setFollowingPks((prev) => new Set(prev).add(pk));
    try {
      await followPubkey(pk, { allowEmptyContactList: true });
    } finally {
      setFollowingPks((prev) => {
        const s = new Set(prev);
        s.delete(pk);
        return s;
      });
    }
  };

  if (!user || recommendations.length === 0) return null;

  return (
    <Box sx={{ maxWidth: 900, mx: "auto", px: 2, pt: 2, pb: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        People you may know
      </Typography>
      <Box sx={{ display: "flex", gap: 1.5, overflowX: "auto", pb: 1 }}>
        {recommendations.map((r) => {
          const profile = profiles?.get(r.pubkey);
          const npub = nip19.npubEncode(r.pubkey);
          const name =
            profile?.display_name || profile?.name || `${npub.slice(0, 8)}…`;
          const isLoading = followingPks.has(r.pubkey);
          return (
            <Box
              key={r.pubkey}
              sx={{
                flex: "0 0 auto",
                width: 150,
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
                p: 1.5,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
              }}
            >
              <Avatar
                src={profile?.picture || DEFAULT_IMAGE_URL}
                sx={{ width: 56, height: 56, cursor: "pointer", mb: 1 }}
                onClick={() => openProfileTab(npub, navigate)}
              />
              <Typography
                variant="body2"
                fontWeight={600}
                noWrap
                sx={{ width: "100%", cursor: "pointer" }}
                onClick={() => openProfileTab(npub, navigate)}
              >
                {name}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                Followed by {r.score} you follow
              </Typography>
              <Button
                size="small"
                variant="outlined"
                fullWidth
                disabled={isLoading}
                onClick={() => handleFollow(r.pubkey)}
              >
                {isLoading ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  "Follow"
                )}
              </Button>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default WhoToFollow;
