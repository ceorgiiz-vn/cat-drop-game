import math
import os
import struct
import wave

from clean_wav import finalize_bgm

sample_rate = 44100
bpm = 100
beat_dur = 60.0 / bpm # ~0.6 seconds per beat
bar_dur = beat_dur * 4 # 2.4 seconds per bar
num_bars = 5
duration = bar_dur * num_bars # 12.0 seconds

def get_adsr(t, duration, attack=0.02, decay=0.08, sustain=0.6, release=0.15):
	if t < attack:
		return t / attack
	elif t < attack + decay:
		progress = (t - attack) / decay
		return 1.0 - (1.0 - sustain) * progress
	elif t > duration - release:
		progress = (duration - t) / release
		return sustain * progress
	else:
		return sustain

def get_note_freq(note_name):
	notes = {
		'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
		'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00, 'B5': 987.77,
		'C3': 130.81, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00,
		'C2': 65.41, 'E2': 82.41, 'F2': 87.31, 'G2': 98.00, 'A2': 110.00
	}
	return notes.get(note_name, 0.0)

def write_wav(filename, samples):
	with wave.open(filename, 'wb') as wav_file:
		wav_file.setnchannels(1)
		wav_file.setsampwidth(2)
		wav_file.setframerate(sample_rate)
		for sample in samples:
			val = int(max(-32768, min(32767, sample * 32767)))
			wav_file.writeframesraw(struct.pack('<h', val))

def synth_bgm():
	num_samples = int(duration * sample_rate)
	samples = [0.0] * num_samples
	
	# 1. Bassline (Deep warm sine wave, changes every 2 beats)
	bass_prog = [
		('C3', 2.0), ('E3', 2.0),
		('A2', 2.0), ('C3', 2.0),
		('F2', 2.0), ('A2', 2.0),
		('G2', 2.0), ('B2', 2.0),
		('C3', 4.0)
	]
	
	bass_time = 0.0
	for note, beats in bass_prog:
		freq = get_note_freq(note)
		note_len = beats * beat_dur
		start_idx = int(bass_time * sample_rate)
		num_note_samples = int(note_len * sample_rate)
		
		for i in range(num_note_samples):
			idx = start_idx + i
			if idx >= num_samples: break
			t = i / sample_rate
			phase = 2.0 * math.pi * freq * t
			val = math.sin(phase) + 0.15 * math.sin(2.0 * phase)
			env = get_adsr(t, note_len, 0.05, 0.1, 0.8, 0.1)
			samples[idx] += val * env * 0.28
			
		bass_time += note_len

	# 2. Arpeggio / Chime chords (Cozy triangle wave)
	chords = [
		['C4', 'E4', 'G4', 'C5'], # Cmaj
		['A3', 'C4', 'E4', 'A4'], # Amin
		['F3', 'A3', 'C4', 'F4'], # Fmaj
		['G3', 'B3', 'D4', 'G4'], # Gmaj
		['C4', 'E4', 'G4', 'C5']  # Cmaj
	]
	
	arp_step = beat_dur / 4.0
	arp_dur = arp_step * 0.95
	
	for bar in range(num_bars):
		chord = chords[bar]
		bar_start = bar * bar_dur
		
		for step in range(16):
			step_start = bar_start + step * arp_step
			note_name = chord[step % len(chord)]
			freq = get_note_freq(note_name)
			
			start_idx = int(step_start * sample_rate)
			num_note_samples = int(arp_dur * sample_rate)
			
			for i in range(num_note_samples):
				idx = start_idx + i
				if idx >= num_samples: break
				t = i / sample_rate
				phase = 2.0 * math.pi * freq * t
				p_mod = (phase % (2.0 * math.pi)) / (2.0 * math.pi)
				if p_mod < 0.5:
					val = -1.0 + 4.0 * p_mod
				else:
					val = 3.0 - 4.0 * p_mod
				env = get_adsr(t, arp_dur, 0.01, 0.04, 0.4, 0.06)
				samples[idx] += val * env * 0.15

	# 3. Sweet cute melody
	melody = [
		('E5', 1.0), ('G5', 1.0), ('C6', 2.0),
		('A5', 1.0), ('C6', 1.0), ('E6', 2.0),
		('F5', 1.0), ('A5', 1.0), ('D6', 1.0), ('C6', 1.0),
		('B5', 2.0), ('G5', 2.0),
		('C5', 4.0)
	]
	
	mel_time = 0.0
	for note, beats in melody:
		freq = get_note_freq(note)
		note_len = beats * beat_dur
		start_idx = int(mel_time * sample_rate)
		num_note_samples = int(note_len * sample_rate)
		
		for i in range(num_note_samples):
			idx = start_idx + i
			if idx >= num_samples: break
			t = i / sample_rate
			phase = 2.0 * math.pi * freq * t
			val = math.sin(phase)
			vibrato = 1.0 + 0.05 * math.sin(2.0 * math.pi * 5.0 * t)
			env = get_adsr(t, note_len, 0.04, 0.1, 0.7, 0.1)
			samples[idx] += val * vibrato * env * 0.18
			
		mel_time += note_len

	# Crossfade loop
	fade_len = int(0.2 * sample_rate)
	for i in range(fade_len):
		weight = i / fade_len
		samples[i] = samples[i] * weight + samples[num_samples - fade_len + i] * (1.0 - weight)
	
	samples = samples[:num_samples - fade_len]
	return finalize_bgm(samples)

# Create directory and write file
audio_dir = os.path.dirname(os.path.abspath(__file__))
os.makedirs(audio_dir, exist_ok=True)
write_wav(os.path.join(audio_dir, "bgm.wav"), synth_bgm())
print("Cozy looping BGM track generated successfully!")
