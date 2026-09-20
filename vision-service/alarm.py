"""
alarm.py
--------
Maneja la alarma sonora local del microservicio de visión:
- Sirena (tono) usando pygame (multiplataforma) con fallback a winsound en Windows.
- Voz en español anunciando el número de intrusos (pyttsx3 offline, o gTTS como alternativa).
- Cooldown configurable para no disparar la alarma en cada frame.

Nota: esta alarma es la del propio microservicio Python (útil si corre en el
mismo equipo que se quiere vigilar). El navegador dispara su propia alarma
(alarm.mp3 + Web Speech API) de forma independiente vía el evento de Socket.IO.
"""

import io
import logging
import os
import platform
import tempfile
import threading
import time

logger = logging.getLogger("visionguard.alarm")

try:
    import pygame
except ImportError:
    pygame = None

try:
    import pyttsx3
except ImportError:
    pyttsx3 = None

try:
    from gtts import gTTS
except ImportError:
    gTTS = None

if platform.system() == "Windows":
    try:
        import winsound
    except ImportError:
        winsound = None
else:
    winsound = None


class AlarmManager:
    """
    Controla la sirena y el anuncio de voz, respetando un cooldown
    para evitar disparos repetidos mientras el intruso sigue en escena.
    """

    def __init__(self, cooldown_seconds: float = 15.0, tts_voice: str = "local"):
        self.cooldown_seconds = cooldown_seconds
        self.tts_voice = tts_voice  # "local" (pyttsx3) o "gtts"
        self._last_trigger_time = 0.0
        self._lock = threading.Lock()
        self._sirena_activa = False

        if pygame is not None:
            try:
                pygame.mixer.init()
            except Exception as exc:  # sin dispositivo de audio, por ejemplo en un servidor
                logger.warning("No se pudo inicializar pygame.mixer: %s", exc)

    # ------------------------------------------------------------------
    def puede_disparar(self) -> bool:
        return (time.time() - self._last_trigger_time) >= self.cooldown_seconds

    def disparar(self, person_count: int):
        """Dispara sirena + voz en un hilo aparte, respetando el cooldown."""
        with self._lock:
            if not self.puede_disparar():
                return False
            self._last_trigger_time = time.time()

        threading.Thread(target=self._reproducir_alarma, args=(person_count,), daemon=True).start()
        return True

    def silenciar(self):
        """Detiene cualquier audio en reproducción."""
        self._sirena_activa = False
        if pygame is not None and pygame.mixer.get_init():
            pygame.mixer.stop()

    # ------------------------------------------------------------------
    def _reproducir_alarma(self, person_count: int):
        self._sirena_activa = True
        self._reproducir_sirena()
        self._anunciar_voz(person_count)

    def _reproducir_sirena(self):
        """Reproduce un tono de sirena corto (beep generado o winsound)."""
        try:
            if winsound is not None:
                winsound.Beep(1000, 400)
                winsound.Beep(1300, 400)
                return
            if pygame is not None and pygame.mixer.get_init():
                # Genera un tono simple en memoria si no hay archivo de sirena.
                import numpy as np
                sample_rate = 44100
                duracion = 0.6
                frecuencia = 900
                t = np.linspace(0, duracion, int(sample_rate * duracion), False)
                onda = (np.sin(frecuencia * t * 2 * np.pi) * 32767 * 0.5).astype("int16")
                estereo = np.column_stack([onda, onda])
                sonido = pygame.sndarray.make_sound(estereo)
                sonido.play()
                time.sleep(duracion)
        except Exception as exc:
            logger.error("Error reproduciendo sirena: %s", exc)

    def _texto_alerta(self, person_count: int) -> str:
        return (
            f"{person_count} intrusos detectados, por favor retirarse "
            "antes de contactar con las autoridades."
            if person_count != 1
            else "1 intruso detectado, por favor retirarse antes de contactar con las autoridades."
        )

    def _anunciar_voz(self, person_count: int):
        texto = self._texto_alerta(person_count)
        try:
            if self.tts_voice == "gtts" and gTTS is not None:
                self._hablar_gtts(texto)
            elif pyttsx3 is not None:
                self._hablar_pyttsx3(texto)
            else:
                logger.warning("Ningún motor TTS disponible; alerta solo por log: %s", texto)
        except Exception as exc:
            logger.error("Error en síntesis de voz: %s", exc)

    def _hablar_pyttsx3(self, texto: str):
        engine = pyttsx3.init()
        for voice in engine.getProperty("voices"):
            if "spanish" in voice.name.lower() or "es" in (voice.languages or [b""])[0].decode(errors="ignore").lower():
                engine.setProperty("voice", voice.id)
                break
        engine.say(texto)
        engine.runAndWait()

    def _hablar_gtts(self, texto: str):
        tts = gTTS(text=texto, lang="es")
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            tts.save(f.name)
            ruta = f.name
        if pygame is not None and pygame.mixer.get_init():
            pygame.mixer.music.load(ruta)
            pygame.mixer.music.play()
            while pygame.mixer.music.get_busy():
                time.sleep(0.1)
        os.unlink(ruta)
