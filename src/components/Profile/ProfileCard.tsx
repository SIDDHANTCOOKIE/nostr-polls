import React from "react";
import { Event } from "nostr-tools";
import { Avatar, Card, CardContent, Typography } from "@mui/material";
import Rate from "../Ratings/Rate";
import { DEFAULT_IMAGE_URL } from "../../utils/constants";
import { Nip05Badge } from "../Common/Nip05Badge";

const ProfileCard: React.FC<{ event: Event }> = ({ event }) => {
  const profile = JSON.parse(event.content || "{}");
  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Avatar
          src={profile.picture || DEFAULT_IMAGE_URL}
          alt="Profile Picture"
        />
        <Typography variant="h6">{profile.name || "Unnamed"}</Typography>
        <Nip05Badge nip05={profile.nip05} pubkey={event.pubkey} />
        <Typography variant="body2" color="text.secondary">
          {profile.about}
        </Typography>
        <Rate entityId={event.pubkey} entityType="profile" />
      </CardContent>
    </Card>
  );
};

export default ProfileCard;
