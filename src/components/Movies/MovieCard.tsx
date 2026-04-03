import React, { useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  CardMedia,
  Typography,
  Button,
  IconButton,
  Tooltip,
} from "@mui/material";
import { Event, nip19 } from "nostr-tools";
import MovieMetadataModal from "./MovieMetadataModal";
import Rate from "../Ratings/Rate";
import { useAppContext } from "../../hooks/useAppContext";
import { useUserContext } from "../../hooks/useUserContext";
import { selectBestMetadataEvent } from "../../utils/utils";
import { useMetadata } from "../../hooks/MetadataProvider";
import { useNavigate } from "react-router/dist";
import { RelaySourceModal } from "../Common/RelaySourceModal";
import { useEventRelays } from "../../hooks/useEventRelays";
import CellTowerIcon from "@mui/icons-material/CellTower";

interface MovieCardProps {
  imdbId: string;
  metadataEvent?: Event;
}

interface FallbackMovieData {
  title?: string;
  poster?: string;
  year?: string;
  summary?: string;
}

const MovieCard: React.FC<MovieCardProps> = ({ imdbId, metadataEvent }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [relayModalOpen, setRelayModalOpen] = useState(false);
  const [fallbackData, setFallbackData] = useState<FallbackMovieData | null>(null);

  const { fetchUserProfileThrottled, profiles } = useAppContext();
  const { user } = useUserContext();
  const { registerEntity, metadata } = useMetadata();
  const navigate = useNavigate();

  useEffect(() => {
    registerEntity("movie", imdbId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imdbId]);

  let activeEvent: Event | undefined;
  if (!metadataEvent) {
    const events = metadata.get(imdbId) ?? [];
    activeEvent = selectBestMetadataEvent(events, user?.follows) ?? undefined;
  } else {
    activeEvent = metadataEvent;
  }
  const metadataSource = metadataEvent
    ? "Preview metadata"
    : activeEvent
      ? "Community metadata"
      : fallbackData
        ? "Fallback metadata from Wikidata"
        : null;

  useEffect(() => {
    if (activeEvent) {
      setFallbackData(null);
      return;
    }

    const cacheKey = `movie-fallback:${imdbId}`;
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
      try {
        setFallbackData(JSON.parse(cached));
        return;
      } catch {
        localStorage.removeItem(cacheKey);
      }
    }

    let cancelled = false;

    const fetchFallback = async () => {
      try {
        const query = `
          SELECT ?item ?itemLabel ?poster ?year WHERE {
            ?item wdt:P345 "${imdbId}".
            OPTIONAL { ?item wdt:P18 ?poster. }
            OPTIONAL { ?item wdt:P577 ?year. }
            SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
          }
          LIMIT 1
        `;

        const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const data = await res.json();

        const result = data?.results?.bindings?.[0];
        if (!result || cancelled) return;

        const fallback: FallbackMovieData = {
          title: result.itemLabel?.value,
          poster: result.poster?.value,
          year: result.year?.value?.slice(0, 4),
        };

        localStorage.setItem(cacheKey, JSON.stringify(fallback));
        setFallbackData(fallback);
      } catch (err) {
        console.error("Fallback metadata failed", imdbId, err);
      }
    };

    fetchFallback();

    return () => {
      cancelled = true;
    };
  }, [activeEvent, imdbId]);

  const eventRelays = useEventRelays(activeEvent?.id ?? "");

  const title =
    activeEvent?.content ||
    fallbackData?.title ||
    `No Metadata - ${imdbId}`;

  const poster =
    activeEvent?.tags.find((t) => t[0] === "poster")?.[1] ||
    fallbackData?.poster;

  const year =
    activeEvent?.tags.find((t) => t[0] === "year")?.[1] ||
    fallbackData?.year;

  const summary =
    activeEvent?.tags.find((t) => t[0] === "summary")?.[1] ||
    fallbackData?.summary;

  const pubkey = activeEvent?.pubkey;

  const metadataUser = metadataEvent
    ? { pubkey, name: "Preview User" }
    : pubkey
      ? profiles?.get(pubkey) ||
      (() => {
        fetchUserProfileThrottled(pubkey);
        return null;
      })()
      : null;

  return (
    <>
      <Card sx={{ display: "flex", mb: 2 }}>
        {poster ? (
          <Box sx={{ position: "relative", width: 120 }}>
            <CardMedia
              component="img"
              sx={{ width: 120 }}
              image={poster}
              alt={title}
            />
            <Button
              size="small"
              variant="text"
              onClick={() => setModalOpen(true)}
              sx={{
                position: "absolute",
                top: 4,
                right: 4,
                minWidth: "auto",
                p: 0.5,
                backgroundColor: "black",
                borderRadius: "50%",
              }}
              title="Edit Metadata"
            >
              ✏️
            </Button>
          </Box>
        ) : (
          <Box
            sx={{
              width: 120,
              height: 180,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "action.hover",
            }}
          >
            <Button size="small" onClick={() => setModalOpen(true)}>
              {activeEvent || fallbackData ? "Edit Metadata" : "Add Metadata"}
            </Button>
          </Box>
        )}

        <Box sx={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <CardContent>
            <div
              onClick={() => navigate(`${imdbId}`)}
              style={{ cursor: "pointer" }}
            >
              <Typography
                variant="h6"
                sx={{
                  display: "inline-block",
                  textDecoration: "none",
                  "&:hover": {
                    textDecoration: "underline",
                  },
                }}
              >
                {title}
              </Typography>
            </div>

            {year && (
              <Typography variant="body2" color="text.secondary">
                {year}
              </Typography>
            )}

            {summary && (
              <Typography variant="body2" mt={1}>
                {summary}
              </Typography>
            )}

            {pubkey && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ wordBreak: "break-word", whiteSpace: "normal" }}
              >
                Metadata by {metadataUser?.name || nip19.npubEncode(pubkey)}
              </Typography>
            )}
            {metadataSource && (
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
                sx={{ opacity: 0.8 }}
              >
                {metadataSource}
              </Typography>
            )}

            <Rate entityId={imdbId} entityType="movie" />

            {activeEvent && eventRelays.length > 0 && (
              <Tooltip
                title={`Found on ${eventRelays.length} relay${eventRelays.length !== 1 ? "s" : ""}`}
              >
                <IconButton
                  size="small"
                  onClick={() => setRelayModalOpen(true)}
                  sx={{
                    mt: 0.5,
                    opacity: 0.5,
                    "&:hover": { opacity: 1 },
                  }}
                >
                  <CellTowerIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
          </CardContent>
        </Box>
      </Card>

      <MovieMetadataModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        imdbId={imdbId}
      />

      <RelaySourceModal
        open={relayModalOpen}
        onClose={() => setRelayModalOpen(false)}
        relays={eventRelays}
      />
    </>
  );
};

export default MovieCard;
