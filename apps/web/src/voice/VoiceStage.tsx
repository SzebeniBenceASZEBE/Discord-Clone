import { useEffect, useRef } from 'react';
import type { Channel } from '@dc/shared';
import { theme } from '../theme.ts';
import { Avatar } from '../components/Avatar.tsx';
import { useVoice } from './VoiceContext.tsx';
import type { VideoShare } from './VoiceContext.tsx';

/** Attaches a LiveKit video track (screen or camera) to a <video> element. */
function VideoTile({ track, style }: { track: VideoShare['track']; style?: React.CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted style={{ width: '100%', display: 'block', ...style }} />;
}

/** Renders one shared screen. */
function ScreenView({ screen }: { screen: VideoShare }) {
  return (
    <div style={{ flex: '1 1 480px', maxWidth: 800, background: '#000', borderRadius: 8, overflow: 'hidden' }}>
      <VideoTile track={screen.track} />
      <div style={{ fontSize: 12, color: theme.textMuted, padding: '6px 10px', background: theme.rail }}>{screen.name}&rsquo;s screen</div>
    </div>
  );
}

/** Main-area view for a voice channel: a Join button, or the call. */
export function VoiceStage({ channel }: { channel: Channel }) {
  const voice = useVoice();
  const joinedHere = voice.channelId === channel.id;

  if (!joinedHere) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ fontSize: 18, color: theme.text }}>🔊 {channel.name}</div>
        <button
          onClick={() => voice.join(channel)}
          disabled={voice.status === 'connecting'}
          style={{ background: theme.green, border: 'none', color: '#fff', borderRadius: 4, padding: '10px 22px', fontSize: 15, fontWeight: 500, cursor: 'pointer' }}
        >
          {voice.status === 'connecting' ? 'Connecting…' : 'Join Voice'}
        </button>
        {voice.status === 'error' && <div style={{ color: '#f0888c' }}>{voice.error} — is the LiveKit server running?</div>}
      </div>
    );
  }

  // One camera tile per participant who has their camera on, keyed by identity.
  const cameraByIdentity = new Map(voice.cameras.map((c) => [c.identity, c]));

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }} className="scrollthin">
      {voice.screens.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {voice.screens.map((s) => (
            <ScreenView key={s.identity} screen={s} />
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {voice.members.map((m) => {
          const cam = cameraByIdentity.get(m.identity);
          return (
            <div key={m.identity} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: cam ? 180 : 110 }}>
              {cam ? (
                <div style={{ width: '100%', aspectRatio: '16 / 10', background: '#000', borderRadius: 10, overflow: 'hidden', outline: m.speaking ? `3px solid ${theme.green}` : '3px solid transparent', transition: 'outline-color .1s' }}>
                  <VideoTile track={cam.track} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ) : (
                <div style={{ borderRadius: '50%', padding: 3, outline: m.speaking ? `3px solid ${theme.green}` : '3px solid transparent', transition: 'outline-color .1s' }}>
                  <Avatar name={m.name} id={m.identity} size={72} />
                </div>
              )}
              <span style={{ fontSize: 13, color: theme.text, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {m.muted && <span style={{ color: '#f23f43' }}>🔇</span>}
                {m.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
