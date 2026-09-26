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

  bindWasm(actor) {
    this.actor = actor;
    if (this.actor && typeof this.actor.audioInit === 'function') {
      this.actor.audioInit(44100);
      this.actor.audioSetBpm(this.bpm);
    }
  }

  /* ── Direct Native DSP Control ── */

  noteOn(trackIdx = 0, pitch = 60, velocity = 0.8) {
    const midi = typeof pitch === 'string' ? noteToMidi(pitch) : pitch;
    if (this.actor && typeof this.actor.audioNoteOn === 'function') {
      this.actor.audioNoteOn(trackIdx, midi, velocity);
    }
    this.sdk.hooks.trigger('onAudioNoteOn', { trackIdx, midi, velocity });
  }

  noteOff(trackIdx = 0, pitch = 60) {
    const midi = typeof pitch === 'string' ? noteToMidi(pitch) : pitch;
    if (this.actor && typeof this.actor.audioNoteOff === 'function') {
      this.actor.audioNoteOff(trackIdx, midi);
    }
    this.sdk.hooks.trigger('onAudioNoteOff', { trackIdx, midi });
  }

  triggerSfxr(preset = 0, volume = 0.8) {
    const presetMap = { coin: 0, laser: 1, explosion: 2, powerup: 3, hit: 4, jump: 5, select: 6, synth: 7 };
    const pIdx = typeof preset === 'string' ? (presetMap[preset.toLowerCase()] || 0) : preset;
    if (this.actor && typeof this.actor.audioTriggerSfxr === 'function') {
      this.actor.audioTriggerSfxr(pIdx, volume);
    }
    this.sdk.hooks.trigger('onAudioSfxr', { preset: pIdx, volume });
  }

  renderBlock(numFrames = 128) {
    if (this.actor && typeof this.actor.audioRenderBlock === 'function') {
      this.actor.audioRenderBlock(numFrames);
      return this.actor.audioGetBuffers(numFrames);
    }
    return null;
  }

  exportWav(totalFrames = 44100) {
    if (this.actor && typeof this.actor.audioExportWav === 'function') {
      return this.actor.audioExportWav(totalFrames);
    }
    return null;
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
