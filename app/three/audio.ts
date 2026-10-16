/**
 * Everything you hear is synthesised in the browser — no audio files.
 *
 * Buses: ambient (wind + water + birds), music (slow chord pad), sfx (bell,
 * freewheel, tyres). The context is only created after a user gesture.
 */

export type Audio = {
  resume: () => void;
  setMuted: (muted: boolean) => void;
  isMuted: () => boolean;
  bell: () => void;
  collect: () => void;
  cheer: () => void;
  update: (speed: number, airborne: boolean) => void;
  dispose: () => void;
};

function noiseBuffer(context: AudioContext, seconds: number, brown = false): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buffer;
}

export function createAudio(): Audio {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let ambientBus: GainNode | null = null;
  let musicBus: GainNode | null = null;
  let sfxBus: GainNode | null = null;
  let tyreGain: GainNode | null = null;
  let windGain: GainNode | null = null;
  let musicTimer: number | null = null;
  let birdTimer: number | null = null;
  let muted = false;
  let tickAccumulator = 0;
  /** Short noise burst reused for every freewheel click (no per-click allocation). */
  let clickBuffer: AudioBuffer | null = null;

  const MASTER = 0.5;

  function noiseSource(brown: boolean): AudioBufferSourceNode {
    const source = context!.createBufferSource();
    source.buffer = noiseBuffer(context!, 3, brown);
    source.loop = true;
    return source;
  }

  /** Slow pad: four voices cycling through soft chords. */
  function startMusic(): void {
    const chords = [
      [220, 277.18, 329.63, 415.3], // A minor 9
      [174.61, 220, 261.63, 329.63], // F major 7
      [196, 246.94, 293.66, 392], // G major
      [130.81, 196, 261.63, 329.63], // C major 7
    ];
    let index = 0;
    const delay = context!.createDelay(0.6);
    delay.delayTime.value = 0.42;
    const feedback = context!.createGain();
    feedback.gain.value = 0.32;
    const filter = context!.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1100;
    filter.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(musicBus!);

    const voices: { oscillator: OscillatorNode; gain: GainNode }[] = [];
    for (const frequency of chords[0]) {
      const oscillator = context!.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = (Math.random() - 0.5) * 12;
      const gain = context!.createGain();
      gain.gain.value = 0;
      oscillator.connect(gain).connect(filter);
      oscillator.start();
      voices.push({ oscillator, gain });
    }

    const voiceGain = 0.055;
    const playChord = () => {
      const chord = chords[index % chords.length];
      index++;
      voices.forEach((voice, voiceIndex) => {
        const target = voiceIndex < chord.length ? chord[voiceIndex] : chord[0];
        voice.oscillator.frequency.setTargetAtTime(target, context!.currentTime, 0.6);
        voice.gain.gain.setTargetAtTime(voiceGain, context!.currentTime, 1.4);
      });
      window.setTimeout(() => {
        for (const voice of voices) voice.gain.gain.setTargetAtTime(0, context!.currentTime, 1.8);
      }, 6200);
    };
    playChord();
    musicTimer = window.setInterval(playChord, 8000);
  }

  function startAmbient(): void {
    clickBuffer = noiseBuffer(context!, 0.05);

    // wind: brown noise through a slowly opening filter
    const wind = noiseSource(true);
    const windFilter = context!.createBiquadFilter();
    windFilter.type = "lowpass";
    windFilter.frequency.value = 420;
    windGain = context!.createGain();
    windGain.gain.value = 0.22;
    const windLfo = context!.createOscillator();
    windLfo.frequency.value = 0.06;
    const windLfoGain = context!.createGain();
    windLfoGain.gain.value = 160;
    windLfo.connect(windLfoGain).connect(windFilter.frequency);
    windLfo.start();
    wind.connect(windFilter).connect(windGain).connect(ambientBus!);
    wind.start();

    // canal water: bandpassed noise with a lazy swell
    const water = noiseSource(false);
    const waterFilter = context!.createBiquadFilter();
    waterFilter.type = "bandpass";
    waterFilter.frequency.value = 620;
    waterFilter.Q.value = 0.9;
    const waterGain = context!.createGain();
    waterGain.gain.value = 0.1;
    const waterLfo = context!.createOscillator();
    waterLfo.frequency.value = 0.23;
    const waterLfoGain = context!.createGain();
    waterLfoGain.gain.value = 0.05;
    waterLfo.connect(waterLfoGain).connect(waterGain.gain);
    waterLfo.start();
    water.connect(waterFilter).connect(waterGain).connect(ambientBus!);
    water.start();

    // tyres on the bricks, driven by speed
    const tyres = noiseSource(false);
    const tyreFilter = context!.createBiquadFilter();
    tyreFilter.type = "lowpass";
    tyreFilter.frequency.value = 900;
    tyreGain = context!.createGain();
    tyreGain.gain.value = 0;
    tyres.connect(tyreFilter).connect(tyreGain).connect(sfxBus!);
    tyres.start();

    const chirp = () => {
      if (!context) return;
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      const base = 1500 + Math.random() * 1400;
      oscillator.frequency.setValueAtTime(base, now);
      oscillator.frequency.exponentialRampToValueAtTime(base * 1.35, now + 0.07);
      oscillator.frequency.exponentialRampToValueAtTime(base * 0.85, now + 0.22);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      oscillator.connect(gain).connect(ambientBus!);
      oscillator.start(now);
      oscillator.stop(now + 0.34);
      birdTimer = window.setTimeout(chirp, 2500 + Math.random() * 9000);
    };
    birdTimer = window.setTimeout(chirp, 1800);
  }

  function ensure(): boolean {
    if (context) return true;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    try {
      context = new Ctor();
      master = context.createGain();
      master.gain.value = muted ? 0 : MASTER;
      master.connect(context.destination);
      ambientBus = context.createGain();
      ambientBus.gain.value = 0.75;
      ambientBus.connect(master);
      musicBus = context.createGain();
      musicBus.gain.value = 0.5;
      musicBus.connect(master);
      sfxBus = context.createGain();
      sfxBus.gain.value = 0.85;
      sfxBus.connect(master);
      startAmbient();
      startMusic();
      return true;
    } catch {
      context = null;
      return false;
    }
  }

  function tone(frequency: number, type: OscillatorType, at: number, duration: number, level: number): void {
    if (!context || !sfxBus) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain).connect(sfxBus);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.05);
  }

  return {
    resume() {
      if (!ensure()) return;
      void context?.resume();
    },
    setMuted(next) {
      muted = next;
      if (master && context) master.gain.setTargetAtTime(next ? 0 : MASTER, context.currentTime, 0.05);
    },
    isMuted() {
      return muted;
    },
    bell() {
      if (!ensure() || !context) return;
      const now = context.currentTime;
      for (const [offset, frequency] of [0, 1860].entries()) {
        tone(frequency, "sine", now + offset * 0.06, 1.1, 0.1);
      }
      tone(2480, "sine", now + 0.06, 0.9, 0.06);
    },
    collect() {
      if (!ensure() || !context) return;
      const now = context.currentTime;
      [1046.5, 1318.5, 1568].forEach((frequency, index) => {
        tone(frequency, "triangle", now + index * 0.07, 0.5, 0.09);
      });
    },
    cheer() {
      if (!ensure() || !context) return;
      const now = context.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
        tone(frequency, "triangle", now + index * 0.11, 0.9, 0.1);
      });
    },
    update(speed, airborne) {
      if (!context || !tyreGain || !windGain) return;
      const now = context.currentTime;
      const pace = Math.min(Math.abs(speed) / 12, 1);
      tyreGain.gain.setTargetAtTime(airborne ? 0 : pace * 0.12, now, 0.2);
      windGain.gain.setTargetAtTime(0.22 + pace * 0.3, now, 0.4);

      // freewheel clicks, one per ~40cm of travel
      if (speed > 1.2 && !airborne && sfxBus && clickBuffer) {
        tickAccumulator += Math.abs(speed) * 0.02;
        if (tickAccumulator > 1) {
          tickAccumulator = 0;
          const click = context.createBufferSource();
          click.buffer = clickBuffer;
          const filter = context.createBiquadFilter();
          filter.type = "highpass";
          filter.frequency.value = 2400;
          const gain = context.createGain();
          const level = 0.03 + pace * 0.05;
          gain.gain.setValueAtTime(level, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
          click.connect(filter).connect(gain).connect(sfxBus);
          click.start(now);
          click.stop(now + 0.06);
        }
      }
    },
    dispose() {
      if (musicTimer !== null) window.clearInterval(musicTimer);
      if (birdTimer !== null) window.clearTimeout(birdTimer);
      musicTimer = null;
      birdTimer = null;
      clickBuffer = null;
      void context?.close();
      context = null;
    },
  };
}
