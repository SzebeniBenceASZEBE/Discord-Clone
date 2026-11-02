import { useEffect, useRef, useState } from 'react';
import type { Channel } from '@dc/shared';
import { theme } from '../theme.ts';
import { Avatar } from '../components/Avatar.tsx';
import { useVoice } from './VoiceContext.tsx';
import type { VideoShare, VoiceMember } from './VoiceContext.tsx';

/** Attaches a LiveKit video track (screen or camera) to a <video> element. */
function VideoTile({ track, objectFit = 'cover' }: { track: VideoShare['track']; objectFit?: 'cover' | 'contain' }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit, display: 'block' }} />;
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" />
      {muted ? (
        <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      )}
    </svg>
  );
}

/** One shared screen: the video, a name bar, and a per-share audio mute button. */
function ScreenTile({ screen, audioMuted, onToggleAudio, onClick, focused }: { screen: VideoShare; audioMuted: boolean; onToggleAudio: () => void; onClick: () => void; focused?: boolean }) {
  return (
    <div
      onClick={onClick}
      title={focused ? 'Back to grid' : `Focus ${screen.name}'s screen`}
      style={{ position: 'relative', width: '100%', height: '100%', background: '#000', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', outline: `1px solid ${theme.divider}` }}
    >
      <VideoTile track={screen.track} objectFit="contain" />
      {/* bottom gradient bar with the sharer's name */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 10px 6px', background: 'linear-gradient(transparent, rgba(0,0,0,.65))', color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><path d="M8 20h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        {screen.name}
      </div>
      {focused && (
        <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: 6, padding: '4px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          Grid
        </div>
      )}
      {screen.hasAudio && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleAudio();
          }}
          title={audioMuted ? 'Unmute this screen' : 'Mute this screen'}
          style={{ position: 'absolute', top: 8, left: 8, width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.55)', color: audioMuted ? theme.red : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <SpeakerIcon muted={audioMuted} />
        </button>
      )}
    </div>
  );
}

/** An avatar (or camera) tile for a voice participant. */
function MemberTile({ member, camera, compact }: { member: VoiceMember; camera?: VideoShare; compact?: boolean }) {
  const avatarSize = compact ? 48 : 72;
  const camWidth = compact ? 130 : 180;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: camera ? camWidth : avatarSize + 32, flex: 'none' }}>
      {camera ? (
        <div style={{ width: '100%', aspectRatio: '16 / 10', background: '#000', borderRadius: 10, overflow: 'hidden', outline: member.speaking ? `3px solid ${theme.green}` : '3px solid transparent', transition: 'outline-color .1s' }}>
          <VideoTile track={camera.track} objectFit="cover" />
        </div>
      ) : (
        <div style={{ borderRadius: '50%', padding: 3, outline: member.speaking ? `3px solid ${theme.green}` : '3px solid transparent', transition: 'outline-color .1s' }}>
          <Avatar name={member.name} id={member.identity} size={avatarSize} />
        </div>
      )}
      <span style={{ fontSize: compact ? 12 : 13, color: theme.text, display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: camera ? camWidth : avatarSize + 30, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {member.muted && <span style={{ color: '#f23f43' }}>🔇</span>}
        {member.name}
      </span>
    </div>
  );
}

/** Main-area view for a voice channel: a Join button, or the call. */
export function VoiceStage({ channel }: { channel: Channel }) {
  const voice = useVoice();
  const joinedHere = voice.channelId === channel.id;
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const screens = voice.screens;
  // If the focused share goes away (sharer stopped / left), fall back to the grid.
  useEffect(() => {
    if (focusedId && !screens.some((s) => s.identity === focusedId)) setFocusedId(null);
  }, [screens, focusedId]);

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

  const cameraByIdentity = new Map(voice.cameras.map((c) => [c.identity, c]));
  const focused = focusedId ? screens.find((s) => s.identity === focusedId) ?? null : null;
  // Column count for the grid — keep tiles a reasonable size as shares pile up.
  const cols = screens.length <= 1 ? 1 : screens.length <= 4 ? 2 : 3;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, minHeight: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {screens.length === 0 ? (
          // No one is sharing — participants are the main content. (Who's
          // connected + their status also always shows in the channel sidebar.)
          <div className="scrollthin" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 16, alignContent: 'flex-start', justifyContent: 'center', alignItems: 'center' }}>
            {voice.members.map((m) => (
              <MemberTile key={m.identity} member={m} camera={cameraByIdentity.get(m.identity)} />
            ))}
          </div>
        ) : focused ? (
          // Focus mode: the chosen share fills the stage; others are a filmstrip.
          <>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ScreenTile
                screen={focused}
                audioMuted={!!voice.screenAudioMutes[focused.identity]}
                onToggleAudio={() => voice.toggleScreenAudio(focused.identity)}
                onClick={() => setFocusedId(null)}
                focused
              />
            </div>
            {screens.length > 1 && (
              <div className="scrollthin" style={{ flex: 'none', display: 'flex', gap: 10, overflowX: 'auto', height: 96 }}>
                {screens.filter((s) => s.identity !== focused.identity).map((s) => (
                  <div key={s.identity} style={{ flex: 'none', width: 150, height: 86 }}>
                    <ScreenTile screen={s} audioMuted={!!voice.screenAudioMutes[s.identity]} onToggleAudio={() => voice.toggleScreenAudio(s.identity)} onClick={() => setFocusedId(s.identity)} />
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          // Grid mode: all shares at once, click one to focus it.
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, alignContent: 'start', overflowY: 'auto' }} className="scrollthin">
            {screens.map((s) => (
              <div key={s.identity} style={{ aspectRatio: '16 / 9' }}>
                <ScreenTile screen={s} audioMuted={!!voice.screenAudioMutes[s.identity]} onToggleAudio={() => voice.toggleScreenAudio(s.identity)} onClick={() => setFocusedId(s.identity)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
