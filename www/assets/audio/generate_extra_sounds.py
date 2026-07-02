import math
import wave
import struct
import os
import random

sample_rate = 44100

def get_adsr(t, duration, attack=0.01, release=0.1):
	if t < attack:
		return t / attack
	elif t > (duration - release):
		return max(0.0, (duration - t) / release)
	else:
		return 1.0

def write_wav(filename, samples):
	max_val = max(abs(x) for x in samples) if samples else 0.0
	if max_val > 0.0:
		samples = [x / max_val * 0.8 for x in samples]
		
	with wave.open(filename, 'wb') as wav_file:
		wav_file.setnchannels(1)
		wav_file.setsampwidth(2)
		wav_file.setframerate(sample_rate)
		for sample in samples:
			val = int(max(-32768, min(32767, sample * 32767)))
			wav_file.writeframesraw(struct.pack('<h', val))

# Helper to generate bandpass-like noise (simple resonant noise filter)
def get_filtered_noise(duration, center_freq, bandwidth):
	num_samples = int(duration * sample_rate)
	samples = []
	
	y1, y2 = 0.0, 0.0
	r = math.exp(-math.pi * bandwidth / sample_rate)
	b2 = r * r
	b1 = -2.0 * r * math.cos(2.0 * math.pi * center_freq / sample_rate)
	a0 = (1.0 - b2) * 0.5
	
	for i in range(num_samples):
		x = random.uniform(-1.0, 1.0)
		y = a0 * x - b1 * y1 - b2 * y2
		y2 = y1
		y1 = y
		samples.append(y)
	return samples

# Helper to generate buzzy vocal-like source wave with pitch/amplitude mod
def gen_vocal_source(duration, pitch_start, pitch_end, pulse_mod_freq=0.0, jitter_amp=0.0):
	num_samples = int(duration * sample_rate)
	samples = []
	phase = 0.0
	
	for i in range(num_samples):
		t = i / sample_rate
		progress = i / num_samples
		
		f0 = pitch_start + (pitch_end - pitch_start) * progress
		
		if jitter_amp > 0.0:
			f0 += jitter_amp * math.sin(2.0 * math.pi * 7.5 * t)
			
		phase += 2.0 * math.pi * f0 / sample_rate
		if phase > 2.0 * math.pi:
			phase -= 2.0 * math.pi
			
		val = math.sin(phase) + 0.6 * math.sin(2.0 * phase) + 0.45 * math.sin(3.0 * phase) + 0.3 * math.sin(4.0 * phase)
		
		if pulse_mod_freq > 0.0:
			val *= (0.6 + 0.4 * math.sin(2.0 * math.pi * pulse_mod_freq * t))
			
		samples.append(val)
	return samples


# ==========================================
# 1. VAMPIRE SET ("Boo!" / "Booouuu!" Sounds)
# ==========================================

def gen_vampire_drop():
	# Creepy short "Boo!" whisper-shout
	duration = 0.18
	num_samples = int(duration * sample_rate)
	samples = []
	
	# Frequency slides down from 280Hz to 130Hz ("B-oo")
	src = gen_vocal_source(duration, 280.0, 130.0, pulse_mod_freq=12.0)
	# Layer with breathy whisper noise
	noise = get_filtered_noise(duration, 450.0, 150.0)
	
	for i in range(num_samples):
		t = i / sample_rate
		val = src[i] * 0.45 + noise[i] * 0.55
		env = get_adsr(t, duration, 0.01, 0.04)
		samples.append(val * env)
		
	return samples

def gen_vampire_merge():
	# Haunted, slow "Booouuuu!" layered with dark gothic organ
	duration = 1.15
	num_samples = int(duration * sample_rate)
	samples = [0.0] * num_samples
	
	# 1. Dark Organ Chord (D minor)
	organ_notes = [146.83, 220.0, 293.66]
	for freq in organ_notes:
		for i in range(num_samples):
			t = i / sample_rate
			phase = 2.0 * math.pi * freq * t
			val = math.sin(phase) + 0.5 * math.sin(2.0 * phase) + 0.2 * math.sin(3.0 * phase)
			env = math.exp(-3.0 * t) * get_adsr(t, duration, 0.05, 0.15)
			samples[i] += val * env * 0.22
			
	# 2. Spooky "Booouuu!" voice (vibrato 6Hz, sweep from 350Hz down to 180Hz)
	src = gen_vocal_source(duration, 350.0, 180.0, pulse_mod_freq=0.0, jitter_amp=10.0)
	noise = get_filtered_noise(duration, 500.0, 180.0)
	
	for i in range(num_samples):
		t = i / sample_rate
		# Ghostly swelling envelope
		val = src[i] * 0.5 + noise[i] * 0.5
		# Add a bit of resonance
		val = max(-1.0, min(1.0, val * 1.2))
		env = math.exp(-1.8 * t) * get_adsr(t, duration, 0.12, 0.22)
		samples[i] += val * env * 0.65
		
	return samples

