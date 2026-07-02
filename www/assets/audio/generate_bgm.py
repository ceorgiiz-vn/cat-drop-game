"""Cozy retro-style looping BGM — one unique track per sound pack."""
import math
import os
import struct
import wave

sample_rate = 44100


def get_adsr(t, duration, attack=0.02, decay=0.08, sustain=0.6, release=0.15):
    if t < attack:
        return t / attack
    if t < attack + decay:
        return 1.0 - (1.0 - sustain) * ((t - attack) / decay)
    if t > duration - release:
        return sustain * max(0.0, (duration - t) / release)
    return sustain


def note_freq(name):
    table = {
        "C2": 65.41, "D2": 73.42, "E2": 82.41, "F2": 87.31, "G2": 98.00, "A2": 110.00, "B2": 123.47,
        "C3": 130.81, "D3": 146.83, "E3": 164.81, "F3": 174.61, "G3": 196.00, "A3": 220.00, "B3": 246.94,
        "C4": 261.63, "D4": 293.66, "E4": 329.63, "F4": 349.23, "G4": 392.00, "A4": 440.00, "B4": 493.88,
        "C5": 523.25, "D5": 587.33, "E5": 659.25, "F5": 698.46, "G5": 783.99, "A5": 880.00, "B5": 987.77,
        "C6": 1046.50, "D6": 1174.66, "Eb4": 311.13, "Bb3": 233.08, "F#4": 369.99,
    }
    return table.get(name, 261.63)


