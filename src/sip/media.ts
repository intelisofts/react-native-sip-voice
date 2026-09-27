import { mediaDevices, registerGlobals } from "react-native-webrtc";

let globalsRegistered = false;

/**
 * SIP.js's Web session description handler uses the browser globals (`RTCPeerConnection`,
 * `MediaStream`, `navigator.mediaDevices`, …). react-native-webrtc provides them.
 */
export function ensureWebRTCGlobals(): void {
  if (globalsRegistered) return;
  registerGlobals();
  globalsRegistered = true;
}

/** Audio-only local stream. Remote audio plays automatically in react-native-webrtc. */
export async function reactNativeMediaStreamFactory(): Promise<MediaStream> {
  // Voice-only: ignore SIP.js's constraints (which may request video) and always ask for audio.
  const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
  return stream as unknown as MediaStream;
}

/** @internal test hook */
export function _resetWebRTCGlobalsForTests(): void {
  globalsRegistered = false;
}
