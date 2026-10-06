# Native Audio DSP Engine & DAW

Esenho contains an embedded, high-performance C99 audio Digital Signal Processing (DSP) engine compiled directly into the WebAssembly core (`src/quadro.c`, `include/quadro.h`).

This audio subsystem enables synchronized multi-track audio playback, polyphonic synthesizer voicing, procedural sound effect generation (SFXR), dynamic master/track effects (filter, delay, reverb, bitcrusher, overdrive), and native 16-bit PCM WAV exporting without external dependencies.

---

## 1. Core Architecture

```
                    ┌───────────────────────────────┐
                    │  Audio Domain (SDK / DAW UI)  │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │             Native C Audio Core (quadro.c)             │
       ├────────────────────────────────────────────────────────┤
       │  BPM Clock & Master Volume                             │
       │                                                        │
       │  ┌──────────────────┐        ┌──────────────────────┐  │
       │  │ Track Synthesizer│  ...   │ Procedural SFXR Core │  │
       │  │ - 8 Poly Voices  │        │ - Laser, Hit, Boom,  │  │
       │  │ - ADSR Envelope  │        │   Jump, Powerup      │  │
       │  │ - Bi-quad Filter │        └──────────┬───────────┘  │
       │  │ - FX Rack (Delay,│                   │              │
       │  │   Reverb, Crush) │                   │              │
       │  └────────┬─────────┘                   │              │
       │           │                             │              │
       │           └──────────────┬──────────────┘              │
       │                          ▼                             │
       │            Master Stereo Summing Bus                   │
       │          (Left & Right Float Buffers)                  │
       └──────────────────────────┬─────────────────────────────┘
                                  │
                 ┌────────────────┴────────────────┐
                 ▼                                 ▼
       ┌───────────────────┐             ┌───────────────────┐
       │ Web Audio Output  │             │ Native WAV File   │
       │ (AudioWorklet /   │             │ Exporter (16-bit  │
       │  ScriptProcessor) │             │  44.1kHz Stereo)  │
       └───────────────────┘             └───────────────────┘
```

---

## 2. WebAssembly C ABI Reference

The low-level interface is declared in `include/quadro.h`:

```c
/* Lifecycle & Transport */
W_EXPORT void     w_audio_init(uint32_t sample_rate);
W_EXPORT void     w_audio_set_bpm(float bpm);
W_EXPORT float    w_audio_get_bpm(void);
W_EXPORT void     w_audio_set_master_vol(float vol);
W_EXPORT float    w_audio_get_master_vol(void);

/* Synthesizer & Track Control */
W_EXPORT void     w_audio_set_track_synth(
    uint32_t track_idx,
    uint32_t wave_type,
    float attack_s,
    float decay_s,
    float sustain_lvl,
    float release_s,
    float pulse_width
);

W_EXPORT void     w_audio_set_track_filter(
    uint32_t track_idx,
    uint32_t filter_type,
    float cutoff_hz,
    float resonance,
    float gain_db
);

W_EXPORT void     w_audio_set_track_fx(
    uint32_t track_idx,
    float delay_s,
    float delay_fb,
    float delay_mix,
    float reverb_size,
    float reverb_mix,
    float crush_bits,
    float dist_drive
);

W_EXPORT void     w_audio_set_track_vol_pan(uint32_t track_idx, float volume, float pan);

/* Note Triggering */
W_EXPORT void     w_audio_note_on(uint32_t track_idx, uint32_t midi_note, float velocity);
W_EXPORT void     w_audio_note_off(uint32_t track_idx, uint32_t midi_note);
W_EXPORT void     w_audio_all_notes_off(uint32_t track_idx);

/* Procedural Sound Effects */
W_EXPORT void     w_audio_trigger_sfxr(uint32_t preset_type, float volume);

/* Buffer Rendering & Export */
W_EXPORT void     w_audio_render_block(uint32_t num_frames);
W_EXPORT float*   w_audio_get_buffer_l(void);
W_EXPORT float*   w_audio_get_buffer_r(void);
W_EXPORT uint32_t w_audio_export_wav(uint8_t *out_wav_buffer, uint32_t max_bytes, uint32_t total_frames);
```

---

## 3. Synthesizer & Sound Generation

