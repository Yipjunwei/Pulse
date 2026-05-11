export async function playRawAudio(base64Data: string, sampleRate: number = 24000) {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Decode base64
    const binaryString = window.atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Convert to Float32Array (assuming 16-bit PCM from Gemini TTS)
    // Actually Gemini TTS returns raw bytes, let's assume 16-bit signed PCM
    const int16Buffer = new Int16Array(bytes.buffer);
    const float32Buffer = new Float32Array(int16Buffer.length);
    
    for (let i = 0; i < int16Buffer.length; i++) {
        float32Buffer[i] = int16Buffer[i] / 32768.0;
    }
    
    const audioBuffer = audioContext.createBuffer(1, float32Buffer.length, sampleRate);
    audioBuffer.getChannelData(0).set(float32Buffer);
    
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start();
    
    return source;
  } catch (error) {
    console.error('Error playing raw audio:', error);
    return null;
  }
}
