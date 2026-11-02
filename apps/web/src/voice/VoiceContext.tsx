import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ExternalE2EEKeyProvider, Room, RoomEvent, Track } from 'livekit-client';
import type { RemoteTrack, RoomOptions, TrackPublication } from 'livekit-client';
import type { Channel, VoiceTokenResponse } from '@dc/shared';
import { api } from '../api.ts';

/** Does this browser support insertable-streams E2EE? (Chromium/Firefox yes, Safari no.) */
function e2eeSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { RTCRtpScriptTransform?: unknown };
  return typeof w.RTCRtpScriptTransform !== 'undefined' || (typeof RTCRtpSender !== 'undefined' && 'createEncodedStreams' in RTCRtpSender.prototype);
}

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

/** A published video track (screen share or camera) to attach to a <video>. */
export interface VideoShare {
  identity: string;
  name: string;
  track: Track;
}

interface VoiceState {
  channelId: string | null;
  channelName: string | null;
  status: 'idle' | 'connecting' | 'connected' | 'error';
  error: string;
  members: VoiceMember[];
  screens: VideoShare[];
  cameras: VideoShare[];
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

  useEffect(() => () => void roomRef.current?.disconnect(), []);

  function reset() {
    setChannelId(null);
    setChannelName(null);
    setStatus('idle');
    setMembers([]);
    setScreens([]);
    setCameras([]);
    setMuted(false);
    setDeafened(false);
    deafenedRef.current = false;
    setScreenSharing(false);
    setCameraOn(false);
    setJoinedAt(null);
  }

  /** Mute/unmute every remote audio element — this is what "deafen" does. */
  function applyDeafen(on: boolean) {
    audioRef.current?.querySelectorAll('audio').forEach((el) => {
      (el as HTMLAudioElement).muted = on;
    });
  }

  function wire(room: Room): () => void {
    const refresh = () => {
      const all = [room.localParticipant, ...room.remoteParticipants.values()];
      setMembers(all.map((p) => ({ identity: p.identity, name: p.name || p.identity, speaking: p.isSpeaking, muted: !p.isMicrophoneEnabled })));

      const screenShares: VideoShare[] = [];
      const cameraShares: VideoShare[] = [];
      for (const p of all) {
        for (const pub of p.trackPublications.values() as IterableIterator<TrackPublication>) {
          if (pub.kind !== Track.Kind.Video || !pub.track) continue;
          if (pub.source === Track.Source.ScreenShare) {
            screenShares.push({ identity: p.identity, name: p.name || p.identity, track: pub.track });
          } else if (pub.source === Track.Source.Camera) {
            cameraShares.push({ identity: p.identity, name: p.name || p.identity, track: pub.track });
          }
        }
      }
      setScreens(screenShares);
      setCameras(cameraShares);
      setScreenSharing(room.localParticipant.isScreenShareEnabled);
      setCameraOn(room.localParticipant.isCameraEnabled);
    };
    room
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.ActiveSpeakersChanged, refresh)
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.LocalTrackPublished, refresh)
      .on(RoomEvent.LocalTrackUnpublished, refresh)
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.muted = deafenedRef.current; // stay silent if we're deafened
          audioRef.current?.appendChild(el);
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
      applyDeafen(false);
      setDeafened(false);
    }
  }

  async function toggleDeafen() {
    const room = roomRef.current;
    if (!room) return;
    const next = !deafened;
    deafenedRef.current = next;
    applyDeafen(next);
    setDeafened(next);
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
      await room.localParticipant.setScreenShareEnabled(next, { audio: true });
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
      value={{ channelId, channelName, status, error, members, screens, cameras, muted, deafened, screenSharing, cameraOn, joinedAt, micDeviceId, speakerDeviceId, join, leave, toggleMute, toggleDeafen, toggleScreen, toggleCamera, setMicDevice, setSpeakerDevice }}
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
