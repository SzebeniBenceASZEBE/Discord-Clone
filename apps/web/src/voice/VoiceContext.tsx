import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ExternalE2EEKeyProvider, Room, RoomEvent, ScreenSharePresets, Track } from 'livekit-client';
import type { RemoteTrack, RoomOptions, ScreenShareCaptureOptions, TrackPublication, TrackPublishOptions } from 'livekit-client';
import type { Channel, VoiceTokenResponse } from '@dc/shared';
import { api } from '../api.ts';

/** Does this browser support insertable-streams E2EE? (Chromium/Firefox yes, Safari no.) */
function e2eeSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { RTCRtpScriptTransform?: unknown };
  return typeof w.RTCRtpScriptTransform !== 'undefined' || (typeof RTCRtpSender !== 'undefined' && 'createEncodedStreams' in RTCRtpSender.prototype);
}

/**
 * Screen-share quality. LiveKit's default is 1080p at only 15 fps / 2.5 Mbps, so
 * we ask for 1080p60 instead. Capture and encoding are separate settings, and
 * both must allow 60 fps or the lower one wins.
 *
 * 'motion' tells the encoder to favour smoothness (games, video).
 */
const SCREEN_CAPTURE: ScreenShareCaptureOptions = {
  audio: true,
  resolution: { width: 1920, height: 1080, frameRate: 60 },
  contentHint: 'motion',
};

/**
 * The top layer is the full 1080p60. The extra 720p30 layer is simulcast: the
 * sharer uploads both, and the server sends each viewer the one that fits their
 * connection and tile size (small grid tile: 720p; focused share: 1080p60).
 * Nobody watching the small layer means it pauses, so it costs little.
 */
const SCREEN_PUBLISH: TrackPublishOptions = {
  screenShareEncoding: { maxBitrate: 8_000_000, maxFramerate: 60 },
  simulcast: true,
  screenShareSimulcastLayers: [ScreenSharePresets.h720fps30],
};

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
  /** Has their audio off (deafened). Synced across clients via a participant attribute. */
  deafened: boolean;
  /** Currently sharing their screen. */
  streaming: boolean;
}

/** A published video track (screen share or camera) to attach to a <video>. */
export interface VideoShare {
  identity: string;
  name: string;
  track: Track;
  /** Screens only: whether this share also carries an audio track we can mute. */
  hasAudio?: boolean;
}

interface VoiceState {
  channelId: string | null;
  channelName: string | null;
  status: 'idle' | 'connecting' | 'connected' | 'error';
  error: string;
  members: VoiceMember[];
  screens: VideoShare[];
  cameras: VideoShare[];
  /** Per-screen-share audio mute, keyed by the sharer's identity. */
  screenAudioMutes: Record<string, boolean>;
  muted: boolean;
  deafened: boolean;
  screenSharing: boolean;
  cameraOn: boolean;
  joinedAt: number | null;
  micDeviceId: string | undefined;
  speakerDeviceId: string | undefined;
  join: (channel: Channel) => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  toggleScreenAudio: (identity: string) => void;
  toggleScreen: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  setMicDevice: (id: string) => Promise<void>;
  setSpeakerDevice: (id: string) => Promise<void>;
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
  const [screens, setScreens] = useState<VideoShare[]>([]);
  const [cameras, setCameras] = useState<VideoShare[]>([]);
  const [screenAudioMutes, setScreenAudioMutes] = useState<Record<string, boolean>>({});
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [joinedAt, setJoinedAt] = useState<number | null>(null);
  const [micDeviceId, setMicDeviceId] = useState<string | undefined>(undefined);
  const [speakerDeviceId, setSpeakerDeviceId] = useState<string | undefined>(undefined);

  // Read inside LiveKit event handlers (which close over the first render).
  const deafenedRef = useRef(false);
  const muteBeforeDeafenRef = useRef(false);
  const screenAudioMutesRef = useRef<Record<string, boolean>>({});

  useEffect(() => () => void roomRef.current?.disconnect(), []);