### Waveform Oscillators
Tracks can generate tone using band-limited waveforms:
- `0`: **Sine** — Pure harmonic sine tone.
- `1`: **Sawtooth** — Bright, buzzy harmonic series for synth leads and basses.
- `2`: **Square / Pulse** — Classic 8-bit sound with adjustable pulse width (`pulse_width` 0.05..0.95).
- `3`: **Triangle** — Soft, warm acoustic-like tone.
- `4`: **White Noise** — Percussion and sound design textures.

### ADSR Envelope Generator
Shapes the volume contour of each polyphonic voice:
- **Attack (`attack_s`)**: Rise time in seconds from note trigger to peak amplitude.
- **Decay (`decay_s`)**: Fall time in seconds from peak to sustain level.
- **Sustain (`sustain_lvl`)**: Held volume ratio (0.0 to 1.0) while note is down.
- **Release (`release_s`)**: Fade out duration in seconds after `note_off`.

### Digital Filter (Bi-quad)
- `0`: **Lowpass** — Attenuates frequencies above `cutoff_hz`.
- `1`: **Highpass** — Attenuates frequencies below `cutoff_hz`.
- `2`: **Bandpass** — Isolates a frequency band around `cutoff_hz`.
- **Resonance**: Resonance boost / Q-factor at the cutoff boundary.

### Effects Rack
Each track has an independent inline effect chain:
1. **Stereo Delay**: Configurable delay time (`delay_s`), feedback loop amount (`delay_fb`), and wet/dry mix.
2. **Reverb**: Algorithmic Schroeder-style comb/allpass diffuser with room size and wet mix.
3. **Bitcrusher**: Quantizes bit depth down to `crush_bits` (e.g. 4-bit, 8-bit, 12-bit lo-fi retro audio).
4. **Distortion**: Soft-saturation overdrive curve controlled by `dist_drive`.

---

## 4. Procedural SFXR Engine

Esenho contains an integrated procedural sound effect synthesizer inspired by Dr. Petter's sfxr:

| Preset Index | Name | Common Use Cases |
| :--- | :--- | :--- |
| `0` | **Laser / Shoot** | High frequency downward frequency slide for projectile fire. |
| `1` | **Explosion** | Bandpassed noise burst with aggressive decay. |
| `2` | **Powerup** | Rapidly ascending arpeggio or frequency sweep. |
| `3` | **Hit / Hurt** | Quick crunchy noise with abrupt low-frequency drop. |
| `4` | **Jump** | Upward frequency pitch bend with gentle resonance. |
| `5` | **Blip / Select** | Short sine/square tone for UI interaction. |

---

## 5. JavaScript SDK Integration (`esenho.audio`)

The audio engine is directly controllable via the universal SDK:

```javascript
// Initialize audio core at standard 44.1 kHz
esenho.audio.setBpm(130);

// Setup lead synth on track 0
canvas.audioSetTrackSynth(0, 1 /* SAW */, 0.01, 0.2, 0.4, 0.3, 0.5);
canvas.audioSetTrackFilter(0, 0 /* LOWPASS */, 3200, 2.5, 0.0);
canvas.audioSetTrackFx(0, 0.3, 0.5, 0.25, 0.6, 0.2, 0, 0.1);

// Play an A-minor triad (A3, C4, E4)
esenho.audio.noteOn(0, 57, 0.85);
esenho.audio.noteOn(0, 60, 0.85);
esenho.audio.noteOn(0, 64, 0.85);

// Release after 1 second
setTimeout(() => {
  esenho.audio.noteOff(0, 57);
  esenho.audio.noteOff(0, 60);
  esenho.audio.noteOff(0, 64);
}, 1000);
```

---

## 6. Native WAV Export

To export rendered tracks directly to disk or download without browser audio record delays:

```javascript
// Export 5 seconds of audio at 44100 Hz (220,500 frames)
const totalFrames = 44100 * 5;
const wavBuffer = canvas.audioExportWav(totalFrames);

// wavBuffer contains a standard binary RIFF/WAVE header and 16-bit stereo PCM
const blob = new Blob([wavBuffer], { type: 'audio/wav' });
const url = URL.createObjectURL(blob);
```
