export const registerGlobals = jest.fn();
export const mediaDevices = {
  getUserMedia: jest.fn(async () => ({ getTracks: () => [], getAudioTracks: () => [] })),
};
