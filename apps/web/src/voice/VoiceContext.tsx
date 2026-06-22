import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import type { RemoteTrack } from 'livekit-client';
import type { Channel, VoiceTokenResponse } from '@dc/shared';
import { api } from '../api.ts';

/**
 * Holds the ONE active voice connection for the session, above channel
 * selection — so you stay connected (and keep hearing people) while you browse
 * other channels and DMs. The hidden audio container is rendered here so remote
 * audio keeps playing no matter what view is on screen.
 */
export interface VoiceMember {
  identity: string;
  name: string;
  speaking: boolean;
  muted: boolean;
}

interface VoiceState {
  channelId: string | null;
  channelName: string | null;
  status: 'idle' | 'connecting' | 'connected' | 'error';
  error: string;
  members: VoiceMember[];
  muted: boolean;
  joinedAt: number | null;
  join: (channel: Channel) => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => Promise<void>;
}

const VoiceCtx = createContext<VoiceState | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLDivElement>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [channelName, setChannelName] = useState<string | null>(null);
  const [status, setStatus] = useState<VoiceState['status']>('idle');
  const [error, setError] = useState('');
  const [members, setMembers] = useState<VoiceMember[]>([]);
  const [muted, setMuted] = useState(false);
  const [joinedAt, setJoinedAt] = useState<number | null>(null);

  // If the app unmounts (e.g. logout) while in a call, don't leave a room open.
  useEffect(() => () => void roomRef.current?.disconnect(), []);

  function reset() {
    setChannelId(null);
    setChannelName(null);
    setStatus('idle');
    setMembers([]);
    setMuted(false);
    setJoinedAt(null);
  }

  function wire(room: Room): () => void {
    const refresh = () => {
      const all = [room.localParticipant, ...room.remoteParticipants.values()];
      setMembers(all.map((p) => ({ identity: p.identity, name: p.name || p.identity, speaking: p.isSpeaking, muted: !p.isMicrophoneEnabled })));
    };
    room
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.ActiveSpeakersChanged, refresh)
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.LocalTrackPublished, refresh)
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) audioRef.current?.appendChild(track.attach());
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el) => el.remove());
      })
      .on(RoomEvent.Disconnected, () => {
        if (roomRef.current === room) {
          roomRef.current = null;
          reset();
        }
      });
    return refresh;
  }

  async function leave() {
    const room = roomRef.current;
    roomRef.current = null;
    reset();
    if (room) await room.disconnect();
  }

  async function join(channel: Channel) {
    if (channelId === channel.id && status === 'connected') return;
    await leave(); // leave any current call first

    setStatus('connecting');
    setError('');
    setChannelId(channel.id);
    setChannelName(channel.name);

    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    const refresh = wire(room);

    try {
      const { url, token } = await api.post<VoiceTokenResponse>(`/api/channels/${channel.id}/voice-token`);
      await room.connect(url, token);
      // Browser-native noise suppression / echo cancellation (free, built in).
      await room.localParticipant.setMicrophoneEnabled(true, { noiseSuppression: true, echoCancellation: true, autoGainControl: true });
      setStatus('connected');
      setMuted(false);
      setJoinedAt(Date.now());
      refresh();
    } catch (err) {
      roomRef.current = null;
      reset();
      setError(err instanceof Error ? err.message : 'Could not connect');
      setStatus('error');
      await room.disconnect();
    }
  }

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }

  return (
    <VoiceCtx.Provider value={{ channelId, channelName, status, error, members, muted, joinedAt, join, leave, toggleMute }}>
      {children}
      <div ref={audioRef} style={{ display: 'none' }} />
    </VoiceCtx.Provider>
  );
}

export function useVoice(): VoiceState {
  const ctx = useContext(VoiceCtx);
  if (!ctx) throw new Error('useVoice must be used inside <VoiceProvider>');
  return ctx;
}