def gen_vampire_game_over():
	# Terrifying deep scream "BOOOOOOOOO!" with heavy feedback and echo
	duration = 1.8
	num_samples = int(duration * sample_rate)
	samples = []
	
	# Shrill sweep down from 650Hz to 120Hz
	src = gen_vocal_source(duration, 650.0, 120.0, pulse_mod_freq=0.0, jitter_amp=18.0)
	# Heavy white noise layer
	noise = get_filtered_noise(duration, 600.0, 300.0)
	
	for i in range(num_samples):
		t = i / sample_rate
		# Dramatic volume swell and fade
		val = src[i] * 0.45 + noise[i] * 0.55
		# Hard clipping for maximum scary scream texture
		val = max(-1.0, min(1.0, val * 2.2))
		env = math.exp(-1.3 * t) * get_adsr(t, duration, 0.05, 0.35)
		samples.append(val * env)
		
	return samples


# ==========================================
# 2. ZOMBIE SET (Minecraft-like Guttural Sounds)
# ==========================================

def gen_zombie_drop():
	# Short guttural grunt like Minecraft's zombie ("Гххр!")
	duration = 0.22
	num_samples = int(duration * sample_rate)
	samples = []
	
	# Low pitch grunting voice (85Hz down to 65Hz) with strong ring modulation / tremble
	src = gen_vocal_source(duration, 85.0, 65.0, pulse_mod_freq=58.0, jitter_amp=4.0)
	noise = get_filtered_noise(duration, 220.0, 100.0)
	
	for i in range(num_samples):
		t = i / sample_rate
		val = src[i] * 0.6 + noise[i] * 0.4
		env = math.exp(-11.0 * t) * get_adsr(t, duration, 0.02, 0.06)
		samples.append(val * env)
		
	return samples

def gen_zombie_merge():
	# Classic Minecraft zombie groan ("Уууууррргх!")
	duration = 0.9
	num_samples = int(duration * sample_rate)
	samples = []
	
	# Low hollow pitch (80Hz to 68Hz) with heavy gurgling / tremble LFO
	src = gen_vocal_source(duration, 80.0, 68.0, pulse_mod_freq=45.0, jitter_amp=6.0)
	# Resonant low-frequency noise (Minecraft breathiness)
	noise = get_filtered_noise(duration, 280.0, 80.0)
	
	for i in range(num_samples):
		t = i / sample_rate
		val = src[i] * 0.65 + noise[i] * 0.35
		# Slight distortion/saturation
		val = max(-1.0, min(1.0, val * 1.35))
		env = math.exp(-2.2 * t) * get_adsr(t, duration, 0.08, 0.16)
		samples.append(val * env)
		
	return samples

def gen_zombie_game_over():
	# Minecraft-like zombie death groan ("Ууууррр...")
	duration = 1.6
	num_samples = int(duration * sample_rate)
	samples = []
	
	# Low tone sliding down (90Hz to 45Hz)
	src = gen_vocal_source(duration, 90.0, 45.0, pulse_mod_freq=38.0, jitter_amp=7.0)
	noise = get_filtered_noise(duration, 200.0, 70.0)
	
	for i in range(num_samples):
		t = i / sample_rate
		val = src[i] * 0.6 + noise[i] * 0.4
		env = math.exp(-1.4 * t) * get_adsr(t, duration, 0.12, 0.35)
		samples.append(val * env)
		
	return samples


# ==========================================
# 3. OLDMAN SET (Shouts, Coughs, Sighs)
# ==========================================

