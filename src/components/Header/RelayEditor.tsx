import React, { useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { useRelays } from "../../hooks/useRelays";
import { publishUserRelays } from "../../nostr/OutboxService";
import { publishInboxRelays } from "../../nostr/nip17";
import { useNotification } from "../../contexts/notification-context";
import { fetchInboxRelays } from "../../nostr/nip17";
import { useUserContext } from "../../hooks/useUserContext";

function RelayList({
  label,
  description,
  relays,
  onChange,
}: {
  label: string;
  description: string;
  relays: string[];
  onChange: (updated: string[]) => void;
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const url = input.trim();
    if (!url || relays.includes(url)) return;
    onChange([...relays, url]);
    setInput("");
  };

  const remove = (url: string) => onChange(relays.filter((r) => r !== url));

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        {label}
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          {description}
        </Typography>
      </Typography>
      <Stack spacing={0.5} sx={{ mt: 0.5, mb: 1 }}>
        {relays.map((url) => (
          <Chip
            key={url}
            label={url}
            onDelete={() => remove(url)}
            deleteIcon={<DeleteIcon />}
            size="small"
            sx={{ fontFamily: "monospace", fontSize: "0.75rem", justifyContent: "space-between" }}
          />
        ))}
        {relays.length === 0 && (
          <Typography variant="caption" color="text.secondary">None</Typography>
        )}
      </Stack>
      <Box sx={{ display: "flex", gap: 1 }}>
        <TextField
          size="small"
          placeholder="wss://relay.example.com"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          fullWidth
          inputProps={{ style: { fontFamily: "monospace", fontSize: "0.8rem" } }}
        />
        <IconButton size="small" onClick={add}>
          <AddIcon />
        </IconButton>
      </Box>
    </Box>
  );
}

interface RelayEditorProps {
  onDone: () => void;
}

export const RelayEditor: React.FC<RelayEditorProps> = ({ onDone }) => {
  const { relays: ctxRead, writeRelays: ctxWrite, refreshRelays } = useRelays();
  const { user } = useUserContext();
  const { showNotification } = useNotification();

  const [readRelays, setReadRelays] = useState<string[]>(ctxRead);
  const [writeRelays, setWriteRelays] = useState<string[]>(ctxWrite);
  const [dmRelays, setDmRelays] = useState<string[]>([]);
  const [dmLoaded, setDmLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Lazy-load DM relays on first render
  React.useEffect(() => {
    if (user?.pubkey) {
      fetchInboxRelays(user.pubkey, true).then((r) => {
        setDmRelays(r);
        setDmLoaded(true);
      });
    } else {
      setDmLoaded(true);
    }
  }, [user?.pubkey]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await publishUserRelays(readRelays, writeRelays);
      await publishInboxRelays(dmRelays);
      refreshRelays();
      showNotification("Relay lists saved", "success");
      onDone();
    } catch (e) {
      console.error(e);
      showNotification("Failed to save relay lists", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Stack spacing={2}>
        <RelayList
          label="Read relays"
          description="(subscriptions — where you read from)"
          relays={readRelays}
          onChange={setReadRelays}
        />
        <Divider />
        <RelayList
          label="Write relays"
          description="(publishing — where you post to)"
          relays={writeRelays}
          onChange={setWriteRelays}
        />
        <Divider />
        {dmLoaded ? (
          <RelayList
            label="DM inbox relays"
            description="(NIP-17 — where you receive encrypted DMs)"
            relays={dmRelays}
            onChange={setDmRelays}
          />
        ) : (
          <CircularProgress size={20} />
        )}
      </Stack>
      <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
        <Button variant="contained" onClick={handleSave} disabled={saving} startIcon={saving ? <CircularProgress size={16} /> : null}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button variant="outlined" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
};
