import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import type { RemoteTrack } from 'livekit-client';
import type { Channel, VoiceTokenResponse } from '@dc/shared';
import { api } from '../api.ts';
import { theme } from '../theme.ts';
import { Avatar } from '../components/Avatar.tsx';

interface Member {
  identity: string;
  name: string;
  speaking: boolean;
  muted: boolean;
}

/**
 * Joins the LiveKit room for a voice channel. Phase 1: connect, publish your
 * mic, hear everyone, see who's in the call, mute, and leave. Screen share,
 * device selection, and E2EE come in later phases.
 */
export function VoiceCall({ channel, onLeave }: { channel: Channel; onLeave: () => void }) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [error, setError] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [muted, setMuted] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    function refresh() {
      const all = [room.localParticipant, ...room.remoteParticipants.values()];
      setMembers(all.map((p) => ({ identity: p.identity, name: p.name || p.identity, speaking: p.isSpeaking, muted: !p.isMicrophoneEnabled })));
    }

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
      });

    (async () => {
      try {
        const { url, token } = await api.post<VoiceTokenResponse>(`/api/channels/${channel.id}/voice-token`);
        if (cancelled) return;
        await room.connect(url, token);
        await room.localParticipant.setMicrophoneEnabled(true);
        if (cancelled) {
          await room.disconnect();
          return;
        }
        setStatus('connected');
        refresh();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not connect');
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      void room.disconnect();
    };
  }, [channel.id]);

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }} className="scrollthin">
        {status === 'connecting' && <div style={{ color: theme.textMuted }}>Connecting to voice…</div>}
        {status === 'error' && (
          <div style={{ color: '#f0888c' }}>
            Couldn&rsquo;t connect: {error}
            <div style={{ color: theme.textMuted, fontSize: 13, marginTop: 8 }}>Is the LiveKit server running? (see the run note)</div>
          </div>
        )}
        {status === 'connected' && (
          <>
            <div style={{ color: theme.green, fontWeight: 600, marginBottom: 16 }}>Voice connected — #{channel.name}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {members.map((m) => (
                <div key={m.identity} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 100 }}>
                  <div style={{ borderRadius: '50%', padding: 3, outline: m.speaking ? `3px solid ${theme.green}` : '3px solid transparent' }}>
                    <Avatar name={m.name} id={m.identity} size={64} />
                  </div>
                  <span style={{ fontSize: 13, color: theme.text, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {m.muted && <span style={{ color: '#f23f43' }}>🔇</span>}
                    {m.name}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ flex: 'none', display: 'flex', justifyContent: 'center', gap: 12, padding: 16, borderTop: '1px solid rgba(0,0,0,.2)' }}>
        <button onClick={toggleMute} disabled={status !== 'connected'} style={{ background: muted ? '#f23f43' : theme.sidebar, border: `1px solid ${theme.divider}`, color: '#fff', borderRadius: 4, padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}>
          {muted ? 'Unmute' : 'Mute'}
        </button>
        <button onClick={onLeave} style={{ background: '#f23f43', border: 'none', color: '#fff', borderRadius: 4, padding: '8px 16px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
          Disconnect
        </button>
      </div>

      <div ref={audioRef} style={{ display: 'none' }} />
    </div>
  );
}