def gen_oldman_drop():
	duration = 0.22
	num_samples = int(duration * sample_rate)
	samples = [0.0] * num_samples
	cough_times = [0.0, 0.09]
	for c_start in cough_times:
		start_idx = int(c_start * sample_rate)
		c_dur = 0.08
		c_samples = int(c_dur * sample_rate)
		grunt = gen_vocal_source(c_dur, 120.0, 100.0, pulse_mod_freq=12.0)
		noise = get_filtered_noise(c_dur, 650.0, 300.0)
		for i in range(c_samples):
			idx = start_idx + i
			if idx >= num_samples: break
			t = i / sample_rate
			val = grunt[i] * 0.45 + noise[i] * 0.55
			env = get_adsr(t, c_dur, 0.005, 0.03)
			samples[idx] += val * env * 0.85
	return samples

def gen_oldman_merge():
	duration = 0.7
	num_samples = int(duration * sample_rate)
	src = gen_vocal_source(duration, 145.0, 115.0, pulse_mod_freq=0.0, jitter_amp=12.0)
	noise = get_filtered_noise(duration, 800.0, 250.0)
	samples = []
	for i in range(num_samples):
		t = i / sample_rate
		voice_shake = 1.0 + 0.35 * math.sin(2.0 * math.pi * 6.5 * t)
		val = src[i] * voice_shake * 0.6 + noise[i] * 0.4
		env = math.exp(-3.0 * t) * get_adsr(t, duration, 0.04, 0.12)
		samples.append(val * env)
	return samples

def gen_oldman_game_over():
	duration = 1.7
	num_samples = int(duration * sample_rate)
	src = gen_vocal_source(duration, 175.0, 90.0, pulse_mod_freq=0.0, jitter_amp=16.0)
	noise = get_filtered_noise(duration, 550.0, 200.0)
	samples = []
	for i in range(num_samples):
		t = i / sample_rate
		voice_shake = 1.0 + 0.45 * math.sin(2.0 * math.pi * 8.0 * t)
		val = src[i] * voice_shake * 0.55 + noise[i] * 0.45
		val = max(-1.0, min(1.0, val * 1.3))
		env = math.exp(-1.1 * t) * get_adsr(t, duration, 0.08, 0.35)
		samples.append(val * env)
	return samples


# ==========================================
# 4. HALLOWEEN / MYSTIC SET (Spooky chimes & owl hoots)
# ==========================================

def gen_mystic_drop():
	# Short owl-ish hoot
	duration = 0.2
	num_samples = int(duration * sample_rate)
	samples = []
	for i in range(num_samples):
		t = i / sample_rate
		freq = 380.0 - 120.0 * (t / duration)
		phase = 2.0 * math.pi * freq * t
		val = math.sin(phase) + 0.25 * math.sin(phase * 2.0)
		env = math.exp(-10.0 * t) * get_adsr(t, duration, 0.02, 0.06)
		samples.append(val * env * 0.65)
	return samples

def gen_mystic_merge():
	# Witchy ascending chime + sparkle
	duration = 0.95
	num_samples = int(duration * sample_rate)
	samples = [0.0] * num_samples
	notes = [
		(0.0, 392.0, 0.22),
		(0.07, 523.25, 0.22),
		(0.14, 659.25, 0.24),
		(0.22, 783.99, 0.26),
	]
	for note_start, freq, amp in notes:
		start_idx = int(note_start * sample_rate)
		note_dur = duration - note_start
		note_num_samples = int(note_dur * sample_rate)
		for i in range(note_num_samples):
			idx = start_idx + i
			if idx >= num_samples: break
			t = i / sample_rate
			tremolo = 1.0 + 0.3 * math.sin(2.0 * math.pi * 9.0 * t)
			phase = 2.0 * math.pi * freq * t
			val = math.sin(phase) * tremolo + 0.15 * math.sin(phase * 3.0)
			env = math.exp(-5.0 * t) * get_adsr(t, note_dur, 0.015, 0.18)
			samples[idx] += val * env * amp
	return samples

def gen_mystic_game_over():
	# Spooky descending ghost wail
	duration = 1.4
	num_samples = int(duration * sample_rate)
	samples = []
	for i in range(num_samples):
		t = i / sample_rate
		freq = 420.0 * (1.0 - 0.55 * (t / duration))
		phase = 2.0 * math.pi * freq * t
		val = math.sin(phase) + 0.2 * math.sin(phase * 2.0)
		ghost = math.sin(2.0 * math.pi * 3.5 * t) * 0.15
		env = math.exp(-1.6 * t) * get_adsr(t, duration, 0.08, 0.35)
		samples.append((val + ghost) * env * 0.7)
	return samples


