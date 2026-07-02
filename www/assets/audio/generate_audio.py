import math
import wave
import struct
import os

sample_rate = 44100

class Resonator:
	def __init__(self):
		self.y1 = 0.0
		self.y2 = 0.0
		
	def process(self, x, fc, bandwidth, sample_rate):
		r = math.exp(-math.pi * bandwidth / sample_rate)
		b2 = r * r
		b1 = -2.0 * r * math.cos(2.0 * math.pi * fc / sample_rate)
		a0 = (1.0 - b2) * 0.5
		
		y = a0 * x - b1 * self.y1 - b2 * self.y2
		self.y2 = self.y1
		self.y1 = y
		return y

def get_adsr(t, duration, attack=0.01, release=0.1):
	if t < attack:
		return t / attack
	elif t > (duration - release):
		return max(0.0, (duration - t) / release)
	else:
		return 1.0

# Vowel Synthesizer ("meow")
def generate_meow(duration, pitch_start, pitch_mid, pitch_end, is_sad=False):
	num_samples = int(duration * sample_rate)
	samples = []
	
	res1 = Resonator()
	res2 = Resonator()
	
	phase = 0.0
	
	for i in range(num_samples):
		progress = i / num_samples
		t = i / sample_rate
		
		# 1. Pitch sweep
		if progress < 0.35:
			f0 = pitch_start + (pitch_mid - pitch_start) * (progress / 0.35)
		else:
			f0 = pitch_mid + (pitch_end - pitch_mid) * ((progress - 0.35) / 0.65)
			
		# 2. Source wave (Triangle wave rich in odd harmonics)
		phase += 2.0 * math.pi * f0 / sample_rate
		if phase > 2.0 * math.pi:
			phase -= 2.0 * math.pi
			
		if phase < math.pi:
			src = -1.0 + 2.0 * (phase / math.pi)
		else:
			src = 3.0 - 2.0 * (phase / math.pi)
			
		# 3. Formant sweep (ee -> ow diphthong)
		if is_sad:
			# Sad minor meow
			f1 = 280.0 + (320.0 - 280.0) * progress
			f2 = 1800.0 - 1100.0 * progress
		else:
			# Cute meow
			f1 = 300.0 + (400.0 - 300.0) * progress
			f2 = 2400.0 - 1600.0 * progress
			
		bw1 = 90.0
		bw2 = 130.0
		
		y1 = res1.process(src, f1, bw1, sample_rate)
		y2 = res2.process(src, f2, bw2, sample_rate)
		
		mix = 0.75 * y1 + 0.25 * y2
		
		env = get_adsr(t, duration, attack=0.03, release=0.08)
		samples.append(mix * env)
		
	# Normalize
	max_val = max(abs(x) for x in samples)
	if max_val > 0.0:
		samples = [x / max_val * 0.7 for x in samples]
		
	return samples

# 1. Drop sound: Soft cozy bubble pop ("bloop")
def generate_drop():
	duration = 0.08
	num_samples = int(duration * sample_rate)
	samples = []
	
	f_start = 320.0
	f_end = 150.0
	
	factor = f_end / f_start
	log_factor = math.log(factor)
	
	for i in range(num_samples):
		t = i / sample_rate
		
		# Exponential sweep phase
		phase = 2.0 * math.pi * f_start * (duration / log_factor) * (math.pow(factor, t / duration) - 1.0)
		
		# Pure sine wave for maximum warmth
		val = math.sin(phase)
		
		# Very quick exponential decay (almost immediate pop)
		env = math.exp(-55.0 * t) * get_adsr(t, duration, 0.002, 0.02)
		
		samples.append(val * env * 0.55)
		
	return samples

# 2. Merge sound: Warm purr combined with soft major chime
def generate_merge():
	duration = 0.55
	num_samples = int(duration * sample_rate)
	samples = [0.0] * num_samples
	
	# 1. Purr component (throat vibration at 65Hz / 130Hz modulated at 15Hz)
	purr_samples = []
	for i in range(num_samples):
		t = i / sample_rate
		carrier = math.sin(2.0 * math.pi * 65.0 * t) + 0.45 * math.sin(2.0 * math.pi * 130.0 * t)
		mod = 0.6 + 0.4 * math.sin(2.0 * math.pi * 15.0 * t)
		env = math.exp(-2.5 * t)
		purr_samples.append(carrier * mod * env * 0.3)
		
	# 2. Cozy major chord arpeggio chime
	notes = [
		(0.0, 523.25, 0.2),   # C5
		(0.06, 659.25, 0.2),  # E5
		(0.12, 783.99, 0.2),  # G5
		(0.18, 1046.50, 0.15) # C6
	]
	
	for note_start, freq, amp in notes:
		start_idx = int(note_start * sample_rate)
		note_dur = duration - note_start
		note_num_samples = int(note_dur * sample_rate)
		
		for i in range(note_num_samples):
			idx = start_idx + i
			if idx >= num_samples:
				break
			t = i / sample_rate
			phase = 2.0 * math.pi * freq * t
			val = math.sin(phase) + 0.15 * math.sin(2.0 * phase)
			env = math.exp(-11.0 * t) * get_adsr(t, note_dur, 0.005, 0.05)
			samples[idx] += val * env * amp
			
	# Blend components
	for i in range(num_samples):
		samples[i] += purr_samples[i]
		
	# Normalize
	max_val = max(abs(x) for x in samples)
	if max_val > 0.0:
		samples = [x / max_val * 0.8 for x in samples]
		
	return samples

# 3. Game Over sound: Descending sad "meow"
def generate_game_over():
	return generate_meow(
		duration=0.85,
		pitch_start=340.0,
		pitch_mid=310.0,
		pitch_end=150.0,
		is_sad=True
	)

def write_wav(filename, samples):
	with wave.open(filename, 'wb') as wav_file:
		wav_file.setnchannels(1)
		wav_file.setsampwidth(2)
		wav_file.setframerate(sample_rate)
		for sample in samples:
			val = int(max(-32768, min(32767, sample * 32767)))
			wav_file.writeframesraw(struct.pack('<h', val))

# Write files
audio_dir = os.path.dirname(os.path.abspath(__file__))
os.makedirs(audio_dir, exist_ok=True)
write_wav(os.path.join(audio_dir, "drop.wav"), generate_drop())
write_wav(os.path.join(audio_dir, "merge.wav"), generate_merge())
write_wav(os.path.join(audio_dir, "game_over.wav"), generate_game_over())
print("All audio files generated successfully!")