def write_wav(filename, samples):
    peak = max(abs(x) for x in samples) if samples else 0.0
    if peak > 0.0:
        samples = [x / peak * 0.74 for x in samples]
    with wave.open(filename, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        for s in samples:
            wf.writeframesraw(struct.pack("<h", int(max(-32768, min(32767, s * 32767)))))


def osc(wave, phase):
    if wave == "tri":
        p = (phase % (2.0 * math.pi)) / (2.0 * math.pi)
        return -1.0 + 4.0 * p if p < 0.5 else 3.0 - 4.0 * p
    if wave == "sq":
        return 1.0 if math.sin(phase) >= 0 else -1.0
    return math.sin(phase)


def crossfade_loop(samples, fade_sec=0.18):
    fade = int(fade_sec * sample_rate)
    if fade * 2 >= len(samples):
        return samples
    for i in range(fade):
        w = i / fade
        samples[i] = samples[i] * w + samples[-fade + i] * (1.0 - w)
    return samples[: len(samples) - fade]


def synth_track(bpm, num_bars, bass_prog, chords, melody, beat_div=4, bass_wave="sin",
                arp_wave="tri", mel_wave="sin", bass_gain=0.26, arp_gain=0.14, mel_gain=0.17):
    beat = 60.0 / bpm
    bar = beat * beat_div
    duration = bar * num_bars
    n = int(duration * sample_rate)
    samples = [0.0] * n

    t_bass = 0.0
    for note, beats in bass_prog:
        freq = note_freq(note)
        length = beats * beat
        start = int(t_bass * sample_rate)
        count = int(length * sample_rate)
        for i in range(count):
            idx = start + i
            if idx >= n:
                break
            t = i / sample_rate
            ph = 2.0 * math.pi * freq * t
            val = osc(bass_wave, ph) + 0.12 * osc(bass_wave, ph * 2.0)
            env = get_adsr(t, length, 0.04, 0.1, 0.75, 0.12)
            samples[idx] += val * env * bass_gain
        t_bass += length

    arp_step = beat / 2.0
    arp_len = arp_step * 0.92
    for bar_i in range(num_bars):
        chord = chords[bar_i % len(chords)]
        bar_start = bar_i * bar
        steps = int(beat_div * 2)
        for step in range(steps):
            step_start = bar_start + step * arp_step
            freq = note_freq(chord[step % len(chord)])
            start = int(step_start * sample_rate)
            count = int(arp_len * sample_rate)
            for i in range(count):
                idx = start + i
                if idx >= n:
                    break
                t = i / sample_rate
                ph = 2.0 * math.pi * freq * t
                env = get_adsr(t, arp_len, 0.01, 0.05, 0.38, 0.08)
                samples[idx] += osc(arp_wave, ph) * env * arp_gain

    t_mel = 0.0
    for note, beats in melody:
        freq = note_freq(note)
        length = beats * beat
        start = int(t_mel * sample_rate)
        count = int(length * sample_rate)
        for i in range(count):
            idx = start + i
            if idx >= n:
                break
            t = i / sample_rate
            ph = 2.0 * math.pi * freq * t
            vibrato = 1.0 + 0.04 * math.sin(2.0 * math.pi * 5.5 * t)
            env = get_adsr(t, length, 0.03, 0.1, 0.65, 0.12)
            samples[idx] += osc(mel_wave, ph * vibrato) * env * mel_gain
        t_mel += length

    return crossfade_loop(samples)


def bgm_default():
    return synth_track(
        100, 8,
        [("C3", 2), ("E3", 2), ("A2", 2), ("C3", 2), ("F2", 2), ("A2", 2), ("G2", 2), ("B2", 2), ("C3", 4)],
        [["C4", "E4", "G4", "C5"], ["A3", "C4", "E4", "A4"], ["F3", "A3", "C4", "F4"],
         ["G3", "B3", "D4", "G4"], ["C4", "E4", "G4", "C5"], ["A3", "C4", "E4", "A4"],
         ["F3", "A3", "C4", "F4"], ["G3", "B3", "D4", "G4"]],
        [("E5", 1), ("G5", 1), ("C6", 2), ("A5", 1), ("C6", 1), ("E6", 2),
         ("F5", 1), ("A5", 1), ("D6", 1), ("C6", 1), ("B5", 2), ("G5", 2), ("C5", 4)],
    )


def bgm_halloween():
    """Spooky minor — Halloween / mystic pack."""
    return synth_track(
        88, 8,
        [("A2", 2), ("C3", 2), ("E3", 2), ("A2", 2), ("D3", 2), ("F3", 2), ("E3", 2), ("A2", 4)],
        [["A3", "C4", "E4", "A4"], ["D3", "F3", "A3", "D4"], ["E3", "G3", "B3", "E4"], ["A3", "C4", "Eb4", "A4"],
         ["A3", "C4", "E4", "A4"], ["F3", "A3", "C4", "F4"], ["E3", "G3", "B3", "E4"], ["A3", "C4", "E4", "A4"]],
        [("E5", 1), ("Eb5", 1), ("E5", 2), ("C5", 1), ("D5", 1), ("E5", 2),
         ("A4", 1), ("B4", 1), ("C5", 2), ("B4", 1), ("A4", 2), ("E4", 2)],
        arp_wave="tri", mel_wave="tri", arp_gain=0.16, mel_gain=0.15,
    )


def bgm_rapper():
    """Lo-fi boom-bap pocket beat."""
    beat = 60.0 / 92
    bar = beat * 4
    num_bars = 8
    n = int(bar * num_bars * sample_rate)
    samples = [0.0] * n

    kick_pattern = [1, 0, 0, 1, 0, 0, 1, 0]
    snare_pattern = [0, 0, 1, 0, 0, 0, 1, 0]
    hat_every = 2

    for bar_i in range(num_bars):
        bar_start = bar_i * bar
        for step in range(8):
            t0 = bar_start + step * (beat / 2)
            idx0 = int(t0 * sample_rate)

            if kick_pattern[step % 8]:
                for i in range(int(0.12 * sample_rate)):
                    idx = idx0 + i
                    if idx >= n:
                        break
                    t = i / sample_rate
                    f = 90 * math.exp(-28 * t)
                    samples[idx] += math.sin(2 * math.pi * f * t) * math.exp(-18 * t) * 0.55

            if snare_pattern[step % 8]:
                for i in range(int(0.08 * sample_rate)):
                    idx = idx0 + i
                    if idx >= n:
                        break
                    t = i / sample_rate
                    noise = math.sin(i * 12.9898) * 0.7
                    samples[idx] += (noise + math.sin(2 * math.pi * 180 * t) * 0.3) * math.exp(-22 * t) * 0.35

            if step % hat_every == 0:
                for i in range(int(0.025 * sample_rate)):
                    idx = idx0 + i
                    if idx >= n:
                        break
                    t = i / sample_rate
                    samples[idx] += math.sin(i * 78.233) * math.exp(-80 * t) * 0.12

    bass = synth_track(
        92, num_bars,
        [("C2", 1), ("C2", 1), ("G2", 1), ("F2", 1)] * num_bars,
        [["C4", "Eb4", "G4", "C5"]] * num_bars,
        [("G4", 2), ("F4", 2)] * (num_bars // 2),
        bass_gain=0.22, arp_gain=0.08, mel_gain=0.1, bass_wave="sq",
    )
    for i in range(min(len(samples), len(bass))):
        samples[i] += bass[i] * 0.85
    return crossfade_loop(samples)


def bgm_zombie():
    """Sluggish horror march — detuned and hollow."""
    s = synth_track(
        76, 8,
        [("C2", 3), ("B2", 1), ("C2", 2), ("Eb2", 2), ("F2", 2), ("C2", 2), ("G2", 2), ("C2", 4)],
        [["C3", "Eb3", "G3", "C4"], ["B2", "D3", "F3", "B3"], ["C3", "Eb3", "G3", "C4"], ["F2", "Ab2", "C3", "F3"],
         ["C3", "Eb3", "G3", "C4"], ["G2", "B2", "D3", "G3"], ["C3", "Eb3", "G3", "C4"], ["F2", "Ab2", "C3", "F3"]],
        [("G4", 2), ("F4", 2), ("Eb4", 2), ("C4", 4), ("D4", 2), ("Eb4", 2), ("C4", 4)],
        bass_wave="sq", arp_wave="sq", mel_wave="tri", bass_gain=0.24, arp_gain=0.11, mel_gain=0.13,
    )
    wobble = [math.sin(i / sample_rate * 2.3) * 0.015 for i in range(len(s))]
    out = []
    for i, v in enumerate(s):
        j = max(0, min(len(s) - 1, i + int(wobble[i] * sample_rate)))
        out.append(v * 0.92 + s[j] * 0.08)
    return crossfade_loop(out)


def bgm_vampire():
    """Gothic organ drone in D minor."""
    return synth_track(
        80, 8,
        [("D2", 4), ("A2", 2), ("D2", 2), ("F2", 2), ("A2", 2), ("D2", 4), ("G2", 2), ("D2", 2)],
        [["D3", "F3", "A3", "D4"], ["A2", "C3", "E3", "A3"], ["D3", "F3", "A3", "D4"], ["Bb3", "D4", "F4", "Bb4"],
         ["D3", "F3", "A3", "D4"], ["G3", "B3", "D4", "G4"], ["D3", "F3", "A3", "D4"], ["A2", "C3", "E3", "A3"]],
        [("A4", 2), ("F4", 2), ("D4", 4), ("E4", 1), ("F4", 1), ("A4", 2), ("D5", 4)],
        bass_wave="sq", arp_wave="sq", mel_wave="sin", bass_gain=0.3, arp_gain=0.12, mel_gain=0.14,
    )


def bgm_oldman():
    """Nostalgic music-box waltz (3/4)."""
    return synth_track(
        112, 8,
        [("C3", 3), ("G2", 3), ("A2", 3), ("F2", 3), ("C3", 3), ("G2", 3), ("F2", 3), ("C3", 6)],
        [["C4", "E4", "G4", "C5"], ["G3", "B3", "D4", "G4"], ["A3", "C4", "E4", "A4"], ["F3", "A3", "C4", "F4"],
         ["C4", "E4", "G4", "C5"], ["G3", "B3", "D4", "G4"], ["F3", "A3", "C4", "F4"], ["C4", "E4", "G4", "C5"]],
        [("E5", 1.5), ("G5", 1.5), ("C6", 3), ("A5", 1.5), ("G5", 1.5), ("E5", 3),
         ("F5", 1.5), ("E5", 1.5), ("D5", 3), ("C5", 6)],
        beat_div=3, arp_wave="sin", mel_wave="sin", bass_gain=0.2, arp_gain=0.18, mel_gain=0.2,
    )


THEMES = {
    "bgm.wav": bgm_default,
    "bgm_mystic.wav": bgm_halloween,
    "bgm_rapper.wav": bgm_rapper,
    "bgm_zombie.wav": bgm_zombie,
    "bgm_vampire.wav": bgm_vampire,
    "bgm_oldman.wav": bgm_oldman,
}


if __name__ == "__main__":
    audio_dir = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(audio_dir, exist_ok=True)
    for fname, builder in THEMES.items():
        path = os.path.join(audio_dir, fname)
        write_wav(path, builder())
        print(f"BGM: {fname}")