  function reset() {
    setChannelId(null);
    setChannelName(null);
    setStatus('idle');
    setMembers([]);
    setScreens([]);
    setCameras([]);
    setScreenAudioMutes({});
    screenAudioMutesRef.current = {};
    setMuted(false);
    setDeafened(false);
    deafenedRef.current = false;
    setScreenSharing(false);
    setCameraOn(false);
    setJoinedAt(null);
  }

  /**
   * Recompute the muted state of every remote audio element. An element is
   * silenced if we're deafened, or if it's a screen-share's audio and we've
   * muted that sharer. Tagging happens in TrackSubscribed (data-* attributes).
   */
  function applyAudioMuting() {
    audioRef.current?.querySelectorAll('audio').forEach((node) => {
      const el = node as HTMLAudioElement;
      const isScreenAudio = el.dataset.screenaudio === '1';
      const id = el.dataset.identity ?? '';
      el.muted = deafenedRef.current || (isScreenAudio && !!screenAudioMutesRef.current[id]);
    });
  }

  /** Mute/unmute one participant's screen-share audio (leaves their mic alone). */
  function toggleScreenAudio(identity: string) {
    const next = { ...screenAudioMutesRef.current, [identity]: !screenAudioMutesRef.current[identity] };
    screenAudioMutesRef.current = next;
    setScreenAudioMutes(next);
    applyAudioMuting();
  }

