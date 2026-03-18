import React, { useEffect } from "react";
import {
  Avatar,
  Box,
  Chip,
  Divider,
  IconButton,
  Popover,
  Tooltip,
  Typography,
} from "@mui/material";
import FilterListIcon from "@mui/icons-material/FilterList";
import GroupIcon from "@mui/icons-material/Group";
import { Event } from "nostr-tools";
import { useListContext } from "../../hooks/useListContext";
import { useUserContext } from "../../hooks/useUserContext";
import { useAppContext } from "../../hooks/useAppContext";
import { DEFAULT_IMAGE_URL } from "../../utils/constants";

interface FilterProps {
  onChange: (pubkeys: string[]) => void;
}

function getPackMeta(event: Event) {
  const title =
    event.tags.find((t) => t[0] === "title")?.[1] ||
    event.tags.find((t) => t[0] === "d")?.[1] ||
    "Unnamed Pack";
  const image = event.tags.find((t) => t[0] === "image")?.[1];
  const members = event.tags.filter((t) => t[0] === "p").length;
  return { title, image, members };
}

export const Filters: React.FC<FilterProps> = ({ onChange }) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const { lists, handleListSelected, selectedList, bookmarkedPackKeys, fetchAndHydratePacks } = useListContext();
  const { user } = useUserContext();
  const { profiles, fetchUserProfileThrottled } = useAppContext();

  const open = Boolean(anchorEl);

  // On open, re-trigger hydration for any bookmarked packs not yet in lists
  useEffect(() => {
    if (!open) return;
    const missing = Array.from(bookmarkedPackKeys).filter((key) => !lists?.has(key));
    if (missing.length > 0) fetchAndHydratePacks(missing);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleAllPosts = () => {
    handleListSelected(null);
    onChange([]);
    setAnchorEl(null);
  };

  const handleFollowing = () => {
    const key = `3:${user?.pubkey}`;
    handleListSelected(key);
    const event = lists?.get(key);
    const pubkeys = event?.tags.filter((t) => t[0] === "p").map((t) => t[1]) || [];
    onChange(pubkeys);
    setAnchorEl(null);
  };

  const handlePackSelect = (key: string) => {
    handleListSelected(key);
    const event = lists?.get(key);
    const pubkeys = event?.tags.filter((t) => t[0] === "p").map((t) => t[1]) || [];
    onChange(pubkeys);
    setAnchorEl(null);
  };

  const allPacks = Array.from(lists?.entries() || []).filter(([, e]) => e.kind === 39089);

  const getAdref = (key: string) => key; // key is already "39089:pubkey:d"
  const bookmarkedPacks = allPacks.filter(([key]) => bookmarkedPackKeys.has(getAdref(key)));
  const bookmarkedKeys = new Set(bookmarkedPacks.map(([k]) => k));
  const myPacks = allPacks.filter(([key, e]) => e.pubkey === user?.pubkey && !bookmarkedKeys.has(key));
  const mentionedPacks = allPacks.filter(([key, e]) => e.pubkey !== user?.pubkey && !bookmarkedKeys.has(key));

  useEffect(() => {
    mentionedPacks.forEach(([, e]) => {
      if (!profiles?.get(e.pubkey)) fetchUserProfileThrottled(e.pubkey);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPacks.length]);

  const isFiltered = Boolean(selectedList);
  const userProfile = user ? profiles?.get(user.pubkey) : null;

  return (
    <>
      <Tooltip title={isFiltered ? "Filter active" : "Filter votes"}>
        <IconButton
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            color: isFiltered ? "primary.main" : "text.secondary",
            position: "relative",
          }}
        >
          <FilterListIcon fontSize="small" />
          {isFiltered && (
            <Box
              sx={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 6,
                height: 6,
                borderRadius: "50%",
                bgcolor: "primary.main",
              }}
            />
          )}
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: { width: 240, py: 0.5, borderRadius: 2 },
          },
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ px: 2, pt: 1, pb: 0.5, display: "block", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          Filter votes by
        </Typography>

        {/* All votes */}
        <FilterRow
          selected={!selectedList}
          onClick={handleAllPosts}
          avatar={<Avatar sx={{ width: 32, height: 32, bgcolor: "action.hover" }}><GroupIcon sx={{ fontSize: 18, color: "text.secondary" }} /></Avatar>}
          label="All votes"
        />

        {/* People you follow */}
        {lists?.has(`3:${user?.pubkey}`) && (
          <FilterRow
            selected={selectedList === `3:${user?.pubkey}`}
            onClick={handleFollowing}
            avatar={
              <Avatar
                src={userProfile?.picture || DEFAULT_IMAGE_URL}
                sx={{ width: 32, height: 32 }}
              />
            }
            label="People you follow"
            count={lists.get(`3:${user?.pubkey}`)?.tags.filter((t) => t[0] === "p").length}
          />
        )}

        {/* Bookmarked packs */}
        {bookmarkedPacks.length > 0 && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ px: 2, py: 0.5, display: "block", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              Bookmarked
            </Typography>
            {bookmarkedPacks.map(([key, event]) => {
              const { title, image, members } = getPackMeta(event);
              return (
                <FilterRow
                  key={key}
                  selected={selectedList === key}
                  onClick={() => handlePackSelect(key)}
                  avatar={<Avatar src={image} variant="rounded" sx={{ width: 32, height: 32 }} />}
                  label={title}
                  count={members}
                />
              );
            })}
          </>
        )}

        {/* My Follow Packs */}
        {myPacks.length > 0 && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ px: 2, py: 0.5, display: "block", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              My Packs
            </Typography>
            {myPacks.map(([key, event]) => {
              const { title, image, members } = getPackMeta(event);
              return (
                <FilterRow
                  key={key}
                  selected={selectedList === key}
                  onClick={() => handlePackSelect(key)}
                  avatar={<Avatar src={image} variant="rounded" sx={{ width: 32, height: 32 }} />}
                  label={title}
                  count={members}
                />
              );
            })}
          </>
        )}

        {/* Packs I'm mentioned in */}
        {mentionedPacks.length > 0 && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ px: 2, py: 0.5, display: "block", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              Featured In
            </Typography>
            {mentionedPacks.map(([key, event]) => {
              const { title, image, members } = getPackMeta(event);
              const authorProfile = profiles?.get(event.pubkey);
              return (
                <FilterRow
                  key={key}
                  selected={selectedList === key}
                  onClick={() => handlePackSelect(key)}
                  avatar={
                    <Box sx={{ position: "relative", width: 32, height: 32 }}>
                      <Avatar src={image} variant="rounded" sx={{ width: 32, height: 32 }} />
                      <Avatar
                        src={authorProfile?.picture || DEFAULT_IMAGE_URL}
                        sx={{
                          width: 16,
                          height: 16,
                          position: "absolute",
                          bottom: -2,
                          right: -2,
                          border: "1.5px solid",
                          borderColor: "background.paper",
                        }}
                      />
                    </Box>
                  }
                  label={title}
                  count={members}
                />
              );
            })}
          </>
        )}
      </Popover>
    </>
  );
};

interface FilterRowProps {
  selected: boolean;
  onClick: () => void;
  avatar: React.ReactNode;
  label: string;
  count?: number;
}

const FilterRow: React.FC<FilterRowProps> = ({ selected, onClick, avatar, label, count }) => (
  <Box
    onClick={onClick}
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 1.5,
      px: 1.5,
      py: 0.75,
      cursor: "pointer",
      borderRadius: 1,
      mx: 0.5,
      bgcolor: selected ? "action.selected" : "transparent",
      "&:hover": { bgcolor: selected ? "action.selected" : "action.hover" },
      transition: "background 0.1s",
    }}
  >
    {avatar}
    <Typography variant="body2" sx={{ flex: 1, fontWeight: selected ? 600 : 400 }}>
      {label}
    </Typography>
    {count !== undefined && (
      <Chip
        label={count}
        size="small"
        sx={{ height: 18, fontSize: "0.65rem", "& .MuiChip-label": { px: 0.75 } }}
      />
    )}
  </Box>
);
