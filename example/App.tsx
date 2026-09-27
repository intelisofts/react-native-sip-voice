// Minimal integration example. Copy into an Expo app (SDK 53+, dev build) that has the peer deps installed.
import { useState } from "react";
import { Button, SafeAreaView, TextInput } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ConnectionState, SipVoiceClient, SipVoiceProvider, useConnectionState, useSipVoice } from "react-native-sip-voice";
import { CallOverlay } from "react-native-sip-voice/ui";

const client = new SipVoiceClient({
  debug: true,
  credentialsProvider: async () => ({
    type: "digest",
    wsServer: "wss://sbc.example.com:7443",
    domain: "sip.example.com",
    username: "1001",
    password: "change-me",
  }),
});

function Dialer() {
  const { client } = useSipVoice();
  const state = useConnectionState();
  const [number, setNumber] = useState("+447700900123");
  return (
    <SafeAreaView style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <TextInput value={number} onChangeText={setNumber} keyboardType="phone-pad" style={{ fontSize: 24 }} />
      <Button title={`Call (${state === ConnectionState.CONNECTED ? "connected" : state})`} onPress={() => client.newCall({ destination: number })} />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SipVoiceProvider client={client} nativeConfig={{ appName: "SIP Voice Example" }}>
        <Dialer />
        <CallOverlay />
      </SipVoiceProvider>
    </SafeAreaProvider>
  );
}
