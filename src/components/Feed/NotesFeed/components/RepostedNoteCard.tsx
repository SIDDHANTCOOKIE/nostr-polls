import { Avatar, Tooltip, Typography } from "@mui/material";
import { nip19 } from "nostr-tools";
import { DEFAULT_IMAGE_URL } from "../../../../utils/constants";
import { useAppContext } from "../../../../hooks/useAppContext";
import { Event } from "nostr-tools";
import { Notes } from "../../../../components/Notes";
import ReplayIcon from '@mui/icons-material/Replay';
import { useNavigate } from "react-router-dom";
import { openProfileTab } from "../../../../nostr";

interface RepostsCardProps {
  note: Event;
  reposts: Event[];
}

const RepostsCard: React.FC<RepostsCardProps> = ({ note, reposts }) => {
  const { profiles, fetchUserProfileThrottled } = useAppContext();
  const navigate = useNavigate();

  // Filter reposts that belong to this note by checking tags for 'e' with note.id
  const matchingReposts = reposts.filter((r) => {
    const taggedNoteId = r.tags.find((tag) => tag[0] === "e")?.[1];
    return taggedNoteId === note.id;
  });

  // Pre-fetch profiles
  matchingReposts.forEach((r) => {
    if (!profiles?.get(r.pubkey)) {
      fetchUserProfileThrottled(r.pubkey);
    }
  });

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      {matchingReposts.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
            color: "#4caf50", // green for reposts
          }}
        >
          <ReplayIcon />
          <Typography> Reposted by</Typography>
          {matchingReposts.slice(0, 3).map((r) => {
            const profile = profiles?.get(r.pubkey);
            const displayName =
              profile?.name || nip19.npubEncode(r.pubkey).substring(0, 8) + "...";

            return (
              <Tooltip title={`Reposted by ${displayName}`} key={r.id}>
                <div
                  onClick={() => openProfileTab(nip19.npubEncode(r.pubkey), navigate)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openProfileTab(nip19.npubEncode(r.pubkey), navigate);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                  }}
                >
                  <Avatar
                    src={profile?.picture || DEFAULT_IMAGE_URL}
                    alt={displayName}
                    sx={{ width: 24, height: 24 }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      color: "inherit",
                      "&:hover, &:focus-visible": { textDecoration: "underline" },
                    }}
                  >
                    {displayName}
                  </Typography>
                </div>
              </Tooltip>
            );
          })}
          {matchingReposts.length > 3 && (
            <Typography variant="caption">
              +{matchingReposts.length - 3} more
            </Typography>
          )}
        </div>
      )}
      <Notes event={note} />
    </div>
  );
};

export default RepostsCard;
