import { useEffect, useState } from 'react';
import { theme } from '../theme.ts';
import { buttonStyle, labelStyle } from '../pages/authStyles.ts';
import { useVoice } from './VoiceContext.tsx';

/**
 * Device picker behind the settings gear: choose mic + speaker. Device *labels*
 * only appear after mic permission is granted (i.e. once you've joined a call).
 * Changing a device switches it live if you're in a call, and is remembered for
 * the next call.
 */
export function VoiceSettingsModal({ onClose }: { onClose: () => void }) {
  const voice = useVoice();
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    async function load() {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMics(devices.filter((d) => d.kind === 'audioinput'));
      setSpeakers(devices.filter((d) => d.kind === 'audiooutput'));
    }
    void load();
    navigator.mediaDevices.addEventListener('devicechange', load);
    return () => navigator.mediaDevices.removeEventListener('devicechange', load);
  }, []);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: theme.sidebar, borderRadius: 8, padding: 24 }}>
        <div style={{ color: '#f2f3f5', fontSize: 18, fontWeight: 500 }}>Voice settings</div>
        <div style={{ color: theme.textMuted, fontSize: 13, marginTop: 4 }}>Pick your microphone and speaker.</div>

        <label style={labelStyle} htmlFor="mic">Microphone</label>
        <select id="mic" className="auth-input" value={voice.micDeviceId ?? ''} onChange={(e) => voice.setMicDevice(e.target.value)}>
          {mics.length === 0 && <option value="">Default — join a call to see device names</option>}
          {mics.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
          ))}
        </select>

        {speakers.length > 0 ? (
          <>
            <label style={labelStyle} htmlFor="spk">Speaker</label>
            <select id="spk" className="auth-input" value={voice.speakerDeviceId ?? ''} onChange={(e) => voice.setSpeakerDevice(e.target.value)}>
              <option value="">Default</option>
              {speakers.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${i + 1}`}</option>
              ))}
            </select>
          </>
        ) : (
          <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 12 }}>Speaker selection isn&rsquo;t available in this browser.</div>
        )}

        <button onClick={onClose} style={{ ...buttonStyle }}>Done</button>
      </div>
    </div>
  );
}
