/**
 * =========================================================================
 * Wesenho Audio Scripting Domain (src/script/domains/audio_domain.js)
 * Programmatic control over DAW tracks, synths, piano roll MIDI events,
 * mixer channels, DSP effect racks, and audio buffer export.
 * =========================================================================
 */

export class AudioDomain {
  constructor(sdk) {
    this.sdk = sdk;
    this.bpm = 120;
    this.timeSignature = [4, 4];
    this.isPlaying = false;
    this.tracks = [];
    this.master = {
      volume: 1.0,
      pan: 0.0,
      effects: []
    };
  }

  /* ── Transport API ── */
  play() {
    this.isPlaying = true;
    this.sdk.hooks.trigger('onAudioPlay', { bpm: this.bpm });
  }

  stop() {
    this.isPlaying = false;
    this.sdk.hooks.trigger('onAudioStop', {});
  }

  setBpm(bpm) {
    this.bpm = Math.max(20, Math.min(300, bpm));
    this.sdk.hooks.trigger('onBpmChange', { bpm: this.bpm });
  }

  /* ── Track Management ── */
  createTrack(name = `Track ${this.tracks.length + 1}`, type = 'synth') {
    const track = {
      id: `track_${this.tracks.length + 1}`,
      name,
      type, // 'synth', 'sampler', 'audio'
      volume: 0.8,
      pan: 0.0,
      mute: false,
      solo: false,
      midiNotes: [],
      audioClips: [],
      effects: [],
      synthConfig: {
        oscillator: 'sawtooth',
        cutoff: 2000,
        resonance: 2.0,
        attack: 0.01,
        decay: 0.2,
        sustain: 0.5,
        release: 0.3
      }
    };
    this.tracks.push(track);
    return track;
  }

  addNote(trackId, note = { pitch: 60, start: 0, duration: 1.0, velocity: 0.8 }) {
    const track = this.tracks.find(t => t.id === trackId || t.name === trackId);
    if (!track) return null;
    const noteEntry = {
      id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      pitch: typeof note.pitch === 'string' ? noteToMidi(note.pitch) : note.pitch,
      start: note.start || 0,
      duration: note.duration || 1.0,
      velocity: note.velocity !== undefined ? note.velocity : 0.8
    };
    track.midiNotes.push(noteEntry);
    track.midiNotes.sort((a, b) => a.start - b.start);
    return noteEntry;
  }

  addEffect(trackId, fxName, params = {}) {
    const target = trackId === 'master' ? this.master : this.tracks.find(t => t.id === trackId || t.name === trackId);
    if (!target) return null;
    const fx = {
      name: fxName,
      enabled: true,
      params: { ...params }
    };
    target.effects.push(fx);
    return fx;
  }
}

function noteToMidi(name) {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const match = name.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return 60;
  const noteIdx = notes.indexOf(match[1].toUpperCase());
  const octave = parseInt(match[2], 10);
  return (octave + 1) * 12 + noteIdx;
}