# ==========================================
# 5. RAPPER SET (Scratch & Beatbox snatches)
# ==========================================

def gen_rapper_drop():
	duration = 0.14
	num_samples = int(duration * sample_rate)
	samples = []
	for i in range(num_samples):
		t = i / sample_rate
		progress = t / duration
		if progress < 0.5:
			freq = 150.0 + 800.0 * (progress / 0.5)
		else:
			freq = 950.0 - 800.0 * ((progress - 0.5) / 0.5)
		phase = 2.0 * math.pi * freq * t
		p_mod = (phase % (2.0 * math.pi)) / (2.0 * math.pi)
		val = -1.0 + 2.0 * p_mod
		env = get_adsr(t, duration, 0.01, 0.03)
		samples.append(val * env * 0.5)
	return samples

def gen_rapper_merge():
	duration = 0.6
	num_samples = int(duration * sample_rate)
	samples = [0.0] * num_samples
	for i in range(num_samples):
		t = i / sample_rate
		freq = 130.0 * math.exp(-25.0 * t)
		phase = 2.0 * math.pi * freq * t
		val = math.sin(phase)
		env = math.exp(-20.0 * t)
		samples[i] += val * env * 0.6
		
	snare_start = int(0.12 * sample_rate)
	snare_dur = 0.25
	snare_samples = int(snare_dur * sample_rate)
	for i in range(snare_samples):
		idx = snare_start + i
		if idx >= num_samples: break
		t = i / sample_rate
		noise = random.uniform(-1.0, 1.0)
		pop = math.sin(2.0 * math.pi * 180.0 * t) * math.exp(-40.0 * t)
		env = math.exp(-12.0 * t) * get_adsr(t, snare_dur, 0.005, 0.05)
		samples[idx] += (noise * 0.45 + pop * 0.35) * env
	return samples

def gen_rapper_game_over():
	duration = 1.3
	num_samples = int(duration * sample_rate)
	samples = []
	for i in range(num_samples):
		t = i / sample_rate
		freq = 220.0 * (1.0 - (t / duration)) ** 2
		phase = 2.0 * math.pi * freq * t
		val = 0.3 if math.sin(phase) > 0.0 else -0.3
		env = get_adsr(t, duration, 0.05, 0.2)
		samples.append(val * env * 0.8)
	return samples


# ==========================================
# WRITE ALL WAVE ASSETS
# ==========================================

audio_dir = os.path.dirname(os.path.abspath(__file__))
os.makedirs(audio_dir, exist_ok=True)

# Vampire
write_wav(os.path.join(audio_dir, "drop_vampire.wav"), gen_vampire_drop())
write_wav(os.path.join(audio_dir, "merge_vampire.wav"), gen_vampire_merge())
write_wav(os.path.join(audio_dir, "game_over_vampire.wav"), gen_vampire_game_over())

# Zombie
write_wav(os.path.join(audio_dir, "drop_zombie.wav"), gen_zombie_drop())
write_wav(os.path.join(audio_dir, "merge_zombie.wav"), gen_zombie_merge())
write_wav(os.path.join(audio_dir, "game_over_zombie.wav"), gen_zombie_game_over())

# Oldman
write_wav(os.path.join(audio_dir, "drop_oldman.wav"), gen_oldman_drop())
write_wav(os.path.join(audio_dir, "merge_oldman.wav"), gen_oldman_merge())
write_wav(os.path.join(audio_dir, "game_over_oldman.wav"), gen_oldman_game_over())

# Mystic
write_wav(os.path.join(audio_dir, "drop_mystic.wav"), gen_mystic_drop())
write_wav(os.path.join(audio_dir, "merge_mystic.wav"), gen_mystic_merge())
write_wav(os.path.join(audio_dir, "game_over_mystic.wav"), gen_mystic_game_over())

# Rapper
write_wav(os.path.join(audio_dir, "drop_rapper.wav"), gen_rapper_drop())
write_wav(os.path.join(audio_dir, "merge_rapper.wav"), gen_rapper_merge())
write_wav(os.path.join(audio_dir, "game_over_rapper.wav"), gen_rapper_game_over())

print("Themed sound files updated successfully with Minecraft zombie and Boo vampire shouts!")