  function wire(room: Room): () => void {
    const refresh = () => {
      const all = [room.localParticipant, ...room.remoteParticipants.values()];
      const localId = room.localParticipant.identity;

      const screenShares: VideoShare[] = [];
      const cameraShares: VideoShare[] = [];
      const streamingIds = new Set<string>();
      for (const p of all) {
        const pubs = [...(p.trackPublications.values() as IterableIterator<TrackPublication>)];
        const hasScreenAudio = pubs.some((pub) => pub.source === Track.Source.ScreenShareAudio && pub.track);
        for (const pub of pubs) {
          if (pub.kind !== Track.Kind.Video || !pub.track) continue;
          if (pub.source === Track.Source.ScreenShare) {
            screenShares.push({ identity: p.identity, name: p.name || p.identity, track: pub.track, hasAudio: hasScreenAudio });
            streamingIds.add(p.identity);
          } else if (pub.source === Track.Source.Camera) {
            cameraShares.push({ identity: p.identity, name: p.name || p.identity, track: pub.track });
          }
        }
      }
      setScreens(screenShares);
      setCameras(cameraShares);

      // Deafen is a client-side notion, so each client advertises it as an
      // attribute; we read our own from local state and others' from theirs.
      setMembers(
        all.map((p) => ({
          identity: p.identity,
          name: p.name || p.identity,
          speaking: p.isSpeaking,
          muted: !p.isMicrophoneEnabled,
          deafened: p.identity === localId ? deafenedRef.current : p.attributes?.deafened === '1',
          streaming: streamingIds.has(p.identity),
        })),
      );
      setScreenSharing(room.localParticipant.isScreenShareEnabled);
      setCameraOn(room.localParticipant.isCameraEnabled);
    };
    room
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.ActiveSpeakersChanged, refresh)
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.ParticipantAttributesChanged, refresh)
      .on(RoomEvent.LocalTrackPublished, refresh)
      .on(RoomEvent.LocalTrackUnpublished, refresh)
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          // Tag it so applyAudioMuting can target screen-share audio per person.
          el.dataset.identity = participant.identity;
          if (track.source === Track.Source.ScreenShareAudio) el.dataset.screenaudio = '1';
          audioRef.current?.appendChild(el);
          applyAudioMuting();
        }
        refresh();
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el) => el.remove());
        refresh();
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
    if (!e2eeSupported()) {
      setStatus('error');
      setError('Encrypted calls need a Chromium browser (Chrome/Edge) or Firefox.');
      return;
    }
    await leave();

    setStatus('connecting');
    setError('');
    setChannelId(channel.id);
    setChannelName(channel.name);

    let room: Room | null = null;
    try {
      const { url, token, e2eeKey } = await api.post<VoiceTokenResponse>(`/api/channels/${channel.id}/voice-token`);

      // E2EE: encrypt media frames in a worker with the room key from our server.
      const keyProvider = new ExternalE2EEKeyProvider();
      await keyProvider.setKey(e2eeKey);
      const worker = new Worker(new URL('livekit-client/e2ee-worker', import.meta.url), { type: 'module' });
      const options: RoomOptions = { adaptiveStream: true, dynacast: true, e2ee: { keyProvider, worker } };

      room = new Room(options);
      roomRef.current = room;
      const refresh = wire(room);
      await room.setE2EEEnabled(true);

      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true, { deviceId: micDeviceId, noiseSuppression: true, echoCancellation: true, autoGainControl: true });
      if (speakerDeviceId) {
        try {
          await room.switchActiveDevice('audiooutput', speakerDeviceId);
        } catch {
          /* speaker selection unsupported in this browser */
        }
      }
      setStatus('connected');
      setMuted(false);
      setDeafened(false);
      deafenedRef.current = false;
      setJoinedAt(Date.now());
      refresh();
    } catch (err) {
      roomRef.current = null;
      reset();
      setError(err instanceof Error ? err.message : 'Could not connect');
      setStatus('error');
      if (room) await room.disconnect();
    }
  }

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
    // Un-muting while deafened makes no sense (you still couldn't hear), so it
    // also un-deafens — matching Discord.
    if (!next && deafened) {
      deafenedRef.current = false;
      applyAudioMuting();
      setDeafened(false);
    }
  }

  async function toggleDeafen() {
    const room = roomRef.current;
    if (!room) return;
    const next = !deafened;
    deafenedRef.current = next;
    applyAudioMuting();
    setDeafened(next);
    // Tell other clients so they can show our deafened status in the list.
    void room.localParticipant.setAttributes({ deafened: next ? '1' : '0' }).catch(() => {});
    // Deafen also mutes your mic (Discord behaviour); un-deafen restores the mic
    // to whatever it was before you deafened.
    if (next) {
      muteBeforeDeafenRef.current = muted;
      if (!muted) await room.localParticipant.setMicrophoneEnabled(false);
      setMuted(true);
    } else {
      const restore = muteBeforeDeafenRef.current;
      await room.localParticipant.setMicrophoneEnabled(!restore);
      setMuted(restore);
    }
  }

  async function toggleScreen() {
    const room = roomRef.current;
    if (!room) return;
    const next = !screenSharing;
    try {
      await room.localParticipant.setScreenShareEnabled(next, SCREEN_CAPTURE, SCREEN_PUBLISH);
      setScreenSharing(next);
    } catch {
      // User cancelled the screen picker — sync to the real state.
      setScreenSharing(room.localParticipant.isScreenShareEnabled);
    }
  }

  async function toggleCamera() {
    const room = roomRef.current;
    if (!room) return;
    const next = !cameraOn;
    try {
      await room.localParticipant.setCameraEnabled(next, { deviceId: undefined });
      setCameraOn(next);
    } catch {
      // Camera unavailable / permission denied — sync to the real state.
      setCameraOn(room.localParticipant.isCameraEnabled);
    }
  }

  async function setMicDevice(id: string) {
    setMicDeviceId(id);
    const room = roomRef.current;
    if (room) await room.switchActiveDevice('audioinput', id);
  }

  async function setSpeakerDevice(id: string) {
    setSpeakerDeviceId(id);
    const room = roomRef.current;
    if (room) {
      try {
        await room.switchActiveDevice('audiooutput', id);
      } catch {
        /* unsupported */
      }
    }
  }

  return (
    <VoiceCtx.Provider
      value={{ channelId, channelName, status, error, members, screens, cameras, screenAudioMutes, muted, deafened, screenSharing, cameraOn, joinedAt, micDeviceId, speakerDeviceId, join, leave, toggleMute, toggleDeafen, toggleScreenAudio, toggleScreen, toggleCamera, setMicDevice, setSpeakerDevice }}
    >
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
